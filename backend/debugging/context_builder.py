import os
import re
from typing import List, Dict, Any, Optional
import db
import rag
from debugging.stacktrace_parser import parse_stacktrace

class ContextBuilder:
    def __init__(self, repo_id: int):
        self.repo_id = repo_id

    def build_debug_context(
        self,
        error_message: str,
        stack_trace: Optional[str] = None,
        language: Optional[str] = None,
        rag_client: Optional[rag.GeminiClient] = None
    ) -> Dict[str, Any]:
        """
        Builds a high-precision, multi-layered evidence context combining:
        1. Exact stack trace file & line snippet
        2. AST symbol resolution (enclosing function / class)
        3. Caller & callee references
        4. Full-text (FTS5) & semantic chunk search
        5. Relevant test files
        """
        full_error_text = f"{error_message or ''}\n{stack_trace or ''}".strip()
        parsed = parse_stacktrace(full_error_text, default_language=language)
        
        frames = parsed.get("frames", [])
        evidence_list: List[Dict[str, Any]] = []
        affected_files_set = set()
        primary_frame = None

        # Fetch all indexed files in this repo for path matching
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT file_path, content, language FROM files WHERE repo_id = ?", (self.repo_id,))
        repo_files = {r["file_path"].replace("\\", "/"): dict(r) for r in cursor.fetchall()}
        conn.close()

        # Step 1: Match stack trace frames to actual repo files
        for frame in frames:
            matched_path = self._match_file_path(frame["file_path"], repo_files.keys())
            if not matched_path:
                continue

            file_info = repo_files[matched_path]
            line_no = frame["line_number"]
            affected_files_set.add(matched_path)

            if primary_frame is None:
                primary_frame = {
                    "file_path": matched_path,
                    "line_number": line_no,
                    "function_name": frame["function_name"]
                }

            # Retrieve exact snippet (±20 lines)
            snippet, start_line, end_line = self._extract_snippet(
                file_info["content"], line_no, window_before=15, window_after=15
            )

            # Find enclosing symbol in code_symbols
            symbols = db.find_symbols_by_name(self.repo_id, frame["function_name"])
            enclosing_symbol = None
            for s in symbols:
                if s["file_path"] == matched_path and s["start_line"] <= line_no <= s["end_line"]:
                    enclosing_symbol = s
                    break

            evidence_list.append({
                "file_path": matched_path,
                "start_line": start_line,
                "end_line": end_line,
                "code_snippet": snippet,
                "evidence_type": "stack_trace_origin",
                "relevance_score": 1.0,
                "function_name": frame["function_name"],
                "enclosing_symbol": enclosing_symbol["name"] if enclosing_symbol else None
            })

            # Step 2: Caller investigation — find other places calling this function
            target_func = frame["function_name"]
            if target_func and target_func not in ("<anonymous>", "<location>", "<file>", "main"):
                callers = self._find_callers(target_func, matched_path, repo_files)
                for caller in callers:
                    evidence_list.append(caller)
                    affected_files_set.add(caller["file_path"])

        # Step 3: If no stack trace matched, use error message keyword search in FTS5
        if not evidence_list:
            fts_matches = db.search_code_fts(self.repo_id, error_message, limit=3)
            for m in fts_matches:
                fpath = m["file_path"]
                if fpath in repo_files:
                    file_info = repo_files[fpath]
                    snippet, start_line, end_line = self._extract_snippet(file_info["content"], 1, window_before=0, window_after=40)
                    evidence_list.append({
                        "file_path": fpath,
                        "start_line": start_line,
                        "end_line": end_line,
                        "code_snippet": snippet,
                        "evidence_type": "keyword_search",
                        "relevance_score": 0.8
                    })
                    affected_files_set.add(fpath)

        # Step 4: Semantic chunk retrieval for conceptual context
        semantic_chunks = self._get_semantic_chunks(error_message, rag_client)
        for sc in semantic_chunks:
            evidence_list.append({
                "file_path": sc["file_path"],
                "start_line": sc["start_line"],
                "end_line": sc["end_line"],
                "code_snippet": sc["text"],
                "evidence_type": "semantic_match",
                "relevance_score": round(sc["score"], 2)
            })
            affected_files_set.add(sc["file_path"])

        # Step 5: Format structured prompt context for LLM
        prompt_context = self._format_prompt_context(parsed, evidence_list)

        return {
            "parsed_error": parsed,
            "primary_frame": primary_frame,
            "evidence_list": evidence_list,
            "affected_files": list(affected_files_set),
            "prompt_context": prompt_context
        }

    def _match_file_path(self, target: str, available_paths: Any) -> Optional[str]:
        """Finds closest matching repository path for a stack trace frame."""
        clean_target = target.replace("\\", "/").strip().lstrip("/")
        
        # 1. Exact match
        if clean_target in available_paths:
            return clean_target

        # 2. Suffix match (e.g. "service/rider.js" matches "backend/src/service/rider.js")
        for path in available_paths:
            if path.endswith(clean_target) or path.endswith("/" + clean_target):
                return path

        # 3. Basename match (e.g. "rider.service.js" matches "src/rider.service.js")
        target_basename = os.path.basename(clean_target)
        for path in available_paths:
            if os.path.basename(path) == target_basename:
                return path

        return None

    def _extract_snippet(
        self,
        content: str,
        target_line: int,
        window_before: int = 15,
        window_after: int = 15
    ) -> tuple[str, int, int]:
        lines = content.splitlines()
        total = len(lines)
        if total == 0:
            return "", 1, 1

        start_line = max(1, target_line - window_before)
        end_line = min(total, target_line + window_after)

        snippet_lines = []
        for i in range(start_line - 1, end_line):
            line_no = i + 1
            marker = ">>" if line_no == target_line else "  "
            snippet_lines.append(f"{marker} {line_no:4d} | {lines[i]}")

        return "\n".join(snippet_lines), start_line, end_line

    def _find_callers(
        self,
        function_name: str,
        origin_file: str,
        repo_files: Dict[str, Any],
        max_callers: int = 2
    ) -> List[Dict[str, Any]]:
        callers = []
        pattern = re.compile(rf'\b{re.escape(function_name)}\s*\(')

        for file_path, file_data in repo_files.items():
            if file_path == origin_file:
                continue

            content = file_data["content"]
            if function_name not in content:
                continue

            lines = content.splitlines()
            for idx, line in enumerate(lines):
                if pattern.search(line):
                    line_no = idx + 1
                    snippet, s_line, e_line = self._extract_snippet(content, line_no, window_before=5, window_after=10)
                    callers.append({
                        "file_path": file_path,
                        "start_line": s_line,
                        "end_line": e_line,
                        "code_snippet": snippet,
                        "evidence_type": "caller",
                        "relevance_score": 0.85,
                        "function_name": function_name
                    })
                    if len(callers) >= max_callers:
                        return callers
        return callers

    def _get_semantic_chunks(self, error_message: str, rag_client: Optional[rag.GeminiClient]) -> List[Dict[str, Any]]:
        if not rag_client or not error_message:
            return []
        try:
            all_chunks = db.get_chunks_for_repo(self.repo_id)
            if not all_chunks:
                return []
            working_model = rag_client.resolve_working_model()
            query_emb = rag_client.embed_text(error_message[:200], model=working_model)
            return rag.search_similar_chunks(query_emb, all_chunks, top_k=2)
        except Exception:
            return []

    def _format_prompt_context(self, parsed: Dict[str, Any], evidence_list: List[Dict[str, Any]]) -> str:
        sections = []
        sections.append(f"## Reported Error\n- Type: {parsed.get('error_type')}\n- Message: {parsed.get('message')}\n- Language: {parsed.get('language')}")

        if evidence_list:
            sections.append("## Repository Evidence (Ground Truth from Actual Codebase):")
            for i, ev in enumerate(evidence_list, 1):
                ev_type = ev.get("evidence_type", "evidence").upper()
                sections.append(
                    f"### [Evidence #{i}] {ev['file_path']} (Lines {ev['start_line']}-{ev['end_line']}) [{ev_type}]\n"
                    f"```\n{ev['code_snippet']}\n```"
                )
        else:
            sections.append("Notice: No direct file matches found in repository index.")

        return "\n\n".join(sections)
