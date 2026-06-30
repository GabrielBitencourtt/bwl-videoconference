import { useEffect, useState, useRef } from "react";
import { useSDK } from "../../lib/sdk-context";

interface Props { roomId: string; senderName?: string; channel?: string; channelLabel?: string }

function hhmm(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return ""; }
}

export default function RoomChat({ roomId, senderName, channel, channelLabel }: Props) {
  const sdk = useSDK();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const ch = channel || null;   // null = sala principal

  // Recarrega o histórico do canal atual (troca ao entrar/sair de um grupo).
  useEffect(() => { sdk.chat.list(roomId, channel).then(setMessages).catch(() => {}); }, [roomId, channel]);

  useEffect(() => {
    return sdk.subscribe(roomId, (event, payload) => {
      // O broadcast chega a todos da sala-pai; só exibe o do canal atual.
      if (event === "chat-message" && (payload?.channel ?? null) === ch) {
        setMessages((m) => [...m, payload]);
      }
    });
  }, [roomId, ch]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await sdk.chat.send(roomId, text, senderName, channel);
    setText("");
  };

  return (
    <div className="vr-chat">
      {channelLabel && <div className="vr-chat-channel">💬 Chat do {channelLabel}</div>}
      <div className="vr-chat-list">
        {messages.length === 0 && <div className="vr-chat-empty">Nenhuma mensagem ainda.</div>}
        {messages.map((m) => (
          <div className="vr-msg" key={m.id}>
            <div className="vr-msg-head">
              <span className="vr-msg-name">{m.sender_name}</span>
              <span className="vr-msg-time">{hhmm(m.created_at)}</span>
            </div>
            <div className="vr-msg-body">{m.message}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="vr-chat-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem…" />
        <button className="vr-send" type="submit">Enviar</button>
      </form>
    </div>
  );
}
