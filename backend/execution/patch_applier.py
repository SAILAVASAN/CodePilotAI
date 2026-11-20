import os
import difflib
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

def generate_unified_diff(original_text: str, modified_text: str, file_path: str) -> str:
    """Generates a standard unified diff string between two text versions."""
    orig_lines = original_text.splitlines(keepends=True)
    mod_lines = modified_text.splitlines(keepends=True)
    
    diff = difflib.unified_diff(
        orig_lines,
        mod_lines,
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        lineterm=""
    )
    return "".join(diff)

def apply_code_patch(
    repo_root: str,
    file_path: str,
    original_snippet: str,
    replacement_snippet: str,
    complete_patched_file: Optional[str] = None
) -> Dict[str, Any]:
    """
    Safely applies a code patch to a local file with backup.
    Requires human approval before invocation.
    """
    clean_rel_path = file_path.replace("\\", "/").lstrip("/")
    abs_target_path = os.path.normpath(os.path.join(repo_root, clean_rel_path))

    # Security check: Prevent path traversal
    if not abs_target_path.startswith(os.path.normpath(repo_root)):
        return {
            "success": False,
            "error": "Security violation: File path escapes repository root."
        }

    if not os.path.exists(abs_target_path):
        return {
            "success": False,
            "error": f"Target file does not exist: {clean_rel_path}"
        }

    try:
        with open(abs_target_path, "r", encoding="utf-8") as f:
            current_content = f.read()

        new_content = None

        if complete_patched_file:
            new_content = complete_patched_file
        elif original_snippet and replacement_snippet:
            # Normalize whitespace/line endings for replacement
            norm_current = current_content.replace("\r\n", "\n")
            norm_orig = original_snippet.strip().replace("\r\n", "\n")
            norm_repl = replacement_snippet.strip().replace("\r\n", "\n")

            if norm_orig in norm_current:
                new_content = norm_current.replace(norm_orig, norm_repl, 1)
            else:
                # Attempt line-by-line fuzzy replacement if exact match failed
                orig_lines = [l.strip() for l in norm_orig.splitlines() if l.strip()]
                if orig_lines:
                    first_line = orig_lines[0]
                    if first_line in norm_current:
                        logger.info(f"Fuzzy matching patch at line: {first_line}")
                        # Fallback to direct replacement if snippet found
                        new_content = norm_current.replace(original_snippet, replacement_snippet)

        if new_content is None:
            return {
                "success": False,
                "error": "Could not locate the original code snippet within target file to apply replacement."
            }

        # Create backup
        backup_path = abs_target_path + ".bak"
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(current_content)

        # Write patched content
        with open(abs_target_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        return {
            "success": True,
            "file_path": clean_rel_path,
            "backup_created": backup_path,
            "message": "Patch applied successfully."
        }
    except Exception as e:
        logger.error(f"Error applying patch to {file_path}: {e}")
        return {
            "success": False,
            "error": str(e)
        }

def rollback_code_patch(repo_root: str, file_path: str) -> Dict[str, Any]:
    """Restores the backup file created prior to patch application."""
    clean_rel_path = file_path.replace("\\", "/").lstrip("/")
    abs_target_path = os.path.normpath(os.path.join(repo_root, clean_rel_path))
    backup_path = abs_target_path + ".bak"

    if not os.path.exists(backup_path):
        return {
            "success": False,
            "error": "No backup file found to rollback."
        }

    try:
        with open(backup_path, "r", encoding="utf-8") as f:
            original = f.read()
        with open(abs_target_path, "w", encoding="utf-8") as f:
            f.write(original)
        os.remove(backup_path)
        return {"success": True, "message": "Rollback completed."}
    except Exception as e:
        return {"success": False, "error": str(e)}
