"""api-gateway — orquestador del flujo completo.

Es el único servicio expuesto al frontend. Orquesta el ciclo:

  1. Recibe la instrucción del usuario en lenguaje natural.
  2. Pide al vlm-service que mire por la cámara y describa la escena.
  3. Pide al llm-service que decida una acción coherente (orden + visión).
  4. Envía la acción al ros2-bridge para que mueva el carrito.
  5. Guarda todo el ciclo en el instruction-service (historial Mongo).

No contiene lógica de IA ni de ROS: solo coordina a los microservicios.
"""

from __future__ import annotations

import os

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

VLM_SERVICE_URL = os.environ.get("VLM_SERVICE_URL", "http://vlm-service:8000")
LLM_SERVICE_URL = os.environ.get("LLM_SERVICE_URL", "http://llm-service:8000")
INSTRUCTION_SERVICE_URL = os.environ.get(
    "INSTRUCTION_SERVICE_URL", "http://instruction-service:8000"
)
ROS2_BRIDGE_URL = os.environ.get("ROS2_BRIDGE_URL", "http://ros2-bridge:8001")

app = FastAPI(title="api-gateway")

# El frontend corre en otro origen (5173); habilitamos CORS para el navegador.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # en producción, restringe al dominio del frontend
    allow_methods=["*"],
    allow_headers=["*"],
)


class CommandRequest(BaseModel):
    """Instrucción del usuario en lenguaje natural (texto)."""

    text: str = Field(..., min_length=1, description="Orden en lenguaje natural")


class CommandResponse(BaseModel):
    """Resultado del ciclo completo, devuelto al frontend."""

    user_text: str
    vlm_observation: str
    action: dict
    executed: bool
    instruction_id: str | None = None


@app.get("/health")
async def health():
    """Comprueba que el gateway responde y reporta los servicios aguas abajo."""
    return {"status": "ok"}


@app.post("/command", response_model=CommandResponse)
async def command(req: CommandRequest) -> CommandResponse:
    """Ejecuta el ciclo completo para una instrucción del usuario."""
    async with httpx.AsyncClient(timeout=30.0) as http:
        # 1) Percepción: el VLM mira por la cámara y describe la escena.
        try:
            vlm_resp = await http.post(f"{VLM_SERVICE_URL}/observe")
            vlm_resp.raise_for_status()
            vlm_observation = vlm_resp.json()["observation"]
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"vlm-service falló: {exc}")

        # 2) Decisión: el LLM combina la orden + la observación visual.
        try:
            llm_resp = await http.post(
                f"{LLM_SERVICE_URL}/decide",
                json={"user_text": req.text, "vlm_observation": vlm_observation},
            )
            llm_resp.raise_for_status()
            action = llm_resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"llm-service falló: {exc}")

        # 3) Actuación: mandamos la acción al carrito vía ROS2.
        executed = False
        try:
            ros_resp = await http.post(
                f"{ROS2_BRIDGE_URL}/execute",
                json={
                    "linear": action["linear"],
                    "angular": action["angular"],
                    "duration_s": action["duration_s"],
                },
            )
            ros_resp.raise_for_status()
            executed = ros_resp.json().get("executed", False)
        except httpx.HTTPError as exc:
            # No abortamos: igual guardamos el ciclo marcando executed=False.
            # El carrito puede estar apagado pero el historial debe registrar el intento.
            executed = False
            _ = exc

        # 4) Persistencia: guardamos el ciclo completo en el historial.
        instruction_id: str | None = None
        try:
            save_resp = await http.post(
                f"{INSTRUCTION_SERVICE_URL}/instructions",
                json={
                    "user_text": req.text,
                    "vlm_observation": vlm_observation,
                    "action": {
                        "type": action["type"],
                        "linear": action["linear"],
                        "angular": action["angular"],
                        "duration_s": action["duration_s"],
                    },
                    "reasoning": action.get("reasoning"),
                    "executed": executed,
                },
            )
            save_resp.raise_for_status()
            instruction_id = save_resp.json().get("id")
        except httpx.HTTPError as exc:
            # El historial es importante pero no debe tumbar la respuesta al usuario.
            _ = exc

    return CommandResponse(
        user_text=req.text,
        vlm_observation=vlm_observation,
        action=action,
        executed=executed,
        instruction_id=instruction_id,
    )


@app.get("/history")
async def history(limit: int = 50, skip: int = 0):
    """Proxy al historial de instrucciones (para que el frontend lo consuma)."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        try:
            resp = await http.get(
                f"{INSTRUCTION_SERVICE_URL}/instructions",
                params={"limit": limit, "skip": skip},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"instruction-service falló: {exc}")


@app.post("/stop")
async def stop():
    """Parada de emergencia: envía una acción de stop inmediata al carrito."""
    async with httpx.AsyncClient(timeout=10.0) as http:
        try:
            resp = await http.post(
                f"{ROS2_BRIDGE_URL}/execute",
                json={"linear": 0.0, "angular": 0.0, "duration_s": 0.2},
            )
            resp.raise_for_status()
            return {"stopped": True}
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"no se pudo detener: {exc}")
