import os
import time
import hmac
import hashlib
import secrets

import bcrypt
import jwt
from cryptography.fernet import Fernet
from fastapi import Request, HTTPException

import db

JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7  # 7 days

STATE_MAX_AGE_SECONDS = 60 * 10  # 10 minutes

_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is None:
        key = os.environ.get("TOKEN_ENCRYPTION_KEY", "")
        if not key:
            raise RuntimeError("TOKEN_ENCRYPTION_KEY is not configured in .env")
        _fernet = Fernet(key.encode("utf-8"))
    return _fernet


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def is_bcrypt_hash(value: str) -> bool:
    return bool(value) and value.startswith(("$2a$", "$2b$", "$2y$"))


def verify_password(password: str, password_hash: str) -> bool:
    """Accounts created before password hashing was added still hold their
    original plaintext password. Fall back to a direct comparison for those
    so existing users aren't locked out; the caller re-hashes on success."""
    if not password_hash:
        return False
    if is_bcrypt_hash(password_hash):
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    return secrets.compare_digest(password, password_hash)


def create_session_token(user_id: int) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + SESSION_MAX_AGE_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def set_session_cookie(response, user_id: int) -> None:
    is_production = os.environ.get("ENV", "development") == "production"
    response.set_cookie(
        key="session",
        value=create_session_token(user_id),
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=SESSION_MAX_AGE_SECONDS,
        path="/",
    )


def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_session_token(token)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = db.get_user_by_id(int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def encrypt_token(raw: str) -> bytes:
    return _get_fernet().encrypt(raw.encode("utf-8"))


def decrypt_token(blob: bytes) -> str:
    return _get_fernet().decrypt(bytes(blob)).decode("utf-8")


def create_oauth_state() -> str:
    """Signed, self-contained CSRF token for the OAuth authorize->callback round trip.
    No server-side session store needed: the signature + embedded timestamp is enough."""
    nonce = secrets.token_urlsafe(16)
    timestamp = str(int(time.time()))
    message = f"{nonce}:{timestamp}"
    signature = hmac.new(JWT_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{message}:{signature}"


def verify_oauth_state(state: str) -> bool:
    try:
        nonce, timestamp, signature = state.split(":")
    except ValueError:
        return False

    message = f"{nonce}:{timestamp}"
    expected = hmac.new(JWT_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return False

    if int(time.time()) - int(timestamp) > STATE_MAX_AGE_SECONDS:
        return False

    return True
