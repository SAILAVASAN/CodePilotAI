import os
import shutil
import subprocess
import traceback
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

# Load .env file manually BEFORE importing auth/oauth below — both read their
# JWT/OAuth config from os.environ at module import time, so the environment
# has to be populated first or they'll always see empty values.
backend_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(backend_dir, ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Depends, Response, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

import auth
import db
import oauth
import rag
from agent import SoftwareAgent
from debugging.agent import DebugAgent
from execution.patch_applier import apply_code_patch, rollback_code_patch

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="DevCopilot API")

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

# Enable CORS for the frontend only. allow_credentials=True requires a concrete
# origin (browsers reject the wildcard+credentials combo), which is also what
# lets the httpOnly session cookie actually be sent/received cross-port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(oauth.router)

# How many chunks to embed at once during ingestion. Higher = faster ingestion
# but more concurrent requests against the Gemini API's rate limit — lower this
# if ingestion starts hitting 429s on a lower API tier.
EMBEDDING_CONCURRENCY = int(os.environ.get("EMBEDDING_CONCURRENCY", "8"))


def get_api_key(current_user: dict) -> str:
    """Resolves the Gemini/Moonshot key: the signed-in user's own saved key first,
    falling back to a backend-operator-wide key from the environment."""
    user_key = db.get_api_key_for_user(current_user["id"])
    if user_key:
        return user_key

    env_key = os.environ.get("MOONSHOT_API_KEY") or os.environ.get("GEMINI_API_KEY", "")
    if env_key:
        return env_key

    raise HTTPException(
        status_code=401,
        detail="Gemini API Key required. Please configure it in Settings."
    )

# Models
class RepoConnectRequest(BaseModel):
    name: str
    url: Optional[str] = None
    local_path: Optional[str] = None  # Support local directory scan!
    provider: Optional[str] = None    # 'github' | 'gitlab' when imported via the repo picker

class ChatRequest(BaseModel):
    repo_id: int
    message: str

class DebugSessionCreateRequest(BaseModel):
    repo_id: int
    error_message: str
    stack_trace: Optional[str] = None
    language: Optional[str] = None

# Ingestion Worker
def ingest_repository_task(repo_id: int, api_key: str, clone_url_override: Optional[str] = None):
    """Clones (if git URL) and ingests repository files and code chunks.
    clone_url_override carries a token-authenticated clone URL for private OAuth
    imports; it is never persisted to the database."""
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT url, local_path FROM repositories WHERE id = ?", (repo_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        logger.error(f"Ingestion failed: Repository {repo_id} not found.")
        return

    repo_url = row["url"]
    local_path = row["local_path"]
    git_path = os.environ.get("GIT_PATH", "git")

    try:
        if repo_url:
            db.update_repo_status(repo_id, "cloning")
            uploads_dir = os.path.join(backend_dir, "uploads")
            cloned_path = rag.clone_repository(clone_url_override or repo_url, uploads_dir, git_path)
            local_path = cloned_path

            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE repositories SET local_path = ? WHERE id = ?", (cloned_path, repo_id))
            conn.commit()
            conn.close()

        db.update_repo_status(repo_id, "ingesting")
        logger.info(f"Scanning files in path: {local_path}")
        files = rag.scan_files(local_path)
        logger.info(f"Scanned {len(files)} files in repository {repo_id}")

        # Chunk every file up front (cheap, CPU-only) and save all file rows in
        # one batch, then embed every chunk concurrently — embedding is the
        # actual bottleneck (one network round-trip per chunk), so this is
        # where parallelism matters.
        db.save_files_batch(repo_id, files)

        all_chunks = []
        all_symbols = []
        for f in files:
            chunks = rag.chunk_file(f["file_path"], f["content"], f["language"])
            all_chunks.extend(chunks)
            symbols = rag.extract_symbols(f["file_path"], f["content"], f["language"])
            all_symbols.extend(symbols)
        logger.info(f"Generated {len(all_chunks)} chunks and {len(all_symbols)} symbols across {len(files)} files in repository {repo_id}")
        db.save_symbols_batch(repo_id, all_symbols)

        from debugging.dependency_analyzer import DependencyAnalyzer
        dep_analyzer = DependencyAnalyzer({f["file_path"]: f for f in files})
        deps = dep_analyzer.analyze_all_dependencies()
        db.save_dependencies_batch(repo_id, deps)
        logger.info(f"Recorded {len(deps)} dependencies for repository {repo_id}")

        rag_client = rag.GeminiClient(rag.resolve_embedding_key(api_key), max_concurrency=EMBEDDING_CONCURRENCY)

        embedded_chunks = []
        total = len(all_chunks)
        if total > 0:
            embedding_model = rag_client.resolve_working_model()
            logger.info(f"Using embedding model '{embedding_model}' for repository {repo_id}")

            # Batch embed in slices of up to 30 chunks per single API request to avoid 429 rate limit errors
            batch_size = 30
            for i in range(0, total, batch_size):
                chunk_batch = all_chunks[i:i + batch_size]
                texts = [c["text"] for c in chunk_batch]
                try:
                    vectors = rag_client.embed_texts_batch(texts, model=embedding_model)
                    for c, v in zip(chunk_batch, vectors):
                        embedded_chunks.append({**c, "embedding": v})
                except Exception as chunk_err:
                    logger.error(f"Error embedding batch {i}-{i+len(chunk_batch)}: {chunk_err}")

                done = min(i + len(chunk_batch), total)
                logger.info(f"Embedded {done}/{total} chunks for repository {repo_id}")
                if done < total:
                    time.sleep(0.5)  # Gentle spacing between batches to prevent RPM bursts

        if total > 0 and not embedded_chunks:
            raise Exception(f"All {total} chunks failed to embed — check your API key and quota.")
        if len(embedded_chunks) < total:
            logger.warning(f"{total - len(embedded_chunks)}/{total} chunks failed to embed for repository {repo_id}; proceeding with a partial index.")

        db.save_chunks_batch(repo_id, embedded_chunks)

        db.update_repo_status(repo_id, "ready")
        logger.info(f"Repository {repo_id} successfully ingested and ready.")

    except Exception as e:
        error_msg = f"Ingestion Error: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        db.update_repo_status(repo_id, "failed", error_message=str(e))

@app.on_event("startup")
def startup_event():
    db.init_db()

@app.get("/api/status")
def get_status(current_user: dict = Depends(auth.get_current_user)):
    key = db.get_api_key_for_user(current_user["id"]) or os.environ.get("MOONSHOT_API_KEY") or os.environ.get("GEMINI_API_KEY", "")
    return {
        "api_key_configured": bool(key)
    }

@app.post("/api/settings/apikey")
def save_api_key(payload: dict, current_user: dict = Depends(auth.get_current_user)):
    key = payload.get("api_key", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key is empty")
    db.set_api_key_for_user(current_user["id"], key)
    return {"success": True, "message": "API key updated."}

@app.get("/api/repositories")
def list_repositories(current_user: dict = Depends(auth.get_current_user)):
    return db.list_repositories_for_user(current_user["id"])

@app.post("/api/repositories")
def connect_repository(req: RepoConnectRequest, background_tasks: BackgroundTasks, current_user: dict = Depends(auth.get_current_user)):
    api_key = get_api_key(current_user)

    # Validation
    if not req.url and not req.local_path:
        raise HTTPException(status_code=400, detail="Either Git URL or Local Folder Path must be provided.")

    local_path = req.local_path or ""
    if local_path and not os.path.exists(local_path):
        raise HTTPException(status_code=400, detail=f"Local path does not exist: {local_path}")

    # Save repo placeholder
    repo_id = db.save_repository(
        name=req.name,
        url=req.url,
        local_path=local_path,
        user_id=current_user["id"],
        status="pending"
    )

    # For OAuth-imported repos, resolve a token-authenticated clone URL server-side
    # now (while we still have the request context) — the raw token never reaches
    # the browser and is never written to the repositories table.
    clone_url_override = None
    if req.url and req.provider:
        clone_url_override = oauth.build_authenticated_clone_url(current_user["id"], req.provider, req.url)

    # Schedule ingestion task
    background_tasks.add_task(ingest_repository_task, repo_id, api_key, clone_url_override)
    return {"repo_id": repo_id, "status": "pending"}

@app.post("/api/repositories/{repo_id}/reindex")
def reindex_repository_endpoint(repo_id: int, background_tasks: BackgroundTasks, current_user: dict = Depends(auth.get_current_user)):
    repo = db.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    api_key = get_api_key(current_user)
    db.clear_repository_index(repo_id)
    db.update_repo_status(repo_id, "pending")
    background_tasks.add_task(ingest_repository_task, repo_id, api_key, None)
    return {"repo_id": repo_id, "status": "pending", "message": "Reindexing started."}

@app.delete("/api/repositories/{repo_id}")
def delete_repository(repo_id: int, current_user: dict = Depends(auth.get_current_user)):
    deleted = db.delete_repository(repo_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Repository not found")

    local_path = deleted["local_path"]
    is_cloned = bool(deleted["url"])  # If URL is set, we cloned it to uploads/

    # Clean up cloned files from uploads folder
    if is_cloned and local_path and os.path.exists(local_path):
        try:
            shutil.rmtree(local_path)
        except Exception as e:
            logger.error(f"Could not delete local clone path {local_path}: {e}")

    return {"success": True}

@app.get("/api/repositories/{repo_id}/files")
def get_repo_files(repo_id: int, current_user: dict = Depends(auth.get_current_user)):
    if not db.get_repository(repo_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Repository not found")

    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, size_bytes, language FROM files WHERE repo_id = ?", (repo_id,))
    rows = cursor.fetchall()
    conn.close()

    return [dict(r) for r in rows]

@app.get("/api/repositories/{repo_id}/file")
def get_file_content(repo_id: int, path: str = Query(...), current_user: dict = Depends(auth.get_current_user)):
    if not db.get_repository(repo_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Repository not found")

    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, content, language FROM files WHERE repo_id = ? AND file_path = ?", (repo_id, path))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"File {path} not found in index.")

    return dict(row)

@app.post("/api/agent/chat")
def chat_with_agent(req: ChatRequest, current_user: dict = Depends(auth.get_current_user)):
    api_key = get_api_key(current_user)

    repository = db.get_repository(req.repo_id, current_user["id"])
    if not repository:
        raise HTTPException(status_code=404, detail="Repository not found")

    local_path = repository["local_path"]

    # Load chat history
    history = db.get_chat_history(req.repo_id, limit=10)

    # Save user message to database
    db.save_chat_message(req.repo_id, "user", req.message)

    # Instantiate agent with custom tool configs
    node_path = os.environ.get("NODE_PATH", "")
    python_path = os.environ.get("PYTHON_PATH", "")

    agent = SoftwareAgent(
        api_key=api_key,
        repo_id=req.repo_id,
        local_path=local_path,
        node_path=node_path,
        python_path=python_path
    )

    # Execute agent loop
    try:
        final_answer, steps = agent.run(req.message, history)
        # Save assistant message to database
        db.save_chat_message(req.repo_id, "assistant", final_answer, steps)
        return {
            "answer": final_answer,
            "steps": steps
        }
    except Exception as e:
        logger.error(f"Agent execution failed: {e}", exc_info=True)
        db.save_chat_message(req.repo_id, "assistant", f"Agent Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/repositories/{repo_id}/chat-history")
def get_repo_chat_history(repo_id: int, current_user: dict = Depends(auth.get_current_user)):
    if not db.get_repository(repo_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Repository not found")
    return db.get_chat_history(repo_id)

@app.get("/api/repositories/{repo_id}/endpoints")
def discover_endpoints(repo_id: int, current_user: dict = Depends(auth.get_current_user)):
    import re
    if not db.get_repository(repo_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Repository not found")

    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, content FROM files WHERE repo_id = ?", (repo_id,))
    rows = cursor.fetchall()
    conn.close()

    endpoints = []
    fastapi_pattern = re.compile(r'@(?:app|router|blueprint)\.(get|post|put|delete|patch|options|head)\(\s*["\']([^"\']+)["\']')
    express_pattern = re.compile(r'(?:app|router|route)\.(get|post|put|delete|patch|options|head|use)\(\s*["\']([^"\']+)["\']')
    rust_pattern = re.compile(r'#\[(get|post|put|delete|patch)\(\s*["\']([^"\']+)["\']\s*\)\]')

    for row in rows:
        file_path = row["file_path"]
        content = row["content"]

        lines = content.split('\n')
        for idx, line in enumerate(lines):
            line_no = idx + 1

            m1 = fastapi_pattern.search(line)
            if m1:
                method, path = m1.groups()
                endpoints.append({
                    "method": method.upper(),
                    "path": path,
                    "file_path": file_path,
                    "line_number": line_no
                })
                continue

            m2 = express_pattern.search(line)
            if m2:
                method, path = m2.groups()
                endpoints.append({
                    "method": method.upper(),
                    "path": path,
                    "file_path": file_path,
                    "line_number": line_no
                })
                continue

            m3 = rust_pattern.search(line)
            if m3:
                method, path = m3.groups()
                endpoints.append({
                    "method": method.upper(),
                    "path": path,
                    "file_path": file_path,
                    "line_number": line_no
                })
                continue

    return endpoints

@app.post("/api/repositories/{repo_id}/run-tests")
def run_repository_tests(repo_id: int, current_user: dict = Depends(auth.get_current_user)):
    import run_tests
    repository = db.get_repository(repo_id, current_user["id"])
    if not repository:
        raise HTTPException(status_code=404, detail="Repository not found")

    local_path = repository["local_path"]
    node_path = os.environ.get("NODE_PATH", "")
    python_path = os.environ.get("PYTHON_PATH", "")

    res = run_tests.execute_repo_tests(local_path, node_path, python_path)
    return res

# ---------------------------------------------------------------------------
# AI Debugging & Patch Verification Routes
# ---------------------------------------------------------------------------

@app.post("/api/debug/sessions")
def create_debug_session_endpoint(req: DebugSessionCreateRequest, current_user: dict = Depends(auth.get_current_user)):
    repo = db.get_repository(req.repo_id, current_user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    session_id = db.create_debug_session(
        repo_id=req.repo_id,
        error_message=req.error_message,
        stack_trace=req.stack_trace,
        language=req.language
    )
    return {"session_id": session_id, "status": "pending"}

@app.post("/api/debug/sessions/{session_id}/analyze")
def analyze_debug_session_endpoint(session_id: int, current_user: dict = Depends(auth.get_current_user)):
    session = db.get_debug_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Debug session not found")

    repo = db.get_repository(session["repo_id"], current_user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    api_key = None
    try:
        api_key = get_api_key(current_user)
    except Exception:
        pass

    agent = DebugAgent(repo_id=session["repo_id"], api_key=api_key)
    try:
        result = agent.run_investigation(
            session_id=session_id,
            error_message=session["error_message"],
            stack_trace=session["stack_trace"],
            language=session["language"]
        )
        return result
    except Exception as e:
        logger.error(f"Debug investigation failed: {e}", exc_info=True)
        db.update_debug_session(session_id, status="failed", root_cause=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/sessions/{session_id}")
def get_debug_session_details_endpoint(session_id: int, current_user: dict = Depends(auth.get_current_user)):
    session = db.get_debug_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Debug session not found")

    repo = db.get_repository(session["repo_id"], current_user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    evidence = db.get_debug_evidence(session_id)
    patches = db.get_patches_for_session(session_id)

    return {
        "session": session,
        "evidence": evidence,
        "patches": patches
    }

@app.get("/api/repositories/{repo_id}/debug-sessions")
def list_repo_debug_sessions_endpoint(repo_id: int, current_user: dict = Depends(auth.get_current_user)):
    if not db.get_repository(repo_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Repository not found")
    return db.list_debug_sessions_for_repo(repo_id)

@app.get("/api/repositories/{repo_id}/symbols")
def get_repo_symbols_endpoint(repo_id: int, q: Optional[str] = None, current_user: dict = Depends(auth.get_current_user)):
    if not db.get_repository(repo_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Repository not found")
    if q:
        return db.find_symbols_by_name(repo_id, q)
    return db.get_symbols_for_repo(repo_id)

@app.get("/api/repositories/{repo_id}/dependencies")
def get_repo_dependencies_endpoint(repo_id: int, current_user: dict = Depends(auth.get_current_user)):
    if not db.get_repository(repo_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Repository not found")

    deps = db.get_dependencies_for_repo(repo_id)

    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, language, size_bytes FROM files WHERE repo_id = ?", (repo_id,))
    files = {r["file_path"]: dict(r) for r in cursor.fetchall()}
    conn.close()

    nodes_dict = {}
    for d in deps:
        for fpath in (d["source_file"], d["target_file"]):
            if fpath not in nodes_dict:
                file_meta = files.get(fpath, {})
                lower = fpath.lower()
                category = "General"
                if any(k in lower for k in ("controller", "route", "api", "endpoint")):
                    category = "Controllers & Routes"
                elif any(k in lower for k in ("service", "agent", "logic", "core", "manager")):
                    category = "Services & Core"
                elif any(k in lower for k in ("model", "schema", "entity", "dto")):
                    category = "Models & Schemas"
                elif any(k in lower for k in ("db", "database", "store", "sql", "migration")):
                    category = "Database & Storage"
                elif any(k in lower for k in ("component", "ui", "view", "page")):
                    category = "Components & Views"
                elif any(k in lower for k in ("test", "spec", "mock")):
                    category = "Tests"

                nodes_dict[fpath] = {
                    "id": fpath,
                    "name": os.path.basename(fpath),
                    "file_path": fpath,
                    "language": file_meta.get("language", "text"),
                    "size_bytes": file_meta.get("size_bytes", 0),
                    "category": category
                }

    edges = [
        {
            "id": f"{d['source_file']}->{d['target_file']}",
            "source": d["source_file"],
            "target": d["target_file"],
            "relationship": d["relationship"],
            "symbol": d["symbol_name"]
        }
        for d in deps
    ]

    return {
        "nodes": list(nodes_dict.values()),
        "edges": edges,
        "total_relationships": len(edges)
    }

@app.post("/api/repositories/{repo_id}/impact-analysis")
def get_impact_analysis_endpoint(repo_id: int, payload: dict, current_user: dict = Depends(auth.get_current_user)):
    if not db.get_repository(repo_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Repository not found")

    file_path = payload.get("file_path", "").strip()
    if not file_path:
        raise HTTPException(status_code=400, detail="file_path is required")

    return db.get_file_impact(repo_id, file_path)

@app.post("/api/patches/{patch_id}/apply")
def apply_patch_endpoint(patch_id: int, current_user: dict = Depends(auth.get_current_user)):
    patch = db.get_patch(patch_id)
    if not patch:
        raise HTTPException(status_code=404, detail="Patch not found")

    session = db.get_debug_session(patch["session_id"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    repo = db.get_repository(session["repo_id"], current_user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = apply_code_patch(
        repo_root=repo["local_path"],
        file_path=patch["file_path"],
        original_snippet=patch["original_content"],
        replacement_snippet=patch["patched_content"]
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to apply patch."))

    db.update_patch_status(patch_id, "applied")

    # Run verification tests automatically
    import run_tests
    node_path = os.environ.get("NODE_PATH", "")
    python_path = os.environ.get("PYTHON_PATH", "")
    test_result = run_tests.execute_repo_tests(repo["local_path"], node_path, python_path)

    status = "passed" if test_result.get("success") else "failed"
    db.save_test_run(
        repo_id=repo["id"],
        session_id=session["id"],
        command=test_result.get("runner", "auto-detect"),
        status=status,
        output=test_result.get("logs", ""),
        duration_ms=0
    )

    return {
        "success": True,
        "patch": patch,
        "verification_test": test_result
    }

@app.post("/api/patches/{patch_id}/reject")
def reject_patch_endpoint(patch_id: int, current_user: dict = Depends(auth.get_current_user)):
    patch = db.get_patch(patch_id)
    if not patch:
        raise HTTPException(status_code=404, detail="Patch not found")
    db.update_patch_status(patch_id, "rejected")
    return {"success": True}

@app.post("/api/patches/{patch_id}/rollback")
def rollback_patch_endpoint(patch_id: int, current_user: dict = Depends(auth.get_current_user)):
    patch = db.get_patch(patch_id)
    if not patch:
        raise HTTPException(status_code=404, detail="Patch not found")

    session = db.get_debug_session(patch["session_id"])
    repo = db.get_repository(session["repo_id"], current_user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    res = rollback_code_patch(repo["local_path"], patch["file_path"])
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))

    db.update_patch_status(patch_id, "proposed")
    return {"success": True, "message": "Patch rolled back."}

@app.post("/api/patches/{patch_id}/push")
def push_patch_endpoint(patch_id: int, payload: dict = Body(default={}), current_user: dict = Depends(auth.get_current_user)):
    patch = db.get_patch(patch_id)
    if not patch:
        raise HTTPException(status_code=404, detail="Patch not found")

    if patch["status"] not in ("applied", "pushed"):
        raise HTTPException(status_code=400, detail="Patch must be applied locally before it can be pushed.")

    session = db.get_debug_session(patch["session_id"])
    if not session:
        raise HTTPException(status_code=404, detail="Debug session not found")

    repo = db.get_repository(session["repo_id"], current_user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    local_path = repo.get("local_path")
    if not local_path or not os.path.exists(local_path):
        raise HTTPException(status_code=400, detail="Repository local directory does not exist on disk.")

    git_bin = os.environ.get("GIT_PATH", "git")
    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    # 1. Detect branch
    try:
        branch_res = subprocess.run(
            [git_bin, "-C", local_path, "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, check=True, startupinfo=startupinfo
        )
        current_branch = branch_res.stdout.strip() or "main"
    except Exception as e:
        logger.warning(f"Could not determine branch, defaulting to main: {e}")
        current_branch = "main"

    # 2. Stage patched file
    file_path = patch["file_path"]
    try:
        subprocess.run(
            [git_bin, "-C", local_path, "add", file_path],
            capture_output=True, text=True, check=True, startupinfo=startupinfo
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"Git add failed: {e.stderr or e.stdout}")

    # 3. Commit
    custom_msg = payload.get("commit_message", "").strip()
    root_cause = session.get("root_cause") or session.get("error_type") or "resolved bug"
    commit_msg = custom_msg or f"fix(agent): apply verified patch for {file_path}\n\nSession #{session['id']}: {root_cause[:120]}"

    commit_res = subprocess.run(
        [git_bin, "-C", local_path, "commit", "-m", commit_msg],
        capture_output=True, text=True, startupinfo=startupinfo
    )
    if commit_res.returncode != 0 and "nothing to commit" not in commit_res.stdout and "nothing to commit" not in commit_res.stderr:
        logger.warning(f"Commit note: {commit_res.stderr or commit_res.stdout}")

    # 4. Check for OAuth token to form authenticated push URL if needed
    push_remote = "origin"
    for prov in ("github", "gitlab"):
        try:
            auth_url = oauth.build_authenticated_clone_url(current_user["id"], prov, repo.get("url", ""))
            if auth_url:
                push_remote = auth_url
                break
        except Exception:
            pass

    # 5. Push to remote
    try:
        push_res = subprocess.run(
            [git_bin, "-C", local_path, "push", push_remote, current_branch],
            capture_output=True, text=True, check=True, startupinfo=startupinfo
        )
    except subprocess.CalledProcessError as e:
        err_msg = e.stderr or e.stdout
        logger.error(f"Git push failed: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Git push failed: {err_msg}")

    # 6. Retrieve commit SHA
    hash_res = subprocess.run(
        [git_bin, "-C", local_path, "rev-parse", "--short", "HEAD"],
        capture_output=True, text=True, startupinfo=startupinfo
    )
    commit_hash = hash_res.stdout.strip() if hash_res.returncode == 0 else ""

    db.update_patch_status(patch_id, "pushed")

    return {
        "success": True,
        "commit_hash": commit_hash,
        "branch": current_branch,
        "message": f"Successfully pushed commit {commit_hash} to {current_branch}!"
    }

@app.post("/api/auth/signup")
def auth_signup(payload: dict, response: Response):
    email = payload.get("email", "").strip()
    password = payload.get("password", "").strip()
    name = payload.get("name", "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    user_id = db.create_user(email, auth.hash_password(password), name)
    if not user_id:
        raise HTTPException(status_code=400, detail="Email address is already registered.")

    auth.set_session_cookie(response, user_id)
    user = db.get_user_by_id(user_id)
    return {"success": True, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "avatar_url": user["avatar_url"]}}

@app.post("/api/auth/signin")
def auth_signin(payload: dict, response: Response):
    email = payload.get("email", "").strip()
    password = payload.get("password", "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    user = db.get_user_by_email(email)
    if not user or not auth.verify_password(password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email address or password.")

    if not auth.is_bcrypt_hash(user["password"]):
        db.set_user_password(user["id"], auth.hash_password(password))

    auth.set_session_cookie(response, user["id"])
    return {"success": True, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "avatar_url": user["avatar_url"]}}
