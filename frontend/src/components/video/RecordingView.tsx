/**
 * Template de gravação (egress). O egress abre um Chrome headless nesta página e
 * grava exatamente o que ela mostra.
 *
 * A gravação é a TELA REAL do facilitador: ele compartilha a própria aba (a
 * videoconferência) e publica esse vídeo no LiveKit com o nome REC_TRACK_NAME. Aqui
 * mostramos esse track em tela cheia — então a gravação é, pixel a pixel, o que o
 * facilitador vê. O RoomAudioRenderer mistura o áudio de todos os participantes.
 *
 * Egress passa url/token do LiveKit por query (via EgressHelper); o backend anexa
 * ?roomDbId=... (não usado aqui, mantido por compatibilidade).
 */
import { useEffect, useMemo } from "react";
import { useTracks, RoomAudioRenderer, ParticipantTile } from "@livekit/components-react";
import { Room, Track, RoomEvent } from "livekit-client";
import { LiveKitRoom } from "@livekit/components-react";
import EgressHelper from "@livekit/egress-sdk";
import "@livekit/components-styles";
import "../../styles/room.css";

// Precisa casar com REC_TRACK_NAME em VideoRoom.tsx (o nome do track de captura).
const REC_TRACK_NAME = "rec-screen";

function RecScreen() {
  const tracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const rec = tracks.find((t) => t.publication?.trackName === REC_TRACK_NAME && t.publication);
  if (!rec) {
    // Antes do facilitador confirmar a captura (ou se ele parar de compartilhar).
    return <div className="vr-center" style={{ color: "#64748b" }}>Aguardando a tela do facilitador…</div>;
  }
  return <ParticipantTile trackRef={rec} className="vr-rec-fullscreen" />;
}

export default function RecordingView() {
  const url = EgressHelper.getLiveKitURL();
  const token = EgressHelper.getAccessToken();
  const room = useMemo(() => new Room({ adaptiveStream: false, dynacast: false }), []);

  useEffect(() => {
    const onConn = () => {
      EgressHelper.setRoom(room);
      EgressHelper.startRecording();
    };
    room.on(RoomEvent.Connected, onConn);
    return () => { room.off(RoomEvent.Connected, onConn); };
  }, [room]);

  return (
    <LiveKitRoom room={room} serverUrl={url} token={token} connect audio={false} video={false} className="vr-root">
      <div style={{ position: "absolute", inset: 0, background: "#000" }}>
        <RecScreen />
      </div>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
