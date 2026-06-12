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
    const body = await res.json().catch(() => null);
    const detail = body?.detail || `Error inesperado del servidor (código ${res.status})`;
    throw new Error(detail);
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

/** Obtiene la configuración de la cámara desde el gateway. */
export async function getCameraConfig() {
  const res = await fetch(`${BASE}/camera/config`);
  if (!res.ok) return null;
  return res.json();
}

/** Busca una instrucción individual por ID en el historial. */
export async function getInstruction(id) {
  const res = await fetch(`${BASE}/history?limit=50`);
  if (!res.ok) throw new Error(`Error al consultar historial (${res.status})`);
  const items = await res.json();
  return items.find((i) => i.id === id) || null;
}
