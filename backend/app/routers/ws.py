"""WebSocket endpoint: clients subscribe to all room events."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..realtime.hub import hub

router = APIRouter()


@router.websocket("/ws/rooms/{room_id}")
async def ws_room(ws: WebSocket, room_id: str):
    await hub.join(room_id, ws)
    try:
        while True:
            # Clients can also send messages — we just relay them as 'client-broadcast'
            msg = await ws.receive_json()
            await hub.broadcast(room_id, msg.get("event", "client-broadcast"), msg.get("payload"), exclude=ws)
    except WebSocketDisconnect:
        pass
    finally:
        await hub.leave(room_id, ws)
