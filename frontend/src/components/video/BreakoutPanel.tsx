import { useEffect, useRef, useState } from "react";
import { useParticipants } from "@livekit/components-react";
import { useSDK } from "../../lib/sdk-context";
import type { BreakoutState, BreakoutGroup } from "../../lib/video-rooms-sdk";

/**
 * Painel de "Grupos" (breakout rooms) — só para o anfitrião.
 * Cria N grupos, atribui participantes (auto/manual/self), abre/encerra,
 * define timer e visita cada grupo. O estado vem do backend (sdk.breakouts).
 */
export default function BreakoutPanel({
  roomId, identity, displayName, activeGroupId, onVisit, onLeaveVisit,
}: {
  roomId: string;
  identity?: string;
  displayName?: string;
  activeGroupId?: string | null;
  onVisit: (g: { id: string; name: string }, endsAt: string | null) => void;
  onLeaveVisit: () => void;
}) {
  const sdk = useSDK();
  const participants = useParticipants();
  const [state, setState] = useState<BreakoutState | null>(null);
  const [count, setCount] = useState(2);
  const [mode, setMode] = useState<"auto" | "manual" | "self">("auto");
  const [minutes, setMinutes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = () => sdk.breakouts.state(roomId).then(setState).catch(() => {});

  useEffect(() => {
    refresh();
    return sdk.subscribe(roomId, (event) => {
      if (event === "breakout-state" || event === "breakout-open" || event === "breakout-close") refresh();
    });
  }, [roomId]);

  const groups = state?.groups ?? [];
  const open = !!state?.open;

  // Sincroniza os controles com a config atual ao abrir (uma vez), depois o host
  // edita livremente para mudar quantidade/modo durante a chamada.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (state && !syncedRef.current) {
      syncedRef.current = true;
      if (state.groups.length) { setCount(state.groups.length); setMode(state.mode); }
    }
  }, [state]);

  // Auto-encerra quando o timer chega ao fim (puxa todos de volta).
  useEffect(() => {
    if (!open || !state?.ends_at) return;
    const ms = new Date(state.ends_at).getTime() - Date.now();
    const id = setTimeout(() => { sdk.breakouts.close(roomId).then(refresh).catch(() => {}); }, Math.max(0, ms));
    return () => clearTimeout(id);
  }, [open, state?.ends_at, roomId]);
  // identidade → grupo, para saber quem já está atribuído
  const assignedOf: Record<string, string> = {};
  groups.forEach((g) => g.members.forEach((m) => (assignedOf[m.identity] = g.id)));

  const create = async () => {
    setBusy(true);
    try { setState(await sdk.breakouts.create(roomId, { count, mode })); }
    finally { setBusy(false); }
  };
  const open_ = async () => {
    setBusy(true);
    try { setState(await sdk.breakouts.open(roomId, minutes > 0 ? minutes * 60 : undefined)); }
    finally { setBusy(false); }
  };
  const close_ = async () => {
    setBusy(true);
    try { await sdk.breakouts.close(roomId); await refresh(); }
    finally { setBusy(false); }
  };
  const assign = async (ident: string, groupId: string | null, name?: string) => {
    await sdk.breakouts.assign(roomId, ident, groupId, name);
    refresh();
  };
  const sendNote = async () => {
    const t = note.trim();
    if (!t) return;
    await sdk.breakouts.message(roomId, t);
    setNote("");
  };

  // Participantes presentes que ainda não estão em nenhum grupo (para atribuição
  // manual). O próprio host fica de fora da lista.
  const roster = participants
    .filter((p) => p.identity && p.identity !== identity)
    .map((p) => ({ identity: p.identity, name: p.name || p.identity }));
  const unassigned = roster.filter((p) => !assignedOf[p.identity]);

  return (
    <div className="vr-bo">
      <div className="vr-bo-config">
        <p className="vr-bo-hint">
          {groups.length ? "Ajuste a quantidade e o tipo de formação quando quiser." : "Crie grupos para dividir a sala em sessões menores."}
        </p>
        <label className="vr-bo-row">
          <span>Número de grupos</span>
          <input type="number" min={1} max={50} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </label>
        <label className="vr-bo-row">
          <span>Atribuição</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="auto">Automática (distribui)</option>
            <option value="manual">Manual (você escolhe)</option>
            <option value="self">Os participantes escolhem</option>
          </select>
        </label>
        <button className="vr-bo-btn vr-bo-btn-primary" onClick={create} disabled={busy}>
          {groups.length ? "Atualizar grupos" : "Criar grupos"}
        </button>
        {groups.length > 0 && <span className="vr-bo-note">Atualizar recria os grupos e redistribui os participantes.</span>}
      </div>

      {groups.length > 0 && (
        <div className="vr-bo-manage">
          <div className="vr-bo-actions">
            {!open ? (
              <>
                <label className="vr-bo-timer">
                  Timer (min)
                  <input type="number" min={0} max={180} value={minutes}
                    onChange={(e) => setMinutes(Math.max(0, Math.min(180, Number(e.target.value) || 0)))} />
                </label>
                <button className="vr-bo-btn vr-bo-btn-primary" onClick={open_} disabled={busy}>Abrir grupos</button>
              </>
            ) : (
              <button className="vr-bo-btn vr-bo-btn-danger" onClick={close_} disabled={busy}>Encerrar grupos</button>
            )}
          </div>

          {open && (
            <div className="vr-bo-broadcast">
              <input placeholder="Aviso para todos os grupos…" value={note}
                onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendNote()} />
              <button className="vr-bo-btn" onClick={sendNote}>Enviar</button>
            </div>
          )}

          {groups.map((g) => (
            <BreakoutGroupCard
              key={g.id} g={g} open={open} mode={state!.mode}
              roster={roster} assignedOf={assignedOf}
              onAssign={assign}
              visiting={activeGroupId === g.id}
              onVisit={() => onVisit({ id: g.id, name: g.name }, state?.ends_at ?? null)}
              onLeaveVisit={onLeaveVisit}
            />
          ))}

          {mode === "manual" && unassigned.length > 0 && (
            <div className="vr-bo-unassigned">
              <div className="vr-bo-sub">Sem grupo</div>
              {unassigned.map((p) => (
                <div className="vr-bo-member" key={p.identity}>
                  <span>{p.name}</span>
                  <select defaultValue="" onChange={(e) => e.target.value && assign(p.identity, e.target.value, p.name)}>
                    <option value="" disabled>atribuir a…</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BreakoutGroupCard({
  g, open, mode, roster, assignedOf, onAssign, visiting, onVisit, onLeaveVisit,
}: {
  g: BreakoutGroup;
  open: boolean;
  mode: string;
  roster: { identity: string; name: string }[];
  assignedOf: Record<string, string>;
  onAssign: (ident: string, groupId: string | null, name?: string) => void;
  visiting: boolean;
  onVisit: () => void;
  onLeaveVisit: () => void;
}) {
  return (
    <div className="vr-bo-group">
      <div className="vr-bo-group-head">
        <strong>{g.name}</strong>
        <span className="vr-bo-count">{g.members.length}</span>
        {open && (visiting
          ? <button className="vr-bo-link" onClick={onLeaveVisit}>Sair</button>
          : <button className="vr-bo-link" onClick={onVisit}>Visitar</button>)}
      </div>
      {g.members.map((m) => (
        <div className="vr-bo-member" key={m.identity}>
          <span>{m.display_name || m.identity}</span>
          {mode === "manual" && !open && (
            <button className="vr-bo-x" title="Remover do grupo" onClick={() => onAssign(m.identity, null)}>✕</button>
          )}
        </div>
      ))}
      {!g.members.length && <div className="vr-bo-empty">vazio</div>}
    </div>
  );
}
