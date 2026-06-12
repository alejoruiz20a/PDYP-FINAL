# Plan: Mostrar instrucción en frontend antes de ejecutar

## Problema
El flujo actual es síncrono: Frontend → VLM → LLM → ROS2 (carro se mueve) → Mongo → Frontend. El carro se mueve antes de que el frontend muestre la instrucción.

## Solución
Dividir `POST /command` en dos fases:
1. **Fase 1 (inmediata)**: Guardar en Mongo con `status: "pending"`, devolver `{id, status}` al toque
2. **Fase 2 (background)**: VLM → LLM → ROS2 → actualizar Mongo con resultado

---

## Archivos a modificar

### 1. `services/instruction-service/app/models.py`

- Agregar campo `status: str = "pending"` a `InstructionCreate`
- Hacer `vlm_observation`, `action`, `reasoning`, `executed` opcionales
- Agregar `class InstructionUpdate(BaseModel)` con los campos actualizables

```python
class InstructionCreate(BaseModel):
    user_text: str
    vlm_observation: Optional[str] = None
    action: Optional[Action] = None
    reasoning: Optional[str] = None
    executed: Optional[bool] = None
    status: str = "pending"  # pending | processing | completed | failed


class InstructionUpdate(BaseModel):
    vlm_observation: Optional[str] = None
    action: Optional[Action] = None
    reasoning: Optional[str] = None
    executed: Optional[bool] = None
    status: Optional[str] = None
```

### 2. `services/instruction-service/app/main.py`

Agregar endpoint `PATCH /instructions/{id}`:

```python
@app.patch("/instructions/{id}", response_model=InstructionOut)
async def update_instruction(id: str, payload: InstructionUpdate) -> InstructionOut:
    from bson import ObjectId
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "No hay campos para actualizar")
    result = await app.state.db[COLLECTION].find_one_and_update(
        {"_id": ObjectId(id)},
        {"$set": update},
        return_document=True,
    )
    if result is None:
        raise HTTPException(404, "Instrucción no encontrada")
    return InstructionOut(**_serialize(result))
```

Importar `ObjectId` de `bson`.

### 3. `services/api-gateway/app/main.py`

Reestructurar `POST /command`:

```python
from contextlib import asynccontextmanager
import asyncio

# Variable global para el cliente HTTP compartido
http_client: httpx.AsyncClient | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=120.0)
    yield
    await http_client.aclose()

# Asignar lifespan a la app
app = FastAPI(title="api-gateway", lifespan=lifespan)

@app.post("/command")
async def command(req: CommandRequest):
    global http_client
    
    # Fase 1: guardar inmediatamente con status "pending"
    try:
        save_resp = await http_client.post(
            f"{INSTRUCTION_SERVICE_URL}/instructions",
            json={"user_text": req.text, "status": "pending"},
        )
        save_resp.raise_for_status()
        saved = save_resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo guardar la instrucción: {exc}")
    
    instruction_id = saved["id"]
    
    # Lanzar pipeline en background
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
        
        # 1) VLM
        vlm_resp = await http_client.post(f"{VLM_SERVICE_URL}/observe")
        vlm_resp.raise_for_status()
        vlm_observation = vlm_resp.json()["observation"]
        
        # 2) LLM
        llm_resp = await http_client.post(
            f"{LLM_SERVICE_URL}/decide",
            json={"user_text": user_text, "vlm_observation": vlm_observation},
        )
        llm_resp.raise_for_status()
        action = llm_resp.json()
        
        # 3) ROS2
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
        await http_client.patch(
            f"{INSTRUCTION_SERVICE_URL}/instructions/{instruction_id}",
            json={"status": "failed", "vlm_observation": "Error: tiempo de espera agotado"},
        )
    except Exception as exc:
        detail = str(exc)
        try:
            await http_client.patch(
                f"{INSTRUCTION_SERVICE_URL}/instructions/{instruction_id}",
                json={"status": "failed", "vlm_observation": f"Error: {detail}"},
            )
        except httpx.HTTPError:
            pass
```

También eliminar el `response_model=CommandResponse` del decorador y cambiar el tipo de retorno.

### 4. `frontend/src/lib/api.js`

`sendCommand` ahora devuelve `{id, user_text, status}` inmediatamente:

```js
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
  return res.json();  // ahora devuelve {id, user_text, status}
}
```

Agregar función auxiliar para obtener una instrucción individual:

```js
export async function getInstruction(id) {
  const res = await fetch(`${BASE}/history?limit=1`);
  if (!res.ok) throw new Error(`Error al consultar instrucción (${res.status})`);
  const items = await res.json();
  return items.find(i => i.id === id) || null;
}
```

### 5. `frontend/src/App.jsx`

Cambios principales:

```jsx
// En el estado:
const [pendingIds, setPendingIds] = useState(new Set());

// En onSubmit:
async function onSubmit(e) {
  e.preventDefault();
  if (!text.trim() || loading) return;
  setLoading(true);
  setError(null);
  const userText = text.trim();
  setText("");
  try {
    const result = await sendCommand(userText);
    // Agregar al historial inmediatamente
    const pendingItem = {
      id: result.id,
      user_text: userText,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    setHistory(prev => [pendingItem, ...prev]);
    setPendingIds(prev => new Set(prev).add(result.id));
    setLast({ ...pendingItem, status: "pending" });
    inputRef.current?.focus();
  } catch (err) {
    setError(err.message);
    setText(userText);
  } finally {
    setLoading(false);
  }
}

// Polling para items pendientes:
const hasPending = pendingIds.size > 0;

useEffect(() => {
  if (!hasPending) return;
  const interval = setInterval(async () => {
    try {
      const fresh = await getHistory(30);
      setHistory(fresh);
      // Verificar si items pendientes ya se completaron
      const stillPending = new Set(pendingIds);
      for (const item of fresh) {
        if (pendingIds.has(item.id) && (item.status === "completed" || item.status === "failed")) {
          stillPending.delete(item.id);
          if (last?.id === item.id) setLast(item);
        }
      }
      setPendingIds(stillPending);
    } catch (e) {
      console.warn(e);
    }
  }, 3000);
  return () => clearInterval(interval);
}, [hasPending, pendingIds, last?.id]);

// En el render del historial, mostrar diferente según status:
{
  history.map((item) => (
    <li key={item.id} className={`history-item${item.status === "pending" ? " pending" : ""}${item.status === "failed" ? " failed" : ""}`}>
      <span className="history-glyph">
        {item.status === "pending" ? "⏳" : item.status === "failed" ? "❌" : (ACTION_GLYPH[item.action?.type] ?? "?")}
      </span>
      <div className="history-body">
        <span className="hi-user">{item.user_text}</span>
        {item.status === "pending" && <p className="hi-status">Procesando instrucción…</p>}
        {item.status === "failed" && <p className="hi-status error">{item.vlm_observation || "Error al procesar"}</p>}
        {item.status === "completed" && <p className="hi-vlm">{item.vlm_observation}</p>}
        <time>{new Date(item.created_at).toLocaleTimeString()}</time>
      </div>
    </li>
  ))
}
```

### 6. CSS: `frontend/src/index.css`

Agregar estilos para items pending/failed:

```css
.history-item.pending {
  opacity: 0.7;
}
.history-item.failed {
  border-left: 3px solid #ef4444;
}
.hi-status {
  font-size: 0.85rem;
  color: #f59e0b;
  margin: 2px 0;
}
.hi-status.error {
  color: #ef4444;
}
```

---

## Rebuild

```bash
docker compose up -d --build instruction-service api-gateway frontend
```
