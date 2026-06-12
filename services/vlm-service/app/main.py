"""vlm-service — percepción visual del carrito.

Responsabilidad única: obtener un frame de la cámara IP del celular y
producir una descripción textual de lo que hay *frente al carrito*, usando
Gemini como VLM a través de OpenRouter (API compatible con OpenAI).

Esa descripción es el "contexto visual" que luego el llm-service usa para
decidir una acción coherente.
"""

from __future__ import annotations

import asyncio
import base64
import os

import httpx
from fastapi import FastAPI, HTTPException
from openai import OpenAI
from pydantic import BaseModel

# ----- Configuración desde entorno --------------------------------------
OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")
OPENROUTER_SITE_URL = os.environ.get("OPENROUTER_SITE_URL", "")
OPENROUTER_SITE_NAME = os.environ.get("OPENROUTER_SITE_NAME", "")
CAMERA_SNAPSHOT_URL = os.environ["CAMERA_SNAPSHOT_URL"]

# OpenRouter expone una API compatible con OpenAI: reusamos el SDK `openai`
# apuntando su base_url al endpoint de OpenRouter.
_extra_headers = {}
if OPENROUTER_SITE_URL:
    _extra_headers["HTTP-Referer"] = OPENROUTER_SITE_URL
if OPENROUTER_SITE_NAME:
    _extra_headers["X-Title"] = OPENROUTER_SITE_NAME

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
    default_headers=_extra_headers or None,
    timeout=120.0,
)

app = FastAPI(title="vlm-service")

# Prompt que guía al VLM. Pedimos una descripción útil para navegación:
# obstáculos, espacio libre, dirección de objetos relevantes.
VLM_SYSTEM_PROMPT = (
    "Eres el sistema de visión de un carrito a control remoto. Recibes la imagen "
    "de la cámara montada al frente del carrito. Describe de forma concisa y objetiva "
    "lo que hay frente al carrito, enfocándote en información útil para navegar: "
    "obstáculos y su posición (izquierda/centro/derecha), si hay espacio libre para "
    "avanzar, paredes, personas u objetos relevantes y hacia dónde están. "
    "No inventes nada que no se vea. Responde en español en 1-3 frases."
)


class Observation(BaseModel):
    """Descripción de la escena producida por el VLM."""

    observation: str
    model: str


async def _capture_frame() -> bytes:
    """Descarga un frame JPEG del endpoint de snapshot de la cámara IP."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            resp = await http.get(CAMERA_SNAPSHOT_URL)
            resp.raise_for_status()
            return resp.content
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="La cámara no respondió a tiempo. Verificá que esté encendida y conectada a la red WiFi.",
        )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo capturar la imagen de la cámara. Verificá que la IP sea correcta y que la cámara esté funcionando.",
        )


def _describe(image_bytes: bytes) -> str:
    """Envía la imagen a Gemini (VLM) y devuelve la descripción textual."""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:image/jpeg;base64,{b64}"
    try:
        completion = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[
                {"role": "system", "content": VLM_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "¿Qué hay frente al carrito ahora mismo?",
                        },
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
            max_tokens=300,
        )
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "timeout" in msg.lower() or "timed out" in msg.lower():
            hint = "La conexión a internet es muy lenta o no hay acceso a la API de IA."
        elif "401" in msg or "unauthorized" in msg.lower() or "api key" in msg.lower():
            hint = "La clave de API de OpenRouter no es válida. Revisá OPENROUTER_API_KEY en el .env."
        elif "429" in msg or "rate limit" in msg.lower() or "too many" in msg.lower():
            hint = "Demasiadas solicitudes a la IA. Esperá 10 segundos y probá de nuevo."
        elif "model" in msg.lower() and ("not found" in msg.lower() or "does not exist" in msg.lower() or "deprecated" in msg.lower()):
            hint = "El modelo de IA fue descontinuado. Actualizá OPENROUTER_MODEL en el .env."
        else:
            hint = f"Error al contactar la IA. Verificá que el WiFi tenga acceso a internet."
        raise HTTPException(status_code=502, detail=f"IA visual: {hint}")

    return (completion.choices[0].message.content or "").strip()


@app.get("/health")
async def health():
    return {"status": "ok", "model": OPENROUTER_MODEL}


@app.post("/observe", response_model=Observation)
async def observe() -> Observation:
    """Capta un frame de la cámara y devuelve la descripción del VLM."""
    frame = await _capture_frame()
    # _describe es síncrona (SDK openai bloqueante); la corremos en un hilo
    # para no bloquear el event loop de FastAPI.
    observation = await asyncio.to_thread(_describe, frame)
    return Observation(observation=observation, model=OPENROUTER_MODEL)
