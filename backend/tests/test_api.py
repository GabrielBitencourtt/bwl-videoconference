"""Critical-path tests: health, admin auth, tenancy isolation, limits."""
import pytest
from conftest import admin_h, user_h


async def _new_tenant(client, token, slug, **overrides):
    body = {"name": slug, "slug": slug, **overrides}
    r = await client.post("/api/admin/tenants", json=body, headers=admin_h(token))
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    k = await client.post(f"/api/admin/tenants/{tid}/keys", json={}, headers=admin_h(token))
    return tid, k.json()["api_key"]


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True


@pytest.mark.asyncio
async def test_health_detail_db(client):
    r = await client.get("/health/detail")
    assert r.status_code == 200 and r.json()["db"] is True


@pytest.mark.asyncio
async def test_admin_login_me(client, admin_token):
    r = await client.get("/api/admin/me", headers=admin_h(admin_token))
    assert r.status_code == 200 and r.json()["role"] == "superadmin"


@pytest.mark.asyncio
async def test_admin_login_wrong_password(client, admin_token):
    r = await client.post("/api/admin/login", json={"email": "a@a.com", "password": "nope"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_requires_auth(client):
    assert (await client.get("/api/admin/me")).status_code == 401
    assert (await client.get("/api/admin/tenants")).status_code == 401


@pytest.mark.asyncio
async def test_login_rate_limit(client, admin_token):
    last = None
    for _ in range(6):
        last = await client.post("/api/admin/login", json={"email": "a@a.com", "password": "x"})
    assert last.status_code == 429  # locked after 5 fails


@pytest.mark.asyncio
async def test_room_create_and_list_default_tenant(client):
    r = await client.post("/api/rooms", json={"title": "R1"}, headers=user_h())
    assert r.status_code == 200
    lst = await client.get("/api/rooms", headers=user_h())
    assert any(x["title"] == "R1" for x in lst.json())


@pytest.mark.asyncio
async def test_tenant_isolation_list(client, admin_token):
    _, ka = await _new_tenant(client, admin_token, "ta")
    _, kb = await _new_tenant(client, admin_token, "tb")
    await client.post("/api/rooms", json={"title": "A-room"}, headers=user_h(key=ka))
    await client.post("/api/rooms", json={"title": "B-room"}, headers=user_h(key=kb))
    la = (await client.get("/api/rooms", headers=user_h(key=ka))).json()
    lb = (await client.get("/api/rooms", headers=user_h(key=kb))).json()
    assert [x["title"] for x in la] == ["A-room"]
    assert [x["title"] for x in lb] == ["B-room"]


@pytest.mark.asyncio
async def test_token_isolation(client, admin_token):
    _, ka = await _new_tenant(client, admin_token, "ta")
    _, kb = await _new_tenant(client, admin_token, "tb")
    room_a = (await client.post("/api/rooms", json={"title": "A"}, headers=user_h(key=ka))).json()
    # B's key cannot mint a token for A's room
    bad = await client.post("/api/token", json={"room_id": room_a["id"]}, headers=user_h(key=kb, role="user"))
    assert bad.status_code == 403
    # A's key can
    ok = await client.post("/api/token", json={"room_id": room_a["id"]}, headers=user_h(key=ka, role="user"))
    assert ok.status_code == 200 and ok.json()["token"]


@pytest.mark.asyncio
async def test_limit_max_rooms(client, admin_token):
    _, k = await _new_tenant(client, admin_token, "lim", max_rooms=1)
    r1 = await client.post("/api/rooms", json={"title": "1"}, headers=user_h(key=k))
    r2 = await client.post("/api/rooms", json={"title": "2"}, headers=user_h(key=k))
    assert r1.status_code == 200 and r2.status_code == 403


@pytest.mark.asyncio
async def test_max_participants_capped(client, admin_token):
    _, k = await _new_tenant(client, admin_token, "cap", max_participants=10)
    r = await client.post("/api/rooms", json={"title": "x", "max_participants": 999}, headers=user_h(key=k))
    assert r.json()["max_participants"] == 10


@pytest.mark.asyncio
async def test_recording_gate(client, admin_token):
    _, k = await _new_tenant(client, admin_token, "norec", recording_enabled=False)
    room = (await client.post("/api/rooms", json={"title": "x"}, headers=user_h(key=k))).json()
    r = await client.post(f"/api/rooms/{room['id']}/recording/start", headers=user_h(key=k))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_guest_flow(client):
    room = (await client.post("/api/rooms", json={"title": "G"}, headers=user_h())).json()
    info = await client.get(f"/api/rooms/by-guest-token/{room['guest_token']}")
    assert info.status_code == 200 and info.json()["id"] == room["id"]
    tok = await client.post("/api/token", json={"room_id": room["id"], "guest_token": room["guest_token"], "display_name": "Guest"})
    assert tok.status_code == 200 and tok.json()["identity"].startswith("guest_")


@pytest.mark.asyncio
async def test_delete_plan_in_use_blocked(client, admin_token):
    plans = (await client.get("/api/admin/plans", headers=admin_h(admin_token))).json()
    default_id = [p["id"] for p in plans if p["slug"] == "default"][0]
    r = await client.delete(f"/api/admin/plans/{default_id}", headers=admin_h(admin_token))
    assert r.status_code == 409  # default plan is used by the openpbl tenant
