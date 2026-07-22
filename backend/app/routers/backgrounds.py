"""Lobby background-video gallery: upload to S3 + list, isolado por licença (tenant).

As chaves ficam sob `backgrounds/<tenant_id>/[<scope>/]...` — cada licença só
enxerga os próprios vídeos. O `scope` opcional permite sub-isolar (ex.: por
organização do cliente, quando várias compartilham o mesmo tenant)."""
import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from ..auth import get_current_user, CurrentUser
from ..config import settings
from ..tenancy import resolve_tenant_id
from ..services.recording_service import s3_client, presigned_url

router = APIRouter(prefix="/api/backgrounds", tags=["backgrounds"])
PREFIX = "backgrounds/"
# Banners de fundo da apresentação (roteiro do episódio) ficam em um prefixo PRÓPRIO:
# sob `backgrounds/` eles apareceriam na galeria de vídeos do saguão.
PREFIX_BANNER = "banners/"
VIDEO_EXTS = (".mp4", ".webm", ".mov", ".m4v", ".ogg", ".ogv", ".mkv", ".avi", ".3gp")
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif")


class PresignBody(BaseModel):
    filename: str
    content_type: str = ""
    scope: str = ""
    # "video" = vídeo de fundo do saguão; "image" = banner de fundo da apresentação.
    kind: str = "video"


class ViewBody(BaseModel):
    key: str


def _is_video(filename: str, content_type: str) -> bool:
    # Aceita por MIME OU por extensão: ao reencaminhar via BFF (Next/undici), o
    # Content-Type da parte costuma virar application/octet-stream, então a
    # extensão é o sinal confiável.
    if (content_type or "").startswith("video/"):
        return True
    return (filename or "").lower().endswith(VIDEO_EXTS)


def _is_image(filename: str, content_type: str) -> bool:
    if (content_type or "").startswith("image/"):
        return True
    return (filename or "").lower().endswith(IMAGE_EXTS)


def _image_ctype(safe: str, content_type: str) -> str:
    ctype = content_type or ""
    if not ctype.startswith("image/"):
        ext = safe.lower().rsplit(".", 1)[-1] if "." in safe else "png"
        ctype = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp",
                 "gif": "image/gif", "avif": "image/avif"}.get(ext, "image/png")
    return ctype


def _safe_scope(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", s or "")[:64]


def _prefix(tenant_id: str, scope: str = "", base: str = PREFIX) -> str:
    p = f"{base}{tenant_id}/"
    sc = _safe_scope(scope)
    if sc:
        p += f"{sc}/"
    return p


def _name_from_key(key: str) -> str:
    base = key.rsplit("/", 1)[-1]  # keys look like "<uuidhex>-<original name>"
    return base.split("-", 1)[-1] if "-" in base else base


def _safe_name(filename: str) -> str:
    return (filename or "video.mp4").replace("/", "_").replace("\\", "_").replace(" ", "_")


def _video_ctype(safe: str, content_type: str) -> str:
    # Garante um Content-Type de vídeo (necessário para o <video> tocar o presigned
    # URL); se veio octet-stream/vazio, infere pela extensão.
    ctype = content_type or ""
    if not ctype.startswith("video/"):
        ext = safe.lower().rsplit(".", 1)[-1] if "." in safe else "mp4"
        ctype = {"webm": "video/webm", "ogg": "video/ogg", "ogv": "video/ogg",
                 "mov": "video/quicktime", "mkv": "video/x-matroska"}.get(ext, "video/mp4")
    return ctype


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


@router.post("/presign")
async def presign_background(
    body: PresignBody,
    user: CurrentUser = Depends(get_current_user),
    tenant_id: str = Depends(resolve_tenant_id),
):
    """Gera uma URL pré-assinada de PUT no S3 para upload DIRETO do browser.

    Necessário quando o upload passa por um BFF serverless (ex.: CustomerApp no
    Amplify/Lambda, limite de 6MB no payload): o browser sobe os bytes direto ao
    S3 (sem passar pelo Lambda), e só o presign (JSON pequeno) passa pelo BFF.
    O browser DEVE enviar o PUT com o mesmo Content-Type retornado aqui.
    """
    if not user.is_staff:
        raise HTTPException(403)
    imagem = (body.kind or "video").lower() == "image"
    if imagem:
        if not _is_image(body.filename or "", body.content_type or ""):
            raise HTTPException(400, "Envie uma imagem (.jpg, .png, .webp, …)")
    elif not _is_video(body.filename or "", body.content_type or ""):
        raise HTTPException(400, "Envie um arquivo de vídeo (.mp4, .webm, …)")
    safe = _safe_name(body.filename)
    base = PREFIX_BANNER if imagem else PREFIX
    key = f"{_prefix(tenant_id, body.scope, base)}{uuid.uuid4().hex}-{safe}"
    ctype = _image_ctype(safe, body.content_type or "") if imagem else _video_ctype(safe, body.content_type or "")
    put_url = s3_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.s3_bucket, "Key": key, "ContentType": ctype},
        ExpiresIn=3600,
    )
    return {
        "key": key,
        "put_url": put_url,
        "content_type": ctype,
        "name": safe,
        "url": presigned_url(key, expires=3600),
    }


@router.post("/view")
async def view_background(
    body: ViewBody,
    user: CurrentUser = Depends(get_current_user),
    tenant_id: str = Depends(resolve_tenant_id),
):
    """URL de leitura (curta) para uma chave já guardada.

    O que se persiste no roteiro é a CHAVE do S3, não a URL: presigned URLs expiram
    em horas e o roteiro de um episódio vive meses. Quem for exibir pede uma URL
    nova — aqui (edição) ou via `room_public` (dentro da sala).
    """
    if not user.is_staff:
        raise HTTPException(403)
    key = (body.key or "").strip()
    # Só chaves DESTE tenant: sem isto, uma licença leria os arquivos de outra.
    if not key or (f"/{tenant_id}/" not in key and not key.startswith(f"{PREFIX_BANNER}{tenant_id}/")):
        raise HTTPException(404)
    return {"key": key, "url": presigned_url(key, expires=6 * 3600)}
