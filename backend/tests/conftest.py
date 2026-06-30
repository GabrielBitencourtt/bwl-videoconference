import os

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@testdb:5432/test")
os.environ.setdefault("LIVEKIT_API_KEY", "testkey")
os.environ.setdefault("LIVEKIT_API_SECRET", "testsecrettestsecrettestsecret12")
os.environ.setdefault("ADMIN_JWT_SECRET", "test-admin-secret")
os.environ.setdefault("DEFAULT_TENANT_SLUG", "openpbl")

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.db import init_pool, close_pool, pool
from app.admin_auth import hash_password


@pytest_asyncio.fixture(autouse=True)
async def _db():
    """Fresh pool per test (bound to that test's event loop) + clean schema."""
    await init_pool()
    with open("app/schema.sql") as f:
        await pool().execute(f.read())  # idempotent (CREATE ... IF NOT EXISTS)
    await pool().execute(
        "TRUNCATE video_rooms, tenant_api_keys, admin_users, tenants, plans RESTART IDENTITY CASCADE"
    )
    await pool().execute("INSERT INTO plans (name, slug) VALUES ('Padrão', 'default')")
    await pool().execute(
        "INSERT INTO tenants (name, slug, plan_id) SELECT 'OpenPBL', 'openpbl', id FROM plans WHERE slug='default'"
    )
    # reset per-process state that would leak across tests
    import app.routers.admin as adm
    adm._login_fails.clear()
    yield
    await close_pool()


@pytest.fixture(autouse=True)
def _mock_livekit(monkeypatch):
    async def counts():
        return {}

    async def start(*a, **k):
        return "EG_test"

    monkeypatch.setattr("app.routers.admin.livekit_participant_counts", counts)
    monkeypatch.setattr("app.routers.recording.start_recording", start)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


@pytest_asyncio.fixture
async def admin_token(client):
    await pool().execute(
        "INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1,$2,'A','superadmin')",
        "a@a.com", hash_password("secret123"),
    )
    r = await client.post("/api/admin/login", json={"email": "a@a.com", "password": "secret123"})
    return r.json()["token"]


# Helpers
def admin_h(token):
    return {"Authorization": f"Bearer {token}"}


def user_h(role="admin", uid="u1", key=None):
    h = {"X-User-Id": uid, "X-User-Name": "U", "X-User-Role": role}
    if key:
        h["X-API-Key"] = key
    return h
