import { useEffect, useRef, useState } from "react";
import { useSDK } from "../lib/sdk-context";

interface Vid { key: string; name: string; size?: number; url: string }

export default function BgVideoPicker({
  selectedKey, onClose, onSelect,
}: {
  selectedKey?: string;
  onClose: () => void;
  onSelect: (v: { key: string; name: string; url: string }) => void;
}) {
  const sdk = useSDK();
  const [videos, setVideos] = useState<Vid[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setLoading(true);
    sdk.backgrounds.list().then((v) => setVideos(v)).catch(() => setError("Falha ao carregar a galeria.")).finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const v = await sdk.backgrounds.upload(file);
      onSelect({ key: v.key, name: v.name, url: v.url });
      onClose();
    } catch {
      setError("Falha no upload. Verifique se é um vídeo válido.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="nrm-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="nrm bgp" onClick={(e) => e.stopPropagation()}>
        <div className="nrm-head">
          <h2>Vídeo de Fundo</h2>
          <button className="nrm-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={onFile} />

        <div className="bgp-actions">
          <button className="nrm-btn-create" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Enviando…" : "⬆ Enviar novo vídeo"}
          </button>
        </div>

        {error && <div className="bgp-error">{error}</div>}

        {loading ? (
          <div className="bgp-empty">Carregando…</div>
        ) : videos.length === 0 ? (
          <div className="bgp-empty">
            Nenhum vídeo na galeria ainda.<br />
            Faça upload do primeiro vídeo de fundo.
          </div>
        ) : (
          <div className="bgp-grid">
            {videos.map((v) => (
              <button
                key={v.key}
                className="bgp-item"
                data-sel={v.key === selectedKey}
                onClick={() => { onSelect({ key: v.key, name: v.name, url: v.url }); onClose(); }}
                title={v.name}
              >
                <video src={v.url} muted loop playsInline preload="metadata"
                  onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                  onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />
                <span className="bgp-name">{v.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
