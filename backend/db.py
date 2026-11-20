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

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS code_symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        name TEXT NOT NULL,
        symbol_type TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        signature TEXT,
        FOREIGN KEY (repo_id) REFERENCES repositories (id) ON DELETE CASCADE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS debug_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        error_message TEXT NOT NULL,
        stack_trace TEXT,
        language TEXT,
        status TEXT DEFAULT 'pending',
        error_type TEXT,
        root_cause TEXT,
        confidence REAL,
        suggested_fix TEXT,
        recommended_tests TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories (id) ON DELETE CASCADE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS debug_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        code_snippet TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        relevance_score REAL DEFAULT 1.0,
        FOREIGN KEY (session_id) REFERENCES debug_sessions (id) ON DELETE CASCADE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        diff_content TEXT NOT NULL,
        original_content TEXT,
        patched_content TEXT,
        status TEXT DEFAULT 'proposed',
        applied_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES debug_sessions (id) ON DELETE CASCADE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        session_id INTEGER,
        command TEXT,
        status TEXT,
        output TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories (id) ON DELETE CASCADE
    )
    """)

    try:
        cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            file_path,
            content,
            repo_id UNINDEXED
        )
        """)
    except Exception as e:
        logger.warning(f"Could not initialize FTS5 table: {e}")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_repo ON files(repo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_repo ON chunks(repo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_repo ON chat_history(repo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_identities(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_repositories_user ON repositories(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_symbols_repo ON code_symbols(repo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_symbols_name ON code_symbols(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_debug_repo ON debug_sessions(repo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_evidence_session ON debug_evidence(session_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_patches_session ON patches(session_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_test_runs_repo ON test_runs(repo_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_test_runs_session ON test_runs(session_id)")

    # Backfill symbols and FTS for any pre-existing files
    _backfill_symbols_and_fts(cursor)

    conn.commit()
    conn.close()

def _backfill_symbols_and_fts(cursor):
    """Automatically populates code_symbols and files_fts for any pre-existing files."""
    try:
        cursor.execute("SELECT COUNT(*) FROM code_symbols")
        sym_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM files")
        file_count = cursor.fetchone()[0]

        if sym_count == 0 and file_count > 0:
            logger.info("Backfilling code_symbols and files_fts for existing repositories...")
            cursor.execute("SELECT repo_id, file_path, content, language FROM files")
            rows = cursor.fetchall()

            import rag
            all_symbols = []
            for r in rows:
                syms = rag.extract_symbols(r["file_path"], r["content"], r["language"])
                for s in syms:
                    all_symbols.append((
                        r["repo_id"], s["file_path"], s["name"], s["symbol_type"],
                        s["start_line"], s["end_line"], s.get("signature", "")
                    ))

            if all_symbols:
                cursor.executemany(
                    """INSERT INTO code_symbols (repo_id, file_path, name, symbol_type, start_line, end_line, signature)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    all_symbols
                )
                logger.info(f"Successfully backfilled {len(all_symbols)} code symbols.")

        cursor.execute("SELECT COUNT(*) FROM files_fts")
        fts_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM files")
        file_count = cursor.fetchone()[0]
        if fts_count == 0 and file_count > 0:
            cursor.execute("SELECT repo_id, file_path, content FROM files")
            rows = cursor.fetchall()
            cursor.executemany(
                "INSERT INTO files_fts (file_path, content, repo_id) VALUES (?, ?, ?)",
                [(r["file_path"], r["content"], str(r["repo_id"])) for r in rows]
            )
            logger.info(f"Successfully backfilled {len(rows)} files into FTS5 index.")
    except Exception as e:
        logger.warning(f"Backfill skipped or failed: {e}")


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
    try:
        cursor.execute("DELETE FROM files_fts WHERE repo_id = ?", (str(repo_id),))
    except Exception:
        pass
    conn.commit()
    conn.close()
    return dict(row)

def clear_repository_index(repo_id):
    """Clears existing files, chunks, symbols, and FTS index for a repo prior to reindexing."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM files WHERE repo_id = ?", (repo_id,))
    cursor.execute("DELETE FROM chunks WHERE repo_id = ?", (repo_id,))
    cursor.execute("DELETE FROM code_symbols WHERE repo_id = ?", (repo_id,))
    try:
        cursor.execute("DELETE FROM files_fts WHERE repo_id = ?", (str(repo_id),))
    except Exception:
        pass
    conn.commit()
    conn.close()

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
    try:
        cursor.executemany(
            "INSERT INTO files_fts (file_path, content, repo_id) VALUES (?, ?, ?)",
            [(f["file_path"], f["content"], str(repo_id)) for f in files]
        )
    except Exception as e:
        logger.warning(f"Could not populate files_fts: {e}")
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

# ---------------------------------------------------------------------------
# Code Symbols & FTS5 Code Search
# ---------------------------------------------------------------------------

def save_symbols_batch(repo_id, symbols):
    """symbols: list of {file_path, name, symbol_type, start_line, end_line, signature}."""
    if not symbols:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany(
        """INSERT INTO code_symbols (repo_id, file_path, name, symbol_type, start_line, end_line, signature)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [(repo_id, s["file_path"], s["name"], s.get("symbol_type", "function"),
          s["start_line"], s["end_line"], s.get("signature", "")) for s in symbols]
    )
    conn.commit()
    conn.close()

def get_symbols_for_repo(repo_id, limit=500):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, file_path, name, symbol_type, start_line, end_line, signature FROM code_symbols WHERE repo_id = ? LIMIT ?",
        (repo_id, limit)
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def find_symbols_by_name(repo_id, name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, file_path, name, symbol_type, start_line, end_line, signature FROM code_symbols WHERE repo_id = ? AND name = ?",
        (repo_id, name)
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def search_code_fts(repo_id, query, limit=10):
    """Full-text search over indexed source code files using SQLite FTS5."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Sanitize query for FTS5 (strip special chars)
        clean_query = "".join(c if c.isalnum() or c in ("_", " ") else " " for c in query).strip()
        if not clean_query:
            return []
        tokens = clean_query.split()
        fts_query = " OR ".join(f'"{t}"' for t in tokens if len(t) > 2)
        if not fts_query:
            return []
        cursor.execute(
            """SELECT file_path, snippet(files_fts, 1, '<b>', '</b>', '...', 20) as snippet, repo_id
               FROM files_fts
               WHERE repo_id = ? AND files_fts MATCH ?
               LIMIT ?""",
            (str(repo_id), fts_query, limit)
        )
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        logger.warning(f"FTS5 query failed: {e}")
        return []
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# Debug Sessions & Evidence
# ---------------------------------------------------------------------------

def create_debug_session(repo_id, error_message, stack_trace=None, language=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO debug_sessions (repo_id, error_message, stack_trace, language, status)
           VALUES (?, ?, ?, ?, 'pending')""",
        (repo_id, error_message, stack_trace, language)
    )
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return session_id

def get_debug_session(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM debug_sessions WHERE id = ?", (session_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    data = dict(row)
    if data.get("recommended_tests"):
        try:
            data["recommended_tests"] = json.loads(data["recommended_tests"])
        except Exception:
            pass
    return data

def list_debug_sessions_for_repo(repo_id, limit=20):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM debug_sessions WHERE repo_id = ? ORDER BY id DESC LIMIT ?",
        (repo_id, limit)
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    for d in rows:
        if d.get("recommended_tests"):
            try:
                d["recommended_tests"] = json.loads(d["recommended_tests"])
            except Exception:
                pass
    return rows

def update_debug_session(session_id, status, error_type=None, root_cause=None,
                         confidence=None, suggested_fix=None, recommended_tests=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    tests_json = json.dumps(recommended_tests) if isinstance(recommended_tests, list) else recommended_tests
    cursor.execute(
        """UPDATE debug_sessions
           SET status = ?,
               error_type = COALESCE(?, error_type),
               root_cause = COALESCE(?, root_cause),
               confidence = COALESCE(?, confidence),
               suggested_fix = COALESCE(?, suggested_fix),
               recommended_tests = COALESCE(?, recommended_tests)
           WHERE id = ?""",
        (status, error_type, root_cause, confidence, suggested_fix, tests_json, session_id)
    )
    conn.commit()
    conn.close()

def save_debug_evidence_batch(session_id, evidence_list):
    """evidence_list: list of {file_path, start_line, end_line, code_snippet, evidence_type, relevance_score}."""
    if not evidence_list:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany(
        """INSERT INTO debug_evidence (session_id, file_path, start_line, end_line, code_snippet, evidence_type, relevance_score)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [(session_id, e["file_path"], e["start_line"], e["end_line"],
          e["code_snippet"], e.get("evidence_type", "source_origin"), e.get("relevance_score", 1.0))
         for e in evidence_list]
    )
    conn.commit()
    conn.close()

def get_debug_evidence(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM debug_evidence WHERE session_id = ? ORDER BY relevance_score DESC, id ASC",
        (session_id,)
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

# ---------------------------------------------------------------------------
# Patches
# ---------------------------------------------------------------------------

def create_patch(session_id, file_path, diff_content, original_content=None, patched_content=None, status="proposed"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO patches (session_id, file_path, diff_content, original_content, patched_content, status)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (session_id, file_path, diff_content, original_content, patched_content, status)
    )
    patch_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return patch_id

def get_patch(patch_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patches WHERE id = ?", (patch_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_patches_for_session(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patches WHERE session_id = ? ORDER BY id ASC", (session_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def update_patch_status(patch_id, status):
    conn = get_db_connection()
    cursor = conn.cursor()
    if status == 'applied':
        cursor.execute("UPDATE patches SET status = ?, applied_at = CURRENT_TIMESTAMP WHERE id = ?", (status, patch_id))
    else:
        cursor.execute("UPDATE patches SET status = ? WHERE id = ?", (status, patch_id))
    conn.commit()
    conn.close()

# ---------------------------------------------------------------------------
# Test Runs
# ---------------------------------------------------------------------------

def save_test_run(repo_id, session_id, command, status, output, duration_ms):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO test_runs (repo_id, session_id, command, status, output, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (repo_id, session_id, command, status, output, duration_ms)
    )
    run_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return run_id

def get_test_runs(repo_id, session_id=None, limit=20):
    conn = get_db_connection()
    cursor = conn.cursor()
    if session_id:
        cursor.execute(
            "SELECT * FROM test_runs WHERE repo_id = ? AND session_id = ? ORDER BY id DESC LIMIT ?",
            (repo_id, session_id, limit)
        )
    else:
        cursor.execute(
            "SELECT * FROM test_runs WHERE repo_id = ? ORDER BY id DESC LIMIT ?",
            (repo_id, limit)
        )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

