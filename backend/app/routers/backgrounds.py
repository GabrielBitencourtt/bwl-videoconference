"""Lobby background-video gallery: upload to S3 + list, isolado por licença (tenant).

As chaves ficam sob `backgrounds/<tenant_id>/[<scope>/]...` — cada licença só
enxerga os próprios vídeos. O `scope` opcional permite sub-isolar (ex.: por
organização do cliente, quando várias compartilham o mesmo tenant)."""
import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from ..auth import get_current_user, CurrentUser
from ..config import settings
from ..tenancy import resolve_tenant_id
from ..services.recording_service import s3_client, presigned_url

router = APIRouter(prefix="/api/backgrounds", tags=["backgrounds"])
PREFIX = "backgrounds/"
VIDEO_EXTS = (".mp4", ".webm", ".mov", ".m4v", ".ogg", ".ogv", ".mkv", ".avi", ".3gp")


def _is_video(filename: str, content_type: str) -> bool:
    # Aceita por MIME OU por extensão: ao reencaminhar via BFF (Next/undici), o
    # Content-Type da parte costuma virar application/octet-stream, então a
    # extensão é o sinal confiável.
    if (content_type or "").startswith("video/"):
        return True
    return (filename or "").lower().endswith(VIDEO_EXTS)


def _safe_scope(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", s or "")[:64]


def _prefix(tenant_id: str, scope: str = "") -> str:
    p = f"{PREFIX}{tenant_id}/"
    sc = _safe_scope(scope)
    if sc:
        p += f"{sc}/"
    return p


def _name_from_key(key: str) -> str:
    base = key.rsplit("/", 1)[-1]  # keys look like "<uuidhex>-<original name>"
    return base.split("-", 1)[-1] if "-" in base else base


@router.get("")
async def list_backgrounds(
    scope: str = "",
    user: CurrentUser = Depends(get_current_user),
    tenant_id: str = Depends(resolve_tenant_id),
):
    if not user.is_staff:
        raise HTTPException(403)
    prefix = _prefix(tenant_id, scope)
    s3 = s3_client()
    resp = s3.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)
    items = []
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        if key.endswith("/"):
            continue
        items.append({
            "key": key,
            "name": _name_from_key(key),
            "size": obj["Size"],
            "url": presigned_url(key, expires=3600),
        })
    items.sort(key=lambda x: x["key"], reverse=True)
    return items


@router.post("")
async def upload_background(
    file: UploadFile = File(...),
    scope: str = Form(""),
    user: CurrentUser = Depends(get_current_user),
    tenant_id: str = Depends(resolve_tenant_id),
):
    if not user.is_staff:
        raise HTTPException(403)
    if not _is_video(file.filename or "", file.content_type or ""):
        raise HTTPException(400, "Envie um arquivo de vídeo (.mp4, .webm, …)")
    safe = (file.filename or "video.mp4").replace("/", "_").replace("\\", "_").replace(" ", "_")
    key = f"{_prefix(tenant_id, scope)}{uuid.uuid4().hex}-{safe}"
    # Garante um Content-Type de vídeo no S3 (importante para o <video> tocar o
    # presigned URL); se veio octet-stream, infere pela extensão.
    ctype = file.content_type or ""
    if not ctype.startswith("video/"):
        ext = safe.lower().rsplit(".", 1)[-1] if "." in safe else "mp4"
        ctype = {"webm": "video/webm", "ogg": "video/ogg", "ogv": "video/ogg",
                 "mov": "video/quicktime", "mkv": "video/x-matroska"}.get(ext, "video/mp4")
    s3 = s3_client()
    s3.upload_fileobj(
        file.file, settings.s3_bucket, key,
        ExtraArgs={"ContentType": ctype},
    )
    return {"key": key, "name": safe, "url": presigned_url(key, expires=3600)}
