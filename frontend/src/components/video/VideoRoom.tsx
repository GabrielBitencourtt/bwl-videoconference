import { useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
import {
  LiveKitRoom, RoomAudioRenderer, GridLayout, ParticipantTile,
  useTracks, useParticipants, useTrackToggle, useRoomContext,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import "@livekit/components-styles";
import "../../styles/room.css";
import { useSDK } from "../../lib/sdk-context";
import { applyBranding, type Branding } from "../../lib/branding";
import type { BreakoutState, BreakoutGroup } from "../../lib/video-rooms-sdk";
import RoomChat from "./RoomChat";
import LobbyPanel from "./LobbyPanel";
import RemoteControlEnforcer from "./RemoteControlEnforcer";

// tldraw is heavy — only load it when the whiteboard is actually opened.
const Whiteboard = lazy(() => import("./Whiteboard"));
const BreakoutPanel = lazy(() => import("./BreakoutPanel"));

/** Estado da troca de mídia quando o participante/host está dentro de um grupo. */
interface BreakoutMedia { token: string; url: string; groupId: string; groupName: string; endsAt: string | null; }
/** Tudo que o RoomShell precisa para a UI de grupos. */
interface BreakoutCtx {
  active: { groupId: string; groupName: string; endsAt: string | null } | null;
  message: string | null;
  identity?: string;
  displayName?: string;
  isStaff: boolean;
  enter: (g: { id: string; name: string }, endsAt: string | null) => void;
  leave: () => void;
}

interface Props {
  roomId: string;
  guestToken?: string;
  speakerInviteId?: string;
  displayName?: string;
  isStaff?: boolean;
  onLeft?: () => void;
  /** Pre-minted LiveKit token (iframe embed) — skips token minting when set. */
  presetToken?: string;
  presetLivekitUrl?: string;
  presetIdentity?: string;
  /** Learner e-mail (SCORM/OpenPBL) — stored on join for progress matching. */
  learnerEmail?: string;
}

/* ---------------- icons (inline, no deps) ---------------- */
const I = {
  mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg>,
  micOff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l22 22"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M19 10v2a7 7 0 0 1-.11 1.23M12 19v4M5 10v2a7 7 0 0 0 12 5"/></svg>,
  cam: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  camOff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22"/><path d="M16 16H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1m4 0h4a2 2 0 0 1 2 2v4l1 1 5-3.5v9"/></svg>,
  screen: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  people: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  board: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 11l3-3 2 2 4-4"/></svg>,
  record: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>,
  stop: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>,
  phone: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 15.46l-5.27-.61-2.52 2.52a15.05 15.05 0 0 1-6.59-6.59l2.53-2.53L8.54 3H3.03C2.45 13.18 10.82 21.55 21 20.97v-5.51z"/></svg>,
  groups: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>,
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  expand: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
  playTri: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  gear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

export default function VideoRoom({ roomId, guestToken, speakerInviteId, displayName, isStaff, onLeft, presetToken, presetLivekitUrl, presetIdentity, learnerEmail }: Props) {
  const sdk = useSDK();
  const [token, setToken] = useState<string | null>(presetToken ?? null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(presetLivekitUrl ?? null);
  const [identity, setIdentity] = useState<string | null>(presetIdentity ?? null);
  const [ended, setEnded] = useState(false);
  const [left, setLeft] = useState(false);
  const [roomTitle, setRoomTitle] = useState<string>("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // pre-join choices
  const [joined, setJoined] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  useEffect(() => {
    if (presetToken) {  // iframe embed: token already minted by the client backend
      setToken(presetToken); setLivekitUrl(presetLivekitUrl ?? null); setIdentity(presetIdentity ?? null);
      return;
    }
    sdk.token
      .issue({ room_id: roomId, guest_token: guestToken, speaker_invite_id: speakerInviteId, display_name: displayName, email: learnerEmail })
      .then((r) => { setToken(r.token); setLivekitUrl(r.livekit_url); setIdentity(r.identity); })
      .catch((e) => console.error(e));
  }, [roomId, guestToken, speakerInviteId, displayName, presetToken, learnerEmail]);

  useEffect(() => {
    return sdk.subscribe(roomId, (event) => {
      if (event === "room-ended") setEnded(true);
      if (event === "force-kick") onLeft?.();
    });
  }, [roomId]);

  /* ---------------- Grupos (breakout) ---------------- */
  const [breakout, setBreakout] = useState<BreakoutMedia | null>(null);
  const [boMessage, setBoMessage] = useState<string | null>(null);
  const [boChoices, setBoChoices] = useState<BreakoutGroup[] | null>(null);
  // A troca de sala remonta o LiveKitRoom (dispara onDisconnected); esse ref evita
  // que o swap seja confundido com o usuário saindo de verdade.
  const swapRef = useRef(false);

  const enterBreakout = useCallback(async (group: { id: string; name: string }, endsAt: string | null) => {
    if (!identity) return;
    try {
      const t = await sdk.breakouts.token(roomId, group.id, identity, displayName);
      swapRef.current = true;
      setBreakout({ token: t.token, url: t.livekit_url, groupId: group.id, groupName: t.group_name, endsAt });
      setBoChoices(null);
    } catch (e) { console.error("breakout token", e); }
  }, [identity, roomId, displayName]);

  const leaveBreakout = useCallback(() => { swapRef.current = true; setBreakout(null); setBoChoices(null); }, []);

  const handleDisconnected = useCallback(() => {
    if (swapRef.current) { swapRef.current = false; return; } // foi troca de grupo, não saída
    setLeft(true);    // mostra a tela de saída (essencial no embed, onde não há onLeft)
    onLeft?.();
  }, [onLeft]);

  // Eventos de controle dos grupos (chegam pela sala-pai, mesmo dentro do grupo).
  useEffect(() => {
    if (!identity) return;
    return sdk.subscribe(roomId, (event, payload) => {
      if (event === "breakout-open") {
        const st = payload as BreakoutState;
        if (isStaff) return; // host fica na principal; visita pelo painel
        const mine = st.groups.find((g) => g.members.some((m) => m.identity === identity));
        if (mine) enterBreakout(mine, st.ends_at);
        else if (st.mode === "self") setBoChoices(st.groups);
      } else if (event === "breakout-close") {
        leaveBreakout();
      } else if (event === "breakout-message") {
        setBoMessage(payload?.text ? `${payload.from || "Anfitrião"}: ${payload.text}` : null);
      }
    });
  }, [roomId, identity, isStaff, enterBreakout, leaveBreakout]);

  // Entrou numa sala com grupos JÁ abertos → vai direto para o seu grupo.
  useEffect(() => {
    if (!identity || isStaff) return;
    sdk.breakouts.state(roomId).then((st) => {
      if (!st.open) return;
      const mine = st.groups.find((g) => g.members.some((m) => m.identity === identity));
      if (mine) enterBreakout(mine, st.ends_at);
      else if (st.mode === "self") setBoChoices(st.groups);
    }).catch(() => {});
  }, [identity, isStaff, roomId]);

  // Auto-some o aviso após alguns segundos.
  useEffect(() => {
    if (!boMessage) return;
    const t = setTimeout(() => setBoMessage(null), 8000);
    return () => clearTimeout(t);
  }, [boMessage]);

  useEffect(() => {
    sdk.rooms.get(roomId).then((r) => {
      setRoomTitle(r.title || "Sala");
      if (isStaff && r.guest_token) setInviteUrl(`${location.origin}/guest/${r.guest_token}`);
    }).catch(() => {});
  }, [roomId, isStaff]);

  if (ended) return (
    <div className="vr-root">
      <div className="vr-center">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div>Esta sala foi encerrada.</div>
          <button className="vr-join-btn" style={{ minWidth: 200 }} onClick={() => onLeft?.()}>Voltar ao início</button>
        </div>
      </div>
    </div>
  );
  if (left) return (
    <div className="vr-root">
      <div className="vr-center">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div>Você saiu da sala.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="vr-join-btn" style={{ minWidth: 180 }} onClick={() => { setBreakout(null); setLeft(false); }}>Entrar novamente</button>
            {onLeft && <button className="vr-join-btn" style={{ minWidth: 140, background: "transparent", border: "1px solid var(--vr-border)" }} onClick={() => onLeft()}>Voltar ao início</button>}
          </div>
        </div>
      </div>
    </div>
  );
  if (!token || !livekitUrl) return <div className="vr-root"><div className="vr-center">Conectando…</div></div>;

  if (!joined) {
    return (
      <PreJoin
        title={roomTitle}
        name={displayName || "Você"}
        camOn={camOn} micOn={micOn}
        setCamOn={setCamOn} setMicOn={setMicOn}
        onJoin={() => setJoined(true)}
      />
    );
  }

  const boCtx: BreakoutCtx = {
    active: breakout ? { groupId: breakout.groupId, groupName: breakout.groupName, endsAt: breakout.endsAt } : null,
    message: boMessage,
    identity: identity ?? undefined,
    displayName,
    isStaff: !!isStaff,
    enter: enterBreakout,
    leave: leaveBreakout,
  };

  return (
    <>
      <LiveKitRoom
        key={breakout?.groupId ?? "main"}
        serverUrl={breakout?.url ?? livekitUrl}
        token={breakout?.token ?? token}
        connect
        video={camOn}
        audio={micOn}
        data-lk-theme="default"
        className="vr-root"
        onDisconnected={handleDisconnected}
      >
        <RoomShell roomId={roomId} roomTitle={roomTitle} isStaff={!!isStaff} inviteUrl={inviteUrl} senderName={displayName} identity={identity ?? undefined} breakout={boCtx} />
        {identity && <RemoteControlEnforcer roomId={roomId} identity={identity} isStaff={!!isStaff} />}
        <RoomAudioRenderer />
        <AudioGate />
      </LiveKitRoom>
      {boChoices && <BreakoutChooser groups={boChoices} onPick={(g) => enterBreakout(g, null)} />}
    </>
  );
}

/* ---------------- Breakout: seletor (modo "os participantes escolhem") ------- */
function BreakoutChooser({ groups, onPick }: { groups: BreakoutGroup[]; onPick: (g: { id: string; name: string }) => void }) {
  return (
    <div className="vr-bo-chooser">
      <div className="vr-bo-chooser-card">
        <h3>Escolha um grupo</h3>
        <p className="vr-sub">O anfitrião abriu os grupos. Selecione em qual você quer entrar.</p>
        <div className="vr-bo-chooser-list">
          {groups.map((g) => (
            <button key={g.id} className="vr-bo-chooser-item" onClick={() => onPick({ id: g.id, name: g.name })}>
              <strong>{g.name}</strong>
              <span>{g.members.length} {g.members.length === 1 ? "pessoa" : "pessoas"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Breakout: banner (dentro de um grupo / aviso do host) ------ */
function BreakoutBanner({ groupName, endsAt, message, onLeave }: { groupName: string | null; endsAt: string | null; message: string | null; onLeave: () => void }) {
  const [remain, setRemain] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) { setRemain(null); return; }
    const end = new Date(endsAt).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setRemain(s);
      if (s <= 0) onLeave();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const mmss = remain != null ? `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")}` : null;

  // Só aviso (host broadcast), sem estar em grupo.
  if (!groupName) return <div className="vr-bo-banner vr-bo-banner-msg">{message}</div>;

  return (
    <div className="vr-bo-banner">
      <span>Você está no <b>{groupName}</b>{mmss ? ` • volta em ${mmss}` : ""}</span>
      <div className="vr-bo-banner-right">
        {message && <span className="vr-bo-banner-note">{message}</span>}
        <button className="vr-bo-banner-btn" onClick={onLeave}>Voltar à sala principal</button>
      </div>
    </div>
  );
}

/* ---------------- Áudio: gate para Safari/mobile (autoplay bloqueado) -------- */
function AudioGate() {
  const room = useRoomContext();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const update = () => setBlocked(!room.canPlaybackAudio);
    update();
    room.on(RoomEvent.AudioPlaybackStatusChanged, update);
    return () => { room.off(RoomEvent.AudioPlaybackStatusChanged, update); };
  }, [room]);
  if (!blocked) return null;
  return (
    <button className="vr-audio-gate" onClick={() => room.startAudio().catch(() => {})}>
      🔊 Toque para ativar o áudio
    </button>
  );
}

/* ---------------- Breakout: barra do host (flutuar entre os grupos) ---------- */
function BreakoutHostBar({ roomId, active, message, onEnter, onLeave }: {
  roomId: string;
  active: { groupId: string; groupName: string; endsAt: string | null } | null;
  message: string | null;
  onEnter: (g: { id: string; name: string }, endsAt: string | null) => void;
  onLeave: () => void;
}) {
  const sdk = useSDK();
  const [groups, setGroups] = useState<BreakoutGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [remain, setRemain] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => sdk.breakouts.state(roomId).then((s) => {
      setGroups(s.groups); setOpen(s.open); setEndsAt(s.ends_at);
    }).catch(() => {});
    refresh();
    return sdk.subscribe(roomId, (e) => { if (typeof e === "string" && e.startsWith("breakout")) refresh(); });
  }, [roomId]);

  useEffect(() => {
    if (!endsAt) { setRemain(null); return; }
    const end = new Date(endsAt).getTime();
    const tick = () => setRemain(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!open) return message ? <div className="vr-bo-banner vr-bo-banner-msg">{message}</div> : null;
  const mmss = remain != null ? `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")}` : null;

  return (
    <div className="vr-bo-hostbar">
      <span className="vr-bo-hostbar-label">Visitar:</span>
      <button className="vr-bo-chip" data-active={!active} onClick={onLeave}>Sala principal</button>
      {groups.map((g) => (
        <button key={g.id} className="vr-bo-chip" data-active={active?.groupId === g.id}
          onClick={() => onEnter({ id: g.id, name: g.name }, endsAt)}>
          {g.name}<span className="vr-bo-chip-n">{g.members.length}</span>
        </button>
      ))}
      {mmss && <span className="vr-bo-hostbar-timer">⏱ {mmss}</span>}
      {message && <span className="vr-bo-hostbar-msg">{message}</span>}
    </div>
  );
}

/* ---------------- Pre-join ---------------- */
function PreJoin({ title, name, camOn, micOn, setCamOn, setMicOn, onJoin }: {
  title: string; name: string; camOn: boolean; micOn: boolean;
  setCamOn: (v: boolean) => void; setMicOn: (v: boolean) => void; onJoin: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = camOn));
  }, [camOn]);
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn]);

  return (
    <div className="vr-root">
      <div className="vr-prejoin">
        <div className="vr-prejoin-card">
          <div>
            <h2>{title || "Entrar na sala"}</h2>
            <p className="vr-sub">Você entrará como <b>{name}</b>. Ajuste sua câmera e microfone.</p>
          </div>
          <div className="vr-preview">
            {camOn
              ? <video ref={videoRef} autoPlay muted playsInline />
              : <span className="vr-preview-off">Câmera desligada</span>}
          </div>
          <div className="vr-prejoin-controls">
            <button className="vr-ctrl" data-off={!micOn} onClick={() => setMicOn(!micOn)} title="Microfone">
              {micOn ? I.mic : I.micOff}
            </button>
            <button className="vr-ctrl" data-off={!camOn} onClick={() => setCamOn(!camOn)} title="Câmera">
              {camOn ? I.cam : I.camOff}
            </button>
          </div>
          <button className="vr-join-btn" onClick={onJoin}>Entrar agora</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- In-room shell ---------------- */
function RoomShell({ roomId, roomTitle, isStaff, inviteUrl, senderName, identity, breakout }: { roomId: string; roomTitle: string; isStaff: boolean; inviteUrl: string | null; senderName?: string; identity?: string; breakout: BreakoutCtx }) {
  const sdk = useSDK();
  // No celular o painel começa fechado pra mostrar o vídeo; no desktop abre no chat.
  const [panel, setPanel] = useState<"chat" | "people" | "breakout" | "scorm" | null>(
    () => (typeof window !== "undefined" && window.innerWidth <= 768 ? null : "chat"),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);   // Configurações = modal central
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [scorm, setScorm] = useState(false);
  const [pblRoster, setPblRoster] = useState<any | null>(null);   // status dos alunos (OpenPBL)
  const [pblStep, setPblStep] = useState<string>("");             // etapa atual (reportada pelo pacote)
  const [showBoard, setShowBoard] = useState(false);
  const [recording, setRecording] = useState(false);
  const [boardEdit, setBoardEdit] = useState(false);   // não-staff: pode editar o quadro?
  const participants = useParticipants();
  const elapsed = useElapsed();
  const [brand, setBrand] = useState<Branding | null>(null);
  const [pubTitle, setPubTitle] = useState("");
  const canEditBoard = isStaff || boardEdit;

  // Branding (logo/cor/nome) via endpoint público — funciona até no embed
  // cross-site, onde rooms.get (autenticado) não está disponível.
  useEffect(() => {
    sdk.rooms.publicInfo(roomId).then((r) => {
      setBrand((r.branding as Branding) || null);
      setPubTitle(r.title || "");
      setScorm(!!(r as any).scorm);
      setBoardEdit(!!(r as any).allow_whiteboard_edit);   // padrão da sala
      applyBranding(r.branding as Branding);
    }).catch(() => {});
  }, [roomId]);

  useEffect(() => {
    sdk.rooms.get(roomId).then((r) => {
      setShowBoard(!!r.whiteboard_active);
      setRecording(!!r.recording_enabled);
      // "Gravação" toggle at room creation → auto-start once when the host joins.
      if (isStaff && (r as any).auto_record && !r.recording_enabled) {
        setRecording(true);
        sdk.recording.start(roomId).catch(() => setRecording(false));
      }
    }).catch(() => {});
    return sdk.subscribe(roomId, (event, payload) => {
      if (event === "whiteboard-toggle") setShowBoard(!!payload.active);
      if (event === "recording-started") setRecording(true);
      if (event === "recording-stopped") setRecording(false);
      // Permissão de editar o quadro (global ou específica deste usuário) muda ao vivo.
      if (event === "room-permissions" && typeof payload.allow_whiteboard_edit === "boolean")
        setBoardEdit(payload.allow_whiteboard_edit);
      if (event === "permissions-updated" && payload.user_id === identity && typeof payload.allow_whiteboard_edit === "boolean")
        setBoardEdit(payload.allow_whiteboard_edit);
    });
  }, [roomId, identity]);

  // A apresentação embutida (pacote) reporta a etapa atual via postMessage.
  useEffect(() => {
    if (!scorm) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (d && d.source === "openpbl-package" && d.type === "step" && typeof d.label === "string")
        setPblStep(d.label);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [scorm]);

  // OpenPBL: roster (bordas de status dos alunos + código) — só em salas scorm.
  useEffect(() => {
    if (!scorm) return;
    const load = () => sdk.openpbl.roster(roomId).then(setPblRoster).catch(() => {});
    load();
    const iv = setInterval(load, 10000);
    const off = sdk.subscribe(roomId, (event) => { if (event === "openpbl-class") load(); });
    return () => { clearInterval(iv); off(); };
  }, [scorm, roomId]);

  // Auto-gera o class-code ao ENTRAR (host + sala vinculada a uma atividade OpenPBL),
  // como o pacote PRESENTATION fazia ao abrir — não depende de abrir a aba OpenPBL.
  const autoClassRef = useRef(false);
  useEffect(() => {
    if (!scorm || !isStaff || autoClassRef.current) return;
    autoClassRef.current = true;
    (async () => {
      try {
        const st = await sdk.openpbl.classState(roomId);
        if (st.active) return;
        const r: any = await sdk.rooms.get(roomId);
        if (r.openpbl_activity_id) await sdk.openpbl.startClass(roomId, r.openpbl_activity_id);
      } catch { /* silencioso */ }
    })();
  }, [scorm, isStaff, roomId]);

  const toggleRecording = () => {
    if (recording) {
      setRecording(false);
      sdk.recording.stop(roomId).catch(() => setRecording(true));
    } else {
      setRecording(true);
      sdk.recording.start(roomId).catch(() => setRecording(false));
    }
  };

  const toggleBoard = () => {
    const next = !showBoard;
    setShowBoard(next);
    if (isStaff) sdk.whiteboard.toggle(roomId, next).catch(() => {});
  };

  // confirm() nativo é bloqueado em iframe cross-origin (embed) → modal in-app.
  const doEndRoom = () => { sdk.rooms.end(roomId).catch(() => {}); setConfirmEnd(false); };

  return (
    <>
      <header className="vr-header">
        <div className="vr-brand">
          {brand?.logo_url
            ? <img className="vr-logo vr-logo-img" src={brand.logo_url} alt="" />
            : <div className="vr-logo">V</div>}
          <div className="vr-title">{roomTitle || pubTitle || brand?.product_name || "Sala de vídeo"}</div>
        </div>
        <div className="vr-meta">
          <span>{elapsed}</span>
          <span className="vr-dot" />
          <span><span className="vr-count-label">participantes: </span>{participants.length}</span>
          {recording && <span className="vr-rec">REC</span>}
          {isStaff && (
            <button className="vr-end-btn" onClick={() => setConfirmEnd(true)} title="Encerrar a sala para todos">Encerrar sala</button>
          )}
        </div>
      </header>

      {scorm && isStaff && pblRoster?.activity_id && (
        <ActivityBar label={pblStep} onNext={() => presentationPost("next")} />
      )}

      {breakout.isStaff
        ? <BreakoutHostBar roomId={roomId} active={breakout.active} message={breakout.message} onEnter={breakout.enter} onLeave={breakout.leave} />
        : (breakout.active || breakout.message) && (
          <BreakoutBanner
            groupName={breakout.active?.groupName ?? null}
            endsAt={breakout.active?.endsAt ?? null}
            message={breakout.message}
            onLeave={breakout.leave}
          />
        )}

      <div className="vr-stage" data-pbl={scorm ? "1" : undefined}>
        <div className="vr-grid-wrap">
          {scorm
            ? <OpenPblStudentsGrid roster={pblRoster} localIsStaff={isStaff} localIdentity={identity} />
            : <VideoGrid />}
          {showBoard && (
            <div className="vr-wb-overlay">
              <Suspense fallback={<div className="vr-center">Carregando quadro…</div>}>
                <Whiteboard roomId={roomId} canEdit={canEditBoard} isHost={isStaff} />
              </Suspense>
            </div>
          )}
        </div>
        {panel && (panel === "breakout" || panel === "scorm") && isStaff ? (
          // Seção dedicada: SUBSTITUI o painel (sem abas de chat/participantes).
          <aside className="vr-panel">
            <div className="vr-panel-head">
              <span className="vr-panel-title">{panel === "breakout" ? "Grupos" : "OpenPBL"}</span>
              <button className="vr-panel-x" onClick={() => setPanel("chat")} title="Voltar ao chat" aria-label="Voltar">✕</button>
            </div>
            <div className="vr-panel-body">
              {panel === "breakout" && (
                <Suspense fallback={<div className="vr-center" style={{ padding: 32 }}>Carregando…</div>}>
                  <BreakoutPanel
                    roomId={roomId} identity={identity} displayName={senderName}
                    activeGroupId={breakout.active?.groupId ?? null}
                    onVisit={breakout.enter} onLeaveVisit={breakout.leave}
                  />
                </Suspense>
              )}
              {panel === "scorm" && scorm && <ScormPanel roomId={roomId} />}
            </div>
          </aside>
        ) : (panel === "chat" || panel === "people") && (
          <aside className="vr-panel">
            {scorm && <PblPanelHeader roster={pblRoster} localIsStaff={isStaff} localIdentity={identity} roomId={roomId} />}
            {scorm && pblRoster?.activity_id && <PresentationFrame activityId={pblRoster.activity_id} />}
            <div className="vr-tabs">
              <button className="vr-tab" data-active={panel === "chat"} onClick={() => setPanel("chat")}>Chat</button>
              <button className="vr-tab" data-active={panel === "people"} onClick={() => setPanel("people")}>
                Participantes ({participants.length})
              </button>
            </div>
            <div className="vr-panel-body">
              {panel === "chat" && <RoomChat roomId={roomId} senderName={senderName} channel={breakout.active?.groupId} channelLabel={breakout.active?.groupName} />}
              {panel === "people" && <PeoplePanel roomId={roomId} isStaff={isStaff} inviteUrl={inviteUrl} />}
            </div>
          </aside>
        )}
      </div>

      <ControlBar
        isStaff={isStaff}
        scorm={scorm}
        panel={panel}
        setPanel={setPanel}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsActive={settingsOpen}
        peopleCount={participants.length}
        boardActive={showBoard}
        onToggleBoard={toggleBoard}
        recording={recording}
        onToggleRecording={toggleRecording}
      />

      {settingsOpen && isStaff && (
        <div className="vr-sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="vr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="vr-sheet-head">
              <h3>Configurações</h3>
              <button className="vr-sheet-close" onClick={() => setSettingsOpen(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="vr-sheet-body">
              <RoomSettings roomId={roomId} />
            </div>
          </div>
        </div>
      )}

      {confirmEnd && (
        <div className="vr-modal-backdrop" onClick={() => setConfirmEnd(false)}>
          <div className="vr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Encerrar a sala?</h3>
            <p>Isso desconecta todos os participantes e finaliza a sessão para todos.</p>
            <div className="vr-modal-actions">
              <button className="vr-modal-btn" onClick={() => setConfirmEnd(false)}>Cancelar</button>
              <button className="vr-modal-btn vr-modal-btn-danger" onClick={doEndRoom}>Encerrar sala</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VideoGrid() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  // Spotlight: se alguém compartilha tela, ela ocupa tudo, os demais somem e a
  // câmera de quem compartilha (o facilitador) vira um box pequeno sobreposto.
  const screen = tracks.find((t) => t.source === Track.Source.ScreenShare && t.publication);
  if (screen) {
    const sharerCam = tracks.find(
      (t) => t.source === Track.Source.Camera && t.participant.identity === screen.participant.identity,
    );
    return (
      <div className="vr-spotlight">
        <ParticipantTile trackRef={screen} className="vr-spotlight-main" />
        {sharerCam && (
          <div className="vr-spotlight-pip">
            <ParticipantTile trackRef={sharerCam} />
          </div>
        )}
      </div>
    );
  }

  const cams = tracks.filter((t) => t.source === Track.Source.Camera);
  return (
    <GridLayout tracks={cams} style={{ height: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

/* Base do launcher OpenPBL (play2). A apresentação é embutida por Invite. */
const OPENPBL_PLAY_BASE = "https://play2.openpbl.ai";

/** Envia comando à apresentação embutida (ponte postMessage — o pacote escuta). */
function presentationPost(type: "next" | "prev") {
  const f = document.getElementById("openpbl-presentation") as HTMLIFrameElement | null;
  f?.contentWindow?.postMessage({ source: "bwl-webconf", type }, "*");
}

/** Apresentação OpenPBL embutida (coluna esquerda). */
function PresentationFrame({ activityId }: { activityId: string }) {
  const src = `${OPENPBL_PLAY_BASE}/Invite/${encodeURIComponent(activityId)}?profile=facilitador`;
  return (
    <div className="vr-pbl-present">
      <iframe id="openpbl-presentation" title="Apresentação OpenPBL" src={src}
        allow="autoplay; fullscreen; microphone; camera" />
    </div>
  );
}

/** Barra "Próxima atividade ▶" (topo) — só o facilitador avança a apresentação. */
function ActivityBar({ label, onNext }: { label: string; onNext: () => void }) {
  return (
    <div className="vr-actbar">
      <div className="vr-actbar-info">
        <span className="vr-actbar-cap">Próxima atividade</span>
        <span className="vr-actbar-name">{label || "Apresentação"}</span>
      </div>
      <button className="vr-actbar-next" onClick={onNext} title="Avançar a apresentação">
        {I.playTri}
      </button>
    </div>
  );
}

/** Grade dos ALUNOS (área principal, à direita) com borda de status:
 *  🟢 dentro do pacote · 🔴 fora · badge ✓ = registrou presença com o class-code.
 *  O facilitador e o código ficam no header do painel (PblPanelHeader). */
function OpenPblStudentsGrid({ roster, localIsStaff, localIdentity }: { roster: any | null; localIsStaff: boolean; localIdentity?: string }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  // Compartilhamento de tela em spotlight, sobrepondo o layout.
  const screen = tracks.find((t) => t.source === Track.Source.ScreenShare && t.publication);
  if (screen) {
    const sharerCam = tracks.find(
      (t) => t.source === Track.Source.Camera && t.participant.identity === screen.participant.identity,
    );
    return (
      <div className="vr-spotlight">
        <ParticipantTile trackRef={screen} className="vr-spotlight-main" />
        {sharerCam && <div className="vr-spotlight-pip"><ParticipantTile trackRef={sharerCam} /></div>}
      </div>
    );
  }

  const byId: Record<string, any> = {};
  (roster?.students || []).forEach((s: any) => { byId[s.identity] = s; });
  const isHostTile = (identity: string) =>
    byId[identity]?.is_staff ?? (identity === localIdentity && localIsStaff);

  const studentTiles = tracks.filter((t) => t.source === Track.Source.Camera && !isHostTile(t.participant.identity));

  return (
    <div className="vr-pbl-students">
      {studentTiles.length === 0 && <div className="vr-pbl-empty">Aguardando alunos…</div>}
      {studentTiles.map((t) => {
        const st = byId[t.participant.identity];
        return (
          <div key={`${t.participant.identity}-st`} className="vr-pbl-tile" data-pkg={st?.in_package ? "in" : "out"}>
            <ParticipantTile trackRef={t} />
            {st?.registered && <span className="vr-pbl-reg" title="Registrado na sessão (class-code inserido)">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Header do painel (OpenPBL): câmera do facilitador destacada + card do class-code.
 *  O facilitador pode ocultar/reexibir o código (sincronizado p/ todos). */
function PblPanelHeader({ roster, localIsStaff, localIdentity, roomId }: { roster: any | null; localIsStaff: boolean; localIdentity?: string; roomId: string }) {
  const sdk = useSDK();
  const [expand, setExpand] = useState(false);
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });

  const byId: Record<string, any> = {};
  (roster?.students || []).forEach((s: any) => { byId[s.identity] = s; });
  const isHostTile = (identity: string) =>
    byId[identity]?.is_staff ?? (identity === localIdentity && localIsStaff);
  const hostTrack = tracks.find((t) => isHostTile(t.participant.identity));
  const code: string | null = roster?.code ?? null;
  const hidden = !!roster?.code_hidden;
  const isHost = localIsStaff;

  const toggle = () => sdk.openpbl.setCodeVisible(roomId, !hidden).catch(() => {});
  const showCard = !!code && !hidden;

  if (!hostTrack && !code) return null;
  return (
    <div className="vr-pbl-head" data-wide={showCard ? undefined : "1"}>
      {hostTrack && <div className="vr-pbl-head-cam"><ParticipantTile trackRef={hostTrack} /></div>}

      {showCard && (
        <div className="vr-pbl-code-card">
          <div className="vr-pbl-code-top">
            <span className="vr-pbl-code-label">Class code</span>
            <div className="vr-pbl-code-tools">
              {isHost && <button className="vr-pbl-code-ico" onClick={toggle} title="Ocultar o código para todos">{I.eyeOff}</button>}
              <button className="vr-pbl-code-ico" onClick={() => setExpand(true)} title="Ampliar">{I.expand}</button>
            </div>
          </div>
          <span className="vr-pbl-code">{code}</span>
          {roster?.checking_open === false && <span className="vr-pbl-code-closed">registro encerrado</span>}
        </div>
      )}

      {/* Oculto: só o facilitador vê o botão de reexibir para todos */}
      {code && hidden && isHost && (
        <button className="vr-pbl-code-show" onClick={toggle} title="Reexibir o código para todos">
          {I.eye}<span>Mostrar class code</span>
        </button>
      )}

      {expand && code && (
        <div className="vr-sheet-backdrop" onClick={() => setExpand(false)}>
          <div className="vr-pbl-code-big" onClick={(e) => e.stopPropagation()}>
            <button className="vr-sheet-close vr-pbl-big-x" onClick={() => setExpand(false)} aria-label="Fechar">✕</button>
            <span className="vr-pbl-code-label">Class code</span>
            <span className="vr-pbl-code-huge">{code}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PeoplePanel({ roomId, isStaff, inviteUrl }: { roomId: string; isStaff: boolean; inviteUrl: string | null }) {
  const sdk = useSDK();
  const participants = useParticipants();
  const [copied, setCopied] = useState(false);
  // Estado local do que o host bloqueou por participante (true = bloqueado).
  const [blocked, setBlocked] = useState<Record<string, { screen?: boolean }>>({});

  const mod = (id: string, action: string) => sdk.rooms.moderate(roomId, action, { user_id: id }).catch(() => {});
  const setPerm = (id: string, key: "screen_share", allow: boolean) => {
    sdk.rooms.setPermissions(roomId, id, { [`allow_${key}`]: allow }).catch(() => {});
    setBlocked((b) => ({ ...b, [id]: { ...b[id], screen: !allow } }));
  };
  // confirm() nativo não funciona no embed (iframe cross-origin) → ação direta.
  const kick = (id: string, _nm: string) => mod(id, "force-kick");

  return (
    <>
      {isStaff && inviteUrl && (
        <div className="vr-invite">
          <label>Link de convite</label>
          <div className="vr-invite-row">
            <input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
            <button className="vr-send" onClick={() => { navigator.clipboard?.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? "✓" : "Copiar"}
            </button>
          </div>
        </div>
      )}
      {isStaff && <LobbyPanel roomId={roomId} />}
      <div className="vr-people">
        {participants.map((p) => {
          const nm = p.name || p.identity;
          const screenBlocked = !!blocked[p.identity]?.screen;
          return (
            <div className="vr-person" key={p.sid}>
              <div className="vr-person-top">
                <div className="vr-avatar">{nm.slice(0, 1).toUpperCase()}</div>
                <span className="vr-person-name">{nm} {p.isLocal && <span className="vr-you">(você)</span>}</span>
                <span className={p.isMicrophoneEnabled ? "" : "vr-muted"}>{p.isMicrophoneEnabled ? I.mic : I.micOff}</span>
              </div>
              {isStaff && !p.isLocal && (
                <div className="vr-person-ctrls">
                  <button className="vr-mini" onClick={() => mod(p.identity, "force-mute")} title="Mutar microfone">Mutar</button>
                  <button className="vr-mini" onClick={() => mod(p.identity, "force-camera-off")} title="Desligar câmera">Câmera</button>
                  <button className="vr-mini" data-on={!screenBlocked} onClick={() => setPerm(p.identity, "screen_share", screenBlocked)} title="Permitir/bloquear compartilhar tela">
                    {screenBlocked ? "Liberar tela" : "Bloquear tela"}
                  </button>
                  <button className="vr-mini vr-mini-danger" onClick={() => kick(p.identity, nm)} title="Remover da sala">Remover</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Room settings (host) ---------------- */
function RoomSettings({ roomId }: { roomId: string }) {
  const sdk = useSDK();
  const [p, setP] = useState({ allow_mic: true, allow_camera: true, allow_screen_share: true, allow_whiteboard_edit: false });

  useEffect(() => {
    sdk.rooms.get(roomId).then((r: any) => setP({
      allow_mic: r.allow_mic, allow_camera: r.allow_camera,
      allow_screen_share: r.allow_screen_share, allow_whiteboard_edit: r.allow_whiteboard_edit,
    })).catch(() => {});
    return sdk.subscribe(roomId, (e, payload) => { if (e === "room-permissions") setP((prev) => ({ ...prev, ...payload })); });
  }, [roomId]);

  const toggle = (key: keyof typeof p) => {
    const next = !p[key];
    setP((prev) => ({ ...prev, [key]: next }));
    sdk.rooms.setRoomPermissions(roomId, { [key]: next }).catch(() => {});
  };

  const row = (key: keyof typeof p, label: string, sub: string) => (
    <div className="vr-setrow">
      <div><div className="vr-setrow-l">{label}</div><div className="vr-setrow-s">{sub}</div></div>
      <button className="tg" data-on={p[key]} onClick={() => toggle(key)} aria-pressed={p[key]} />
    </div>
  );

  return (
    <div className="vr-settings">
      <p className="vr-settings-hint">Permissões padrão dos participantes durante a chamada. Aplica a todos (você, anfitrião, não é afetado) e vale para quem entrar depois.</p>
      {row("allow_mic", "Microfone", "Participantes podem falar")}
      {row("allow_camera", "Câmera", "Participantes podem abrir a câmera")}
      {row("allow_screen_share", "Compartilhar tela", "Participantes podem compartilhar a tela")}
      {row("allow_whiteboard_edit", "Editar quadro", "Participantes podem desenhar no quadro")}
    </div>
  );
}

/* ---------------- OpenPBL / SCORM (host) ---------------- */
const SCORM_STATUS: Record<string, string> = {
  "ativo": "no pacote", "concluido": "concluído", "saiu": "saiu do pacote",
  "nao-abriu": "não abriu", "erro": "—",
};

/** Aula OpenPBL ao vivo: gera o class-code aqui dentro (substitui o pacote
 *  PRESENTATION do facilitador), libera questionários e encerra o registro. */
function ClassControl({ roomId }: { roomId: string }) {
  const sdk = useSDK();
  const [cls, setCls] = useState<any | null>(null);
  const [activityId, setActivityId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sentChat, setSentChat] = useState(false);

  useEffect(() => {
    sdk.openpbl.classState(roomId).then(setCls).catch(() => setCls({ active: false }));
    return sdk.subscribe(roomId, (event, payload) => {
      if (event === "openpbl-class") setCls(payload);
    });
  }, [roomId]);

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setErr(null);
    try { setCls(await fn()); }
    catch (e: any) { setErr(e?.message?.slice(0, 180) || "Falha na operação"); }
    finally { setBusy(null); }
  };

  const start = () => {
    const a = activityId.trim();
    if (!a) { setErr("Informe o ID da atividade (courseActivityId)."); return; }
    run("start", () => sdk.openpbl.startClass(roomId, a));
  };
  const sendCode = () => {
    if (!cls?.presentation_code) return;
    sdk.chat.send(roomId, `Código da sessão: ${cls.presentation_code} — digite no seu pacote OpenPBL para registrar presença.`).catch(() => {});
    setSentChat(true); setTimeout(() => setSentChat(false), 2500);
  };

  if (cls === null) return <div className="vr-scorm-empty">Carregando…</div>;

  if (!cls.active) {
    return (
      <div className="vr-class-ctl">
        <div className="vr-class-head">Aula OpenPBL</div>
        <p className="vr-scorm-hint">Gere o código da sessão direto daqui — sem precisar abrir o pacote de apresentação.</p>
        <div className="vr-scorm-relay-row">
          <input value={activityId} onChange={(e) => setActivityId(e.target.value)}
            placeholder="ID da atividade (courseActivityId)"
            onKeyDown={(e) => { if (e.key === "Enter") start(); }} />
          <button onClick={start} disabled={busy === "start"}>{busy === "start" ? "Gerando…" : "Iniciar aula"}</button>
        </div>
        {err && <p className="vr-class-err">{err}</p>}
      </div>
    );
  }

  return (
    <div className="vr-class-ctl">
      <div className="vr-class-head">Aula OpenPBL</div>
      <div className="vr-class-code-box">
        <span className="vr-class-code-label">Código da sessão</span>
        <span className="vr-class-code">{cls.presentation_code}</span>
        <button className="vr-mini" onClick={sendCode}>{sentChat ? "Enviado ✓" : "Enviar no chat"}</button>
      </div>
      <div className="vr-class-actions">
        <button className="vr-class-btn" data-done={cls.released_dimensions}
          disabled={busy !== null || cls.released_dimensions}
          onClick={() => run("risks", () => sdk.openpbl.release(roomId, "risks"))}>
          {cls.released_dimensions ? "✓ Riscos liberado" : busy === "risks" ? "Liberando…" : "Liberar Questionário de Riscos"}
        </button>
        <button className="vr-class-btn" data-done={cls.released}
          disabled={busy !== null || cls.released}
          onClick={() => run("perceptions", () => sdk.openpbl.release(roomId, "perceptions"))}>
          {cls.released ? "✓ Percepções liberado" : busy === "perceptions" ? "Liberando…" : "Liberar Questionário de Percepções"}
        </button>
        <button className="vr-class-btn vr-class-btn-danger" data-done={!cls.checking_open}
          disabled={busy !== null || !cls.checking_open}
          onClick={() => run("close", () => sdk.openpbl.closeRegistration(roomId))}>
          {!cls.checking_open ? "✓ Registro encerrado" : busy === "close" ? "Encerrando…" : "Encerrar registro"}
        </button>
      </div>
      {(cls.group_codes?.length ?? 0) > 0 && (
        <div className="vr-class-groups">
          <span className="vr-class-code-label">Códigos dos grupos</span>
          <div className="vr-class-group-list">
            {cls.group_codes.map((g: string, i: number) => (
              <span key={g} className="vr-class-group-chip" title={`Grupo ${i + 1}`}>{i + 1}: {g}</span>
            ))}
          </div>
        </div>
      )}
      {err && <p className="vr-class-err">{err}</p>}
    </div>
  );
}

/** Chat do facilitador — responde os alunos que escrevem pelo chat do pacote. */
function FacilitatorChat({ roomId }: { roomId: string }) {
  const sdk = useSDK();
  const [convs, setConvs] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  const loadConvs = () => sdk.openpbl.chat.conversations(roomId).then((c) => setConvs(Array.isArray(c) ? c : [])).catch(() => setUnavailable(true));
  const loadMsgs = (conv: any) => sdk.openpbl.chat.messages(roomId, conv.id).then((m) => setMsgs(Array.isArray(m) ? m : [])).catch(() => {});

  useEffect(() => {
    loadConvs();
    const iv = setInterval(() => { loadConvs(); }, 8000);
    return () => clearInterval(iv);
  }, [roomId]);
  useEffect(() => {
    if (!open) return;
    loadMsgs(open);
    const iv = setInterval(() => loadMsgs(open), 5000);
    return () => clearInterval(iv);
  }, [open?.id]);

  const reply = async () => {
    const t = text.trim();
    if (!t || !open) return;
    setText("");
    await sdk.openpbl.chat.reply(roomId, open.id, t).catch(() => {});
    loadMsgs(open);
  };

  if (unavailable) return null;   // chat não configurado no servidor — esconde a seção

  return (
    <div className="vr-fchat">
      <div className="vr-class-head">Chat dos alunos (pacote)</div>
      {!open ? (
        convs.length === 0
          ? <div className="vr-scorm-empty">Nenhuma conversa ainda. Quando um aluno escrever pelo pacote, aparece aqui.</div>
          : (
            <div className="vr-fchat-list">
              {convs.map((c) => (
                <button key={c.id} className="vr-fchat-conv" onClick={() => { setOpen(c); setMsgs([]); }}>
                  <span className="vr-fchat-name">{c.student_name || c.student_email}</span>
                  <span className="vr-fchat-meta">{c.course_id?.slice(0, 18)}{(c.unread ?? 0) > 0 ? ` • ${c.unread} nova(s)` : ""}</span>
                </button>
              ))}
            </div>
          )
      ) : (
        <div className="vr-fchat-thread">
          <div className="vr-fchat-thread-head">
            <button className="vr-mini" onClick={() => setOpen(null)}>← Conversas</button>
            <span className="vr-fchat-name">{open.student_name || open.student_email}</span>
          </div>
          <div className="vr-fchat-msgs">
            {msgs.map((m) => (
              <div key={m.id} className="vr-fchat-msg" data-teacher={m.sender === "teacher"}>
                <span>{m.content}</span>
              </div>
            ))}
            {msgs.length === 0 && <div className="vr-scorm-empty">Sem mensagens.</div>}
          </div>
          <div className="vr-scorm-relay-row">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Responder ao aluno…"
              onKeyDown={(e) => { if (e.key === "Enter") reply(); }} />
            <button onClick={reply}>Enviar</button>
          </div>
        </div>
      )}
    </div>
  );
}


function LessonDots({ s, order }: { s: any; order: string[] }) {
  if (!order.length) return null;
  const done = new Set<string>(s.done_lessons || []);
  return (
    <div className="vr-scorm-dots" title={`${s.lessons_done}/${order.length} lições concluídas`}>
      {order.map((lid, i) => (
        <span key={lid} className="vr-scorm-dot" data-done={done.has(lid)}
          title={`Lição ${i + 1}${done.has(lid) ? " — concluída" : ""}`} />
      ))}
    </div>
  );
}

function StudentRow({ s, order }: { s: any; order: string[] }) {
  return (
    <div className="vr-scorm-row" data-warn={s.status === "nao-abriu"}>
      <div className="vr-scorm-rowtop">
        <div className="vr-scorm-who"><b>{s.name}</b><span>{s.email}</span></div>
        <div className="vr-scorm-meta">
          <span className="vr-scorm-badge" data-st={s.status}>{SCORM_STATUS[s.status] || s.status}</span>
          {s.completed && <span className="vr-scorm-done" title="Concluiu o pacote">✓</span>}
        </div>
      </div>
      {s.status !== "nao-abriu" && <LessonDots s={s} order={order} />}
    </div>
  );
}

function StudentList({ students, loading, order }: { students: any[]; loading: boolean; order: string[] }) {
  if (loading) return <div className="vr-scorm-empty">Carregando…</div>;
  if (students.length === 0) return <div className="vr-scorm-empty">Nenhum aluno com e-mail identificado. Ative “Pedir e-mail” no convite da sala.</div>;
  return <div className="vr-scorm-list">{students.map((s) => <StudentRow key={s.email} s={s} order={order} />)}</div>;
}

function ScormPanel({ roomId }: { roomId: string }) {
  const sdk = useSDK();
  const [students, setStudents] = useState<any[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = () => sdk.rooms.scormProgress(roomId)
    .then((r: any) => { setStudents(r.students || []); setOrder(r.lessons || []); })
    .catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv); }, [roomId]);
  const notOpened = students.filter((s) => s.status === "nao-abriu").length;

  const warn = !loading && students.length > 0 && notOpened > 0
    ? <div className="vr-scorm-warn">⚠ {notOpened} de {students.length} ainda não abriram o pacote</div> : null;
  const legend = order.length > 0
    ? <div className="vr-scorm-legend">Cada bolinha = uma lição; verde quando o aluno conclui.</div> : null;

  return (
    <div className="vr-scorm">
      <ClassControl roomId={roomId} />
      <FacilitatorChat roomId={roomId} />
      <div className="vr-scorm-progress">
        <div className="vr-scorm-head">
          <span>Progresso dos alunos</span>
          <div className="vr-scorm-actions">
            <button className="vr-mini" onClick={() => setExpanded(true)} title="Abrir em popup">⤢ Expandir</button>
            <button className="vr-mini" onClick={load}>Atualizar</button>
          </div>
        </div>
        {warn}{legend}
        <StudentList students={students} loading={loading} order={order} />
      </div>

      {expanded && (
        <div className="vr-scorm-overlay" onClick={() => setExpanded(false)}>
          <div className="vr-scorm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vr-scorm-modal-head">
              <h3>Progresso dos alunos — OpenPBL</h3>
              <div className="vr-scorm-actions">
                <button className="vr-mini" onClick={load}>Atualizar</button>
                <button className="vr-mini" onClick={() => setExpanded(false)}>Fechar ✕</button>
              </div>
            </div>
            <div className="vr-scorm-modal-body">
              {warn}{legend}
              <StudentList students={students} loading={loading} order={order} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Controls ---------------- */
function ControlBar({ isStaff, scorm, panel, setPanel, onOpenSettings, settingsActive, peopleCount, boardActive, onToggleBoard, recording, onToggleRecording }: {
  isStaff: boolean; scorm: boolean; panel: string | null;
  setPanel: (p: "chat" | "people" | "breakout" | "scorm" | null) => void;
  onOpenSettings: () => void; settingsActive: boolean;
  peopleCount: number; boardActive: boolean; onToggleBoard: () => void;
  recording: boolean; onToggleRecording: () => void;
}) {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const room = useRoomContext();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="vr-controls">
      <div className="vr-pill">
        <button className="vr-ctrl" data-off={!mic.enabled} onClick={() => mic.toggle()} disabled={mic.pending} title="Microfone">
          {mic.enabled ? I.mic : I.micOff}
        </button>
        <button className="vr-ctrl" data-off={!cam.enabled} onClick={() => cam.toggle()} disabled={cam.pending} title="Câmera">
          {cam.enabled ? I.cam : I.camOff}
        </button>
        <button className="vr-ctrl" data-active={screen.enabled} onClick={() => screen.toggle()} disabled={screen.pending} title="Compartilhar tela">
          {I.screen}
        </button>
        <button className="vr-ctrl" data-active={boardActive} onClick={onToggleBoard} title="Quadro branco">
          {I.board}
        </button>
        {isStaff && (
          <button
            className="vr-ctrl vr-rec-btn"
            data-active={recording}
            onClick={onToggleRecording}
            title={recording ? "Parar gravação" : "Iniciar gravação"}
          >
            {recording ? I.stop : I.record}
          </button>
        )}
        <div className="vr-sep" />
        <button className="vr-ctrl" data-active={panel === "chat"} onClick={() => setPanel(panel === "chat" ? null : "chat")} title="Chat">
          {I.chat}
        </button>
        <button className="vr-ctrl vr-ctrl-badge" data-active={panel === "people"} data-count={peopleCount} onClick={() => setPanel(panel === "people" ? null : "people")} title="Participantes">
          {I.people}
        </button>
        {isStaff && (
          <button className="vr-ctrl" data-active={panel === "breakout"} onClick={() => setPanel(panel === "breakout" ? null : "breakout")} title="Grupos">
            {I.groups}
          </button>
        )}
        {isStaff && (
          <div className="vr-ctrl-more">
            <button className="vr-ctrl" data-active={moreOpen || panel === "scorm" || settingsActive} onClick={() => setMoreOpen((o) => !o)} title="Mais (OpenPBL, Configurações)">
              {I.more}
            </button>
            {moreOpen && (
              <>
                <div className="vr-menu-backdrop" onClick={() => setMoreOpen(false)} />
                <div className="vr-ctrl-menu">
                  {scorm && <button onClick={() => { setPanel("scorm"); setMoreOpen(false); }}>{I.board} OpenPBL</button>}
                  <button onClick={() => { onOpenSettings(); setMoreOpen(false); }}>{I.gear} Configurações</button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="vr-sep" />
        <button className="vr-ctrl" data-leave="true" onClick={() => room.disconnect()} title="Sair">
          {I.phone}
        </button>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */
function useElapsed() {
  const [t, setT] = useState("00:00");
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      const hh = Math.floor(s / 3600);
      setT(hh > 0 ? `${String(hh).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}
