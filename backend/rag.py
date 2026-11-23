import re
import os
import ast
import time
import subprocess
import httpx
import numpy as np
import logging

logger = logging.getLogger(__name__)

# List of folders to ignore
IGNORE_FOLDERS = {
    'node_modules', '.git', 'venv', '.venv', 'dist', 'build', 'coverage', 
    '.next', '__pycache__', 'target', 'bin', 'obj', '.idea', '.vscode'
}

# List of binary file extensions to ignore
IGNORE_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', 
    '.mp4', '.mp3', '.wav', '.exe', '.dll', '.so', '.class', '.pyc', '.pdb',
    '.woff', '.woff2', '.eot', '.ttf', '.svg', '.db', '.sqlite', '.sqlite3'
}

# Language mapping by extension
EXTENSION_LANGUAGES = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.html': 'html',
    '.css': 'css',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.json': 'json',
    '.md': 'markdown',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.xml': 'xml',
    '.sh': 'shell',
    '.bat': 'batch',
    '.ps1': 'powershell'
}

EMBEDDING_MODELS = ["gemini-embedding-2", "text-embedding-004"]


def resolve_embedding_key(api_key: str) -> str:
    """Embeddings always go through Gemini, even when the resolved chat key is a
    Moonshot/Kimi key ("sk-..." prefix) — the two providers aren't interchangeable,
    so swap to the backend's own Gemini key for embedding calls in that case."""
    if api_key.startswith("sk-"):
        return os.environ.get("GEMINI_API_KEY") or api_key
    return api_key


class GeminiClient:
    _cached_working_model: str = None

    def __init__(self, api_key: str, max_concurrency: int = 8):
        self.api_key = api_key
        # A generous connection pool so the ingestion thread pool can actually
        # run `max_concurrency` embedding requests at once instead of queueing
        # behind httpx's default pool size.
        self.client = httpx.Client(
            timeout=60.0,
            limits=httpx.Limits(max_connections=max_concurrency * 2, max_keepalive_connections=max_concurrency),
        )

    def _post_embed(self, model: str, text: str):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={self.api_key}"
        return self.client.post(
            url,
            json={"content": {"parts": [{"text": text}]}},
            headers={"Content-Type": "application/json"},
        )

    def resolve_working_model(self) -> str:
        """Finds which embedding model this API key can actually use. Call this
        once, synchronously, before embedding chunks concurrently — probing per
        chunk from multiple threads would race on which model "won"."""
        if GeminiClient._cached_working_model:
            return GeminiClient._cached_working_model

        for model in EMBEDDING_MODELS:
            try:
                response = self._post_embed(model, "ping")
                if response.status_code == 200:
                    GeminiClient._cached_working_model = model
                    return model
                logger.warning(f"Model {model} embedding failed: {response.text}")
            except Exception as e:
                logger.error(f"Error calling embedding with {model}: {e}")

        raise Exception("All Gemini embedding models failed. Please verify API key and network connectivity.")

    def embed_text(self, text: str, model: str = EMBEDDING_MODELS[0], retries: int = 4) -> list[float]:
        """Generate a text embedding vector using the given (already-resolved) model.
        Retries with exponential backoff on 429/5xx — those are typically transient
        rate-limit/server hiccups, not permanent failures, so an immediate retry
        (or none at all) would just fail again for no reason."""
        last_error = None
        for attempt in range(retries + 1):
            try:
                response = self._post_embed(model, text)
                if response.status_code == 200:
                    return response.json()["embedding"]["values"]
                last_error = response.text
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < retries:
                        time.sleep(min(2 ** attempt, 20))
                        continue
                break  # non-retryable (e.g. 400 bad request) — no point retrying
            except Exception as e:
                last_error = str(e)
                if attempt < retries:
                    time.sleep(min(2 ** attempt, 20))

        raise Exception(f"Embedding with model {model} failed after {attempt + 1} attempt(s): {last_error}")

def clone_repository(repo_url: str, dest_dir: str, git_path: str = "git") -> str:
    """Clones a git repository using the specified git binary to dest_dir."""
    os.makedirs(dest_dir, exist_ok=True)
    
    repo_name = repo_url.split('/')[-1]
    if repo_name.endswith('.git'):
        repo_name = repo_name[:-4]
        
    target_path = os.path.join(dest_dir, repo_name)
    if os.path.exists(target_path):
        return target_path

    cmd = [git_path, "clone", repo_url, target_path]
    logger.info(f"Running git command: {' '.join(cmd)}")
    
    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
    res = subprocess.run(cmd, capture_output=True, text=True, startupinfo=startupinfo)
    if res.returncode != 0:
        raise Exception(f"Failed to clone repository: {res.stderr}")
        
    return target_path

def scan_files(dir_path: str) -> list[dict]:
    """Recursively scan repository for files, skipping ignored folders/files and large files."""
    scanned_files = []
    
    for root, dirs, files in os.walk(dir_path):
        dirs[:] = [d for d in dirs if d not in IGNORE_FOLDERS]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in IGNORE_EXTENSIONS:
                continue
                
            abs_path = os.path.join(root, file)
            try:
                stat = os.stat(abs_path)
                if stat.st_size > 1024 * 1024:
                    continue
                    
                with open(abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    
                rel_path = os.path.relpath(abs_path, dir_path).replace("\\", "/")
                language = EXTENSION_LANGUAGES.get(ext, 'text')
                
                scanned_files.append({
                    "file_path": rel_path,
                    "language": language,
                    "content": content,
                    "size_bytes": stat.st_size
                })
            except Exception as e:
                logger.error(f"Error reading file {abs_path}: {e}")
                
    return scanned_files

def get_python_chunks(content: str, file_path: str) -> list[dict]:
    """Extract class and function chunks from Python code using AST."""
    chunks = []
    lines = content.split('\n')
    
    try:
        tree = ast.parse(content)
    except Exception:
        # Fallback to regex or sliding window if invalid Python syntax
        return []
        
    class PythonVisitor(ast.NodeVisitor):
        def visit_ClassDef(self, node):
            # Extract class body
            start_line = node.lineno
            end_line = getattr(node, 'end_lineno', len(lines))
            class_lines = lines[start_line - 1 : end_line]
            chunk_text = "\n".join(class_lines)
            
            chunks.append({
                "file_path": file_path,
                "start_line": start_line,
                "end_line": end_line,
                "type": "class",
                "name": node.name,
                "text": f"# File: {file_path}\n# Class: {node.name}\n\n{chunk_text}"
            })
            self.generic_visit(node)
            
        def visit_FunctionDef(self, node):
            # Extract function body
            # If function is nested inside a class, it will be double-chunked, which is fine
            start_line = node.lineno
            end_line = getattr(node, 'end_lineno', len(lines))
            func_lines = lines[start_line - 1 : end_line]
            chunk_text = "\n".join(func_lines)
            
            chunks.append({
                "file_path": file_path,
                "start_line": start_line,
                "end_line": end_line,
                "type": "function",
                "name": node.name,
                "text": f"# File: {file_path}\n# Function: {node.name}\n\n{chunk_text}"
            })
            self.generic_visit(node)
            
        def visit_AsyncFunctionDef(self, node):
            self.visit_FunctionDef(node)
            
    visitor = PythonVisitor()
    visitor.visit(tree)
    return chunks

def get_regex_chunks(content: str, file_path: str, language: str) -> list[dict]:
    """Regex-based parser for JavaScript, TypeScript, Go, Java, Rust to split by classes/functions."""
    chunks = []
    lines = content.split('\n')
    
    # Common function patterns
    # Matches: function name(arg) or export const name = (arg) => or async function name
    # Matches class Name
    patterns = [
        (r'^\s*(?:export\s+|default\s+|async\s+)*function\s+([a-zA-Z0-9_]+)', 'function'),
        (r'^\s*(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(.*?\)\s*=>', 'function'),
        (r'^\s*(?:export\s+|default\s+)*class\s+([a-zA-Z0-9_]+)', 'class'),
        (r'^\s*fn\s+([a-zA-Z0-9_]+)', 'function'), # Rust fn
        (r'^\s*func\s+([a-zA-Z0-9_]+)', 'function'), # Go func
        (r'^\s*(?:public|private|protected|static|\s)*[a-zA-Z0-9_<>]+\s+([a-zA-Z0-9_]+)\s*\(.*?\)\s*(?:throws\s+[a-zA-Z0-9_,\s]+)?\s*\{', 'function') # Java/C++ method
    ]
    
    compiled = [(re.compile(p), t) for p, t in patterns]
    
    current_chunk = None
    
    for i, line in enumerate(lines):
        line_num = i + 1
        matched = False
        
        for r, t in compiled:
            match = r.match(line)
            if match:
                name = match.group(1)
                if current_chunk:
                    # Close previous chunk
                    current_chunk["end_line"] = line_num - 1
                    current_chunk["text"] = "\n".join(lines[current_chunk["start_line"] - 1 : current_chunk["end_line"]])
                    chunks.append(current_chunk)
                    
                current_chunk = {
                    "file_path": file_path,
                    "start_line": line_num,
                    "end_line": len(lines),
                    "type": t,
                    "name": name,
                    "text": ""
                }
                matched = True
                break
                
    if current_chunk:
        current_chunk["text"] = "\n".join(lines[current_chunk["start_line"] - 1 :])
        chunks.append(current_chunk)
        
    return chunks

def get_sliding_window_chunks(content: str, file_path: str, window_size=60, overlap=10) -> list[dict]:
    """Fall back to sliding window chunking if AST/Regex doesn't yield results or for config/markdown files."""
    chunks = []
    lines = content.split('\n')
    if not lines:
        return []
        
    i = 0
    idx = 0
    while i < len(lines):
        window = lines[i : i + window_size]
        text = "\n".join(window)
        start_line = i + 1
        end_line = min(i + window_size, len(lines))
        
        chunks.append({
            "file_path": file_path,
            "start_line": start_line,
            "end_line": end_line,
            "type": "fallback",
            "name": f"chunk_{idx}",
            "text": f"// File: {file_path} (Lines {start_line}-{end_line})\n\n{text}"
        })
        
        idx += 1
        i += (window_size - overlap)
        if window_size - overlap <= 0:
            break
            
    return chunks

def chunk_file(file_path: str, content: str, language: str) -> list[dict]:
    """Routes file to appropriate chunker and ensures some chunks are generated."""
    chunks = []
    
    if language == 'python':
        chunks = get_python_chunks(content, file_path)
    elif language in ['javascript', 'typescript', 'go', 'rust', 'java', 'cpp', 'csharp']:
        chunks = get_regex_chunks(content, file_path, language)
        
    # If AST or regex parsing yielded no chunks (or language is markup/config/text), do sliding window
    if not chunks:
        chunks = get_sliding_window_chunks(content, file_path)
        
    return chunks

def extract_symbols(file_path: str, content: str, language: str) -> list[dict]:
    """Extracts function, class, and method symbols with line numbers and signatures."""
    symbols = []
    lines = content.split('\n')
    
    if language == 'python':
        try:
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    start = node.lineno
                    end = getattr(node, 'end_lineno', start)
                    sig = lines[start - 1].strip() if start <= len(lines) else f"class {node.name}"
                    symbols.append({
                        "file_path": file_path,
                        "name": node.name,
                        "symbol_type": "class",
                        "start_line": start,
                        "end_line": end,
                        "signature": sig
                    })
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    start = node.lineno
                    end = getattr(node, 'end_lineno', start)
                    sig = lines[start - 1].strip() if start <= len(lines) else f"def {node.name}"
                    symbols.append({
                        "file_path": file_path,
                        "name": node.name,
                        "symbol_type": "function",
                        "start_line": start,
                        "end_line": end,
                        "signature": sig
                    })
        except Exception:
            pass

    elif language in ['javascript', 'typescript', 'go', 'rust', 'java', 'cpp', 'csharp']:
        patterns = [
            (re.compile(r'^\s*(?:export\s+|default\s+|async\s+)*function\s+([a-zA-Z0-9_]+)'), 'function'),
            (re.compile(r'^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\('), 'function'),
            (re.compile(r'^\s*(?:export\s+|default\s+)*class\s+([a-zA-Z0-9_]+)'), 'class'),
            (re.compile(r'^\s*(?:export\s+)?interface\s+([a-zA-Z0-9_]+)'), 'interface'),
            (re.compile(r'^\s*fn\s+([a-zA-Z0-9_]+)'), 'function'),
            (re.compile(r'^\s*func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)'), 'function'),
            (re.compile(r'^\s*(?:public|private|protected|static|\s)*[a-zA-Z0-9_<>]+\s+([a-zA-Z0-9_]+)\s*\('), 'method')
        ]
        for i, line in enumerate(lines):
            for regex, sym_type in patterns:
                m = regex.match(line)
                if m:
                    name = m.group(1)
                    if name not in ('if', 'for', 'while', 'switch', 'catch'):
                        symbols.append({
                            "file_path": file_path,
                            "name": name,
                            "symbol_type": sym_type,
                            "start_line": i + 1,
                            "end_line": min(i + 30, len(lines)),
                            "signature": line.strip()
                        })
                    break

    return symbols

def cosine_similarity(v1, v2):
    """Calculates cosine similarity between two 1D numpy arrays."""
    dot_product = np.dot(v1, v2)
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    if norm_v1 == 0 or norm_v2 == 0:
        return 0.0
    return float(dot_product / (norm_v1 * norm_v2))

def search_similar_chunks(query_embedding, db_chunks, top_k=5):
    """
    Searches chunks using in-memory Cosine Similarity with NumPy.
    - query_embedding: list/array of float32
    - db_chunks: list of dicts with 'embedding' (numpy array) and chunk info
    """
    if not db_chunks:
        return []
        
    query_vec = np.array(query_embedding, dtype=np.float32)
    
    # Compute similarity for each chunk
    scored_chunks = []
    for chunk in db_chunks:
        similarity = cosine_similarity(query_vec, chunk['embedding'])
        # Add metadata and similarity score
        scored_chunks.append({
            "file_path": chunk["file_path"],
            "start_line": chunk["start_line"],
            "end_line": chunk["end_line"],
            "type": chunk["type"],
            "name": chunk["name"],
            "text": chunk["text"],
            "score": similarity
        })
        
    # Sort descending by score
    scored_chunks.sort(key=lambda x: x["score"], reverse=True)
    return scored_chunks[:top_k]
