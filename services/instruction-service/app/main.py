"""instruction-service — historial de instrucciones en MongoDB Atlas.

Microservicio FastAPI con un único responsable: persistir y consultar el
historial de instrucciones. No conoce nada del LLM, VLM ni ROS2.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient

from .models import InstructionCreate, InstructionOut

MONGODB_URI = os.environ["MONGODB_URI"]
MONGODB_DB = os.environ.get("MONGODB_DB", "carrito_rc")
COLLECTION = "instructions"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Abre la conexión a Mongo al arrancar y la cierra al terminar."""
    app.state.client = AsyncIOMotorClient(MONGODB_URI)
    app.state.db = app.state.client[MONGODB_DB]
    # Índice por fecha para listar el historial eficientemente (más reciente primero)
    await app.state.db[COLLECTION].create_index("created_at")
    yield
    app.state.client.close()


app = FastAPI(title="instruction-service", lifespan=lifespan)


def _serialize(doc: dict) -> dict:
    """Convierte el _id de Mongo (ObjectId) a string para Pydantic."""
    doc["id"] = str(doc.pop("_id"))
    return doc


@app.get("/health")
async def health():
    """Verifica que Mongo responde (ping)."""
    try:
        await app.state.client.admin.command("ping")
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"mongo no disponible: {exc}")


@app.post("/instructions", response_model=InstructionOut, status_code=201)
async def create_instruction(payload: InstructionCreate) -> InstructionOut:
    """Guarda un ciclo de instrucción y lo devuelve con su id y timestamp."""
    doc = payload.model_dump()
    out = InstructionOut(id="placeholder", **doc)  # genera created_at
    to_insert = out.model_dump(exclude={"id"})
    result = await app.state.db[COLLECTION].insert_one(to_insert)
    saved = await app.state.db[COLLECTION].find_one({"_id": result.inserted_id})
    return InstructionOut(**_serialize(saved))


@app.get("/instructions", response_model=list[InstructionOut])
async def list_instructions(
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
) -> list[InstructionOut]:
    """Lista el historial, más reciente primero, con paginación simple."""
    cursor = (
        app.state.db[COLLECTION]
        .find()
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    return [InstructionOut(**_serialize(doc)) async for doc in cursor]
