"""Client portal auth — license owners. Reuses bcrypt; JWT typ='client' carries tenant."""
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import Header, HTTPException, Cookie
from .config import settings
from .db import pool

ALGO = "HS256"
SESSION_HOURS = 12
COOKIE_NAME = "client_session"


def make_client_token(uid: str, tenant_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": uid, "tid": tenant_id, "typ": "client", "iat": now, "exp": now + timedelta(hours=SESSION_HOURS)},
        settings.admin_jwt_secret, algorithm=ALGO,
    )


def _extract_client_token(authorization: str | None, client_session: str | None) -> str | None:
    if client_session:
        return client_session
    if authorization and authorization.lower().startswith("bearer "):
        cand = authorization[7:].strip()
        if not cand.startswith("bwl_"):   # don't capture tenant API keys
            return cand
    return None


async def _load_client(token: str | None) -> dict | None:
    """Decode a client session and load the (active) client + tenant, else None."""
    if not token:
        return None
    try:
        p = jwt.decode(token, settings.admin_jwt_secret, algorithms=[ALGO])
        if p.get("typ") != "client":
            return None
    except JWTError:
        return None
    row = await pool().fetchrow(
        """SELECT c.id, c.email, c.name, c.role, c.status, c.tenant_id, t.status AS tenant_status
           FROM client_users c JOIN tenants t ON t.id=c.tenant_id WHERE c.id=$1""",
        p["sub"],
    )
    if not row or row["status"] != "active" or row["tenant_status"] not in ("active", "trial"):
        return None
    return dict(row)


async def require_client(
    authorization: str | None = Header(default=None),
    client_session: str | None = Cookie(default=None),
) -> dict:
    row = await _load_client(_extract_client_token(authorization, client_session))
    if not row:
        raise HTTPException(401, "client authentication required")
    return row


async def optional_client(
    authorization: str | None = Header(default=None),
    client_session: str | None = Cookie(default=None),
) -> dict | None:
    """Like require_client but returns None instead of raising — used to make the
    rooms API recognize a portal session without forcing it (API-key/embed flows)."""
    return await _load_client(_extract_client_token(authorization, client_session))
