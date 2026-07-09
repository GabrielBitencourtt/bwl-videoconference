"""Aula OpenPBL ao vivo — a webconf substitui o pacote PRESENTATION do facilitador.

Replica exatamente a sequência que o pacote faz contra a integration.openpbl.ai
(ContentBuilder C#):
  1. POST /api/Presentation {ActivityId, email}            → presentationCode
  2. POST /api/ClassCourse {name,email,courseId:"",code}   → ClassCourseId + 6 grupos
  Liberar Riscos:      POST /api/ClassRoom/release/{email}/{ccid}/performance
  Liberar Percepções:  POST /api/ClassRoom/release/{email}/{ccid}
  Encerrar registro:   POST /api/Presentation/CloseChecking {Code, ActivityCourseId}
Os pacotes dos alunos já fazem polling desses estados (5s) — nada muda para eles.

O chat do facilitador é um proxy do chat.openpbl.ai (painel do professor, HTTP
Basic). O aluno continua mandando pelo chat do pacote; o facilitador responde
daqui de dentro da sala.
"""
import asyncio
import json
import time
import httpx
from datetime import timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user, optional_user, CurrentUser
from ..config import settings
from ..db import pool
from ..realtime.hub import hub
from .breakouts import _broadcast_state as _broadcast_breakout_state

router = APIRouter(prefix="/api/rooms", tags=["openpbl-class"])


# ── schemas ───────────────────────────────────────────────────────────────
class ClassStart(BaseModel):
    activity_id: str
    facilitator_email: str | None = None   # default: user.id quando for e-mail


class ClassRelease(BaseModel):
    gate: str   # "risks" (dimensões, /performance) | "perceptions"


class ChatReply(BaseModel):
    content: str


# ── helpers ───────────────────────────────────────────────────────────────
def _integration_headers() -> dict:
    if not settings.openpbl_integration_apikey:
        raise HTTPException(503, "Integração OpenPBL não configurada (apikey ausente)")
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "apikey": settings.openpbl_integration_apikey,
    }


def _chat_auth() -> tuple[str, str]:
    if not settings.openpbl_chat_user:
        raise HTTPException(503, "Chat OpenPBL não configurado (credenciais ausentes)")
    return (settings.openpbl_chat_user, settings.openpbl_chat_pass)


async def _require_host(user: CurrentUser):
    if not user.is_staff:
        raise HTTPException(403)


def _row_to_state(row) -> dict:
    groups = row["group_codes"]
    if isinstance(groups, str):
        groups = json.loads(groups)
    return {
        "active": True,
        "activity_id": row["activity_id"],
        "presentation_code": row["presentation_code"],
        "class_course_id": row["class_course_id"],
        "group_codes": groups,
        "facilitator_email": row["facilitator_email"],
        "facilitator_name": row["facilitator_name"],
        "checking_open": row["checking_open"],
        "released_dimensions": row["released_dimensions"],
        "released": row["released"],
        "code_hidden": row["code_hidden"],
    }


async def _get_class(room_id: str):
    return await pool().fetchrow(
        "SELECT * FROM video_room_openpbl_class WHERE room_id=$1", room_id)


# ── endpoints ─────────────────────────────────────────────────────────────
@router.post("/{room_id}/openpbl/start")
async def start_class(room_id: str, body: ClassStart, user: CurrentUser = Depends(get_current_user)):
    """Gera o class-code e cria a turma — igual ao pacote PRESENTATION ao abrir."""
    await _require_host(user)
    room = await pool().fetchrow("SELECT id FROM video_rooms WHERE id=$1", room_id)
    if not room:
        raise HTTPException(404, "room not found")

    email = (body.facilitator_email or "").strip() or (user.id if "@" in user.id else "")
    if not email:
        raise HTTPException(400, "facilitator_email é obrigatório (identidade sem e-mail)")
    activity_id = body.activity_id.strip()
    if not activity_id:
        raise HTTPException(400, "activity_id é obrigatório")

    base = settings.openpbl_integration_url.rstrip("/")
    headers = _integration_headers()
    async with httpx.AsyncClient(timeout=20) as c:
        # 1. presentationCode
        r1 = await c.post(f"{base}/api/Presentation",
                          headers=headers,
                          json={"ActivityId": activity_id, "email": email})
        if r1.status_code != 200:
            raise HTTPException(502, f"OpenPBL /api/Presentation falhou ({r1.status_code})")
        code = r1.json() if r1.headers.get("content-type", "").startswith("application/json") else r1.text.strip('"')
        if not code or not isinstance(code, str):
            raise HTTPException(502, "OpenPBL não retornou o código da sessão")

        # 2. ClassCourse (turma + 6 grupos)
        r2 = await c.post(f"{base}/api/ClassCourse",
                          headers=headers,
                          json={"name": user.name or "Facilitador", "email": email,
                                "courseId": "", "presentationCode": code})
        if r2.status_code != 200:
            raise HTTPException(502, f"OpenPBL /api/ClassCourse falhou ({r2.status_code})")
        cc = r2.json() or {}
        ccid = cc.get("id")
        group_codes = [g.get("codigo") for g in (cc.get("classeRooms") or []) if g.get("codigo")]
        if not ccid:
            raise HTTPException(502, "OpenPBL não retornou o ClassCourseId")

    await pool().execute(
        """
        INSERT INTO video_room_openpbl_class
          (room_id, activity_id, presentation_code, class_course_id, group_codes,
           facilitator_email, facilitator_name, checking_open, released_dimensions, released)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,true,false,false)
        ON CONFLICT (room_id) DO UPDATE SET
          activity_id=EXCLUDED.activity_id, presentation_code=EXCLUDED.presentation_code,
          class_course_id=EXCLUDED.class_course_id, group_codes=EXCLUDED.group_codes,
          facilitator_email=EXCLUDED.facilitator_email, facilitator_name=EXCLUDED.facilitator_name,
          checking_open=true, released_dimensions=false, released=false, created_at=now()
        """,
        room_id, activity_id, code, str(ccid), json.dumps(group_codes),
        email, user.name or "")

    row = await _get_class(room_id)
    state = _row_to_state(row)
    await hub.broadcast(room_id, "openpbl-class", state)
    return state


@router.get("/{room_id}/openpbl")
async def get_class(room_id: str, user: CurrentUser = Depends(get_current_user)):
    row = await _get_class(room_id)
    if not row:
        return {"active": False}
    return _row_to_state(row)


@router.post("/{room_id}/openpbl/release")
async def release_gate(room_id: str, body: ClassRelease, user: CurrentUser = Depends(get_current_user)):
    """Libera um questionário para a turma (Riscos → /performance; Percepções → base)."""
    await _require_host(user)
    row = await _get_class(room_id)
    if not row:
        raise HTTPException(404, "aula OpenPBL não iniciada nesta sala")
    if body.gate not in ("risks", "perceptions"):
        raise HTTPException(400, "gate deve ser 'risks' ou 'perceptions'")

    base = settings.openpbl_integration_url.rstrip("/")
    email, ccid = row["facilitator_email"], row["class_course_id"]
    suffix = "/performance" if body.gate == "risks" else ""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{base}/api/ClassRoom/release/{email}/{ccid}{suffix}",
                         headers={"Accept": "*/*", "apikey": settings.openpbl_integration_apikey})
        if r.status_code != 200:
            raise HTTPException(502, f"OpenPBL release falhou ({r.status_code})")

    field = "released_dimensions" if body.gate == "risks" else "released"
    await pool().execute(
        f"UPDATE video_room_openpbl_class SET {field}=true WHERE room_id=$1", room_id)
    row = await _get_class(room_id)
    state = _row_to_state(row)
    await hub.broadcast(room_id, "openpbl-class", state)
    return state


@router.post("/{room_id}/openpbl/close-registration")
async def close_registration(room_id: str, user: CurrentUser = Depends(get_current_user)):
    """Encerra o registro/presença — novos alunos não conseguem mais entrar."""
    await _require_host(user)
    row = await _get_class(room_id)
    if not row:
        raise HTTPException(404, "aula OpenPBL não iniciada nesta sala")

    base = settings.openpbl_integration_url.rstrip("/")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{base}/api/Presentation/CloseChecking",
                         headers=_integration_headers(),
                         json={"Code": row["presentation_code"],
                               "ActivityCourseId": row["activity_id"]})
        if r.status_code != 200:
            raise HTTPException(502, f"OpenPBL CloseChecking falhou ({r.status_code})")

    await pool().execute(
        "UPDATE video_room_openpbl_class SET checking_open=false WHERE room_id=$1", room_id)

    # A API OpenPBL monta os grupos ao encerrar o registro — reflete nos breakouts
    # da webconf (best-effort: não deve derrubar o fechamento se o listarGrupos falhar).
    try:
        await _sync_openpbl_groups(room_id, row)
    except Exception:
        pass

    row = await _get_class(room_id)
    state = _row_to_state(row)
    await hub.broadcast(room_id, "openpbl-class", state)
    return state


@router.get("/{room_id}/openpbl/groups")
async def list_groups(room_id: str, user: CurrentUser = Depends(get_current_user)):
    """Grupos da turma com os alunos que entraram (listarGrupos, ao vivo)."""
    await _require_host(user)
    row = await _get_class(room_id)
    if not row:
        raise HTTPException(404, "aula OpenPBL não iniciada nesta sala")
    base = settings.openpbl_integration_url.rstrip("/")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{base}/api/ClassRoomStudent/listarGrupos/{row['class_course_id']}",
                        headers=_integration_headers())
        if r.status_code != 200:
            raise HTTPException(502, f"OpenPBL listarGrupos falhou ({r.status_code})")
        return r.json()


async def _sync_openpbl_groups(room_id: str, cls) -> int:
    """Reflete os grupos montados pela API OpenPBL (ao encerrar o registro) nos
    breakout rooms da webconf. Cada grupo do `listarGrupos` vira um breakout, e
    cada aluno é atribuído mapeando o e-mail → identity do participante da sala.
    Recria a configuração de grupos do zero. Retorna o nº de grupos criados."""
    ccid = cls["class_course_id"]
    if not ccid:
        return 0
    base = settings.openpbl_integration_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{base}/api/ClassRoomStudent/listarGrupos/{ccid}",
                            headers=_integration_headers())
        if r.status_code != 200:
            return 0
        payload = r.json() or {}
    except Exception:
        return 0

    # `data` costuma vir como string JSON (o pacote facilitador faz eval()).
    raw = payload.get("data") if isinstance(payload, dict) else payload
    try:
        groups = raw if isinstance(raw, list) else (json.loads(raw) if raw else [])
    except Exception:
        return 0
    groups = [g for g in groups if isinstance(g, dict) and (g.get("Alunos") or [])]
    if not groups:
        return 0

    # Mapa e-mail → (identity, nome) dos participantes atuais da sala.
    parts = await pool().fetch(
        "SELECT user_id, display_name, email FROM video_room_participants "
        "WHERE room_id=$1 AND left_at IS NULL", room_id)
    by_email = {(p["email"] or "").strip().lower(): (p["user_id"], p["display_name"] or "")
                for p in parts if p["email"]}

    room = await pool().fetchrow("SELECT * FROM video_rooms WHERE id=$1", room_id)
    if not room:
        return 0
    # Recria do zero (mesma semântica do create_breakouts). Fecha se estava aberto.
    if room["breakout_open"]:
        await hub.broadcast(room_id, "breakout-close", {"room_id": room_id})
    await pool().execute("DELETE FROM video_breakout_groups WHERE parent_room_id=$1", room_id)
    await pool().execute(
        "UPDATE video_rooms SET breakout_open=false, breakout_ends_at=NULL, breakout_mode='manual' WHERE id=$1",
        room_id)

    for i, g in enumerate(groups):
        rn = f"{room['room_id']}__bo{i + 1}"
        gid = await pool().fetchval(
            "INSERT INTO video_breakout_groups (parent_room_id, name, room_name, position) "
            "VALUES ($1,$2,$3,$4) RETURNING id", room_id, f"Grupo {i + 1}", rn, i)
        for aluno in (g.get("Alunos") or []):
            email = (aluno.get("Email") or "").strip().lower()
            hit = by_email.get(email)
            if not hit:
                continue   # aluno do grupo não está (ainda) na sala de vídeo
            await pool().execute(
                "INSERT INTO video_breakout_assignments (parent_room_id, group_id, identity, display_name) "
                "VALUES ($1,$2,$3,$4) ON CONFLICT (parent_room_id, identity) DO UPDATE "
                "SET group_id=EXCLUDED.group_id, display_name=EXCLUDED.display_name",
                room_id, str(gid), hit[0], (aluno.get("Name") or hit[1]))

    await _broadcast_breakout_state(room_id)
    return len(groups)


@router.post("/{room_id}/openpbl/sync-groups")
async def sync_groups(room_id: str, user: CurrentUser = Depends(get_current_user)):
    """(Re)cria os breakouts a partir dos grupos da API OpenPBL. Idempotente —
    útil se os grupos ainda estavam sendo montados quando o registro fechou."""
    await _require_host(user)
    row = await _get_class(room_id)
    if not row:
        raise HTTPException(404, "aula OpenPBL não iniciada nesta sala")
    n = await _sync_openpbl_groups(room_id, row)
    return {"ok": True, "groups": n}


# ── roster: status dos alunos p/ as bordas dos tiles ──────────────────────
# Verde = dentro do pacote; vermelho = fora; badge = registrou presença na
# sessão (Presentation/Students). Todo cliente da sala faz polling, então o
# resultado é cacheado por sala (1 varredura LRS/attendance a cada ~8s).
_roster_cache: dict[str, tuple[float, dict]] = {}
_ROSTER_TTL = 8.0


@router.get("/{room_id}/openpbl/roster")
async def class_roster(room_id: str, user: CurrentUser | None = Depends(optional_user)):
    now = time.monotonic()
    hit = _roster_cache.get(room_id)
    if hit and (now - hit[0]) < _ROSTER_TTL:
        return hit[1]

    room = await pool().fetchrow(
        "SELECT created_at, owner_id FROM video_rooms WHERE id=$1", room_id)
    if not room:
        raise HTTPException(404, "room not found")
    cls = await _get_class(room_id)
    parts = await pool().fetch(
        "SELECT user_id, display_name, email, is_staff FROM video_room_participants "
        "WHERE room_id=$1 AND left_at IS NULL", room_id)

    since_iso = room["created_at"].astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    lrs = settings.scorm_lrs_url.rstrip("/")

    # Presença registrada na sessão (lista do Presentation/Students).
    registered_emails: set[str] = set()
    if cls and settings.openpbl_integration_apikey:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(
                    f"{settings.openpbl_integration_url.rstrip('/')}/api/Presentation/Students/{cls['presentation_code']}",
                    headers={"Accept": "application/json", "apikey": settings.openpbl_integration_apikey})
                if r.status_code == 200:
                    for s in ((r.json() or {}).get("data") or []):
                        if s.get("email"):
                            registered_emails.add(s["email"].strip().lower())
        except Exception:
            pass

    async def in_package(email: str) -> bool | None:
        """True/False pelo LRS; None = sem eventos na sessão (LRS pode atrasar)."""
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(f"{lrs}/interaction-events",
                                params={"studentEmail": email, "limit": 60})
            evs = (r.json() or {}).get("data") or []
        except Exception:
            return None
        sess = sorted([e for e in evs if (e.get("createdAt") or "") >= since_iso],
                      key=lambda x: x.get("createdAt") or "", reverse=True)
        if not sess:
            return None
        if sess[0].get("eventType") == "package_exited":
            return False
        return any(e.get("eventType") in ("package_opened", "activity_accessed",
                                          "authenticated", "quiz_answered", "lesson_score",
                                          "package_completed") for e in sess)

    emails = {(p["email"] or "").strip().lower(): None for p in parts
              if p["email"] and not p["is_staff"] and p["user_id"] != room["owner_id"]}
    flags = await asyncio.gather(*[in_package(e) for e in emails]) if emails else []
    # Registrar presença SÓ é possível de dentro do pacote — então, sem eventos
    # no LRS (None), o registro vale como evidência de pacote aberto. O LRS só
    # rebaixa para vermelho quando mostrar package_exited (saiu depois).
    in_pkg = {e: (f if f is not None else (e in registered_emails))
              for e, f in zip(emails.keys(), flags)}

    students = []
    for p in parts:
        email = (p["email"] or "").strip().lower()
        is_staff = bool(p["is_staff"]) or p["user_id"] == room["owner_id"]
        students.append({
            "identity": p["user_id"],
            "name": p["display_name"] or p["user_id"],
            "is_staff": is_staff,
            "in_package": (in_pkg.get(email, False) if not is_staff else None),
            "registered": (email in registered_emails) if (email and not is_staff) else False,
        })

    out = {
        "code": cls["presentation_code"] if cls else None,
        "activity_id": cls["activity_id"] if cls else None,
        "facilitator_email": cls["facilitator_email"] if cls else None,
        "facilitator_name": cls["facilitator_name"] if cls else None,
        "checking_open": cls["checking_open"] if cls else None,
        "code_hidden": cls["code_hidden"] if cls else False,
        "students": students,
    }
    _roster_cache[room_id] = (now, out)
    return out


class CodeVisibility(BaseModel):
    hidden: bool


@router.post("/{room_id}/openpbl/code-visibility")
async def set_code_visibility(room_id: str, body: CodeVisibility, user: CurrentUser = Depends(get_current_user)):
    """Facilitador oculta/reexibe o card do class-code para todos."""
    await _require_host(user)
    row = await _get_class(room_id)
    if not row:
        raise HTTPException(404, "aula OpenPBL não iniciada nesta sala")
    await pool().execute(
        "UPDATE video_room_openpbl_class SET code_hidden=$2 WHERE room_id=$1", room_id, body.hidden)
    _roster_cache.pop(room_id, None)   # invalida o cache p/ refletir na hora
    row = await _get_class(room_id)
    state = _row_to_state(row)
    await hub.broadcast(room_id, "openpbl-class", state)
    return state


# ── chat do facilitador (proxy do painel do professor) ────────────────────
@router.get("/{room_id}/openpbl/chat/conversations")
async def chat_conversations(room_id: str, user: CurrentUser = Depends(get_current_user)):
    await _require_host(user)
    async with httpx.AsyncClient(timeout=20, auth=_chat_auth()) as c:
        r = await c.get(f"{settings.openpbl_chat_url.rstrip('/')}/api/conversations")
        if r.status_code != 200:
            raise HTTPException(502, f"chat OpenPBL falhou ({r.status_code})")
        return r.json()


@router.get("/{room_id}/openpbl/chat/conversations/{conv_id}/messages")
async def chat_messages(room_id: str, conv_id: str, user: CurrentUser = Depends(get_current_user)):
    await _require_host(user)
    async with httpx.AsyncClient(timeout=20, auth=_chat_auth()) as c:
        r = await c.get(f"{settings.openpbl_chat_url.rstrip('/')}/api/conversations/{conv_id}/messages")
        if r.status_code != 200:
            raise HTTPException(502, f"chat OpenPBL falhou ({r.status_code})")
        return r.json()


@router.post("/{room_id}/openpbl/chat/conversations/{conv_id}/reply")
async def chat_reply(room_id: str, conv_id: str, body: ChatReply, user: CurrentUser = Depends(get_current_user)):
    await _require_host(user)
    text = (body.content or "").strip()
    if not text:
        raise HTTPException(400, "mensagem vazia")
    async with httpx.AsyncClient(timeout=20, auth=_chat_auth()) as c:
        r = await c.post(
            f"{settings.openpbl_chat_url.rstrip('/')}/api/conversations/{conv_id}/reply",
            json={"content": text})
        if r.status_code != 200:
            raise HTTPException(502, f"chat OpenPBL reply falhou ({r.status_code})")
        return r.json()
