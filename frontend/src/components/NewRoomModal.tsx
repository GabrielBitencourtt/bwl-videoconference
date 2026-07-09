import { useState } from "react";
import "../styles/modal.css";

// Sala nasce com participantes/saguão/edição de quadro fixos: os controles não são
// renderizados e o servidor ignora esses campos (ver ROOM_MAX_PARTICIPANTS em rooms.py).
export interface NewRoomData {
  title: string;
  auto_record: boolean;
  is_public: boolean;
  allow_camera: boolean;
  allow_mic: boolean;
  allow_screen_share: boolean;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="tg" data-on={on} onClick={() => onChange(!on)} aria-pressed={on} />;
}

const icons = {
  cam: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  mic: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>,
  screen: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/></svg>,
};

export default function NewRoomModal({ onClose, onCreate }: { onClose: () => void; onCreate: (d: NewRoomData) => void }) {
  const [d, setD] = useState<NewRoomData>({
    title: "",
    auto_record: true,
    is_public: true,
    allow_camera: true,
    allow_mic: true,
    allow_screen_share: true,
  });
  const set = <K extends keyof NewRoomData>(k: K, v: NewRoomData[K]) => setD((p) => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!d.title.trim() || busy) return;
    setBusy(true);
    onCreate(d);
  };

  return (
    <div className="nrm-overlay" onClick={onClose}>
      <div className="nrm" onClick={(e) => e.stopPropagation()}>
        <div className="nrm-head">
          <h2>Nova Sala de Vídeo</h2>
          <button className="nrm-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <label className="nrm-label">Nome da Sala</label>
        <input className="nrm-input" autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Mentoria 1:1" />

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
          </div>
        </div>

        <div className="nrm-foot">
          <button className="nrm-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="nrm-btn-create" onClick={submit} disabled={busy}>{busy ? "Criando…" : "Criar Sala"}</button>
        </div>
      </div>
    </div>
  );
}
