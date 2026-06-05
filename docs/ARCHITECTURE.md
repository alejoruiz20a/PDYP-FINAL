# Arquitectura

Este documento detalla las responsabilidades, contratos y decisiones de diseño de la plataforma.

## Principio: microservicios con responsabilidad única

Cada servicio hace **una cosa** y no conoce los detalles de los demás. Solo el `api-gateway`
sabe cómo encajan; el resto exponen una API pequeña y enfocada.

```
Usuario
  │  POST /command { text }
  ▼
api-gateway ──1──► vlm-service   POST /observe        → { observation }
            ──2──► llm-service   POST /decide         → { type, linear, angular, duration_s, reasoning }
            ──3──► ros2-bridge   POST /execute        → { executed }
            ──4──► instruction-service POST /instructions → { id, ... }
  ▲
  │  CommandResponse { vlm_observation, action, executed, instruction_id }
Usuario
```

## El flujo paso a paso

1. **Percepción (`vlm-service`).** El gateway pide `/observe`. El vlm-service descarga un frame
   JPEG del `CAMERA_SNAPSHOT_URL` (la cámara IP del celular) y lo manda a Gemini como imagen.
   Gemini devuelve una descripción en lenguaje natural orientada a navegación (obstáculos,
   espacio libre, posición de objetos). Esa descripción es el **contexto visual**.

2. **Decisión (`llm-service`).** El gateway pide `/decide` con la **orden del usuario** y la
   **observación del VLM**. El llm-service usa Gemini con **salida estructurada (JSON schema)**
   para forzar la forma de una acción válida. El prompt impone reglas de seguridad: no avanzar
   si hay obstáculo cercano, preferir `stop` ante peligro, magnitudes moderadas, etc.

3. **Actuación (`ros2-bridge`).** El gateway manda la acción a `/execute`. El bridge publica
   `geometry_msgs/Twist` en `/cmd_vel` a 20 Hz durante `duration_s` y luego publica un Twist en
   cero. El **micro-ROS agent** entrega esos mensajes al ESP32 por WiFi/UDP.

4. **Persistencia (`instruction-service`).** El gateway guarda el ciclo completo
   (orden + observación + acción + razonamiento + si se ejecutó) en MongoDB Atlas.

El gateway es **tolerante a fallos parciales**: si el carrito está apagado (falla `/execute`)
o Mongo no responde, igual devuelve al usuario lo que vio y decidió, registrando `executed=false`.

## Contrato de la acción

El "lenguaje" entre el LLM y el carrito es una acción discreta con duración:

```json
{
  "type": "forward | backward | left | right | stop",
  "linear": -1.0 a 1.0,     // velocidad lineal normalizada (avance/retroceso)
  "angular": -1.0 a 1.0,    // velocidad angular normalizada (giro)
  "duration_s": 0 a 10,     // cuánto tiempo mantener el movimiento
  "reasoning": "texto"      // justificación coherente con orden + visión
}
```

El firmware del ESP32 ([firmware/src/main.cpp](../firmware/src/main.cpp)) hace la **mezcla
diferencial**: `left = linear - angular`, `right = linear + angular`, y la convierte a PWM por
el L298N. Convención de signos:

- `forward`  → `linear > 0`, `angular = 0`
- `backward` → `linear < 0`, `angular = 0`
- `left`     → `angular > 0`
- `right`    → `angular < 0`
- `stop`     → todo en 0

## ¿Por qué micro-ROS y no HTTP directo al ESP32?

El ESP32 ya viene con **micro-ROS sobre WiFi**: no expone HTTP, sino que habla DDS con un
**micro-ROS agent** en el PC y se suscribe a `/cmd_vel`. Esto encaja con la decisión de usar
ROS2 como **capa intermedia de control**: el `ros2-bridge` traduce la decisión del LLM a la
semántica robótica estándar (`Twist` en `/cmd_vel`), y el agent se encarga del transporte.

Ventaja: si mañana quieres añadir odometría, sensores o teleop estándar, ya estás en el
ecosistema ROS2.

## Redes y Docker

- `micro-ros-agent` y `ros2-bridge` usan `network_mode: host` porque:
  - el **agent** necesita ser alcanzable por el ESP32 en la LAN (UDP 8888), y
  - **bridge y agent** deben compartir el mismo dominio DDS para descubrirse.
- El resto de servicios viven en la red por defecto de Docker Compose y se hablan por
  **nombre de servicio** (`http://vlm-service:8000`, etc.).
- El `api-gateway` alcanza al bridge (que está en host network) vía
  `host.docker.internal:8001`.

```
┌──────────────────── red docker (bridge) ────────────────────┐
│  api-gateway ── vlm-service ── llm-service ── instruction    │
└───────┬─────────────────────────────────────────────────────┘
        │ host.docker.internal:8001
        ▼
┌──────────────────── network_mode: host ─────────────────────┐
│  ros2-bridge  ◄──DDS──►  micro-ros-agent ◄──WiFi/UDP──► ESP32│
└──────────────────────────────────────────────────────────────┘
```

## Decisiones de diseño clave

| Decisión | Por qué |
| --- | --- |
| Gemini multimodal para VLM **y** LLM | Un solo proveedor; Gemini ve la imagen e interpreta. Menos piezas y latencia. |
| OpenRouter + SDK `openai` | OpenRouter es compatible con la API de OpenAI; reusamos un SDK maduro apuntando `base_url`. |
| Salida estructurada en el LLM | Garantiza una acción válida y parseable; evita texto libre ambiguo para mover motores. |
| Acción discreta con duración | Predecible y segura: el bridge publica N segundos y detiene; combina con el watchdog del firmware. |
| `uv` en servicios Python | Builds rápidos y reproducibles sin pip clásico. |
| Tolerancia a fallos en el gateway | El historial y la respuesta al usuario no dependen de que el carrito esté encendido. |

## Posibles extensiones

- Entrada de **voz** (Web Speech API en el navegador → texto al gateway). Hoy es solo texto.
- **Secuencias** de acciones (el LLM devuelve una lista de pasos que el bridge ejecuta en orden).
- **WebSocket** del bridge al frontend para feedback de telemetría en vivo.
- Stream de video embebido en la UI (hoy el VLM consume el snapshot por su cuenta).
