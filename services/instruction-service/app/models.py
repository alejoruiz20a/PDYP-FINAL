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
    """Payload para guardar un ciclo de instrucción en el historial."""

    user_text: str = Field(..., description="Instrucción en lenguaje natural del usuario")
    vlm_observation: str = Field(..., description="Descripción de la escena por el VLM")
    action: Action = Field(..., description="Acción decidida por el LLM")
    reasoning: Optional[str] = Field(None, description="Por qué el LLM eligió esta acción")
    executed: bool = Field(False, description="Si la acción se envió al carrito con éxito")


class InstructionOut(InstructionCreate):
    """Instrucción tal como se devuelve desde la base de datos."""

    id: str = Field(..., description="ObjectId de Mongo como string")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
