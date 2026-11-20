import re
from typing import List, Dict, Any, Optional

def parse_stacktrace(raw_text: str, default_language: Optional[str] = None) -> Dict[str, Any]:
    """
    Parses an error message or stack trace into structured metadata and frames.
    Supports Python, JavaScript/TypeScript/Node.js, Go, Java, and generic format.
    """
    if not raw_text or not raw_text.strip():
        return {
            "error_type": "UnknownError",
            "message": "",
            "language": default_language or "unknown",
            "frames": []
        }

    raw_text = raw_text.strip()
    lines = raw_text.splitlines()

    # Try Python Traceback first
    if "Traceback (most recent call last):" in raw_text or any('File "' in l and 'line ' in l for l in lines):
        return _parse_python_traceback(lines)

    # Try JavaScript / TypeScript V8 format
    if any(re.search(r'^\s*at\s+', l) for l in lines):
        return _parse_js_stacktrace(lines, default_language)

    # Try TypeScript / Babel / Vite compiler error format: e.g. "src/App.tsx(45,10): error TS2339: ..."
    ts_match = _parse_compiler_diagnostic(lines, default_language)
    if ts_match:
        return ts_match

    # Try Go stack trace
    if any('.go:' in l for l in lines) and any('panic:' in l or 'goroutine ' in l for l in lines):
        return _parse_go_stacktrace(lines)

    # Try Java stack trace
    if any('Exception in thread' in l or re.search(r'^\s*at\s+[\w\.\$]+\([\w\.\$]+:\d+\)', l) for l in lines):
        return _parse_java_stacktrace(lines)

    # Generic file:line pattern matching
    return _parse_generic_error(lines, default_language)


def _parse_python_traceback(lines: List[str]) -> Dict[str, Any]:
    frames = []
    error_type = "PythonError"
    message = ""

    # Match: File "/path/to/file.py", line 145, in func_name
    frame_pattern = re.compile(r'^\s*File\s+"([^"]+)",\s*line\s+(\d+)(?:,\s*in\s+(.+))?')

    for i, line in enumerate(lines):
        match = frame_pattern.match(line)
        if match:
            file_path = match.group(1).replace("\\", "/")
            line_num = int(match.group(2))
            func_name = (match.group(3) or "").strip()
            frames.append({
                "file_path": file_path,
                "line_number": line_num,
                "function_name": func_name,
                "raw_line": line.strip()
            })

    # The last non-empty line of Python traceback is typically `ExceptionType: message`
    for line in reversed(lines):
        trimmed = line.strip()
        if trimmed and not trimmed.startswith("File "):
            if ":" in trimmed:
                parts = trimmed.split(":", 1)
                error_type = parts[0].strip()
                message = parts[1].strip()
            else:
                message = trimmed
            break

    return {
        "error_type": error_type,
        "message": message,
        "language": "python",
        "frames": frames
    }


def _parse_js_stacktrace(lines: List[str], default_language: Optional[str]) -> Dict[str, Any]:
    frames = []
    error_type = "Error"
    message = ""

    # Header line: TypeError: Cannot read properties of undefined (reading 'foo')
    first_line = lines[0].strip()
    if ":" in first_line and not first_line.startswith("at "):
        parts = first_line.split(":", 1)
        error_type = parts[0].strip()
        message = parts[1].strip()
    else:
        message = first_line

    # Frames:
    # at assignRider (rider.service.js:145:12)
    # at async processOrder (/app/order.controller.js:89:5)
    # at http://localhost:5173/src/components/APIList.jsx:93:22
    # at rider.service.js:145:12
    v8_with_func = re.compile(r'^\s*at\s+(?:async\s+)?([^\(\s]+)?\s*\((?:.+?[/\\])?([^\):]+):(\d+)(?::(\d+))?\)')
    v8_bare = re.compile(r'^\s*at\s+(?:async\s+)?(?:.+?[/\\])?([^\):]+):(\d+)(?::(\d+))?')

    for line in lines:
        if not line.strip().startswith("at "):
            continue

        m = v8_with_func.match(line)
        if m:
            func_name = m.group(1) or "<anonymous>"
            file_name = m.group(2)
            line_num = int(m.group(3))
            frames.append({
                "file_path": file_name,
                "line_number": line_num,
                "function_name": func_name,
                "raw_line": line.strip()
            })
            continue

        m2 = v8_bare.match(line)
        if m2:
            file_name = m2.group(1)
            line_num = int(m2.group(2))
            frames.append({
                "file_path": file_name,
                "line_number": line_num,
                "function_name": "<anonymous>",
                "raw_line": line.strip()
            })

    # Deduce JS vs TS
    lang = default_language or "javascript"
    if any(f["file_path"].endswith(('.ts', '.tsx')) for f in frames):
        lang = "typescript"

    return {
        "error_type": error_type,
        "message": message,
        "language": lang,
        "frames": frames
    }


def _parse_compiler_diagnostic(lines: List[str], default_language: Optional[str]) -> Optional[Dict[str, Any]]:
    # E.g. "src/App.tsx(45,10): error TS2339: Property 'x' does not exist on type 'Y'."
    diag_pattern = re.compile(r'^([^\(\s:]+)\((\d+)(?:,\d+)?\):\s*(?:error\s+([A-Z0-9]+):\s*)?(.*)')
    frames = []
    error_type = "CompilerError"
    message = ""

    for line in lines:
        m = diag_pattern.match(line.strip())
        if m:
            file_path = m.group(1).replace("\\", "/")
            line_num = int(m.group(2))
            code = m.group(3)
            diag_msg = m.group(4)

            error_type = f"Diagnostic {code}" if code else "CompilationError"
            message = diag_msg
            frames.append({
                "file_path": file_path,
                "line_number": line_num,
                "function_name": "<file>",
                "raw_line": line.strip()
            })

    if frames:
        return {
            "error_type": error_type,
            "message": message,
            "language": default_language or ("typescript" if frames[0]["file_path"].endswith(('.ts', '.tsx')) else "javascript"),
            "frames": frames
        }
    return None


def _parse_go_stacktrace(lines: List[str]) -> Dict[str, Any]:
    frames = []
    message = ""
    error_type = "Panic"

    for i, line in enumerate(lines):
        if line.startswith("panic:"):
            message = line.replace("panic:", "").strip()
            continue

        # Go trace lines look like:
        # main.assignRider(...)
        #     /home/user/project/rider.go:145 +0x3a
        if line.strip().startswith("/") or ": " in line or ".go:" in line:
            m = re.search(r'([^\s:]+\.go):(\d+)', line)
            if m:
                func_name = lines[i-1].strip() if i > 0 and not lines[i-1].startswith(" ") else "<func>"
                frames.append({
                    "file_path": m.group(1),
                    "line_number": int(m.group(2)),
                    "function_name": func_name,
                    "raw_line": line.strip()
                })

    return {
        "error_type": error_type,
        "message": message,
        "language": "go",
        "frames": frames
    }


def _parse_java_stacktrace(lines: List[str]) -> Dict[str, Any]:
    frames = []
    error_type = "JavaException"
    message = ""

    first_line = lines[0].strip()
    if ":" in first_line:
        parts = first_line.split(":", 1)
        error_type = parts[0].strip()
        message = parts[1].strip()
    else:
        message = first_line

    java_pattern = re.compile(r'^\s*at\s+([\w\.\$]+)\(([\w\.\$]+):(\d+)\)')
    for line in lines:
        m = java_pattern.match(line)
        if m:
            frames.append({
                "file_path": m.group(2),
                "line_number": int(m.group(3)),
                "function_name": m.group(1),
                "raw_line": line.strip()
            })

    return {
        "error_type": error_type,
        "message": message,
        "language": "java",
        "frames": frames
    }


def _parse_generic_error(lines: List[str], default_language: Optional[str]) -> Dict[str, Any]:
    # Match any generic pattern of filename:line
    pattern = re.compile(r'(?:^|[\s\(])([a-zA-Z0-9_\-/\\]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?')
    frames = []
    message = lines[0].strip() if lines else "Error occurred"

    for line in lines:
        for match in pattern.finditer(line):
            file_name = match.group(1).replace("\\", "/")
            # Avoid matching URLs or standard numbers
            if not file_name.startswith("http://") and not file_name.startswith("https://"):
                frames.append({
                    "file_path": file_name,
                    "line_number": int(match.group(2)),
                    "function_name": "<location>",
                    "raw_line": line.strip()
                })

    return {
        "error_type": "RuntimeError",
        "message": message,
        "language": default_language or "unknown",
        "frames": frames
    }
