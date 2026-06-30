"""
WebSocket hub — per-room pub/sub for chat, lobby, permissions, whiteboard
sync and admin moderation broadcasts. Replaces Supabase Realtime.
"""
from __future__ import annotations
import asyncio
import json
from collections import defaultdict
from typing import Any
from fastapi import WebSocket


class RoomHub:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def join(self, room_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._rooms[room_id].add(ws)

    async def leave(self, room_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._rooms[room_id].discard(ws)
            if not self._rooms[room_id]:
                self._rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, event: str, payload: Any, *, exclude: WebSocket | None = None) -> None:
        msg = json.dumps({"event": event, "payload": payload})
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(room_id, ())):
            if ws is exclude:
                continue
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.leave(room_id, ws)


hub = RoomHub()
