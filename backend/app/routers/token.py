import hashlib
import secrets
from fastapi import APIRouter, HTTPException, Depends
from ..config import settings
from ..db import pool
from ..models.schemas import TokenRequest, TokenResponse
from ..services.livekit_service import create_token
from ..auth import optional_user, CurrentUser
from ..tenancy import resolve_tenant_id

router = APIRouter(prefix="/api/token", tags=["token"])


def _ws(url: str) -> str:
    return url if url.startswith(("ws://", "wss://")) else f"wss://{url}"


async def _register(room_db_id: str, identity: str, name: str, perms_row, email: str | None = None, is_staff: bool = False) -> None:
    await pool().execute(
        """
        INSERT INTO video_room_participants (room_id, user_id, display_name, email, is_staff, joined_at, left_at)
        VALUES ($1,$2,$3,$4,$5, now(), NULL)
        ON CONFLICT (room_id, user_id) DO UPDATE
          SET joined_at=now(), left_at=NULL, display_name=EXCLUDED.display_name,
              email=COALESCE(EXCLUDED.email, video_room_participants.email),
              is_staff=EXCLUDED.is_staff
        """,
        room_db_id, identity, name, (email or None), is_staff,
    )
    await pool().execute(
        """
        INSERT INTO video_room_participant_permissions
          (room_id, user_id, allow_camera, allow_mic, allow_screen_share, allow_whiteboard_edit)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (room_id, user_id) DO NOTHING
        """,
        room_db_id, identity,
        perms_row["allow_camera"], perms_row["allow_mic"],
        perms_row["allow_screen_share"], perms_row["allow_whiteboard_edit"],
    )


@router.post("", response_model=TokenResponse)
async def issue_token(
    body: TokenRequest,
    user: CurrentUser | None = Depends(optional_user),
    tenant_id: str = Depends(resolve_tenant_id),
):
    """
    Single endpoint, three flows:
      - guest:   pass guest_token + display_name (no auth headers needed)
      - speaker: pass speaker_invite_id + display_name (no auth headers needed)
      - user:    send X-User-Id / X-User-Name / X-User-Role headers
    """
    room = await pool().fetchrow("SELECT * FROM video_rooms WHERE id=$1", body.room_id)
    if not room or room["status"] == "ended":
        raise HTTPException(404, "room not available")

    if body.guest_token:
        if room["guest_token"] != body.guest_token:
            raise HTTPException(403, "invalid guest token")
        if not body.display_name:
            raise HTTPException(400, "display_name required")
        # Identity ESTÁVEL por e-mail: o aluno que cair e voltar mantém o mesmo
        # identity → sua atribuição de grupo (persistida) continua válida e o
        # rejoin ao grupo funciona (salas OpenPBL têm require_email). Sem e-mail
        # cai no aleatório (sem como persistir).
        _email = (body.email or "").strip().lower()
        if _email:
            identity = "guest_" + hashlib.sha256(_email.encode()).hexdigest()[:12]
        else:
            identity = f"guest_{secrets.token_hex(4)}"
        tok = create_token(
            room_name=room["room_id"], identity=identity,
            display_name=body.display_name, is_admin=False,
            allow_screen_share=room["allow_screen_share"],
        )
        await _register(body.room_id, identity, body.display_name, room, email=body.email)
        return TokenResponse(token=tok, livekit_url=_ws(settings.livekit_url), identity=identity)

    if body.speaker_invite_id:
        inv = await pool().fetchrow(
            "SELECT * FROM speaker_invite_links WHERE id=$1 AND revoked_at IS NULL",
            body.speaker_invite_id,
        )
        if not inv or str(inv["room_id"]) != body.room_id:
            raise HTTPException(403, "invalid invite")
        if not body.display_name:
            raise HTTPException(400, "display_name required")
        identity = f"speaker_{body.speaker_invite_id}"
        tok = create_token(
            room_name=room["room_id"], identity=identity,
            display_name=body.display_name, is_admin=False,
            allow_screen_share=inv["allow_screen_share"],
        )
        await _register(body.room_id, identity, body.display_name, inv, email=body.email)
        return TokenResponse(token=tok, livekit_url=_ws(settings.livekit_url), identity=identity)

    if not user:
        raise HTTPException(401, "auth headers or guest/speaker token required")

    # Tenant isolation: an API key (or the default tenant) may only mint user
    # tokens for rooms it owns. Guest/speaker flows above are authorized by their
    # own room-specific secret, so they skip this check.
    if str(room["tenant_id"]) != tenant_id:
        raise HTTPException(403, "room does not belong to this tenant")

    tok = create_token(
        room_name=room["room_id"], identity=user.id,
        display_name=user.name, is_admin=user.is_staff,
        allow_screen_share=room["allow_screen_share"],
    )
    await _register(body.room_id, user.id, user.name, room,
                    email=(body.email or (user.id if "@" in user.id else None)), is_staff=user.is_staff)
    return TokenResponse(token=tok, livekit_url=_ws(settings.livekit_url), identity=user.id)
