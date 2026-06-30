import { useState } from "react";
import "../styles/modal.css";
import BgVideoPicker from "./BgVideoPicker";

export interface NewRoomData {
  title: string;
  max_participants: number;
  auto_record: boolean;
  is_public: boolean;
  allow_camera: boolean;
  allow_mic: boolean;
  allow_screen_share: boolean;
  allow_whiteboard_edit: boolean;
  lobby_enabled: boolean;
  lobby_timer_title: string;
  lobby_timer_seconds: number;
  lobby_bg_video: string;
  lobby_auto_admit: boolean;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="tg" data-on={on} onClick={() => onChange(!on)} aria-pressed={on} />;
}

const icons = {
  cam: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  mic: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>,
  screen: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/></svg>,
  board: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>,
  clock: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  film: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5"/></svg>,
};

export default function NewRoomModal({ onClose, onCreate }: { onClose: () => void; onCreate: (d: NewRoomData) => void }) {
  const [d, setD] = useState<NewRoomData>({
    title: "",
    max_participants: 50,
    auto_record: false,
    is_public: true,
    allow_camera: true,
    allow_mic: true,
    allow_screen_share: true,
    allow_whiteboard_edit: false,
    lobby_enabled: false,
    lobby_timer_title: "A sessão começará em breve",
    lobby_timer_seconds: 300,
    lobby_bg_video: "",
    lobby_auto_admit: false,
  });
  const set = <K extends keyof NewRoomData>(k: K, v: NewRoomData[K]) => setD((p) => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bgName, setBgName] = useState("");
  const [bgUrl, setBgUrl] = useState("");

  const submit = () => {
    if (!d.title.trim() || busy) return;
    setBusy(true);
    onCreate(d);
  };

  const secs = d.lobby_timer_seconds;
  const mmss = `${Math.floor(secs / 60)}min ${secs % 60}s`;

  return (
    <div className="nrm-overlay" onClick={onClose}>
      <div className="nrm" onClick={(e) => e.stopPropagation()}>
        <div className="nrm-head">
          <h2>Nova Sala de Vídeo</h2>
          <button className="nrm-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <label className="nrm-label">Nome da Sala</label>
        <input className="nrm-input" autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Mentoria 1:1" />

        <label className="nrm-label">Máx. Participantes</label>
        <input className="nrm-input" type="number" min={2} max={500} value={d.max_participants} onChange={(e) => set("max_participants", parseInt(e.target.value) || 2)} />

        <div className="nrm-row">
          <div className="nrm-row-text">Gravação</div>
          <Toggle on={d.auto_record} onChange={(v) => set("auto_record", v)} />
        </div>

        <div className="nrm-row">
          <div>
            <div className="nrm-row-text">Sala Pública</div>
            <div className="nrm-row-sub">Todos os usuários podem ver e acessar</div>
          </div>
          <Toggle on={d.is_public} onChange={(v) => set("is_public", v)} />
        </div>

        <div className="nrm-card">
          <div className="nrm-card-title">Permissões dos Participantes</div>
          <div className="nrm-card-sub">Defina o que os participantes podem fazer por padrão</div>
          <div className="nrm-perms">
            <div className="nrm-perm"><span>{icons.cam} Câmera</span><Toggle on={d.allow_camera} onChange={(v) => set("allow_camera", v)} /></div>
            <div className="nrm-perm"><span>{icons.mic} Microfone</span><Toggle on={d.allow_mic} onChange={(v) => set("allow_mic", v)} /></div>
            <div className="nrm-perm"><span>{icons.screen} Compartilhar Tela</span><Toggle on={d.allow_screen_share} onChange={(v) => set("allow_screen_share", v)} /></div>
            <div className="nrm-perm"><span>{icons.board} Editar Quadro</span><Toggle on={d.allow_whiteboard_edit} onChange={(v) => set("allow_whiteboard_edit", v)} /></div>
          </div>
        </div>

        <div className="nrm-card">
          <div className="nrm-row" style={{ padding: 0 }}>
            <div>
              <div className="nrm-card-title">{icons.clock} Saguão (Lobby)</div>
              <div className="nrm-card-sub" style={{ margin: "2px 0 0" }}>Participantes aguardam antes de entrar na sala</div>
            </div>
            <Toggle on={d.lobby_enabled} onChange={(v) => set("lobby_enabled", v)} />
          </div>

          {d.lobby_enabled && (
            <div style={{ marginTop: 14 }}>
              <label className="nrm-label" style={{ marginTop: 0 }}>Título do Cronômetro</label>
              <input className="nrm-input" value={d.lobby_timer_title} onChange={(e) => set("lobby_timer_title", e.target.value)} />

              <label className="nrm-label">Tempo do Cronômetro (segundos)</label>
              <input className="nrm-input" type="number" min={0} value={d.lobby_timer_seconds} onChange={(e) => set("lobby_timer_seconds", parseInt(e.target.value) || 0)} />
              <div className="nrm-hint">{mmss} — Use 0 para desativar o cronômetro</div>

              <label className="nrm-label">{icons.film} Vídeo de Fundo</label>
              <button type="button" className="nrm-bgbtn" onClick={() => setPickerOpen(true)}>
                {icons.film}
                <span>{d.lobby_bg_video ? (bgName || "Vídeo selecionado") : "Escolher vídeo de fundo"}</span>
              </button>
              {bgUrl && <video className="nrm-bgpreview" src={bgUrl} muted loop autoPlay playsInline />}

              <div className="nrm-row">
                <div>
                  <div className="nrm-row-text">Admissão Automática</div>
                  <div className="nrm-row-sub">Admitir todos automaticamente ao fim do timer</div>
                </div>
                <Toggle on={d.lobby_auto_admit} onChange={(v) => set("lobby_auto_admit", v)} />
              </div>
            </div>
          )}
        </div>

        <div className="nrm-foot">
          <button className="nrm-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="nrm-btn-create" onClick={submit} disabled={busy}>{busy ? "Criando…" : "Criar Sala"}</button>
        </div>
      </div>

      {pickerOpen && (
        <BgVideoPicker
          selectedKey={d.lobby_bg_video}
          onClose={() => setPickerOpen(false)}
          onSelect={(v) => { set("lobby_bg_video", v.key); setBgName(v.name); setBgUrl(v.url); }}
        />
      )}
    </div>
  );
}
