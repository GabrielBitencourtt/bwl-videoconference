import { useEffect, useState } from "react";
import { useSDK } from "../../lib/sdk-context";

export default function LobbyPanel({ roomId }: { roomId: string }) {
  const sdk = useSDK();
  const [waiting, setWaiting] = useState<any[]>([]);
  const refresh = () => sdk.lobby.list(roomId).then(setWaiting).catch(() => {});

  useEffect(() => { refresh(); }, [roomId]);

  useEffect(() => {
    return sdk.subscribe(roomId, (event) => {
      if (event === "lobby-join" || event === "lobby-decision") refresh();
    });
  }, [roomId]);

  if (!waiting.length) return <div style={{ padding: 8, fontSize: 12, opacity: 0.6 }}>Saguão vazio.</div>;
  return (
    <div style={{ padding: 8, borderBottom: "1px solid #333" }}>
      <h4 style={{ margin: "0 0 6px" }}>Saguão</h4>
      {waiting.map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 4, padding: 4 }}>
          <span>{p.display_name} <small>({p.participant_type})</small></span>
          <span>
            <button onClick={() => sdk.lobby.decide(roomId, p.id, true).then(refresh)}>✓</button>
            <button onClick={() => sdk.lobby.decide(roomId, p.id, false).then(refresh)}>✕</button>
          </span>
        </div>
      ))}
    </div>
  );
}
