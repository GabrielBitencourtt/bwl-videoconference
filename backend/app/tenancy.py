"""Tenant (license) resolution + API-key helpers.

Requests carry a tenant in one of two ways:
  - X-API-Key (or Authorization: Bearer bwl_...) → resolves to the key's tenant.
  - nothing → falls back to the default tenant (the existing first-party app).
"""
import hashlib
import json
import secrets
from fastapi import Depends, Header, HTTPException
from .db import pool
from .config import settings
from .client_auth import optional_client


def normalize_branding(v) -> dict:
    """jsonb is decoded as a raw string (no pool codec); normalize to a dict."""
    if isinstance(v, str):
        try:
            return json.loads(v) or {}
        except Exception:
            return {}
    return v or {}


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def generate_api_key(env: str = "live") -> tuple[str, str, str]:
    """Returns (full_key, prefix, hash). Full key is shown to the user only once."""
    full = f"bwl_{env}_{secrets.token_urlsafe(32)}"
    return full, full[:18], hash_key(full)


def _extract_key(x_api_key: str | None, authorization: str | None) -> str | None:
    if x_api_key:
        return x_api_key
    if authorization and authorization.lower().startswith("bearer "):
        tok = authorization[7:].strip()
        if tok.startswith("bwl_"):   # don't capture admin JWTs
            return tok
    return None


async def resolve_tenant_id(
    client: dict | None = Depends(optional_client),
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> str:
    # 1) Explicit API key (server-to-server / embed integrations) wins.
    key = _extract_key(x_api_key, authorization)
    if key and key.startswith("bwl_"):
        kh = hash_key(key)
        row = await pool().fetchrow(
            """SELECT t.id FROM tenant_api_keys k JOIN tenants t ON t.id = k.tenant_id
               WHERE k.key_hash=$1 AND k.revoked_at IS NULL AND t.status='active'""",
            kh,
        )
        if not row:
            raise HTTPException(401, "invalid or revoked API key")
        await pool().execute("UPDATE tenant_api_keys SET last_used_at=now() WHERE key_hash=$1", kh)
        return str(row["id"])

    # 2) A logged-in portal session scopes to that client's license.
    if client:
        return str(client["tenant_id"])

    # 3) Fallback: the first-party default tenant.
    row = await pool().fetchrow("SELECT id FROM tenants WHERE slug=$1", settings.default_tenant_slug)
    if not row:
        raise HTTPException(500, "default tenant not provisioned")
    return str(row["id"])


async def get_effective_limits(tenant_id: str) -> dict:
    """Effective limits = tenant override ?? plan ?? hard default."""
    r = await pool().fetchrow(
        """SELECT t.max_rooms, t.max_participants, t.recording_enabled, t.storage_quota_gb,
                  p.max_rooms AS p_max_rooms, p.max_participants AS p_max_participants,
                  p.recording_enabled AS p_recording_enabled, p.storage_quota_gb AS p_storage_quota_gb
           FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id=$1""",
        tenant_id,
    )
    defaults = {"max_rooms": -1, "max_participants": 50, "recording_enabled": True, "storage_quota_gb": 50}
    if not r:
        return defaults

    def pick(key: str):
        if r[key] is not None:
            return r[key]
        if r["p_" + key] is not None:
            return r["p_" + key]
        return defaults[key]

    return {k: pick(k) for k in defaults}
