# AGENTS.md — Carrito RC Platform

## Architecture

Microservices platform controlling an ESP32 RC car via natural language. Full flow:
`Frontend → api-gateway:8080 → vlm-service → llm-service → ros2-bridge → micro-ros-agent → ESP32 (WiFi/UDP)` with `instruction-service` persisting to MongoDB Atlas.

- **6 Docker services** on shared `ros2net` bridge network (Docker Desktop on Windows).
- `ros2-bridge` exposes port **8001** (not 8000); others default to 8000.
- `api-gateway:8080` is the only service exposed to the frontend.
- `micro-ros-agent` publishes UDP 8888 via `ports` (not `network_mode:host` — Docker Desktop/WSL2 quirk).

## Services

| Service | Stack | Notes |
|---|---|---|
| `api-gateway` | FastAPI + httpx | Orchestrator; CORS `*` open |
| `vlm-service` | FastAPI + openai SDK | Captures camera frame → Gemini (VLM) |
| `llm-service` | FastAPI + openai SDK | Gemini structured output (JSON schema) |
| `instruction-service` | FastAPI + Motor | MongoDB Atlas via `motor` |
| `ros2-bridge` | ROS2 Jazzy + rclpy + FastAPI | System pip (not uv); sources `/opt/ros/jazzy/setup.bash` |
| `frontend` | React/Vite + pnpm | Built in Docker, served by nginx on port 80 |
| `micro-ros-agent` | Official `microros/micro-ros-agent:jazzy` image | |

## Dev Commands

```bash
# Full stack
docker compose up --build

# Single Python service (outside Docker)
cd services/<name>
uv run uvicorn app.main:app --reload --port 8000

# Frontend (outside Docker)
cd frontend
pnpm install
pnpm dev          # vite dev server on :5173

# ESP32 firmware (PlatformIO)
cd firmware
# Edit src/main.cpp: ssid, password, agent_ip first
pio run -t upload

# ESP32 firmware (Arduino IDE)
# Must install micro_ros_arduino from the `jazzy` branch on GitHub (ZIP).
# Version 2.0.8 from the main branch targets Humble, NOT Jazzy.
```

## Key Conventions

- **Python services**: FastAPI + `uv` (no pip). `pyproject.toml` with `[tool.uv] package = false` (no setup.py).
- **OpenRouter** as OpenAI-compatible API: `base_url="https://openrouter.ai/api/v1"`, `OPENROUTER_API_KEY` required.
- **LLM uses structured output** (`response_format: json_schema`) — action must match `ACTION_SCHEMA`.
- **Action model**: `{type, linear[-1,1], angular[-1,1], duration_s[0,10], reasoning}`. Differential mixing: `left = linear - angular`, `right = linear + angular`.
- **Camera**: `CAMERA_SNAPSHOT_URL` points to a JPEG snapshot endpoint (e.g., IP Webcam `http://ip:8080/shot.jpg`). IP Webcam uses **port 8080** by default, not 80.
- **OpenRouter model lifecycle**: Models can be deprecated (e.g., `google/gemini-2.0-flash-001` deprecated Jun 1, 2026). If "No endpoints found", update `OPENROUTER_MODEL` in `.env` to a current model (e.g., `google/gemini-2.5-flash`).
- **No tests, no lint config, no typecheck** exist in the repo.
- **Firmware watchdog**: ESP32 stops motors if no `/cmd_vel` received for ~1s.
- **micro-ROS init**: Do NOT use `rmw_uros_ping_agent` before `rclc_support_init` — it can corrupt the transport state. Use `set_microros_wifi_transports` + `delay(3000)` + `rclc_support_init` instead.
- **`.env` is in .gitignore** — template is `.env.example`.
- **L298N power**: Motor supply goes to **VS/12V terminal (7-12V)**, NOT the 5V logic terminal. 5V is insufficient for motors.
- **PWM frequency**: Use **500-1000Hz** for L298N DC motors. Higher frequencies (5000Hz) cause whining without rotation.
- **ESP32 ↔ L298N wiring**: `ENA=25, IN1=26, IN2=27, ENB=33, IN3=32, IN4=14`. Remove ENA/ENB jumpers. Share GND.

## Network (Windows + Docker Desktop)

- All services on `ros2net` (bridge) network; communicate by service name.
- `micro-ros-agent` port-maps `8888/udp` to host so ESP32 reaches it via PC's LAN IP (not WSL IP).
- If DDS discovery fails between `ros2-bridge` and `micro-ros-agent`, verify `ROS_DOMAIN_ID` matches (default `0`).
- `ros2-bridge` is reached by other services as `http://ros2-bridge:8001`.
