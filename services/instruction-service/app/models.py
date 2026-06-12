"""Modelos Pydantic del historial de instrucciones.

Una "instrucción" es el registro completo de un ciclo:
  petición del usuario -> lo que vio el VLM -> acción decidida por el LLM.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class Action(BaseModel):
    """Acción discreta de movimiento que ejecuta el carrito.

    El modelo de control es "acción discreta con duración": se publica
    Twist(linear.x, angular.z) durante `duration_s` segundos y luego se detiene.
    Valores normalizados en [-1, 1] como espera el firmware del ESP32.
    """

    type: str = Field(
        ...,
        description="Acción de alto nivel: forward | backward | left | right | stop",
    )
    linear: float = Field(0.0, ge=-1.0, le=1.0, description="Velocidad lineal normalizada")
    angular: float = Field(0.0, ge=-1.0, le=1.0, description="Velocidad angular normalizada")
    duration_s: float = Field(0.0, ge=0.0, le=10.0, description="Duración del movimiento")


class InstructionCreate(BaseModel):
    """Payload para crear un registro de instrucción en el historial.

    En la fase 1 (creación inmediata) solo se envía user_text y status.
    En la fase 2 (actualización por el pipeline) se llenan el resto.
    """

    user_text: str = Field(..., description="Instrucción en lenguaje natural del usuario")
    vlm_observation: Optional[str] = Field(None, description="Descripción de la escena por el VLM")
    action: Optional[Action] = Field(None, description="Acción decidida por el LLM")
    reasoning: Optional[str] = Field(None, description="Por qué el LLM eligió esta acción")
    executed: Optional[bool] = Field(None, description="Si la acción se envió al carrito con éxito")
    status: str = Field("pending", description="Estado: pending | processing | completed | failed")


class InstructionUpdate(BaseModel):
    """Payload para actualizar un registro existente (PATCH)."""

    vlm_observation: Optional[str] = None
    action: Optional[Action] = None
    reasoning: Optional[str] = None
    executed: Optional[bool] = None
    status: Optional[str] = None


class InstructionOut(InstructionCreate):
    """Instrucción tal como se devuelve desde la base de datos."""

    id: str = Field(..., description="ObjectId de Mongo como string")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
