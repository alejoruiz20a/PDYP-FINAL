"""api-gateway — orquestador del flujo completo.

Es el único servicio expuesto al frontend. Orquesta el ciclo:

   1. Recibe la instrucción del usuario en lenguaje natural.
   2. Guarda inmediatamente en instruction-service con status "pending".
   3. Procesa en background: VLM → LLM → ROS2.
   4. Actualiza el registro en instruction-service con el resultado.

No contiene lógica de IA ni de ROS: solo coordina a los microservicios.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

VLM_SERVICE_URL = os.environ.get("VLM_SERVICE_URL", "http://vlm-service:8000")
LLM_SERVICE_URL = os.environ.get("LLM_SERVICE_URL", "http://llm-service:8000")


def _extract_detail(exc: httpx.HTTPError) -> str:
    """Extrae el mensaje 'detail' del body de una respuesta HTTP error, si existe."""
    if hasattr(exc, "response") and exc.response is not None:
        try:
            body = exc.response.json()
            if isinstance(body, dict) and "detail" in body:
                return str(body["detail"])
        except Exception:
            pass
    return ""


def _user_hint(raw: str) -> str:
    """Traduce fragmentos de errores internos a mensajes para el usuario."""
    hints = [
        ("No endpoints found", "El modelo de IA fue descontinuado. Actualizá OPENROUTER_MODEL en el .env."),
        ("Insufficient credits", "La cuenta de OpenRouter no tiene créditos suficientes para usar la IA."),
        ("401", "Error de autenticación con la IA. Revisá OPENROUTER_API_KEY en el .env."),
        ("429", "Demasiadas solicitudes a la IA. Esperá unos segundos y probá de nuevo."),
    ]
    for key, hint in hints:
        if key in raw:
            return hint
    return "Revisá que el WiFi tenga acceso a internet y que los servicios estén funcionando."

INSTRUCTION_SERVICE_URL = os.environ.get(
    "INSTRUCTION_SERVICE_URL", "http://instruction-service:8000"
)
ROS2_BRIDGE_URL = os.environ.get("ROS2_BRIDGE_URL", "http://ros2-bridge:8001")
CAMERA_SNAPSHOT_URL = os.environ.get("CAMERA_SNAPSHOT_URL")

http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicializa el cliente HTTP compartido al arrancar."""
    global http_client
    http_client = httpx.AsyncClient(timeout=120.0)
    yield
    await http_client.aclose()


app = FastAPI(title="api-gateway", lifespan=lifespan)

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


@app.get("/camera/config")
async def camera_config():
    """Expone la URL de la cámara configurada para que el frontend la consuma."""
    return {"snapshot_url": CAMERA_SNAPSHOT_URL}


@app.get("/health")
async def health():
    """Comprueba que el gateway responde y reporta los servicios aguas abajo."""
    return {"status": "ok"}


@app.post("/command")
async def command(req: CommandRequest):
    """Ejecuta el ciclo completo para una instrucción del usuario.

    Fase 1 (inmediata): guarda en instruction-service con status "pending"
    y devuelve {id, user_text, status} al toque.

    Fase 2 (background): VLM → LLM → ROS2 → actualiza el registro.
    """
    # Fase 1: guardar inmediatamente con status "pending"
    try:
        save_resp = await http_client.post(
            f"{INSTRUCTION_SERVICE_URL}/instructions",
            json={"user_text": req.text, "status": "pending"},
        )
        save_resp.raise_for_status()
        saved = save_resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo registrar la instrucción: {exc}",
        )

    instruction_id = saved["id"]

    # Lanzar pipeline en background (no esperamos)
    asyncio.create_task(_process_pipeline(instruction_id, req.text))

    return {"id": instruction_id, "user_text": req.text, "status": "pending"}


async def _process_pipeline(instruction_id: str, user_text: str):
    """Ejecuta VLM → LLM → ROS2 en background y actualiza Mongo."""
    try:
        # Marcar como processing
        await http_client.patch(
            f"{INSTRUCTION_SERVICE_URL}/instructions/{instruction_id}",
            json={"status": "processing"},
        )

        # 1) Percepción: VLM
        vlm_resp = await http_client.post(f"{VLM_SERVICE_URL}/observe")
        vlm_resp.raise_for_status()
        vlm_observation = vlm_resp.json()["observation"]

        # 2) Decisión: LLM
        llm_resp = await http_client.post(
            f"{LLM_SERVICE_URL}/decide",
            json={"user_text": user_text, "vlm_observation": vlm_observation},
        )
        llm_resp.raise_for_status()
        action = llm_resp.json()

        # 3) Actuación: ROS2
        executed = False
        try:
            ros_resp = await http_client.post(
                f"{ROS2_BRIDGE_URL}/execute",
                json={
                    "linear": action["linear"],
                    "angular": action["angular"],
                    "duration_s": action["duration_s"],
                },
            )
            ros_resp.raise_for_status()
            executed = ros_resp.json().get("executed", False)
        except httpx.HTTPError:
            executed = False

        # Actualizar Mongo con resultado exitoso
        await http_client.patch(
            f"{INSTRUCTION_SERVICE_URL}/instructions/{instruction_id}",
            json={
                "status": "completed",
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
    except httpx.TimeoutException:
        try:
            await http_client.patch(
                f"{INSTRUCTION_SERVICE_URL}/instructions/{instruction_id}",
                json={"status": "failed", "vlm_observation": "Error: la IA tardó demasiado en responder."},
            )
        except httpx.HTTPError:
            pass
    except Exception as exc:
        detail = _extract_detail(exc) if isinstance(exc, httpx.HTTPError) else str(exc)
        try:
            await http_client.patch(
                f"{INSTRUCTION_SERVICE_URL}/instructions/{instruction_id}",
                json={"status": "failed", "vlm_observation": f"Error: {detail}"},
            )
        except httpx.HTTPError:
            pass


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
