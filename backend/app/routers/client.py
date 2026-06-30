"""Client self-service portal API. Scoped to the logged-in client's tenant."""
import json
import re
import secrets
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Response
from ..db import pool
from ..admin_auth import hash_password, verify_password
from ..client_auth import make_client_token, require_client, COOKIE_NAME, SESSION_HOURS
from ..tenancy import get_effective_limits, generate_api_key, normalize_branding
from ..services.livekit_service import livekit_participant_counts

router = APIRouter(prefix="/api/client", tags=["client"])
# path="/" so the session also authorizes the rooms/token/chat APIs the portal app uses.
_COOKIE = dict(httponly=True, secure=True, samesite="strict", path="/")


def _slugify(s: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or "cliente"
    return f"{base[:32]}-{secrets.token_hex(3)}"


class SignupBody(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=8)
    company: str


@router.post("/signup")
async def signup(body: SignupBody, response: Response):
    exists = await pool().fetchrow("SELECT 1 FROM client_users WHERE lower(email)=lower($1)", body.email)
    if exists:
        raise HTTPException(409, "e-mail já cadastrado")
    plan = await pool().fetchrow("SELECT id FROM plans WHERE slug='default'")
    tenant = await pool().fetchrow(
        "INSERT INTO tenants (name, slug, status, plan_id) VALUES ($1,$2,'trial',$3) RETURNING id",
        body.company, _slugify(body.company), plan["id"] if plan else None,
    )
    tid = str(tenant["id"])
    cu = await pool().fetchrow(
        "INSERT INTO client_users (tenant_id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,'owner') RETURNING id",
        tid, body.email, hash_password(body.password), body.name,
    )
    response.set_cookie(COOKIE_NAME, make_client_token(str(cu["id"]), tid), max_age=SESSION_HOURS * 3600, **_COOKIE)
    return {"ok": True}


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(body: LoginBody, response: Response):
    row = await pool().fetchrow("SELECT * FROM client_users WHERE lower(email)=lower($1)", body.email)
    if not row or row["status"] != "active" or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "credenciais inválidas")
    await pool().execute("UPDATE client_users SET last_login_at=now() WHERE id=$1", row["id"])
    response.set_cookie(COOKIE_NAME, make_client_token(str(row["id"]), str(row["tenant_id"])), max_age=SESSION_HOURS * 3600, **_COOKIE)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
async def me(client: dict = Depends(require_client)):
    tid = str(client["tenant_id"])
    t = await pool().fetchrow(
        "SELECT t.name, t.slug, t.status, t.branding, p.name AS plan FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=$1",
        tid,
    )
    return {
        "user": {"name": client["name"], "email": client["email"], "role": client["role"]},
        "license": {"name": t["name"], "slug": t["slug"], "status": t["status"], "plan": t["plan"],
                    "branding": normalize_branding(t["branding"]), "limits": await get_effective_limits(tid)},
    }


@router.get("/usage")
async def usage(client: dict = Depends(require_client)):
    tid = str(client["tenant_id"])
    r = await pool().fetchrow(
        """SELECT count(*) AS rooms_total, count(*) FILTER (WHERE status='active') AS rooms_active,
                  count(*) FILTER (WHERE recording_url IS NOT NULL) AS recordings
           FROM video_rooms WHERE tenant_id=$1""", tid)
    p = await pool().fetchrow(
        "SELECT count(*) AS participants FROM video_room_participants vp JOIN video_rooms vr ON vr.id=vp.room_id WHERE vr.tenant_id=$1", tid)
    live = await livekit_participant_counts()
    names = {x["room_id"] for x in await pool().fetch("SELECT room_id FROM video_rooms WHERE tenant_id=$1 AND status='active'", tid)}
    return {"rooms_total": r["rooms_total"], "rooms_active": r["rooms_active"], "recordings": r["recordings"],
            "participants": p["participants"], "live_participants": sum(live.get(n, 0) for n in names)}


@router.get("/rooms")
async def rooms(client: dict = Depends(require_client)):
    rows = await pool().fetch(
        "SELECT id, title, status, created_at, recording_url FROM video_rooms WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        str(client["tenant_id"]))
    return [{"id": str(r["id"]), "title": r["title"], "status": r["status"],
             "created_at": r["created_at"].isoformat(), "has_recording": bool(r["recording_url"])} for r in rows]


@router.get("/keys")
async def list_keys(client: dict = Depends(require_client)):
    rows = await pool().fetch(
        "SELECT id, name, key_prefix, last_used_at, revoked_at, created_at FROM tenant_api_keys WHERE tenant_id=$1 ORDER BY created_at DESC",
        str(client["tenant_id"]))
    return [{**dict(k), "id": str(k["id"]),
             "last_used_at": k["last_used_at"].isoformat() if k["last_used_at"] else None,
             "revoked_at": k["revoked_at"].isoformat() if k["revoked_at"] else None,
             "created_at": k["created_at"].isoformat()} for k in rows]


@router.post("/keys")
async def create_key(client: dict = Depends(require_client)):
    full, prefix, kh = generate_api_key()
    await pool().execute(
        "INSERT INTO tenant_api_keys (tenant_id, name, key_prefix, key_hash) VALUES ($1,$2,$3,$4)",
        str(client["tenant_id"]), "portal", prefix, kh)
    return {"api_key": full, "key_prefix": prefix}


@router.delete("/keys/{kid}")
async def revoke_key(kid: str, client: dict = Depends(require_client)):
    await pool().execute(
        "UPDATE tenant_api_keys SET revoked_at=now() WHERE id=$1 AND tenant_id=$2 AND revoked_at IS NULL",
        kid, str(client["tenant_id"]))
    return {"ok": True}


class BrandingBody(BaseModel):
    product_name: Optional[str] = None
    accent_color: Optional[str] = None
    logo_url: Optional[str] = None


@router.put("/branding")
async def update_branding(body: BrandingBody, client: dict = Depends(require_client)):
    await pool().execute(
        "UPDATE tenants SET branding=$2::jsonb, updated_at=now() WHERE id=$1",
        str(client["tenant_id"]), json.dumps(body.model_dump(exclude_none=True)))
    return {"ok": True}
