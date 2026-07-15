"""Papéis de sessão em memória, por sala (não persiste entre restarts — o anfitrião
reaplica se precisar). Compartilhado entre routers (rooms, lobby, etc.).

- moderators: participantes promovidos pelo anfitrião → ganham poderes de host.
- controller: quem dirige o sequenciador/apresentação OpenPBL (um por vez, "assumir
  controle"). None => o anfitrião original comanda.
- pinned: identidade cuja webcam aparece na área de conteúdo. None => o anfitrião.
"""
from .auth import CurrentUser

_ROOM_ROLES: dict[str, dict] = {}


def roles(room_id: str) -> dict:
    r = _ROOM_ROLES.get(room_id)
    if r is None:
        r = {"moderators": set(), "controller": None, "pinned": None}
        _ROOM_ROLES[room_id] = r
    return r


def roles_public(room_id: str) -> dict:
    r = roles(room_id)
    return {"moderators": sorted(r["moderators"]), "controller": r["controller"], "pinned": r["pinned"]}


def is_host_or_mod(room_id: str, user: CurrentUser) -> bool:
    """Anfitrião (staff) OU moderador promovido → poderes de host."""
    return bool(user.is_staff) or (user.id in roles(room_id)["moderators"])
