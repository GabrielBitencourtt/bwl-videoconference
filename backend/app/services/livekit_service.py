"""LiveKit token generation + server REST helpers."""
import time
from datetime import timedelta
from livekit import api
from ..config import settings


def create_token(
    *,
    room_name: str,
    identity: str,
    display_name: str,
    is_admin: bool,
    allow_screen_share: bool = True,
) -> str:
    grants = api.VideoGrants(
        room=room_name,
        room_join=True,
        room_create=is_admin,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
        # O host (is_admin) sempre pode compartilhar tela; o flag da sala só
        # restringe participantes comuns.
        can_publish_sources=(
            ["camera", "microphone", "screen_share", "screen_share_audio", "unknown"]
            if (allow_screen_share or is_admin)
            else ["camera", "microphone", "unknown"]
        ),
        room_admin=is_admin,
        room_record=is_admin,
    )
    at = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_name(display_name)
        .with_grants(grants)
        .with_ttl(timedelta(hours=6))
    )
    return at.to_jwt()


def livekit_api() -> api.LiveKitAPI:
    return api.LiveKitAPI(
        settings.livekit_host_url,
        settings.livekit_api_key,
        settings.livekit_api_secret,
    )


async def set_participant_sources(room_name: str, identity: str, *, camera: bool, mic: bool, screen: bool) -> None:
    """Autoritativo: define o que um participante pode publicar (ao vivo, no SFU).
    Revogar uma fonte faz o LiveKit despublicar e impedir novas publicações."""
    sources = [api.TrackSource.UNKNOWN]
    if camera:
        sources.append(api.TrackSource.CAMERA)
    if mic:
        sources.append(api.TrackSource.MICROPHONE)
    if screen:
        sources += [api.TrackSource.SCREEN_SHARE, api.TrackSource.SCREEN_SHARE_AUDIO]
    lk = livekit_api()
    try:
        await lk.room.update_participant(api.UpdateParticipantRequest(
            room=room_name, identity=identity,
            permission=api.ParticipantPermission(
                can_subscribe=True, can_publish=True, can_publish_data=True,
                can_publish_sources=sources,
            ),
        ))
    finally:
        await lk.aclose()


async def remove_participant(room_name: str, identity: str) -> None:
    """Remove (expulsa) um participante da sala no SFU."""
    lk = livekit_api()
    try:
        await lk.room.remove_participant(api.RoomParticipantIdentity(room=room_name, identity=identity))
    finally:
        await lk.aclose()


async def list_participant_identities(room_name: str) -> list[str]:
    lk = livekit_api()
    try:
        resp = await lk.room.list_participants(api.ListParticipantsRequest(room=room_name))
        return [p.identity for p in resp.participants]
    except Exception:
        return []
    finally:
        await lk.aclose()


async def livekit_participant_counts() -> dict[str, int]:
    """Live participant count per LiveKit room name (real-time, from the SFU)."""
    lk = livekit_api()
    try:
        resp = await lk.room.list_rooms(api.ListRoomsRequest())
        return {r.name: r.num_participants for r in resp.rooms}
    except Exception:
        return {}
    finally:
        await lk.aclose()
