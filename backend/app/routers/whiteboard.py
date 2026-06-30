from fastapi import APIRouter, Depends, HTTPException, Body
from ..auth import get_current_user, optional_user, CurrentUser
from ..db import pool
from ..realtime.hub import hub

router = APIRouter(prefix="/api/rooms/{room_id}/whiteboard", tags=["whiteboard"])


@router.get("")
async def get_whiteboard(room_id: str):
    row = await pool().fetchrow(
        "SELECT id, state, updated_at FROM whiteboards WHERE room_id=$1", room_id
    )
    if not row:
        row = await pool().fetchrow(
            "INSERT INTO whiteboards (room_id) VALUES ($1) "
            "ON CONFLICT (room_id) DO UPDATE SET room_id=EXCLUDED.room_id "
            "RETURNING id, state, updated_at",
            room_id,
        )
    return {"id": str(row["id"]), "state": row["state"], "updated_at": row["updated_at"].isoformat()}


@router.put("")
async def save_whiteboard(
    room_id: str, state: dict = Body(...),
    user: CurrentUser | None = Depends(optional_user),
):
    await pool().execute(
        """
        INSERT INTO whiteboards (room_id, state, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (room_id) DO UPDATE SET state=EXCLUDED.state, updated_at=now()
        """,
        room_id, state,
    )
    await hub.broadcast(room_id, "whiteboard-snapshot", {"state": state})
    return {"ok": True}


@router.post("/toggle")
async def toggle(
    room_id: str, active: bool = Body(..., embed=True),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.is_staff:
        raise HTTPException(403)
    await pool().execute(
        "UPDATE video_rooms SET whiteboard_active=$2, updated_at=now() WHERE id=$1",
        room_id, active,
    )
    await hub.broadcast(room_id, "whiteboard-toggle", {"active": active})
    return {"ok": True}
