from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user, CurrentUser
from ..db import pool
from ..models.schemas import SpeakerInviteCreate

router = APIRouter(prefix="/api/rooms/{room_id}/invites", tags=["invites"])


@router.post("/speaker")
async def create_speaker_invite(
    room_id: str, body: SpeakerInviteCreate,
    user: CurrentUser = Depends(get_current_user),
):
    if not user.is_staff:
        raise HTTPException(403)
    row = await pool().fetchrow(
        """
        INSERT INTO speaker_invite_links
          (room_id, label, allow_camera, allow_mic, allow_screen_share,
           allow_whiteboard_edit, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
        """,
        room_id, body.label, body.allow_camera, body.allow_mic,
        body.allow_screen_share, body.allow_whiteboard_edit, body.expires_at,
    )
    return {**dict(row), "id": str(row["id"]), "room_id": str(row["room_id"])}


@router.get("")
async def list_invites(room_id: str, user: CurrentUser = Depends(get_current_user)):
    if not user.is_staff:
        raise HTTPException(403)
    rows = await pool().fetch(
        "SELECT * FROM speaker_invite_links WHERE room_id=$1 ORDER BY created_at DESC", room_id
    )
    return [{**dict(r), "id": str(r["id"]), "room_id": str(r["room_id"])} for r in rows]


@router.delete("/speaker/{invite_id}")
async def revoke(room_id: str, invite_id: str, user: CurrentUser = Depends(get_current_user)):
    if not user.is_staff:
        raise HTTPException(403)
    await pool().execute(
        "UPDATE speaker_invite_links SET revoked_at=now() WHERE id=$1 AND room_id=$2",
        invite_id, room_id,
    )
    return {"ok": True}
