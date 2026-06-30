// Client portal API client — httpOnly cookie auth (no token in JS), same-origin.
const base = import.meta.env.VITE_API_BASE || "";

export async function clientApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}/api/client${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).detail ?? msg; } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : "erro");
  }
  return res.json();
}
