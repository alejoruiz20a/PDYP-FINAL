// Cliente del API Gateway. La URL se inyecta en build via VITE_API_GATEWAY_URL.
const BASE = import.meta.env.VITE_API_GATEWAY_URL || "http://localhost:8080";

/** Envía una instrucción en lenguaje natural y devuelve el ciclo completo. */
export async function sendCommand(text) {
  const res = await fetch(`${BASE}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gateway ${res.status}: ${detail}`);
  }
  return res.json();
}

/** Parada de emergencia. */
export async function emergencyStop() {
  const res = await fetch(`${BASE}/stop`, { method: "POST" });
  if (!res.ok) throw new Error(`No se pudo detener (${res.status})`);
  return res.json();
}

/** Trae el historial de instrucciones. */
export async function getHistory(limit = 30) {
  const res = await fetch(`${BASE}/history?limit=${limit}`);
  if (!res.ok) throw new Error(`No se pudo cargar el historial (${res.status})`);
  return res.json();
}
