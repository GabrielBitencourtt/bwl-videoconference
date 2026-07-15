"""Papéis de sessão por sala, PERSISTIDOS no banco (video_room_session_roles).
Compartilhado entre routers (rooms, lobby, etc.).

- moderators: participantes promovidos pelo anfitrião → ganham poderes de host.
- controller: quem dirige o sequenciador/apresentação OpenPBL (um por vez, "assumir
  controle"). None => o anfitrião original comanda.
- pinned: identidade cuja webcam aparece na área de conteúdo. None => o anfitrião.
"""
import json

from .auth import CurrentUser
from .db import pool


async def roles(room_id: str) -> dict:
    row = await pool().fetchrow(
        "SELECT moderators, controller, pinned FROM video_room_session_roles WHERE room_id=$1",
        room_id,
    )
    if not row:
        return {"moderators": set(), "controller": None, "pinned": None}
    mods = row["moderators"]
    if isinstance(mods, str):        # asyncpg devolve jsonb como str por padrão
        mods = json.loads(mods)
    return {"moderators": set(mods or []), "controller": row["controller"], "pinned": row["pinned"]}


async def roles_public(room_id: str) -> dict:
    r = await roles(room_id)
    return {"moderators": sorted(r["moderators"]), "controller": r["controller"], "pinned": r["pinned"]}


async def is_host_or_mod(room_id: str, user: CurrentUser) -> bool:
    """Anfitrião (staff) OU moderador promovido → poderes de host."""
    if user.is_staff:
        return True
    r = await roles(room_id)
    return user.id in r["moderators"]


async def update_roles(
    room_id: str, *,
    add_moderator: str | None = None,
    remove_moderator: str | None = None,
    set_controller: bool = False, controller: str | None = None,
    set_pinned: bool = False, pinned: str | None = None,
) -> dict:
    """Aplica as mudanças de papel e persiste. Retorna o estado público resultante."""
    r = await roles(room_id)
    mods, ctrl, pin = r["moderators"], r["controller"], r["pinned"]
    if add_moderator:
        mods.add(add_moderator)
    if remove_moderator:
        mods.discard(remove_moderator)
        if ctrl == remove_moderator:
            ctrl = None
        if pin == remove_moderator:
            pin = None
    if set_controller:
        ctrl = controller or None
    if set_pinned:
        pin = pinned or None
    await pool().execute(
        """
        INSERT INTO video_room_session_roles (room_id, moderators, controller, pinned, updated_at)
        VALUES ($1, $2::jsonb, $3, $4, now())
        ON CONFLICT (room_id) DO UPDATE
          SET moderators=EXCLUDED.moderators, controller=EXCLUDED.controller,
              pinned=EXCLUDED.pinned, updated_at=now()
        """,
        room_id, json.dumps(sorted(mods)), ctrl, pin,
    )
    return {"moderators": sorted(mods), "controller": ctrl, "pinned": pin}
