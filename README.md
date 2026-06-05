# 🚗 Carrito RC inteligente — plataforma de gestión

Plataforma de microservicios para controlar un **carrito a control remoto (ESP32 + micro-ROS)**
mediante **instrucciones en lenguaje natural**. El sistema:

1. Recibe una orden en texto del usuario.
2. Mira por la **cámara del celular** y la interpreta con un **VLM** (Gemini).
3. Decide una acción de movimiento **coherente con la orden y con lo que ve**, usando un **LLM** (Gemini).
4. Mueve el carrito publicando en **ROS2** (`/cmd_vel`) a través de micro-ROS.
5. Guarda todo el ciclo en **MongoDB Atlas** como historial.

> LLM y VLM corren con **Gemini vía OpenRouter** (API compatible con OpenAI). Gemini es
> multimodal, así que el mismo proveedor cubre ver la imagen y decidir la acción.

---

## 🧩 Arquitectura

```
┌─────────────┐  texto (NL)   ┌──────────────┐
│  Frontend   │ ────────────► │ API Gateway  │  (único expuesto al navegador)
│ React/Vite  │ ◄──────────── │  FastAPI     │
└─────────────┘   resultado   └──────┬───────┘
                                      │ orquesta (HTTP interno)
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                              ▼
 ┌──────────────┐  describe   ┌──────────────┐  acción   ┌──────────────────┐
 │ vlm-service  │────────────►│ llm-service  │──────────►│  instruction-     │
 │ cámara IP +  │  escena     │ orden+visión │  decide   │  service (Mongo)  │
 │ Gemini (VLM) │             │ Gemini (LLM) │           └──────────────────┘
 └──────────────┘             └──────┬───────┘
                                     │ {linear, angular, duration_s}
                                     ▼
                              ┌──────────────┐  Twist /cmd_vel   ┌──────────────┐
                              │ ros2-bridge  │ ────────────────► │ micro-ros    │
                              │ rclpy + HTTP │   (DDS / UDP)     │ agent → ESP32│
                              └──────────────┘                   └──────────────┘
```

Cada caja es un microservicio independiente. Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
para el detalle de responsabilidades y contratos.

| Servicio              | Stack            | Responsabilidad                                  |
| --------------------- | ---------------- | ------------------------------------------------ |
| `api-gateway`         | FastAPI (uv)     | Orquesta el flujo; único expuesto al frontend    |
| `vlm-service`         | FastAPI + OpenAI SDK | Capta frame de la cámara IP y lo describe (VLM)  |
| `llm-service`         | FastAPI + OpenAI SDK | Decide la acción coherente (orden + visión)      |
| `instruction-service` | FastAPI + Motor  | Persiste el historial en MongoDB Atlas           |
| `ros2-bridge`         | ROS2 Jazzy + rclpy | Publica `Twist` en `/cmd_vel` por duración       |
| `micro-ros-agent`     | imagen oficial   | Puente micro-ROS ↔ ESP32 por WiFi/UDP            |
| `frontend`            | React + Vite     | UI de control y visualización del historial      |

---

## ⚙️ Requisitos

- **Docker** y **Docker Compose**
- Una **cuenta de OpenRouter** con API key → https://openrouter.ai/keys
- Un **cluster de MongoDB Atlas** (gratis sirve) con su cadena de conexión
- El **celular** con una app de cámara IP (ej. *IP Webcam* en Android) en la misma red
- El **ESP32** flasheado con el firmware de `firmware/` (micro-ROS sobre WiFi)
- Para desarrollo sin Docker: [`uv`](https://docs.astral.sh/uv/) (Python) y [`pnpm`](https://pnpm.io/) (frontend)

> ⚠️ **Red (Windows + Docker Desktop/WSL2):** el `micro-ros-agent` **publica** el puerto
> `8888/udp`, así Docker Desktop reenvía ese UDP desde Windows hacia el contenedor y el ESP32
> lo alcanza por la IP de tu PC (`agent_ip:8888`). Todos los servicios comparten la red docker
> `ros2net`; el agent y el `ros2-bridge` se descubren por DDS dentro de ella.
>
> Si el `ros2-bridge` no recibe los mensajes del agent (DDS multicast entre contenedores a
> veces falla), exporta en ambos `ROS_DOMAIN_ID` igual (ya lo hacen) y, si persiste, fuerza
> descubrimiento unicast con un `FASTRTPS_DEFAULT_PROFILES_FILE` — ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🚀 Puesta en marcha

### 1. Configura las variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y rellena al menos:

- `OPENROUTER_API_KEY`
- `MONGODB_URI`
- `CAMERA_SNAPSHOT_URL` — la URL del **snapshot** de tu cámara IP
  (en *IP Webcam* suele ser `http://<ip-del-celular>:8080/shot.jpg`)

### 2. Levanta toda la plataforma

```bash
docker compose up --build
```

Esto arranca: micro-ros-agent, ros2-bridge, los 3 servicios de IA/datos, el gateway y el frontend.

### 3. Flashea y enciende el carrito

1. En `firmware/src/main.cpp` ajusta **solo** estas líneas:
   - `ssid` / `password` → tu red WiFi (la misma del celular con la cámara).
   - `agent_ip` → la **IP de tu PC** en la red local. Averíguala con `ipconfig`
     en Windows; es la de tu adaptador `Ethernet`/`Wi-Fi` (algo como `192.168.1.35`),
     **no** las `172.x` de WSL.
   - `agent_port` → déjalo en `8888`.
   - El resto del archivo **no se toca**.
2. Flashea con PlatformIO (`pio run -t upload` desde `firmware/`) o el Arduino IDE.
3. Al encender, el ESP32 buscará el `micro-ros-agent` en `agent_ip:8888` y se
   suscribirá a `/cmd_vel`. En el monitor serie (115200 baudios) verás
   "Agente encontrado" → "Robot listo" cuando conecte.

### 4. Usa la plataforma

Abre **http://localhost:5173**, escribe una instrucción como
*"avanza con cuidado y si ves un obstáculo detente"* y envíala. Verás:

- lo que **vio la cámara** (VLM),
- la **acción decidida** (LLM) y si se ejecutó,
- el **razonamiento**,
- y el **historial** actualizándose.

El botón rojo **PARAR** es una parada de emergencia.

---

## 🔌 Endpoints del API Gateway

| Método | Ruta        | Descripción                                  |
| ------ | ----------- | -------------------------------------------- |
| POST   | `/command`  | Ejecuta el ciclo completo para una orden     |
| POST   | `/stop`     | Parada de emergencia                         |
| GET    | `/history`  | Historial de instrucciones (proxy a Mongo)   |
| GET    | `/health`   | Healthcheck                                  |

---

## 🛠️ Desarrollo sin Docker (opcional)

Cada servicio Python se ejecuta con `uv`:

```bash
cd services/llm-service
uv run uvicorn app.main:app --reload --port 8000
```

Frontend con `pnpm`:

```bash
cd frontend
pnpm install
pnpm dev
```

---

## 📁 Estructura

```
.
├── docker-compose.yml          # orquestación de todo
├── .env.example                # plantilla de configuración
├── services/
│   ├── api-gateway/            # orquestador (FastAPI + uv)
│   ├── vlm-service/            # visión (cámara IP + Gemini)
│   ├── llm-service/            # decisión de acción (Gemini)
│   ├── instruction-service/   # historial (MongoDB Atlas)
│   └── ros2-bridge/           # nodo ROS2 → /cmd_vel
├── frontend/                   # SPA React/Vite
├── firmware/                   # firmware ESP32 (micro-ROS)
└── docs/ARCHITECTURE.md        # detalle de arquitectura
```

---

## 🔒 Notas de seguridad

- El firmware tiene un **watchdog**: si deja de recibir `/cmd_vel` ~1 s, detiene los motores.
- El `llm-service` aplica **clamp** a las velocidades y prefiere `stop` ante ambigüedad o peligro.
- CORS está abierto (`*`) para desarrollo; **restríngelo** al dominio del frontend en producción.
- Nunca commitees tu `.env` (ya está en `.gitignore`).
