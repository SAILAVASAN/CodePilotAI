import sqlite3
import os
import json
import numpy as np

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.db")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("PRAGMA foreign_keys = ON;")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT,
        local_path TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        language TEXT NOT NULL,
        content TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        FOREIGN KEY (repo_id) REFERENCES repositories (id) ON DELETE CASCADE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        type TEXT NOT NULL,
        name TEXT,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        FOREIGN KEY (repo_id) REFERENCES repositories (id) ON DELETE CASCADE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        steps TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories (id) ON DELETE CASCADE
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_repo ON files(repo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_repo ON chunks(repo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_repo ON chat_history(repo_id)")

    conn.commit()
    conn.close()

def save_repository(name, url, local_path, status="ready"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO repositories (name, url, local_path, status) VALUES (?, ?, ?, ?)",
        (name, url, local_path, status)
    )
    repo_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return repo_id

def update_repo_status(repo_id, status, error_message=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE repositories SET status = ?, error_message = ? WHERE id = ?",
        (status, error_message, repo_id)
    )
    conn.commit()
    conn.close()

def save_file(repo_id, file_path, language, content, size_bytes):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO files (repo_id, file_path, language, content, size_bytes) VALUES (?, ?, ?, ?, ?)",
        (repo_id, file_path, language, content, size_bytes)
    )
    file_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return file_id

def save_chunk(repo_id, file_path, start_line, end_line, chunk_type, name, text, embedding_vector):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Serialize float array to binary blob
    arr = np.array(embedding_vector, dtype=np.float32)
    blob = arr.tobytes()
    
    cursor.execute(
        "INSERT INTO chunks (repo_id, file_path, start_line, end_line, type, name, text, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (repo_id, file_path, start_line, end_line, chunk_type, name, text, blob)
    )
    conn.commit()
    conn.close()

def get_chunks_for_repo(repo_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, start_line, end_line, type, name, text, embedding FROM chunks WHERE repo_id = ?", (repo_id,))
    rows = cursor.fetchall()
    
    chunks = []
    for r in rows:
        embedding = np.frombuffer(r['embedding'], dtype=np.float32)
        chunks.append({
            'file_path': r['file_path'],
            'start_line': r['start_line'],
            'end_line': r['end_line'],
            'type': r['type'],
            'name': r['name'],
            'text': r['text'],
            'embedding': embedding
        })
    conn.close()
    return chunks

def save_chat_message(repo_id, role, content, steps=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    steps_str = json.dumps(steps) if steps else None
    cursor.execute(
        "INSERT INTO chat_history (repo_id, role, content, steps) VALUES (?, ?, ?, ?)",
        (repo_id, role, content, steps_str)
    )
    conn.commit()
    conn.close()

def get_chat_history(repo_id, limit=30):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, content, steps, created_at FROM chat_history WHERE repo_id = ? ORDER BY id ASC LIMIT ?",
        (repo_id, limit)
    )
    rows = cursor.fetchall()
    history = []
    for r in rows:
        history.append({
            'role': r['role'],
            'content': r['content'],
            'steps': json.loads(r['steps']) if r['steps'] else None,
            'created_at': r['created_at']
        })
    conn.close()
    return history

def create_user(email, password, name):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (email, password, name) VALUES (?, ?, ?)",
            (email, password, name)
        )
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        success = False
    finally:
        conn.close()
    return success

def verify_user(email, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT email, name FROM users WHERE email = ? AND password = ?",
        (email, password)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"email": row["email"], "name": row["name"]}
    return None
