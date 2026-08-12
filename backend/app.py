import os
import shutil
import traceback
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

import db
import rag
from agent import SoftwareAgent

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Load .env file manually
backend_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(backend_dir, ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()

app = FastAPI(title="DevCopilot API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session key fallback if not in env
LOCAL_API_KEY = os.environ.get("MOONSHOT_API_KEY") or os.environ.get("GEMINI_API_KEY", "")

def get_api_key(authorization: Optional[str] = Header(None)) -> str:
    """Gets the Gemini API key from environment, backend config, or authorization header."""
    global LOCAL_API_KEY
    if LOCAL_API_KEY:
        return LOCAL_API_KEY
    
    if authorization and authorization.startswith("Bearer "):
        key = authorization.split(" ")[1].strip()
        if key:
            return key
            
    raise HTTPException(
        status_code=401,
        detail="Gemini API Key required. Please configure it in Settings."
    )

# Models
class RepoConnectRequest(BaseModel):
    name: str
    url: Optional[str] = None
    local_path: Optional[str] = None # Support local directory scan!

class ChatRequest(BaseModel):
    repo_id: int
    message: str

# Ingestion Worker
def ingest_repository_task(repo_id: int, api_key: str):
    """Clones (if git URL) and ingests repository files and code chunks."""
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
            cloned_path = rag.clone_repository(repo_url, uploads_dir, git_path)
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
        
        # Initialize Gemini embedder client
        rag_client = rag.GeminiClient(api_key)
        
        # Save files and create chunks
        for idx, f in enumerate(files):
            file_path = f["file_path"]
            logger.info(f"Ingesting file ({idx+1}/{len(files)}): {file_path}")
            
            file_id = db.save_file(
                repo_id=repo_id,
                file_path=file_path,
                language=f["language"],
                content=f["content"],
                size_bytes=f["size_bytes"]
            )
            
            # Chunk file
            chunks = rag.chunk_file(file_path, f["content"], f["language"])
            logger.info(f"Generated {len(chunks)} chunks for {file_path}")
            
            # Generate embeddings and save chunks
            for chunk in chunks:
                try:
                    emb = rag_client.embed_text(chunk["text"])
                    db.save_chunk(
                        repo_id=repo_id,
                        file_path=file_path,
                        start_line=chunk["start_line"],
                        end_line=chunk["end_line"],
                        chunk_type=chunk["type"],
                        name=chunk["name"],
                        text=chunk["text"],
                        embedding_vector=emb
                    )
                except Exception as chunk_err:
                    logger.error(f"Error embedding chunk of {file_path}: {chunk_err}")
                    
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
def get_status():
    global LOCAL_API_KEY
    return {
        "api_key_configured": bool(LOCAL_API_KEY)
    }

@app.post("/api/settings/apikey")
def save_api_key(payload: dict):
    global LOCAL_API_KEY
    key = payload.get("api_key", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key is empty")
    LOCAL_API_KEY = key
    return {"success": True, "message": "API key updated."}

@app.get("/api/repositories")
def list_repositories():
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, url, local_path, status, error_message, created_at FROM repositories")
    repos = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return repos

@app.post("/api/repositories")
def connect_repository(req: RepoConnectRequest, background_tasks: BackgroundTasks, authorization: Optional[str] = Header(None)):
    api_key = get_api_key(authorization)
    
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
        status="pending"
    )
    
    # Schedule ingestion task
    background_tasks.add_task(ingest_repository_task, repo_id, api_key)
    return {"repo_id": repo_id, "status": "pending"}

@app.delete("/api/repositories/{repo_id}")
def delete_repository(repo_id: int):
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT local_path, url FROM repositories WHERE id = ?", (repo_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=440, detail="Repository not found")
        
    local_path = row["local_path"]
    is_cloned = bool(row["url"]) # If URL is set, we cloned it to uploads/
    
    # Delete from DB
    cursor.execute("DELETE FROM repositories WHERE id = ?", (repo_id,))
    conn.commit()
    conn.close()
    
    # Clean up cloned files from uploads folder
    if is_cloned and local_path and os.path.exists(local_path):
        try:
            shutil.rmtree(local_path)
        except Exception as e:
            logger.error(f"Could not delete local clone path {local_path}: {e}")
            
    return {"success": True}

@app.get("/api/repositories/{repo_id}/files")
def get_repo_files(repo_id: int):
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, size_bytes, language FROM files WHERE repo_id = ?", (repo_id,))
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(r) for r in rows]

@app.get("/api/repositories/{repo_id}/file")
def get_file_content(repo_id: int, path: str = Query(...)):
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, content, language FROM files WHERE repo_id = ? AND file_path = ?", (repo_id, path))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail=f"File {path} not found in index.")
        
    return dict(row)

@app.post("/api/agent/chat")
def chat_with_agent(req: ChatRequest, authorization: Optional[str] = Header(None)):
    api_key = get_api_key(authorization)
    
    # Retrieve repository paths
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT local_path FROM repositories WHERE id = ?", (req.repo_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    local_path = row["local_path"]
    
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
def get_chat_history(repo_id: int):
    return db.get_chat_history(repo_id)

@app.get("/api/repositories/{repo_id}/endpoints")
def discover_endpoints(repo_id: int):
    import re
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
def run_repository_tests(repo_id: int):
    import run_tests
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT local_path FROM repositories WHERE id = ?", (repo_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    local_path = row["local_path"]
    node_path = os.environ.get("NODE_PATH", "")
    python_path = os.environ.get("PYTHON_PATH", "")
    
    res = run_tests.execute_repo_tests(local_path, node_path, python_path)
    return res

@app.post("/api/auth/signup")
def auth_signup(payload: dict):
    email = payload.get("email", "").strip()
    password = payload.get("password", "").strip()
    name = payload.get("name", "").strip()
    
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
        
    success = db.create_user(email, password, name)
    if not success:
        raise HTTPException(status_code=400, detail="Email address is already registered.")
        
    return {"success": True, "message": "User registered successfully."}

@app.post("/api/auth/signin")
def auth_signin(payload: dict):
    email = payload.get("email", "").strip()
    password = payload.get("password", "").strip()
    
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
        
    user_data = db.verify_user(email, password)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid email address or password.")
        
    return {"success": True, "user": user_data}


