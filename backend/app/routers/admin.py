"""Admin panel API — licenses (tenants), plans, API keys, stats. Secured by JWT."""
import asyncio
import json
import re
import time
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Response
from ..db import pool
from ..config import settings
from ..admin_auth import (
    require_admin, require_superadmin, make_token, verify_password, hash_password,
    COOKIE_NAME, SESSION_HOURS,
)

_COOKIE = dict(httponly=True, secure=True, samesite="strict", path="/api/admin")
from ..tenancy import generate_api_key, normalize_branding
from ..services.livekit_service import livekit_participant_counts

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------- auth ----------
class LoginBody(BaseModel):
    email: str
    password: str


# Simple in-memory brute-force lockout (per email): 5 fails → 5 min lock.
_login_fails: dict[str, dict] = {}
_MAX_FAILS = 5
_LOCK_SECONDS = 300


@router.post("/login")
async def login(body: LoginBody, response: Response):
    key = body.email.lower().strip()
    now = time.time()
    rec = _login_fails.get(key)
    if rec and rec.get("until", 0) > now:
        raise HTTPException(429, "muitas tentativas; tente novamente em alguns minutos")

    row = await pool().fetchrow("SELECT * FROM admin_users WHERE lower(email)=lower($1)", body.email)
    # Generic error to avoid user enumeration.
    if not row or row["status"] != "active" or not verify_password(body.password, row["password_hash"]):
        r = _login_fails.setdefault(key, {"n": 0, "until": 0})
        r["n"] += 1
        if r["n"] >= _MAX_FAILS:
            r["until"] = now + _LOCK_SECONDS
            r["n"] = 0
        raise HTTPException(401, "credenciais inválidas")
    _login_fails.pop(key, None)
    await pool().execute("UPDATE admin_users SET last_login_at=now() WHERE id=$1", row["id"])
    token = make_token(str(row["id"]), row["role"])
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_HOURS * 3600, **_COOKIE)
    # Cookie (httpOnly) authenticates the browser; token is also returned for
    # server-side tooling/tests (the SPA ignores it and relies on the cookie).
    return {
        "token": token,
        "admin": {"id": str(row["id"]), "email": row["email"], "name": row["name"], "role": row["role"]},
    }


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/api/admin")
    return {"ok": True}


@router.get("/me")
async def me(admin: dict = Depends(require_admin)):
    return {"id": str(admin["id"]), "email": admin["email"], "name": admin["name"], "role": admin["role"]}


class ChangePw(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.post("/change-password")
async def change_password(body: ChangePw, admin: dict = Depends(require_admin)):
    row = await pool().fetchrow("SELECT password_hash FROM admin_users WHERE id=$1", admin["id"])
    if not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(400, "senha atual incorreta")
    await pool().execute("UPDATE admin_users SET password_hash=$2 WHERE id=$1", admin["id"], hash_password(body.new_password))
    return {"ok": True}


# ---------- plans ----------
class PlanBody(BaseModel):
    name: str
    slug: str
    max_rooms: int = -1
    max_participants: int = 50
    recording_enabled: bool = True
    storage_quota_gb: int = 50
    price_cents: int = 0


@router.get("/plans")
async def list_plans(admin: dict = Depends(require_admin)):
    rows = await pool().fetch("SELECT * FROM plans ORDER BY price_cents")
    return [{**dict(r), "id": str(r["id"])} for r in rows]


@router.post("/plans")
async def create_plan(body: PlanBody, admin: dict = Depends(require_superadmin)):
    try:
        row = await pool().fetchrow(
            """INSERT INTO plans (name, slug, max_rooms, max_participants, recording_enabled, storage_quota_gb, price_cents)
               VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
            body.name, body.slug, body.max_rooms, body.max_participants,
            body.recording_enabled, body.storage_quota_gb, body.price_cents,
        )
    except Exception:
        raise HTTPException(409, "slug de plano já existe")
    return {**dict(row), "id": str(row["id"])}


# ---------- tenants (licenses) ----------
class TenantBody(BaseModel):
    name: str
    slug: str
    plan_id: Optional[str] = None
    status: str = "active"
    max_rooms: Optional[int] = None
    max_participants: Optional[int] = None
    recording_enabled: Optional[bool] = None
    storage_quota_gb: Optional[int] = None
    branding: Optional[dict] = None   # { product_name, accent_color, logo_url }


async def _tenant_stats(tenant_id: str, live: dict | None = None) -> dict:
    r = await pool().fetchrow(
        """SELECT
             count(*) AS rooms_total,
             count(*) FILTER (WHERE status='active') AS rooms_active,
             count(*) FILTER (WHERE recording_url IS NOT NULL) AS recordings
           FROM video_rooms WHERE tenant_id=$1""",
        tenant_id,
    )
    p = await pool().fetchrow(
        """SELECT count(*) AS participants
           FROM video_room_participants vp JOIN video_rooms vr ON vr.id=vp.room_id
           WHERE vr.tenant_id=$1""",
        tenant_id,
    )
    # Real-time: live participants/rooms from LiveKit, scoped to this tenant.
    live_participants, live_rooms = 0, 0
    if live is not None:
        names = await pool().fetch(
            "SELECT room_id FROM video_rooms WHERE tenant_id=$1 AND status='active'", tenant_id
        )
        for n in names:
            c = live.get(n["room_id"], 0)
            if c > 0:
                live_rooms += 1
            live_participants += c
    return {"rooms_total": r["rooms_total"], "rooms_active": r["rooms_active"],
            "recordings": r["recordings"], "participants": p["participants"],
            "live_participants": live_participants, "live_rooms": live_rooms}


def _effective(t: dict) -> dict:
    """override ?? plan ?? hard default"""
    def pick(key, default):
        if t.get(key) is not None:
            return t[key]
        if t.get("plan_" + key) is not None:
            return t["plan_" + key]
        return default
    return {
        "max_rooms": pick("max_rooms", -1),
        "max_participants": pick("max_participants", 50),
        "recording_enabled": pick("recording_enabled", True),
        "storage_quota_gb": pick("storage_quota_gb", 50),
    }


@router.get("/tenants")
async def list_tenants(admin: dict = Depends(require_admin)):
    rows = await pool().fetch(
        """SELECT t.*, p.name AS plan_name, p.slug AS plan_slug
           FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id ORDER BY t.created_at DESC"""
    )
    live = await livekit_participant_counts()
    out = []
    for r in rows:
        d = dict(r)
        out.append({
            "id": str(d["id"]), "name": d["name"], "slug": d["slug"], "status": d["status"],
            "plan_name": d["plan_name"], "stats": await _tenant_stats(str(d["id"]), live),
        })
    return out


@router.post("/tenants")
async def create_tenant(body: TenantBody, admin: dict = Depends(require_superadmin)):
    try:
        row = await pool().fetchrow(
            """INSERT INTO tenants (name, slug, plan_id, status, max_rooms, max_participants, recording_enabled, storage_quota_gb)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *""",
            body.name, body.slug, body.plan_id, body.status,
            body.max_rooms, body.max_participants, body.recording_enabled, body.storage_quota_gb,
        )
    except Exception:
        raise HTTPException(409, "slug de licença já existe")
    return {**dict(row), "id": str(row["id"])}


@router.get("/tenants/{tid}")
async def get_tenant(tid: str, admin: dict = Depends(require_admin)):
    r = await pool().fetchrow(
        """SELECT t.*, p.name AS plan_name,
                  p.max_rooms AS plan_max_rooms, p.max_participants AS plan_max_participants,
                  p.recording_enabled AS plan_recording_enabled, p.storage_quota_gb AS plan_storage_quota_gb
           FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=$1""",
        tid,
    )
    if not r:
        raise HTTPException(404)
    d = dict(r)
    keys = await pool().fetch(
        "SELECT id, name, key_prefix, last_used_at, revoked_at, created_at FROM tenant_api_keys WHERE tenant_id=$1 ORDER BY created_at DESC",
        tid,
    )
    return {
        "id": str(d["id"]), "name": d["name"], "slug": d["slug"], "status": d["status"],
        "plan_id": str(d["plan_id"]) if d["plan_id"] else None, "plan_name": d["plan_name"],
        "overrides": {k: d[k] for k in ("max_rooms", "max_participants", "recording_enabled", "storage_quota_gb")},
        "effective": _effective(d),
        "branding": normalize_branding(d["branding"]),
        "stats": await _tenant_stats(tid, await livekit_participant_counts()),
        "api_keys": [{**dict(k), "id": str(k["id"])} for k in keys],
    }


@router.put("/tenants/{tid}")
async def update_tenant(tid: str, body: TenantBody, admin: dict = Depends(require_superadmin)):
    await pool().execute(
        """UPDATE tenants SET name=$2, plan_id=$3, status=$4, max_rooms=$5, max_participants=$6,
             recording_enabled=$7, storage_quota_gb=$8,
             branding=COALESCE($9::jsonb, branding), updated_at=now() WHERE id=$1""",
        tid, body.name, body.plan_id, body.status,
        body.max_rooms, body.max_participants, body.recording_enabled, body.storage_quota_gb,
        json.dumps(body.branding) if body.branding is not None else None,
    )
    return {"ok": True}


@router.delete("/tenants/{tid}")
async def delete_tenant(tid: str, admin: dict = Depends(require_superadmin)):
    rooms = await pool().fetchval("SELECT count(*) FROM video_rooms WHERE tenant_id=$1", tid)
    if rooms:
        raise HTTPException(409, f"licença tem {rooms} sala(s); suspenda em vez de excluir")
    await pool().execute("DELETE FROM tenants WHERE id=$1", tid)  # api keys cascade
    return {"ok": True}


@router.delete("/plans/{pid}")
async def delete_plan(pid: str, admin: dict = Depends(require_superadmin)):
    used = await pool().fetchval("SELECT count(*) FROM tenants WHERE plan_id=$1", pid)
    if used:
        raise HTTPException(409, f"plano em uso por {used} licença(s)")
    await pool().execute("DELETE FROM plans WHERE id=$1", pid)
    return {"ok": True}


# ---------- API keys ----------
class KeyBody(BaseModel):
    name: Optional[str] = None


class ClientAccountBody(BaseModel):
    email: str
    name: str = ""


@router.post("/tenants/{tid}/client")
async def create_client_account(tid: str, body: ClientAccountBody, admin: dict = Depends(require_superadmin)):
    if not await pool().fetchrow("SELECT 1 FROM tenants WHERE id=$1", tid):
        raise HTTPException(404)
    if await pool().fetchrow("SELECT 1 FROM client_users WHERE lower(email)=lower($1)", body.email):
        raise HTTPException(409, "e-mail já possui conta de cliente")
    import secrets as _s
    pw = _s.token_urlsafe(9)
    await pool().execute(
        "INSERT INTO client_users (tenant_id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,'owner')",
        tid, body.email, hash_password(pw), body.name,
    )
    return {"email": body.email, "temp_password": pw}  # shown once


@router.post("/tenants/{tid}/keys")
async def create_key(tid: str, body: KeyBody, admin: dict = Depends(require_superadmin)):
    t = await pool().fetchrow("SELECT id FROM tenants WHERE id=$1", tid)
    if not t:
        raise HTTPException(404)
    full, prefix, kh = generate_api_key()
    row = await pool().fetchrow(
        "INSERT INTO tenant_api_keys (tenant_id, name, key_prefix, key_hash) VALUES ($1,$2,$3,$4) RETURNING id, created_at",
        tid, body.name, prefix, kh,
    )
    # full key returned ONCE — never retrievable again.
    return {"id": str(row["id"]), "name": body.name, "key_prefix": prefix, "api_key": full, "created_at": row["created_at"].isoformat()}


@router.delete("/keys/{key_id}")
async def revoke_key(key_id: str, admin: dict = Depends(require_superadmin)):
    await pool().execute("UPDATE tenant_api_keys SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL", key_id)
    return {"ok": True}


# ---------- stats overview ----------
@router.get("/stats")
async def stats_overview(admin: dict = Depends(require_admin)):
    totals = await pool().fetchrow(
        """SELECT
             (SELECT count(*) FROM tenants) AS tenants,
             (SELECT count(*) FROM tenants WHERE status='active') AS tenants_active,
             (SELECT count(*) FROM video_rooms) AS rooms_total,
             (SELECT count(*) FROM video_rooms WHERE status='active') AS rooms_active,
             (SELECT count(*) FROM video_rooms WHERE recording_url IS NOT NULL) AS recordings"""
    )
    # Real-time totals across the platform.
    live = await livekit_participant_counts()
    active_names = {r["room_id"] for r in await pool().fetch("SELECT room_id FROM video_rooms WHERE status='active'")}
    live_participants = sum(c for n, c in live.items() if n in active_names)
    live_rooms = sum(1 for n, c in live.items() if c > 0 and n in active_names)
    return {**dict(totals), "live_participants": live_participants, "live_rooms": live_rooms}


@router.get("/logs")
async def logs(after: int = 0, admin: dict = Depends(require_admin)):
    from ..logbuffer import since
    items = since(after)
    return {"logs": items, "last": items[-1]["seq"] if items else after}


@router.get("/stats/timeseries")
async def stats_timeseries(days: int = 14, admin: dict = Depends(require_admin)):
    days = max(1, min(days, 90))
    rows = await pool().fetch(
        """SELECT g::date AS day,
             (SELECT count(*) FROM video_rooms WHERE created_at::date = g::date) AS rooms,
             (SELECT count(*) FROM video_room_participants p JOIN video_rooms r ON r.id=p.room_id
                WHERE p.joined_at::date = g::date) AS participants,
             (SELECT count(*) FROM video_rooms WHERE recording_url IS NOT NULL AND created_at::date = g::date) AS recordings
           FROM generate_series(current_date - make_interval(days => $1 - 1), current_date, interval '1 day') g
           ORDER BY day""",
        days,
    )
    return [{"day": r["day"].isoformat(), "rooms": r["rooms"],
             "participants": r["participants"], "recordings": r["recordings"]} for r in rows]


# ---------- monitoring ----------
_IDRE = re.compile(r"/[0-9a-f]{8}-[0-9a-f-]{27,}|/[A-Za-z0-9_-]{20,}")


def _norm(path: str) -> str:
    return _IDRE.sub("/:id", path)


@router.get("/metrics")
async def metrics(window: int = 300, admin: dict = Depends(require_admin)):
    """Aggregated request metrics from the in-memory buffer (excludes admin polling)."""
    from ..logbuffer import snapshot
    now = time.time()
    buf = [e for e in snapshot() if not e["path"].startswith("/api/admin")]
    win = [e for e in buf if now - e["t"] <= window]
    n = len(win)
    lat = sorted(e["ms"] for e in win)
    by = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0}
    for e in win:
        by[f"{e['status'] // 100}xx"] = by.get(f"{e['status'] // 100}xx", 0) + 1
    errors = by["4xx"] + by["5xx"]
    agg: dict = {}
    for e in win:
        k = f"{e['method']} {_norm(e['path'])}"
        a = agg.setdefault(k, {"count": 0, "ms": 0.0, "errors": 0})
        a["count"] += 1
        a["ms"] += e["ms"]
        if e["status"] >= 400:
            a["errors"] += 1
    top = sorted(
        [{"ep": k, "count": v["count"], "avg_ms": round(v["ms"] / v["count"], 1), "errors": v["errors"]} for k, v in agg.items()],
        key=lambda x: -x["count"],
    )[:8]
    recent_errors = [e for e in reversed(buf) if e["status"] >= 400][:15]

    def pct(p):
        return lat[min(len(lat) - 1, int(len(lat) * p))] if lat else 0

    return {
        "window_s": window, "requests": n, "rpm": round(n / (window / 60), 1) if n else 0,
        "avg_ms": round(sum(lat) / n, 1) if n else 0, "p95_ms": pct(0.95), "max_ms": (lat[-1] if lat else 0),
        "error_rate": round(errors / n * 100, 1) if n else 0,
        "by_status": by, "top_endpoints": top, "recent_errors": recent_errors,
    }


_storage = {"ts": 0.0, "mb": 0.0, "count": 0}


def _scan_storage() -> dict:
    from ..services.recording_service import s3_client
    try:
        s3 = s3_client()
        total = 0
        count = 0
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=settings.s3_bucket):
            for o in page.get("Contents", []):
                total += o["Size"]
                count += 1
        _storage.update({"ts": time.time(), "mb": round(total / 1048576, 1), "count": count})
    except Exception:
        pass
    return _storage


@router.get("/system")
async def system(admin: dict = Depends(require_admin)):
    out: dict = {"db": False, "livekit": False, "cpu_pct": None, "mem_pct": None,
                 "disk_pct": None, "uptime_s": None, "storage_mb": None, "storage_files": None}
    try:
        await pool().fetchval("SELECT 1")
        out["db"] = True
    except Exception:
        pass
    try:
        import psutil
        out["cpu_pct"] = psutil.cpu_percent(interval=0.1)
        out["mem_pct"] = psutil.virtual_memory().percent
        out["disk_pct"] = psutil.disk_usage("/").percent
        out["uptime_s"] = round(time.time() - psutil.Process().create_time())
    except Exception:
        pass
    try:
        live = await livekit_participant_counts()
        out["livekit"] = True
        out["live_rooms"] = sum(1 for c in live.values() if c > 0)
        out["live_participants"] = sum(live.values())
    except Exception:
        pass
    if time.time() - _storage["ts"] > 60:
        await asyncio.to_thread(_scan_storage)
    out["storage_mb"] = _storage["mb"]
    out["storage_files"] = _storage["count"]
    return out


@router.get("/rooms")
async def admin_rooms(status: str = "active", tenant: Optional[str] = None, admin: dict = Depends(require_admin)):
    where, args = [], []
    if status in ("active", "ended"):
        args.append(status); where.append(f"r.status=${len(args)}")
    if tenant:
        args.append(tenant); where.append(f"r.tenant_id=${len(args)}")
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = await pool().fetch(
        f"""SELECT r.id, r.room_id, r.title, r.owner_id, r.status, r.created_at,
                   r.recording_enabled, t.name AS tenant
            FROM video_rooms r LEFT JOIN tenants t ON t.id=r.tenant_id
            {clause} ORDER BY r.created_at DESC LIMIT 200""",
        *args,
    )
    live = await livekit_participant_counts()
    return [{"id": str(x["id"]), "room_id": x["room_id"], "title": x["title"], "tenant": x["tenant"],
             "owner": x["owner_id"], "status": x["status"], "created_at": x["created_at"].isoformat(),
             "recording": x["recording_enabled"], "participants": live.get(x["room_id"], 0)} for x in rows]


@router.get("/rooms/{rid}/chat")
async def admin_room_chat(rid: str, admin: dict = Depends(require_admin)):
    rows = await pool().fetch(
        "SELECT sender_name, message, created_at FROM video_room_chat_messages WHERE room_id=$1 ORDER BY created_at LIMIT 500",
        rid,
    )
    return [{"sender": r["sender_name"], "message": r["message"], "at": r["created_at"].isoformat()} for r in rows]


@router.post("/rooms/{rid}/end")
async def admin_end_room(rid: str, admin: dict = Depends(require_admin)):
    from ..realtime.hub import hub
    row = await pool().fetchrow("SELECT id FROM video_rooms WHERE id=$1", rid)
    if not row:
        raise HTTPException(404)
    await pool().execute("UPDATE video_rooms SET status='ended', ended_at=now(), updated_at=now() WHERE id=$1", rid)
    await hub.broadcast(rid, "room-ended", {"room_id": rid})
    return {"ok": True}


@router.get("/nodes")
async def list_nodes(admin: dict = Depends(require_admin)):
    from ..nodes import all_nodes
    return all_nodes()


_consumption = {"ts": 0.0, "by_tenant": {}}


async def _scan_consumption():
    rows = await pool().fetch("SELECT id, tenant_id FROM video_rooms")
    room2tenant = {str(r["id"]): str(r["tenant_id"]) for r in rows if r["tenant_id"]}

    def scan():
        from ..services.recording_service import s3_client
        by: dict = {}
        s3 = s3_client()
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=settings.s3_bucket):
            for o in page.get("Contents", []):
                prefix = o["Key"].split("/")[0]
                t = room2tenant.get(prefix)
                if t:
                    by[t] = by.get(t, 0) + o["Size"]
        return by

    try:
        _consumption["by_tenant"] = await asyncio.to_thread(scan)
        _consumption["ts"] = time.time()
    except Exception:
        pass


@router.get("/consumption")
async def consumption(admin: dict = Depends(require_admin)):
    if time.time() - _consumption["ts"] > 60:
        await _scan_consumption()
    live = await livekit_participant_counts()
    rows = await pool().fetch("SELECT id, name, slug, status FROM tenants ORDER BY name")
    out = []
    for r in rows:
        tid = str(r["id"])
        st = await _tenant_stats(tid, live)
        out.append({"id": tid, "name": r["name"], "slug": r["slug"], "status": r["status"],
                    "storage_mb": round(_consumption["by_tenant"].get(tid, 0) / 1048576, 1), **st})
    return out


@router.get("/finance")
async def finance(admin: dict = Depends(require_admin)):
    """Custos de infra em tempo real: Lightsail (fixo) + S3 (variável),
    acúmulo do mês, projeção pelo ritmo de uso e rateio por cliente."""
    from datetime import datetime, timezone
    import calendar

    # 1) Servidores — custo fixo mensal (Lightsail sa-east-1)
    servers = [
        {"name": "bwl-app", "role": "App · API · Frontend", "bundle": "medium_3_1", "specs": "2 vCPU · 4 GB", "monthly_usd": settings.cost_app_usd},
        {"name": "bwl-livekit", "role": "Mídia · LiveKit · Redis", "bundle": "large_3_1", "specs": "2 vCPU · 8 GB", "monthly_usd": settings.cost_livekit_usd},
        {"name": "bwl-egress", "role": "Gravação · Egress", "bundle": "xlarge_3_1", "specs": "4 vCPU · 16 GB", "monthly_usd": settings.cost_egress_usd},
    ]
    fixed_monthly = sum(s["monthly_usd"] for s in servers)

    # 2) Storage — custo variável (scan S3 cacheado)
    if time.time() - _storage["ts"] > 60:
        await asyncio.to_thread(_scan_storage)
    storage_gb = round(_storage["mb"] / 1024, 3)
    storage_monthly = round(storage_gb * settings.cost_s3_per_gb_usd, 2)
    total_monthly = round(fixed_monthly + storage_monthly, 2)

    # 3) Posição no mês — para acúmulo e projeção
    now = datetime.now(timezone.utc)
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    frac = min(max(((now.day - 1) + now.hour / 24) / days_in_month, 1e-6), 1.0)
    mtd = round((fixed_monthly + storage_monthly) * frac, 2)
    storage_eom = round(storage_monthly / frac, 2)        # storage cresce no ritmo atual
    projection_eom = round(fixed_monthly + storage_eom, 2)

    # 4) Rateio por cliente — storage real + infra por participação no uso (nº de salas)
    if time.time() - _consumption["ts"] > 60:
        await _scan_consumption()
    rows = await pool().fetch("SELECT id, name FROM tenants ORDER BY name")
    counts = await pool().fetch("SELECT tenant_id, count(*) AS n FROM video_rooms GROUP BY tenant_id")
    rc = {str(r["tenant_id"]): r["n"] for r in counts if r["tenant_id"]}
    total_rooms = sum(rc.values()) or 1
    by_tenant = []
    for r in rows:
        tid = str(r["id"])
        st_gb = round(_consumption["by_tenant"].get(tid, 0) / 1073741824, 3)
        st_cost = round(st_gb * settings.cost_s3_per_gb_usd, 2)
        share = rc.get(tid, 0) / total_rooms
        infra_cost = round(fixed_monthly * share, 2)
        by_tenant.append({"id": tid, "name": r["name"], "storage_gb": st_gb,
                          "storage_usd": st_cost, "infra_usd": infra_cost,
                          "total_usd": round(st_cost + infra_cost, 2),
                          "usage_pct": round(share * 100, 1)})
    by_tenant.sort(key=lambda x: -x["total_usd"])

    return {
        "currency": "USD",
        "usd_to_brl": settings.usd_to_brl,
        "servers": servers,
        "storage": {"gb": storage_gb, "monthly_usd": storage_monthly,
                    "rate_per_gb": settings.cost_s3_per_gb_usd, "files": _storage["count"]},
        "fixed_monthly_usd": round(fixed_monthly, 2),
        "total_monthly_usd": total_monthly,
        "month_to_date_usd": mtd,
        "projection_eom_usd": projection_eom,
        "month": {"day": now.day, "days": days_in_month, "label": now.strftime("%Y-%m")},
        "by_tenant": by_tenant,
    }


@router.get("/live-rooms")
async def live_rooms(admin: dict = Depends(require_admin)):
    live = await livekit_participant_counts()
    rows = await pool().fetch(
        """SELECT r.room_id, r.title, r.recording_enabled, t.name AS tenant
           FROM video_rooms r LEFT JOIN tenants t ON t.id=r.tenant_id WHERE r.status='active'"""
    )
    out = [{"room": r["room_id"], "title": r["title"], "tenant": r["tenant"],
            "recording": r["recording_enabled"], "participants": live.get(r["room_id"], 0)} for r in rows]
    out = [r for r in out if r["participants"] > 0]
    out.sort(key=lambda x: -x["participants"])
    return out
