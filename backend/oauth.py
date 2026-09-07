import os
import time
import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse

import auth
import db

logger = logging.getLogger(__name__)
router = APIRouter()

GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.environ.get("GITHUB_REDIRECT_URI", "")

GITLAB_CLIENT_ID = os.environ.get("GITLAB_CLIENT_ID", "")
GITLAB_CLIENT_SECRET = os.environ.get("GITLAB_CLIENT_SECRET", "")
GITLAB_REDIRECT_URI = os.environ.get("GITLAB_REDIRECT_URI", "")

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

_client = httpx.Client(timeout=30.0)


@router.get("/api/auth/me")
def get_me(current_user: dict = Depends(auth.get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "name": current_user["name"],
        "avatar_url": current_user["avatar_url"],
    }


@router.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("session", path="/")
    return {"success": True}


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------

@router.get("/api/auth/github/login")
def github_login():
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured (missing GITHUB_CLIENT_ID).")
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": GITHUB_REDIRECT_URI,
        "scope": "repo read:user user:email",
        "state": auth.create_oauth_state(),
    }
    return RedirectResponse(url=f"https://github.com/login/oauth/authorize?{urlencode(params)}")


@router.get("/api/auth/github/callback")
def github_callback(code: str = Query(...), state: str = Query(...)):
    if not auth.verify_oauth_state(state):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    token_res = _client.post(
        "https://github.com/login/oauth/access_token",
        data={
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": GITHUB_REDIRECT_URI,
        },
        headers={"Accept": "application/json"},
    )
    token_data = token_res.json()
    access_token = token_data.get("access_token")
    if not access_token:
        logger.error(f"GitHub token exchange failed: {token_data}")
        raise HTTPException(status_code=400, detail="GitHub authorization failed.")

    # Present only if the GitHub App has "Expire user access tokens" enabled —
    # a non-expiring classic token simply won't include these fields.
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in")
    expires_at = int(time.time()) + expires_in if expires_in else None

    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    profile = _client.get("https://api.github.com/user", headers=headers).json()

    email = profile.get("email")
    if not email:
        emails_res = _client.get("https://api.github.com/user/emails", headers=headers)
        emails = emails_res.json() if emails_res.status_code == 200 else []
        primary = next((e for e in emails if e.get("primary")), None)
        email = (primary or {}).get("email") or f"{profile['login']}@users.noreply.github.com"

    user_id = db.upsert_oauth_user(
        provider="github",
        provider_user_id=str(profile["id"]),
        email=email,
        name=profile.get("name") or profile.get("login"),
        avatar_url=profile.get("avatar_url"),
    )
    db.save_oauth_identity(
        user_id=user_id,
        provider="github",
        provider_user_id=str(profile["id"]),
        access_token_encrypted=auth.encrypt_token(access_token),
        refresh_token_encrypted=auth.encrypt_token(refresh_token) if refresh_token else None,
        expires_at=expires_at,
        scope=token_data.get("scope", ""),
    )

    response = RedirectResponse(url=f"{FRONTEND_ORIGIN}/?oauth=success&provider=github")
    auth.set_session_cookie(response, user_id)
    return response


def _refresh_github_token(user_id, identity):
    refresh_token = auth.decrypt_token(identity["refresh_token_encrypted"])
    token_data = _client.post(
        "https://github.com/login/oauth/access_token",
        data={
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        headers={"Accept": "application/json"},
    ).json()
    new_access_token = token_data.get("access_token")
    if not new_access_token:
        raise HTTPException(status_code=400, detail="Failed to refresh GitHub session. Please reconnect your account.")

    new_refresh_token = token_data.get("refresh_token", refresh_token)
    expires_in = token_data.get("expires_in")
    new_expires_at = int(time.time()) + expires_in if expires_in else None
    db.save_oauth_identity(
        user_id=user_id,
        provider="github",
        provider_user_id=identity["provider_user_id"],
        access_token_encrypted=auth.encrypt_token(new_access_token),
        refresh_token_encrypted=auth.encrypt_token(new_refresh_token),
        expires_at=new_expires_at,
        scope=identity["scope"],
    )
    return new_access_token


def _fetch_github_repos(access_token):
    repos = []
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    for page in range(1, 6):  # cap at 500 repos
        res = _client.get(
            "https://api.github.com/user/repos",
            headers=headers,
            params={"per_page": 100, "page": page, "sort": "updated"},
        )
        if res.status_code != 200:
            break
        batch = res.json()
        if not batch:
            break
        for r in batch:
            repos.append({
                "name": r["name"],
                "full_name": r["full_name"],
                "clone_url": r["clone_url"],
                "private": r["private"],
                "provider": "github",
            })
        if len(batch) < 100:
            break
    return repos


# ---------------------------------------------------------------------------
# GitLab
# ---------------------------------------------------------------------------

@router.get("/api/auth/gitlab/login")
def gitlab_login():
    if not GITLAB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitLab OAuth is not configured (missing GITLAB_CLIENT_ID).")
    params = {
        "client_id": GITLAB_CLIENT_ID,
        "redirect_uri": GITLAB_REDIRECT_URI,
        "response_type": "code",
        "scope": "read_repository read_api",
        "state": auth.create_oauth_state(),
    }
    return RedirectResponse(url=f"https://gitlab.com/oauth/authorize?{urlencode(params)}")


@router.get("/api/auth/gitlab/callback")
def gitlab_callback(code: str = Query(...), state: str = Query(...)):
    if not auth.verify_oauth_state(state):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    token_data = _client.post(
        "https://gitlab.com/oauth/token",
        json={
            "client_id": GITLAB_CLIENT_ID,
            "client_secret": GITLAB_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": GITLAB_REDIRECT_URI,
        },
    ).json()
    access_token = token_data.get("access_token")
    if not access_token:
        logger.error(f"GitLab token exchange failed: {token_data}")
        raise HTTPException(status_code=400, detail="GitLab authorization failed.")

    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in")
    expires_at = int(time.time()) + expires_in if expires_in else None

    profile = _client.get(
        "https://gitlab.com/api/v4/user",
        headers={"Authorization": f"Bearer {access_token}"},
    ).json()

    email = profile.get("email") or f"{profile['username']}@users.noreply.gitlab.com"

    user_id = db.upsert_oauth_user(
        provider="gitlab",
        provider_user_id=str(profile["id"]),
        email=email,
        name=profile.get("name") or profile.get("username"),
        avatar_url=profile.get("avatar_url"),
    )
    db.save_oauth_identity(
        user_id=user_id,
        provider="gitlab",
        provider_user_id=str(profile["id"]),
        access_token_encrypted=auth.encrypt_token(access_token),
        refresh_token_encrypted=auth.encrypt_token(refresh_token) if refresh_token else None,
        expires_at=expires_at,
        scope=token_data.get("scope", ""),
    )

    response = RedirectResponse(url=f"{FRONTEND_ORIGIN}/?oauth=success&provider=gitlab")
    auth.set_session_cookie(response, user_id)
    return response


def _refresh_gitlab_token(user_id, identity):
    refresh_token = auth.decrypt_token(identity["refresh_token_encrypted"])
    token_data = _client.post(
        "https://gitlab.com/oauth/token",
        json={
            "client_id": GITLAB_CLIENT_ID,
            "client_secret": GITLAB_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    ).json()
    new_access_token = token_data.get("access_token")
    if not new_access_token:
        raise HTTPException(status_code=400, detail="Failed to refresh GitLab session. Please reconnect your account.")

    new_refresh_token = token_data.get("refresh_token", refresh_token)
    expires_in = token_data.get("expires_in")
    new_expires_at = int(time.time()) + expires_in if expires_in else None
    db.save_oauth_identity(
        user_id=user_id,
        provider="gitlab",
        provider_user_id=identity["provider_user_id"],
        access_token_encrypted=auth.encrypt_token(new_access_token),
        refresh_token_encrypted=auth.encrypt_token(new_refresh_token),
        expires_at=new_expires_at,
        scope=identity["scope"],
    )
    return new_access_token


def _fetch_gitlab_repos(access_token):
    repos = []
    headers = {"Authorization": f"Bearer {access_token}"}
    for page in range(1, 6):  # cap at 500 repos
        res = _client.get(
            "https://gitlab.com/api/v4/projects",
            headers=headers,
            params={"membership": "true", "per_page": 100, "page": page, "order_by": "last_activity_at"},
        )
        if res.status_code != 200:
            break
        batch = res.json()
        if not batch:
            break
        for p in batch:
            repos.append({
                "name": p["name"],
                "full_name": p["path_with_namespace"],
                "clone_url": p["http_url_to_repo"],
                "private": p.get("visibility") != "public",
                "provider": "gitlab",
            })
        if len(batch) < 100:
            break
    return repos


# ---------------------------------------------------------------------------
# Shared: valid access token (with GitLab refresh) + repo listing/import wiring
# ---------------------------------------------------------------------------

_REFRESH_HANDLERS = {
    "github": _refresh_github_token,
    "gitlab": _refresh_gitlab_token,
}


def get_valid_access_token(user_id, provider):
    identity = db.get_oauth_identity(user_id, provider)
    if not identity:
        raise HTTPException(status_code=400, detail=f"No linked {provider} account. Please connect it first.")

    # Non-expiring tokens (token_expires_at is NULL) skip straight to returning
    # the stored token — this covers GitHub when "Expire user access tokens"
    # is off, which issues a token that never needs refreshing.
    if identity["token_expires_at"] and int(time.time()) >= identity["token_expires_at"] - 60:
        if not identity["refresh_token_encrypted"]:
            raise HTTPException(status_code=400, detail=f"{provider.capitalize()} session expired. Please reconnect your account.")
        return _REFRESH_HANDLERS[provider](user_id, identity)

    return auth.decrypt_token(identity["access_token_encrypted"])


def build_authenticated_clone_url(user_id, provider, clone_url):
    access_token = get_valid_access_token(user_id, provider)
    if provider == "github":
        return clone_url.replace("https://", f"https://{access_token}@", 1)
    if provider == "gitlab":
        return clone_url.replace("https://", f"https://oauth2:{access_token}@", 1)
    raise HTTPException(status_code=400, detail="Unknown provider.")


@router.get("/api/auth/{provider}/repos")
def list_provider_repos(provider: str, current_user: dict = Depends(auth.get_current_user)):
    if provider not in ("github", "gitlab"):
        raise HTTPException(status_code=400, detail="Unknown provider.")

    access_token = get_valid_access_token(current_user["id"], provider)
    if provider == "github":
        return _fetch_github_repos(access_token)
    return _fetch_gitlab_repos(access_token)
