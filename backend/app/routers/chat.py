from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user, optional_user, CurrentUser
from ..db import pool
from ..models.schemas import ChatMessageIn
from ..realtime.hub import hub

router = APIRouter(prefix="/api/rooms/{room_id}/chat", tags=["chat"])


@router.get("")
async def list_messages(room_id: str, limit: int = 200, channel: str | None = None):
    # channel NULL = sala principal; um groupId = chat daquele grupo (breakout).
    rows = await pool().fetch(
        "SELECT id, sender_id, sender_name, message, channel, created_at "
        "FROM video_room_chat_messages WHERE room_id=$1 AND channel IS NOT DISTINCT FROM $2 "
        "ORDER BY created_at DESC LIMIT $3",
        room_id, channel, limit,
    )
    return [{**dict(r), "id": str(r["id"])} for r in reversed(rows)]


@router.post("")
async def post_message(
    room_id: str,
    body: ChatMessageIn,
    user: CurrentUser | None = Depends(optional_user),
):
    sender_id = user.id if user else "guest"
    sender_name = (user.name if user else body.sender_name) or "Anônimo"
    channel = body.channel or None
    row = await pool().fetchrow(
        "INSERT INTO video_room_chat_messages (room_id, sender_id, sender_name, message, channel) "
        "VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at",
        room_id, sender_id, sender_name, body.message, channel,
    )
    payload = {
        "id": str(row["id"]),
        "room_id": room_id,
        "sender_id": sender_id,
        "sender_name": sender_name,
        "message": body.message,
        "channel": channel,
        "created_at": row["created_at"].isoformat(),
    }
    # Broadcast vai a todos os inscritos na sala-pai; o cliente filtra pelo canal.
    await hub.broadcast(room_id, "chat-message", payload)
    return payload
