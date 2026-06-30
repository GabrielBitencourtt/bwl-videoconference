"""Start/stop LiveKit Web Egress recording → S3, plus presigned playback URLs."""
import boto3
from botocore.config import Config
from livekit import api
from ..config import settings
from .livekit_service import livekit_api

_IS_AWS = "amazonaws.com" in settings.s3_endpoint


def _s3_upload() -> api.S3Upload:
    # For real AWS S3 use the default regional endpoint + virtual-hosted style.
    # For MinIO / S3-compatible, pass the custom endpoint + path style.
    if _IS_AWS:
        return api.S3Upload(
            access_key=settings.s3_access_key,
            secret=settings.s3_secret_key,
            region=settings.s3_region,
            bucket=settings.s3_bucket,
            force_path_style=False,
        )
    return api.S3Upload(
        access_key=settings.s3_access_key,
        secret=settings.s3_secret_key,
        region=settings.s3_region,
        bucket=settings.s3_bucket,
        endpoint=settings.s3_endpoint,
        force_path_style=True,
    )


async def start_recording(room_name: str, room_db_id: str, wb_active: bool = False) -> str:
    # Record our own composite page (/recording-view) so the capture includes
    # everything on screen — videos, screen share AND the live whiteboard —
    # like a screen recording of the meeting. The page signals egress via
    # @livekit/egress-sdk; egress appends url/token/layout to this base URL.
    custom_url = f"{settings.recording_view_base_url}?roomDbId={room_db_id}&wb={1 if wb_active else 0}"
    filepath = f"{room_db_id}/{room_name}-{{time}}.mp4"
    req = api.RoomCompositeEgressRequest(
        room_name=room_name,
        layout="grid",
        custom_base_url=custom_url,
        file_outputs=[
            api.EncodedFileOutput(
                file_type=api.EncodedFileType.MP4,
                filepath=filepath,
                s3=_s3_upload(),
            )
        ],
    )
    lk = livekit_api()
    try:
        # Ensure the LiveKit room exists — egress can only record an existing room.
        try:
            await lk.room.create_room(api.CreateRoomRequest(name=room_name))
        except Exception:
            pass
        info = await lk.egress.start_room_composite_egress(req)
        return info.egress_id
    finally:
        await lk.aclose()


async def stop_recording(egress_id: str) -> None:
    lk = livekit_api()
    try:
        await lk.egress.stop_egress(api.StopEgressRequest(egress_id=egress_id))
    finally:
        await lk.aclose()


def s3_client():
    # Force SigV4 + the regional endpoint so presigned URLs work for buckets
    # outside us-east-1 (avoids the 307 global-endpoint redirect).
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual" if _IS_AWS else "path"},
        ),
    )


def presigned_url(key: str, expires: int = 3600) -> str:
    """Time-limited GET URL for a private recording object."""
    return s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires,
    )
