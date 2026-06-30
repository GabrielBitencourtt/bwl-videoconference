# Integrando o Video Rooms Kit em um projeto existente

## Visão geral

```
[Seu app host]                       [Video Rooms Kit]
   │                                       │
   │  POST /api/rooms/bookings/sync ──────►│  FastAPI cria sala no DB
   │  (quando agenda é criada)             │
   │                                       │
   │  Renderiza <VideoRoom roomId=... />   │
   │  passando o JWT/headers do usuário ──►│  Devolve token LiveKit
   │                                       │
   │  Listener WebSocket ◄─────────────────│  Chat, lobby, moderação
```

## Backend: 3 caminhos de integração

### A) Subir como serviço separado
```bash
cd infra && docker compose up -d
```
Seu app host chama `http://video-rooms-kit:8000/api/...` enviando os headers
de identificação do usuário (`X-User-Id`, `X-User-Name`, `X-User-Role`).

### B) Montar como sub-app no seu FastAPI existente
```python
from fastapi import FastAPI
from video_rooms_kit.app.main import app as vr_app

app = FastAPI()
app.mount("/video-rooms", vr_app)
```

### C) Copiar `backend/app/routers/*` para seu projeto
Substitua `app/auth.py` pela sua implementação real (JWT, sessão, etc.) —
os routers só dependem de `get_current_user()`.

## Frontend: 3 linhas para uma sala funcionando

```tsx
import { createVideoRoomsSDK, SDKContext } from "@video-rooms-kit/frontend";
import VideoRoom from "@video-rooms-kit/frontend/components/video/VideoRoom";

const sdk = createVideoRoomsSDK({
  apiBase: "https://video.meusite.com",
  wsBase:  "wss://video.meusite.com",
  headers: () => ({
    "X-User-Id":   currentUser.id,
    "X-User-Name": currentUser.name,
    "X-User-Role": currentUser.isAdmin ? "admin" : "user",
  }),
});

<SDKContext.Provider value={sdk}>
  <VideoRoom roomId={room.id} isStaff={currentUser.isAdmin} />
</SDKContext.Provider>
```

## Criação automática de sala a partir de agendamento

Quando seu sistema cria um agendamento, dispare:

```ts
await sdk.rooms.syncBooking({
  external_ref: booking.id,                 // idempotente nesse campo
  title:        `Sessão: ${booking.title}`,
  scheduled_at: booking.scheduled_at,
  owner_id:     booking.mentor_id,
  lobby_enabled: true,
});
```

A função retorna a sala (cria se não existir, devolve a existente se já houver).

## Convite de convidado / palestrante

- **Convidado:** ao criar a sala, o backend devolve `guest_token`. Compartilhe
  o link `https://seuapp.com/guest/<guest_token>?room=<room_db_id>`.
  No frontend, monte `<VideoRoom roomId=... guestToken=... displayName="..." />`.
- **Palestrante:** chame `sdk.invites.createSpeaker(roomId, { allow_camera: true, ... })`,
  compartilhe `https://seuapp.com/speaker/<invite_id>?room=<room_db_id>`.
  Frontend usa `<VideoRoom roomId=... speakerInviteId=... displayName="..." />`.

## Gravação

`POST /api/rooms/{id}/recording/start` aciona o LiveKit Web Egress
gravando a página `/recording-view` (já incluída no frontend) e fazendo
upload para o S3 configurado. O webhook em `POST /api/webhooks/livekit`
recebe os eventos `egress_updated` e `egress_ended` e atualiza
`recording_url` no banco.

Configure o LiveKit para chamar o webhook:
```yaml
# livekit-server config.yaml
webhook:
  api_key: devkey
  urls:
    - https://seu-backend/api/webhooks/livekit
```

## O que NÃO está incluído (e por quê)

- **Auth do host** — você pluga em `backend/app/auth.py`.
- **Whiteboard rico** — incluímos canvas básico. Se precisa de mind-map
  com conectores/checkpoints (como no projeto Scale10x), troque por
  [tldraw](https://tldraw.com) ou Excalidraw mantendo o mesmo contrato
  WebSocket (`whiteboard-snapshot`, `wb-stroke`, `wb-clear`).
- **UI shadcn completa** — o kit usa componentes nativos para ser neutro.
  Estilize com Tailwind/CSS no seu projeto host.

## Endpoints (resumo)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/rooms` | Criar sala |
| GET | `/api/rooms` | Listar (histórico) |
| GET | `/api/rooms/{id}` | Detalhe |
| POST | `/api/rooms/{id}/end` | Encerrar |
| POST | `/api/rooms/bookings/sync` | Auto-criar via agendamento (idempotente) |
| POST | `/api/token` | Token LiveKit (user/guest/speaker) |
| GET/POST | `/api/rooms/{id}/chat` | Histórico/envio de chat |
| GET | `/api/rooms/{id}/lobby` | Listar saguão |
| POST | `/api/rooms/{id}/lobby/join` | Entrar no saguão |
| POST | `/api/rooms/{id}/lobby/{lid}/decision` | Admitir/negar |
| POST | `/api/rooms/{id}/invites/speaker` | Criar convite palestrante |
| GET/PUT | `/api/rooms/{id}/whiteboard` | Carregar/salvar quadro |
| POST | `/api/rooms/{id}/whiteboard/toggle` | Ativar/desativar |
| POST | `/api/rooms/{id}/recording/start` | Iniciar gravação |
| POST | `/api/rooms/{id}/recording/stop` | Parar gravação |
| POST | `/api/rooms/{id}/moderation/{action}` | force-mute / -unmute / -camera-off / -kick |
| POST | `/api/rooms/{id}/participants/{uid}/permissions` | Editar permissões |
| POST | `/api/webhooks/livekit` | Webhook do LiveKit |
| WS   | `/ws/rooms/{id}` | Eventos realtime |
