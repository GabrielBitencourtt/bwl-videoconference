from fastapi import APIRouter, Depends, HTTPException, Request
from ..auth import get_current_user, CurrentUser
from ..config import settings
from ..db import pool
from ..services.livekit_service import create_token
from ..services.recording_service import start_recording, stop_recording, presigned_url
from ..realtime.hub import hub
from ..tenancy import resolve_tenant_id, get_effective_limits

router = APIRouter(prefix="/api/rooms/{room_id}/recording", tags=["recording"])


@router.post("/start")
async def start(
    room_id: str,
    user: CurrentUser = Depends(get_current_user),
    tenant_id: str = Depends(resolve_tenant_id),
):
    if not user.is_staff:
        raise HTTPException(403)
    room = await pool().fetchrow("SELECT * FROM video_rooms WHERE id=$1", room_id)
    if not room:
        raise HTTPException(404)
    if str(room["tenant_id"]) != tenant_id:
        raise HTTPException(403, "room does not belong to this tenant")
    limits = await get_effective_limits(tenant_id)
    if not limits["recording_enabled"]:
        raise HTTPException(403, "gravação não habilitada para esta licença")

    egress_id = await start_recording(
        room["room_id"], room_id, wb_active=room["whiteboard_active"],
    )
    await pool().execute(
        "UPDATE video_rooms SET recording_enabled=true, egress_id=$2, "
        "recording_progress='starting', updated_at=now() WHERE id=$1",
        room_id, egress_id,
    )
    await hub.broadcast(room_id, "recording-started", {"egress_id": egress_id})
    return {"ok": True, "egress_id": egress_id}


@router.post("/stop")
async def stop(room_id: str, user: CurrentUser = Depends(get_current_user)):
    if not user.is_staff:
        raise HTTPException(403)
    room = await pool().fetchrow("SELECT egress_id FROM video_rooms WHERE id=$1", room_id)
    if not room or not room["egress_id"]:
        raise HTTPException(400, "no active recording")
    await stop_recording(room["egress_id"])
    await pool().execute(
        "UPDATE video_rooms SET recording_enabled=false, recording_progress='stopping', "
        "updated_at=now() WHERE id=$1",
        room_id,
    )
    await hub.broadcast(room_id, "recording-stopped", {})
    return {"ok": True}


@router.get("")
async def recording_status(room_id: str, user: CurrentUser = Depends(get_current_user)):
    """Recording state + a fresh presigned playback URL (private bucket)."""
    if not user.is_staff:
        raise HTTPException(403)
    row = await pool().fetchrow(
        "SELECT recording_enabled, recording_progress, recording_url FROM video_rooms WHERE id=$1",
        room_id,
    )
    if not row:
        raise HTTPException(404)
    key = row["recording_url"]
    return {
        "recording_enabled": row["recording_enabled"],
        "progress": row["recording_progress"],
        "url": presigned_url(key) if key else None,
    }


# LiveKit webhook → set recording_url, recording_progress, etc.
webhook_router = APIRouter(prefix="/api/webhooks/livekit", tags=["webhooks"])


@webhook_router.post("")
async def livekit_webhook(request: Request):
    body = await request.json()
    event = body.get("event")
    egress = body.get("egressInfo") or {}
    egress_id = egress.get("egressId")
    if not egress_id:
        return {"ok": True}

    if event == "egress_updated":
        await pool().execute(
            "UPDATE video_rooms SET recording_progress=$2 WHERE egress_id=$1",
            egress_id, egress.get("status"),
        )
    elif event == "egress_ended":
        status = egress.get("status")  # EGRESS_COMPLETE | EGRESS_ABORTED | EGRESS_FAILED
        files = egress.get("fileResults") or []
        # Only store a key when the recording actually completed with a file —
        # an aborted/failed egress (e.g. empty room) produces no upload.
        key = None
        if status == "EGRESS_COMPLETE" and files:
            key = files[0].get("filename") or files[0].get("location") or ""
            if key and "://" in key:
                key = key.split("/", 3)[-1].split("?")[0]
            if key and settings.s3_bucket + "/" in key:
                key = key.split(settings.s3_bucket + "/", 1)[-1]
        progress = "completed" if key else (status or "ended").replace("EGRESS_", "").lower()
        await pool().execute(
            "UPDATE video_rooms SET recording_url=$2, recording_progress=$3, "
            "recording_enabled=false WHERE egress_id=$1",
            egress_id, key, progress,
        )
    return {"ok": True}
