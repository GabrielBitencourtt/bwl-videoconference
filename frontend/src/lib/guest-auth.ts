// Identidade do participante-convidado (guest), preenchida por VideoRoom ao entrar.
// O guestSdk envia isto como X-User-* para autenticar ações quando o convidado é
// promovido a MODERADOR (o backend confere no conjunto de moderadores da sala).
export const guestAuth = { id: "", name: "" };
