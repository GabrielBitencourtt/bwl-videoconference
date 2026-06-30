from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user, optional_user, CurrentUser
from ..db import pool
from ..models.schemas import LobbyJoin, LobbyDecision
from ..realtime.hub import hub

router = APIRouter(prefix="/api/rooms/{room_id}/lobby", tags=["lobby"])


@router.get("")
async def list_lobby(room_id: str, user: CurrentUser = Depends(get_current_user)):
    if not user.is_staff:
        raise HTTPException(403)
    rows = await pool().fetch(
        "SELECT * FROM video_room_lobby WHERE room_id=$1 AND status='waiting' ORDER BY created_at",
        room_id,
    )
    return [{**dict(r), "id": str(r["id"])} for r in rows]


@router.post("/join")
async def join_lobby(
    room_id: str, body: LobbyJoin,
    user: CurrentUser | None = Depends(optional_user),
):
    user_id = user.id if user else f"guest_{body.display_name}"
    row = await pool().fetchrow(
        """
        INSERT INTO video_room_lobby (room_id, user_id, display_name, participant_type)
        VALUES ($1,$2,$3,$4) RETURNING id, created_at
        """,
        room_id, user_id, body.display_name, body.participant_type,
    )
    payload = {
        "id": str(row["id"]),
        "user_id": user_id,
        "display_name": body.display_name,
        "participant_type": body.participant_type,
    }
    await hub.broadcast(room_id, "lobby-join", payload)
    return payload


@router.post("/{lobby_id}/decision")
async def decide(
    room_id: str, lobby_id: str, body: LobbyDecision,
    user: CurrentUser = Depends(get_current_user),
):
    if not user.is_staff:
        raise HTTPException(403)
    status = "admitted" if body.admit else "denied"
    row = await pool().fetchrow(
        "UPDATE video_room_lobby SET status=$2, resolved_at=now() "
        "WHERE id=$1 RETURNING user_id, display_name",
        lobby_id, status,
    )
    if not row:
        raise HTTPException(404)
    await hub.broadcast(room_id, "lobby-decision", {
        "lobby_id": lobby_id, "user_id": row["user_id"], "admit": body.admit,
    })
    return {"ok": True}
