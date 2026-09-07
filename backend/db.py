import sqlite3
import os
import json
import logging
import numpy as np

logger = logging.getLogger(__name__)

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.db")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def _migrate_users_table(cursor):
    """Rebuilds a pre-existing `users` table so `password` is nullable (OAuth-only
    accounts have none) and the new avatar_url/api_key/created_at columns exist.
    SQLite can't relax NOT NULL via ALTER TABLE, so this does a rename dance.
    No-ops on a fresh table (already created with the right schema) or one
    already migrated."""
    cursor.execute("PRAGMA table_info(users)")
    columns = {row["name"]: dict(row) for row in cursor.fetchall()}
    password_col = columns.get("password")
    if not password_col or password_col["notnull"] == 0:
        return

    cursor.execute("""
    CREATE TABLE users_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        name TEXT,
        avatar_url TEXT,
        api_key TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("INSERT INTO users_migrated (id, email, password, name) SELECT id, email, password, name FROM users")
    cursor.execute("DROP TABLE users")
    cursor.execute("ALTER TABLE users_migrated RENAME TO users")
    logger.info("Migrated users table: password is now nullable (OAuth-only accounts supported).")

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("PRAGMA foreign_keys = ON;")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        name TEXT,
        avatar_url TEXT,
        api_key TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    _migrate_users_table(cursor)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS oauth_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        access_token_encrypted BLOB NOT NULL,
        refresh_token_encrypted BLOB,
        token_expires_at TIMESTAMP,
        scope TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_user_id),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        url TEXT,
        local_path TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    try:
        cursor.execute("ALTER TABLE repositories ADD COLUMN user_id INTEGER REFERENCES users(id)")
    except sqlite3.OperationalError:
        pass  # column already exists

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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_identities(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_repositories_user ON repositories(user_id)")

    conn.commit()
    conn.close()

# ---------------------------------------------------------------------------
# Users & sessions
# ---------------------------------------------------------------------------

def create_user(email, password_hash, name):
    """password_hash may be None for OAuth-only accounts created via upsert_oauth_user."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (email, password, name) VALUES (?, ?, ?)",
            (email, password_hash, name)
        )
        user_id = cursor.lastrowid
        conn.commit()
        return user_id
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def get_user_by_email(email):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, password, name, avatar_url, api_key FROM users WHERE email = ?", (email,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def set_user_password(user_id, password_hash):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET password = ? WHERE id = ?", (password_hash, user_id))
    conn.commit()
    conn.close()

def get_user_by_id(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, password, name, avatar_url, api_key FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def upsert_oauth_user(provider, provider_user_id, email, name, avatar_url):
    """Finds the user linked to this provider identity, or links/creates one by email,
    or creates a brand new OAuth-only user. Returns the user_id."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT user_id FROM oauth_identities WHERE provider = ? AND provider_user_id = ?",
        (provider, provider_user_id)
    )
    row = cursor.fetchone()
    if row:
        user_id = row["user_id"]
        conn.close()
        return user_id

    user_id = None
    if email:
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        existing = cursor.fetchone()
        if existing:
            user_id = existing["id"]

    if user_id is None:
        cursor.execute(
            "INSERT INTO users (email, password, name, avatar_url) VALUES (?, ?, ?, ?)",
            (email, None, name, avatar_url)
        )
        user_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return user_id

def save_oauth_identity(user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted, expires_at, scope):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO oauth_identities (user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_user_id) DO UPDATE SET
            access_token_encrypted = excluded.access_token_encrypted,
            refresh_token_encrypted = excluded.refresh_token_encrypted,
            token_expires_at = excluded.token_expires_at,
            scope = excluded.scope
    """, (user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted, expires_at, scope))
    conn.commit()
    conn.close()

def get_oauth_identity(user_id, provider):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM oauth_identities WHERE user_id = ? AND provider = ?",
        (user_id, provider)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_api_key_for_user(user_id):
    user = get_user_by_id(user_id)
    return user["api_key"] if user else None

def set_api_key_for_user(user_id, api_key):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET api_key = ? WHERE id = ?", (api_key, user_id))
    conn.commit()
    conn.close()

# ---------------------------------------------------------------------------
# Repositories (scoped by owner)
# ---------------------------------------------------------------------------

def save_repository(name, url, local_path, user_id, status="ready"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO repositories (name, url, local_path, status, user_id) VALUES (?, ?, ?, ?, ?)",
        (name, url, local_path, status, user_id)
    )
    repo_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return repo_id

def get_repository(repo_id, user_id):
    """Returns the repo row only if it belongs to user_id, else None."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, url, local_path, status, error_message, created_at FROM repositories WHERE id = ? AND user_id = ?",
        (repo_id, user_id)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def list_repositories_for_user(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, url, local_path, status, error_message, created_at FROM repositories WHERE user_id = ?",
        (user_id,)
    )
    repos = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return repos

def delete_repository(repo_id, user_id):
    """Deletes the repo if owned by user_id and returns the deleted row, else None."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT local_path, url FROM repositories WHERE id = ? AND user_id = ?",
        (repo_id, user_id)
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    cursor.execute("DELETE FROM repositories WHERE id = ? AND user_id = ?", (repo_id, user_id))
    conn.commit()
    conn.close()
    return dict(row)

def update_repo_status(repo_id, status, error_message=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE repositories SET status = ?, error_message = ? WHERE id = ?",
        (status, error_message, repo_id)
    )
    conn.commit()
    conn.close()

def save_files_batch(repo_id, files):
    """files: list of {file_path, language, content, size_bytes}. One connection
    for the whole repo instead of one per file — this is the ingestion hot path."""
    if not files:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany(
        "INSERT INTO files (repo_id, file_path, language, content, size_bytes) VALUES (?, ?, ?, ?, ?)",
        [(repo_id, f["file_path"], f["language"], f["content"], f["size_bytes"]) for f in files]
    )
    conn.commit()
    conn.close()

def save_chunks_batch(repo_id, chunks):
    """chunks: list of {file_path, start_line, end_line, type, name, text, embedding}.
    One connection for the whole repo instead of one per chunk — this is the
    ingestion hot path for repos with hundreds or thousands of chunks."""
    if not chunks:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = []
    for c in chunks:
        arr = np.array(c["embedding"], dtype=np.float32)
        rows.append((repo_id, c["file_path"], c["start_line"], c["end_line"], c["type"], c["name"], c["text"], arr.tobytes()))
    cursor.executemany(
        "INSERT INTO chunks (repo_id, file_path, start_line, end_line, type, name, text, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rows
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
