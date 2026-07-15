import { useEffect, useRef, useState } from "react";
import "../../styles/lobby.css";

interface Props {
  roomTitle: string;
  timerTitle?: string | null;
  timerSeconds: number;
  /** Âncora do countdown (ISO). Padrão = criação da sala: o tempo é COMPARTILHADO —
   *  quem entra depois vê o tempo corrente restante, não reinicia. */
  startedAt?: string | null;
  bgVideo?: string | null;
  badge?: string;
  denied?: boolean;
  onTimerEnd?: () => void;
}

export default function LobbyWaiting({ roomTitle, timerTitle, timerSeconds, startedAt, bgVideo, badge = "Convidado", denied, onTimerEnd }: Props) {
  // Fim do saguão = âncora (criação da sala) + duração. Sem âncora, cai no "agora".
  const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
  const endMs = startMs + Math.max(0, timerSeconds || 0) * 1000;
  const remaining = () => Math.max(0, Math.round((endMs - Date.now()) / 1000));
  const [left, setLeft] = useState(remaining);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const firedRef = useRef(false);

  // Try to play WITH sound (the "Entrar no saguão" click is a recent user
  // gesture); if the browser blocks autoplay-with-audio, fall back to muted.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !bgVideo) return;
    v.muted = false;
    v.volume = 1;
    v.play().then(() => setMuted(false)).catch(() => {
      v.muted = true;
      setMuted(true);
      v.play().catch(() => {});
    });
  }, [bgVideo]);

  // Reflect mute state imperatively — React's `muted` prop doesn't reliably
  // update the element's muted property.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!timerSeconds || timerSeconds <= 0) return;
    // Recalcula do anchor a cada tick (preciso e resiliente a suspensão da aba).
    const tick = () => {
      const rem = remaining();
      setLeft(rem);
      if (rem <= 0) {
        clearInterval(id);
        if (!firedRef.current) { firedRef.current = true; onTimerEnd?.(); }
      }
    };
    const id = setInterval(tick, 1000);
    tick();   // aplica na hora (aluno que entra depois já vê o tempo corrente)
    return () => clearInterval(id);
  }, [timerSeconds, endMs]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="lob-root">
      {bgVideo ? (
        <video ref={videoRef} className="lob-bg" src={bgVideo} autoPlay loop playsInline />
      ) : (
        <div className="lob-bg lob-bg-grad" />
      )}
      <div className="lob-scrim" />

      <div className="lob-card">
        <span className="lob-badge">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          {badge}
        </span>
        <h1 className="lob-title">{roomTitle}</h1>

        {denied ? (
          <div className="lob-denied">Sua entrada foi recusada pelo anfitrião.</div>
        ) : (
          <>
            {timerTitle && <div className="lob-sub">{timerTitle}</div>}
            {timerSeconds > 0 && (
              <div className="lob-timer">{mm} <span className="lob-colon">:</span> {ss}</div>
            )}
            <div className="lob-wait">
              <span className="lob-spinner" />
              Aguardando o anfitrião liberar sua entrada…
            </div>
          </>
        )}
      </div>

      {bgVideo && (
        <button className="lob-mute" onClick={() => setMuted((m) => !m)} title={muted ? "Ativar som" : "Silenciar"}>
          {muted ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>
          )}
        </button>
      )}
    </div>
  );
}
