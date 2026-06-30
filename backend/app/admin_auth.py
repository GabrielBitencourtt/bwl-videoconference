"""Admin panel authentication — bcrypt passwords + signed JWT sessions."""
from datetime import datetime, timedelta, timezone
import bcrypt
from jose import jwt, JWTError
from fastapi import Header, HTTPException, Depends, Cookie
from .db import pool
from .config import settings

COOKIE_NAME = "admin_session"

ALGO = "HS256"
SESSION_HOURS = 8


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(admin_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": admin_id, "role": role, "typ": "admin",
               "iat": now, "exp": now + timedelta(hours=SESSION_HOURS)}
    return jwt.encode(payload, settings.admin_jwt_secret, algorithm=ALGO)


async def require_admin(
    authorization: str | None = Header(default=None),
    admin_session: str | None = Cookie(default=None),
) -> dict:
    # Prefer the httpOnly cookie (XSS-safe); fall back to Bearer header (curl/tooling).
    token = admin_session
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(401, "admin authentication required")
    try:
        payload = jwt.decode(token, settings.admin_jwt_secret, algorithms=[ALGO])
        if payload.get("typ") != "admin":
            raise JWTError("wrong token type")
    except JWTError:
        raise HTTPException(401, "invalid or expired session")
    row = await pool().fetchrow(
        "SELECT id, email, name, role, status FROM admin_users WHERE id=$1", payload["sub"]
    )
    if not row or row["status"] != "active":
        raise HTTPException(401, "account inactive")
    return dict(row)


def require_superadmin(admin: dict = Depends(require_admin)) -> dict:
    if admin["role"] != "superadmin":
        raise HTTPException(403, "requires superadmin")
    return admin
