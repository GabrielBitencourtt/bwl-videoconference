# Integração / Embed — Video Rooms API

Guia para um cliente (licença) incorporar as funções de webconferência no
próprio sistema: criar salas, listar histórico, agendar, e renderizar a chamada.

Base da API: `https://video.openpbl.ai`

## Modelo de segurança em 2 camadas

```
[Backend do cliente]                         [Video Rooms API]
  ── X-API-Key: bwl_live_... ───────────────►  resolve a LICENÇA,
     (a API key NUNCA vai pro browser)         cria sala / assina token
        │
        └── token curto ──► [Frontend do cliente] ──► entra na chamada
```

- **API key** (server-side): identifica a licença. Fica **só no backend** do cliente.
- **Token curto** (client-side): identifica o usuário final e autoriza entrar numa sala específica. Gerado pelo backend do cliente via nossa API e repassado ao browser.

> ⚠️ Nunca exponha a API key no frontend. Todo acesso autenticado por API key
> deve partir do backend do cliente.

## Autenticação

Envie a API key no header:

```
X-API-Key: bwl_live_xxxxxxxxxxxxxxxxxxxx
```

A licença é resolvida pela key. Todas as operações ficam isoladas à licença
(uma key só enxerga/usa as salas da própria licença).

## Endpoints principais (server-side)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/rooms` | Criar sala |
| GET | `/api/rooms` | Listar salas (histórico) da licença |
| GET | `/api/rooms/{id}` | Detalhe da sala |
| POST | `/api/rooms/{id}/end` | Encerrar sala |
| POST | `/api/rooms/bookings/sync` | Agendar/criar sala idempotente (por `external_ref`) |
| POST | `/api/token` | Emitir token de entrada para um usuário |
| POST | `/api/rooms/{id}/recording/start` · `/stop` | Gravação |
| GET | `/api/rooms/{id}/recording` | Status + URL (presigned) da gravação |

A identidade do usuário final vai nos headers `X-User-Id`, `X-User-Name`,
`X-User-Role` (`admin`/`staff`/`user`) junto da `X-API-Key`.

## Fluxo de embed (exemplo)

### 1) Backend do cliente cria a sala e emite o token

```js
// Node (backend do cliente). A API key fica só aqui.
const API = "https://video.openpbl.ai";
const KEY = process.env.VIDEO_ROOMS_API_KEY; // bwl_live_...

async function startMeeting(user) {
  // cria (ou reusa) a sala
  const room = await fetch(`${API}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify({ title: "Mentoria 1:1", lobby_enabled: true }),
  }).then(r => r.json());

  // emite um token curto para ESTE usuário entrar NESTA sala
  const tok = await fetch(`${API}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": KEY,
      "X-User-Id": user.id,
      "X-User-Name": user.name,
      "X-User-Role": user.isHost ? "admin" : "user",
    },
    body: JSON.stringify({ room_id: room.id }),
  }).then(r => r.json());

  return { roomId: room.id, ...tok }; // { token, livekit_url, identity }
}
```

### 2) Agendamento (idempotente)

```js
await fetch(`${API}/api/rooms/bookings/sync`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": KEY },
  body: JSON.stringify({
    external_ref: booking.id,          // idempotente por este campo
    title: `Sessão: ${booking.title}`,
    scheduled_at: booking.scheduled_at,
    owner_id: booking.mentor_id,
    lobby_enabled: true,
  }),
});
```

### 3) Frontend do cliente renderiza a chamada

Use o SDK/componente (`@video-rooms-kit/frontend`) com o token recebido do
seu backend — a API key não aparece aqui:

```tsx
import { createVideoRoomsSDK, SDKContext } from "@video-rooms-kit/frontend";
import VideoRoom from "@video-rooms-kit/frontend/components/video/VideoRoom";

const sdk = createVideoRoomsSDK({
  apiBase: "https://video.openpbl.ai",
  wsBase: "wss://video.openpbl.ai",
  headers: () => ({ "X-User-Id": user.id, "X-User-Name": user.name }),
});

<SDKContext.Provider value={sdk}>
  <VideoRoom roomId={roomId} isStaff={user.isHost} displayName={user.name} />
</SDKContext.Provider>
```

Para convidados externos (sem login no sistema do cliente), compartilhe o link
`https://video.openpbl.ai/guest/<guest_token>` (o `guest_token` vem na resposta
de criação da sala).

## Limites da licença

Cada licença tem limites (máx. salas, participantes, gravação, storage),
definidos pelo plano e/ou override. Operações que excedam o limite são
recusadas. Consulte os limites efetivos no painel administrativo.

## Erros comuns

| Código | Significado |
|---|---|
| 401 | API key ausente, inválida ou revogada |
| 403 | A sala não pertence à licença desta API key |
| 404 | Sala/convite não encontrado |
