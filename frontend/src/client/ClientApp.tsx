import { useEffect, useState } from "react";
import { clientApi } from "./clientApi";
import "../styles/admin.css";

export default function ClientApp() {
  const [me, setMe] = useState<any>(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => { clientApi("/me").then(setMe).catch(() => {}).finally(() => setBooting(false)); }, []);
  const reload = () => clientApi("/me").then(setMe).catch(() => {});
  const logout = async () => { await clientApi("/logout", { method: "POST" }).catch(() => {}); setMe(null); };
  if (booting) return <div className="ad-shell ad-center">Carregando…</div>;
  if (!me) return <Auth onAuth={reload} />;
  return <Portal me={me} onLogout={logout} onChange={reload} />;
}

function Auth({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", company: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      if (mode === "signup") await clientApi("/signup", { method: "POST", body: JSON.stringify(f) });
      else await clientApi("/login", { method: "POST", body: JSON.stringify({ email: f.email, password: f.password }) });
      onAuth();
    } catch (e: any) { setErr(mode === "signup" ? (e.message || "falha no cadastro") : "credenciais inválidas"); }
    finally { setBusy(false); }
  };
  return (
    <div className="ad-shell ad-center">
      <form className="ad-login" onSubmit={submit} style={{ width: "min(420px,92%)" }}>
        <div className="ad-logo ad-logo-lg" style={{ width: 48, height: 48, borderRadius: 14 }}>V</div>
        <h1>{mode === "login" ? "Portal do Cliente" : "Criar conta"}</h1>
        <div className="ad-range" style={{ marginBottom: 6 }}>
          <button type="button" data-active={mode === "login"} onClick={() => setMode("login")}>Entrar</button>
          <button type="button" data-active={mode === "signup"} onClick={() => setMode("signup")}>Criar conta (trial)</button>
        </div>
        {mode === "signup" && <>
          <input className="ad-input" placeholder="Seu nome" value={f.name} onChange={(e) => set("name", e.target.value)} />
          <input className="ad-input" placeholder="Nome da empresa" value={f.company} onChange={(e) => set("company", e.target.value)} />
        </>}
        <input className="ad-input" type="email" placeholder="E-mail" value={f.email} onChange={(e) => set("email", e.target.value)} autoFocus />
        <input className="ad-input" type="password" placeholder={mode === "signup" ? "Senha (mín. 8)" : "Senha"} value={f.password} onChange={(e) => set("password", e.target.value)} />
        {err && <div className="ad-err">{err}</div>}
        <button className="ad-btn" disabled={busy}>{busy ? "…" : mode === "login" ? "Entrar" : "Criar conta"}</button>
      </form>
    </div>
  );
}

function Portal({ me, onLogout, onChange }: { me: any; onLogout: () => void; onChange: () => void }) {
  const lic = me.license;
  const [usage, setUsage] = useState<any>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [brand, setBrand] = useState<any>(lic.branding || {});
  const loadKeys = () => clientApi<any[]>("/keys").then(setKeys).catch(() => {});
  useEffect(() => {
    clientApi("/usage").then(setUsage).catch(() => {});
    clientApi<any[]>("/rooms").then(setRooms).catch(() => {});
    loadKeys();
  }, []);
  const genKey = async () => { const r = await clientApi<any>("/keys", { method: "POST" }); setNewKey(r.api_key); loadKeys(); };
  const revoke = async (id: string) => { if (confirm("Revogar esta key?")) { await clientApi(`/keys/${id}`, { method: "DELETE" }); loadKeys(); } };
  const saveBrand = async () => { await clientApi("/branding", { method: "PUT", body: JSON.stringify(brand) }); onChange(); alert("Branding salvo."); };
  const eff = (v: number) => v === -1 ? "∞" : v;

  return (
    <div className="ad-shell">
      <header className="ad-top">
        <div className="ad-brand"><div className="ad-logo sm">V</div> {lic.name}</div>
        <div className="ad-top-right"><span className="ad-muted">{me.user.email}</span><button className="ad-link" onClick={onLogout}>Sair</button></div>
      </header>
      <div className="ad-content" style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="ad-head-row"><h2 className="ad-h2">Minha Licença</h2><span className="ad-badge" data-s={lic.status === "active" ? "active" : "trial"}>{lic.status}</span></div>

        <div className="ad-cards">
          <div className="ad-card"><div className="ad-card-v">{lic.plan || "—"}</div><div className="ad-card-l">Plano</div></div>
          <div className="ad-card"><div className="ad-card-v">{eff(lic.limits.max_rooms)}</div><div className="ad-card-l">Máx. salas</div></div>
          <div className="ad-card"><div className="ad-card-v">{lic.limits.max_participants}</div><div className="ad-card-l">Máx. participantes</div></div>
          <div className="ad-card"><div className="ad-card-v">{lic.limits.recording_enabled ? "Sim" : "Não"}</div><div className="ad-card-l">Gravação</div></div>
          <div className="ad-card"><div className="ad-card-v">{lic.limits.storage_quota_gb}<small>GB</small></div><div className="ad-card-l">Storage</div></div>
        </div>

        <h3 className="ad-h3">Uso</h3>
        <div className="ad-cards">
          <div className="ad-card ad-card-live"><div className="ad-card-v">{usage?.live_participants ?? "—"}</div><div className="ad-card-l">Ao vivo</div></div>
          <div className="ad-card"><div className="ad-card-v">{usage?.rooms_active ?? "—"}</div><div className="ad-card-l">Salas ativas</div></div>
          <div className="ad-card"><div className="ad-card-v">{usage?.rooms_total ?? "—"}</div><div className="ad-card-l">Salas (total)</div></div>
          <div className="ad-card"><div className="ad-card-v">{usage?.participants ?? "—"}</div><div className="ad-card-l">Participantes</div></div>
          <div className="ad-card"><div className="ad-card-v">{usage?.recordings ?? "—"}</div><div className="ad-card-l">Gravações</div></div>
        </div>

        <div className="ad-panel">
          <div className="ad-head-row"><h3 className="ad-h3">API Keys</h3><button className="ad-btn" onClick={genKey}>+ Gerar key</button></div>
          <p className="ad-muted" style={{ marginTop: -6 }}>Use no seu backend para integrar. Veja a <a href="/documentation">documentação</a>.</p>
          {newKey && <div className="ad-keybox"><span className="ad-muted">Copie agora (não será mostrada de novo):</span><code className="ad-key">{newKey}</code><button className="ad-btn-outline" onClick={() => navigator.clipboard?.writeText(newKey)}>Copiar</button></div>}
          <table className="ad-table"><thead><tr><th>Prefixo</th><th>Último uso</th><th>Status</th><th></th></tr></thead><tbody>
            {keys.map((k) => <tr key={k.id}><td><code>{k.key_prefix}…</code></td><td className="ad-muted">{k.last_used_at ? new Date(k.last_used_at).toLocaleString("pt-BR") : "nunca"}</td><td>{k.revoked_at ? <span className="ad-badge" data-s="suspended">revogada</span> : <span className="ad-badge" data-s="active">ativa</span>}</td><td>{!k.revoked_at && <button className="ad-link ad-danger" onClick={() => revoke(k.id)}>revogar</button>}</td></tr>)}
            {keys.length === 0 && <tr><td colSpan={4} className="ad-muted" style={{ padding: 14 }}>Nenhuma key. Gere uma para integrar.</td></tr>}
          </tbody></table>
        </div>

        <div className="ad-panel">
          <h3 className="ad-h3">Marca (white-label)</h3>
          <div className="ad-grid2">
            <label className="ad-field"><span>Nome do produto</span><input className="ad-input" value={brand.product_name || ""} onChange={(e) => setBrand({ ...brand, product_name: e.target.value })} /></label>
            <label className="ad-field"><span>Cor de destaque</span><input className="ad-input" type="color" value={brand.accent_color || "#6366f1"} onChange={(e) => setBrand({ ...brand, accent_color: e.target.value })} style={{ height: 42, padding: 4 }} /></label>
          </div>
          <label className="ad-field"><span>URL do logo</span><input className="ad-input" value={brand.logo_url || ""} onChange={(e) => setBrand({ ...brand, logo_url: e.target.value })} placeholder="https://..." /></label>
          <button className="ad-btn" onClick={saveBrand}>Salvar marca</button>
        </div>

        <div className="ad-panel">
          <h3 className="ad-h3">Minhas salas</h3>
          <table className="ad-table"><thead><tr><th>Sala</th><th>Status</th><th>Criada</th><th>Gravação</th></tr></thead><tbody>
            {rooms.map((r) => <tr key={r.id}><td><b>{r.title}</b></td><td><span className="ad-badge" data-s={r.status === "active" ? "active" : "ended"}>{r.status}</span></td><td className="ad-muted">{new Date(r.created_at).toLocaleString("pt-BR")}</td><td>{r.has_recording ? "✓" : "—"}</td></tr>)}
            {rooms.length === 0 && <tr><td colSpan={4} className="ad-muted" style={{ padding: 14 }}>Nenhuma sala ainda.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
