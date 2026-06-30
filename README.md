# Video Rooms Kit

Sistema standalone de salas de vídeo (LiveKit) com whiteboard colaborativo,
lobby, chat persistente, convites de palestrante/convidado, gravação via
Web Egress e criação automática de salas a partir de agendamentos.

- **Backend:** Python 3.11 + FastAPI + PostgreSQL + WebSocket nativo
- **Frontend:** React 18 + Vite + TypeScript + LiveKit Components
- **Realtime:** WebSocket próprio (sem Supabase)
- **Mídia:** LiveKit Cloud ou auto-hospedado
- **Gravação:** LiveKit Web Egress → S3/MinIO
- **Auth:** sem auth embutida — o app host envia `user_id` + `display_name`
  em cada chamada (você pode plugar JWT/OAuth no middleware `auth.py`).

## Estrutura

```
backend/      FastAPI app, schema SQL, Dockerfile
frontend/     SDK React + componentes prontos de sala/whiteboard/lobby
infra/        docker-compose (Postgres + MinIO + LiveKit + backend + frontend)
docs/         Guia de integração em projetos terceiros
```

## Rodando local

```bash
cd infra
cp .env.example .env   # preencha LIVEKIT_API_KEY/SECRET, etc.
docker compose up -d
```

- Backend: http://localhost:8000 (docs em /docs)
- Frontend demo: http://localhost:5173
- LiveKit: ws://localhost:7880
- MinIO console: http://localhost:9001

## Como plugar em outro projeto

Veja [docs/INTEGRATION.md](docs/INTEGRATION.md).

Resumo:
1. Suba o backend FastAPI (ou monte como sub-app do seu FastAPI existente).
2. Aplique `backend/app/schema.sql` no seu Postgres.
3. No frontend, instale o SDK (`frontend/src/lib/video-rooms-sdk.ts`) e
   monte `<VideoRoom roomId=... user={...} apiBase=... />`.
4. Implemente `get_current_user()` em `backend/app/auth.py` integrando com
   sua auth (JWT, sessão, header custom, etc.).
5. (Opcional) Chame `POST /api/bookings/sync` quando um agendamento for
   criado para auto-gerar a sala associada.
