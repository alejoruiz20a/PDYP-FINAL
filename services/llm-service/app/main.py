"""llm-service — decisión de acción del carrito.

Responsabilidad única: dada la instrucción del usuario (lenguaje natural) y la
observación del VLM (lo que ve la cámara), decidir UNA acción de movimiento
discreta y segura, coherente con ambas entradas.

Usa Gemini vía OpenRouter con salida estructurada (JSON schema) para garantizar
que la respuesta siempre tenga la forma de una acción válida para el carrito.
"""

from __future__ import annotations

import asyncio
import json
import os

from fastapi import FastAPI, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")
OPENROUTER_SITE_URL = os.environ.get("OPENROUTER_SITE_URL", "")
OPENROUTER_SITE_NAME = os.environ.get("OPENROUTER_SITE_NAME", "")

_extra_headers = {}
if OPENROUTER_SITE_URL:
    _extra_headers["HTTP-Referer"] = OPENROUTER_SITE_URL
if OPENROUTER_SITE_NAME:
    _extra_headers["X-Title"] = OPENROUTER_SITE_NAME

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
    default_headers=_extra_headers or None,
)

app = FastAPI(title="llm-service")

# --- Contrato de la acción que entiende el carrito ----------------------
# El firmware mezcla linear.x y angular.z en velocidades diferenciales.
#   forward  -> linear > 0, angular = 0
#   backward -> linear < 0, angular = 0
#   left     -> linear = 0, angular > 0  (giro a la izquierda)
#   right    -> linear = 0, angular < 0  (giro a la derecha)
#   stop     -> todo en 0
ACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {
            "type": "string",
            "enum": ["forward", "backward", "left", "right", "stop"],
            "description": "Acción de alto nivel a ejecutar",
        },
        "linear": {
            "type": "number",
            "description": "Velocidad lineal normalizada en [-1, 1]",
        },
        "angular": {
            "type": "number",
            "description": "Velocidad angular normalizada en [-1, 1]",
        },
        "duration_s": {
            "type": "number",
            "description": "Duración del movimiento en segundos (0 a 10)",
        },
        "reasoning": {
            "type": "string",
            "description": "Breve justificación coherente con la orden y lo que ve la cámara",
        },
    },
    "required": ["type", "linear", "angular", "duration_s", "reasoning"],
    "additionalProperties": False,
}

LLM_SYSTEM_PROMPT = (
    "Eres el controlador de un carrito a control remoto con tracción diferencial. "
    "Recibes (1) una instrucción del usuario en lenguaje natural y (2) la descripción "
    "de lo que la cámara frontal ve en este momento. Tu trabajo es decidir UNA acción "
    "de movimiento que cumpla la orden del usuario SIN chocar con lo que ve la cámara.\n\n"
    "Reglas de seguridad y coherencia:\n"
    "- Si el usuario pide avanzar pero la cámara reporta un obstáculo cercano al frente, "
    "no avances: detente o gira hacia el lado con espacio libre.\n"
    "- Velocidades normalizadas en [-1, 1]. Usa magnitudes moderadas (0.3-0.6) salvo que "
    "se pida ir rápido.\n"
    "- duration_s entre 0 y 10. Movimientos cortos (0.5-2 s) para giros, algo más para avances.\n"
    "- Convención: forward=linear>0; backward=linear<0; left=angular>0; right=angular<0; "
    "stop=todo 0.\n"
    "- Ante ambigüedad o peligro, prefiere 'stop'.\n"
    "Devuelve SOLO el objeto JSON con la acción."
)


class DecisionRequest(BaseModel):
    user_text: str = Field(..., description="Instrucción del usuario en lenguaje natural")
    vlm_observation: str = Field(..., description="Descripción de la escena por el VLM")


class Action(BaseModel):
    type: str
    linear: float = Field(..., ge=-1.0, le=1.0)
    angular: float = Field(..., ge=-1.0, le=1.0)
    duration_s: float = Field(..., ge=0.0, le=10.0)
    reasoning: str


@app.get("/health")
async def health():
    return {"status": "ok", "model": OPENROUTER_MODEL}


def _call_llm(user_content: str) -> str:
    """Llamada bloqueante al LLM (SDK openai). Devuelve el JSON crudo."""
    completion = client.chat.completions.create(
        model=OPENROUTER_MODEL,
        messages=[
            {"role": "system", "content": LLM_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "carrito_action",
                "strict": True,
                "schema": ACTION_SCHEMA,
            },
        },
        max_tokens=400,
    )
    return completion.choices[0].message.content or "{}"


@app.post("/decide", response_model=Action)
async def decide(req: DecisionRequest) -> Action:
    """Decide la acción combinando la orden del usuario y el contexto visual."""
    user_content = (
        f"Instrucción del usuario: {req.user_text}\n"
        f"Lo que ve la cámara frontal: {req.vlm_observation}\n"
        f"Decide la acción adecuada."
    )
    try:
        # SDK bloqueante -> hilo aparte para no bloquear el event loop.
        raw = await asyncio.to_thread(_call_llm, user_content)
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"el LLM no devolvió JSON válido: {exc}")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"error del LLM: {exc}")

    # Pydantic valida rangos; clamp defensivo por si el modelo se sale del schema
    data["linear"] = max(-1.0, min(1.0, float(data.get("linear", 0.0))))
    data["angular"] = max(-1.0, min(1.0, float(data.get("angular", 0.0))))
    data["duration_s"] = max(0.0, min(10.0, float(data.get("duration_s", 0.0))))
    return Action(**data)
