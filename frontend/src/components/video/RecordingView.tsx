/**
 * Template de gravação (egress). O egress abre um Chrome headless nesta página e
 * grava exatamente o que ela mostra — então aqui renderizamos a MESMA interface do
 * facilitador (RoomShell) em modo OBSERVADOR: header, área do roteiro/questões/
 * gráfico, grade de participantes, quadro e a barra de controles. A gravação fica
 * idêntica à tela do facilitador.
 *
 * O gravador é um participante oculto do LiveKit: recebe os mesmos eventos (WS) e
 * dados (etapa, questões reveladas, filtro do gráfico) que o facilitador transmite,
 * e por isso reproduz o estado ao vivo. Em modo `recorder` o RoomShell NÃO transmite
 * nada e não inicia gravação — só espelha (ver os guards `recorder` lá).
 *
 * Egress passa url/token do LiveKit por query (via EgressHelper) e o backend anexa
 * ?roomDbId=...&wb=0|1.
 */
import { useEffect, useMemo, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { Room, RoomEvent } from "livekit-client";
import EgressHelper from "@livekit/egress-sdk";
import "@livekit/components-styles";
import "../../styles/room.css";
import { createVideoRoomsSDK, type VideoRoomsSDK } from "../../lib/video-rooms-sdk";
import { SDKContext } from "../../lib/sdk-context";
import { RoomShell } from "./VideoRoom";

export default function RecordingView() {
  const params = new URLSearchParams(location.search);
  const roomDbId = params.get("roomDbId") || "";

  const url = EgressHelper.getLiveKitURL();
  const token = EgressHelper.getAccessToken();

  const room = useMemo(() => new Room({ adaptiveStream: false, dynacast: false }), []);
  const [identity, setIdentity] = useState<string | undefined>(undefined);
  const sdk = useMemo<VideoRoomsSDK>(
    () =>
      createVideoRoomsSDK({
        apiBase: import.meta.env.VITE_API_BASE || "",
        wsBase: import.meta.env.VITE_WS_BASE || "",
        headers: () => ({}),   // gravador não tem sessão: só lê endpoints públicos (optional_user)
      }),
    [],
  );

  // Sinaliza o egress ao conectar e captura a própria identity (EG_…).
  useEffect(() => {
    const onConn = () => {
      setIdentity(room.localParticipant?.identity);
      EgressHelper.setRoom(room);
      EgressHelper.startRecording();
    };
    room.on(RoomEvent.Connected, onConn);
    return () => { room.off(RoomEvent.Connected, onConn); };
  }, [room]);

  // O gravador não entra em grupo: contexto de breakout inerte.
  const breakout = useMemo(
    () => ({ active: null, message: null, isStaff: true, enter: () => {}, leave: () => {} }),
    [],
  );

  return (
    <SDKContext.Provider value={sdk}>
      <LiveKitRoom room={room} serverUrl={url} token={token} connect audio={false} video={false} className="vr-root">
        {/* isStaff → layout do facilitador; recorder → só espelha, sem transmitir/gravar. */}
        <RoomShell
          roomId={roomDbId}
          roomTitle=""
          isStaff
          recorder
          inviteUrl={null}
          identity={identity}
          breakout={breakout}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </SDKContext.Provider>
  );
}
