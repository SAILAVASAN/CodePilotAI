import json
import logging
import re
from typing import Dict, Any, Optional
import db
import rag
from debugging.context_builder import ContextBuilder
from debugging.stacktrace_parser import parse_stacktrace
from llm.client import LLMClient
from execution.patch_applier import generate_unified_diff

logger = logging.getLogger(__name__)

DEBUG_SYSTEM_PROMPT = """You are CodePilotAI, an expert software engineering debugging agent.
Your mission is to investigate software errors, identify the verified root cause using actual repository source code, and propose a precise, minimal patch.

CRITICAL RULES:
1. NEVER invent or hallucinate file names, line numbers, or code that does not exist in the repository evidence.
2. Rely strictly on the provided repository evidence. If evidence is ambiguous, state your uncertainties clearly.
3. Trace the stack trace frame to the exact failing function and line.
4. Analyze potential null, undefined, or missing values, unhandled edge cases, or invalid state.
5. Provide a clear, engineering-grade explanation of the root cause.
6. Propose a minimal, surgical fix.
7. Output valid, raw JSON matching the schema below without any markdown fences or conversational filler.

SCHEMA:
{
  "error_type": "string (e.g. TypeError, AttributeError, Panic)",
  "root_cause": "string (clear technical explanation of why the failure occurred)",
  "confidence": 0.85,
  "evidence": [
    {
      "file_path": "string",
      "start_line": 140,
      "end_line": 150,
      "explanation": "string (why this specific code explains the bug)"
    }
  ],
  "affected_files": [
    {
      "file_path": "string",
      "start_line": 140,
      "end_line": 150
    }
  ],
  "suggested_fix": "string (high level explanation of how to fix it)",
  "patch": {
    "file_path": "string",
    "original_snippet": "string (exact lines of original code to replace)",
    "replacement_snippet": "string (new corrected code lines)"
  },
  "recommended_tests": [
    "string (recommended test scenario 1)",
    "string (recommended test scenario 2)"
  ],
  "uncertainties": [
    "string (any assumption that still requires runtime confirmation)"
  ]
}
"""

class DebugAgent:
    def __init__(self, repo_id: int, api_key: Optional[str] = None):
        self.repo_id = repo_id
        self.api_key = api_key
        self.context_builder = ContextBuilder(repo_id)
        self.llm_client = LLMClient(api_key=api_key)
        self.rag_client = rag.GeminiClient(rag.resolve_embedding_key(api_key)) if api_key else None

    def run_investigation(
        self,
        session_id: int,
        error_message: str,
        stack_trace: Optional[str] = None,
        language: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes end-to-end debugging workflow:
        1. Context Building (Stack trace + AST + Symbol + FTS)
        2. LLM Reasoning (Ollama / Gemini)
        3. Citation Validation
        4. Patch Diff Generation
        5. SQLite Persistence
        """
        db.update_debug_session(session_id, status="analyzing")

        # Step 1: Context building
        context_data = self.context_builder.build_debug_context(
            error_message=error_message,
            stack_trace=stack_trace,
            language=language,
            rag_client=self.rag_client
        )

        user_prompt = (
            f"Please investigate the following error and produce a root cause diagnosis and patch.\n\n"
            f"{context_data['prompt_context']}\n\n"
            f"Provide your response in the required JSON format."
        )

        # Step 2: Invoke LLM
        raw_llm_output = self.llm_client.generate_chat(
            system_prompt=DEBUG_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_format_json=True
        )

        # Step 3: Parse and sanitize JSON
        diagnosis = self._parse_json_response(raw_llm_output)

        # Step 4: Validate citations against repo files
        validated_diagnosis = self._validate_citations(diagnosis, context_data)

        # Step 5: Save evidence to database
        db_evidence = []
        for ev in validated_diagnosis.get("evidence", []):
            db_evidence.append({
                "file_path": ev["file_path"],
                "start_line": ev.get("start_line", 1),
                "end_line": ev.get("end_line", 1),
                "code_snippet": ev.get("explanation", ""),
                "evidence_type": "root_cause_evidence",
                "relevance_score": 0.95
            })

        # Add the original stack trace frames as evidence
        for raw_ev in context_data.get("evidence_list", []):
            db_evidence.append({
                "file_path": raw_ev["file_path"],
                "start_line": raw_ev["start_line"],
                "end_line": raw_ev["end_line"],
                "code_snippet": raw_ev["code_snippet"],
                "evidence_type": raw_ev["evidence_type"],
                "relevance_score": raw_ev["relevance_score"]
            })

        if db_evidence:
            db.save_debug_evidence_batch(session_id, db_evidence)

        # Step 6: Generate unified diff for proposed patch
        patch_data = validated_diagnosis.get("patch")
        patch_id = None
        if patch_data and patch_data.get("file_path"):
            patch_file = patch_data["file_path"]
            orig_snip = patch_data.get("original_snippet", "")
            repl_snip = patch_data.get("replacement_snippet", "")

            # Look up complete file content to generate full unified diff
            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT content FROM files WHERE repo_id = ? AND file_path = ?", (self.repo_id, patch_file))
            file_row = cursor.fetchone()
            conn.close()

            if file_row:
                full_content = file_row["content"].replace("\r\n", "\n")
                clean_orig = orig_snip.strip().replace("\r\n", "\n")
                clean_repl = repl_snip.strip().replace("\r\n", "\n")
                if clean_orig and clean_orig in full_content:
                    patched_full = full_content.replace(clean_orig, clean_repl, 1)
                else:
                    patched_full = full_content
                diff_str = generate_unified_diff(full_content, patched_full, patch_file)
            else:
                diff_str = generate_unified_diff(orig_snip, repl_snip, patch_file)

            if not diff_str or not diff_str.strip():
                diff_str = generate_unified_diff(orig_snip, repl_snip, patch_file)

            patch_id = db.create_patch(
                session_id=session_id,
                file_path=patch_file,
                diff_content=diff_str,
                original_content=orig_snip,
                patched_content=repl_snip,
                status="proposed"
            )
            validated_diagnosis["patch"]["id"] = patch_id
            validated_diagnosis["patch"]["diff"] = diff_str

        # Step 7: Update debug session in DB
        db.update_debug_session(
            session_id=session_id,
            status="completed",
            error_type=validated_diagnosis.get("error_type", "RuntimeError"),
            root_cause=validated_diagnosis.get("root_cause", "No root cause identified"),
            confidence=validated_diagnosis.get("confidence", 0.75),
            suggested_fix=validated_diagnosis.get("suggested_fix", ""),
            recommended_tests=validated_diagnosis.get("recommended_tests", [])
        )

        return {
            "session_id": session_id,
            "status": "completed",
            "diagnosis": validated_diagnosis,
            "context": context_data
        }

    def _parse_json_response(self, text: str) -> Dict[str, Any]:
        """Strips markdown markers if present and parses structured JSON."""
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except Exception as e:
            logger.warning(f"Failed to parse LLM JSON directly ({e}), attempting extraction...")
            m = re.search(r'(\{[\s\S]*\})', cleaned)
            if m:
                try:
                    return json.loads(m.group(1))
                except Exception:
                    pass
            return {
                "error_type": "AnalysisError",
                "root_cause": text,
                "confidence": 0.5,
                "evidence": [],
                "affected_files": [],
                "suggested_fix": "Please check repository logs.",
                "recommended_tests": []
            }

    def _validate_citations(self, diagnosis: Dict[str, Any], context_data: Dict[str, Any]) -> Dict[str, Any]:
        """Ensures that all cited files exist in repository index, stripping hallucinations."""
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM files WHERE repo_id = ?", (self.repo_id,))
        valid_files = {r["file_path"].replace("\\", "/") for r in cursor.fetchall()}
        conn.close()

        def match_valid(fpath: str) -> Optional[str]:
            clean = fpath.replace("\\", "/").strip().lstrip("/")
            if clean in valid_files:
                return clean
            for vf in valid_files:
                if vf.endswith(clean) or vf.endswith("/" + clean):
                    return vf
            return None

        # Filter evidence items
        valid_evidence = []
        for ev in diagnosis.get("evidence", []):
            vf = match_valid(ev.get("file_path", ""))
            if vf:
                ev["file_path"] = vf
                valid_evidence.append(ev)
        diagnosis["evidence"] = valid_evidence

        # Filter affected files
        valid_affected = []
        for af in diagnosis.get("affected_files", []):
            vf = match_valid(af.get("file_path", ""))
            if vf:
                af["file_path"] = vf
                valid_affected.append(af)
        
        # If affected_files became empty, fallback to context affected files
        if not valid_affected and context_data.get("affected_files"):
            for cf in context_data["affected_files"]:
                valid_affected.append({"file_path": cf, "start_line": 1, "end_line": 1})
        diagnosis["affected_files"] = valid_affected

        # Validate patch file path
        patch = diagnosis.get("patch")
        if patch and patch.get("file_path"):
            matched_patch_file = match_valid(patch["file_path"])
            if matched_patch_file:
                patch["file_path"] = matched_patch_file
            elif context_data.get("primary_frame"):
                patch["file_path"] = context_data["primary_frame"]["file_path"]

        return diagnosis
