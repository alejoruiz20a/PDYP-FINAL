"""ros2-bridge — puente entre la decisión del LLM y el carrito vía ROS2.

Responsabilidad única: recibir una acción discreta por HTTP y traducirla a
mensajes geometry_msgs/Twist publicados en /cmd_vel durante una duración fija,
deteniéndose al final. El ESP32 (micro-ROS) está suscrito a /cmd_vel.

Modelo de control: "acción discreta con duración".
  - Publica Twist(linear.x, angular.z) a ~20 Hz durante `duration_s`.
  - El firmware ya tiene un watchdog (CMD_TIMEOUT_MS) que detiene el carrito si
    deja de recibir mensajes, así que la publicación periódica también actúa como
    "keep-alive" mientras dura la acción.

Corre un nodo rclpy en un hilo de fondo y una API FastAPI en el principal.
"""

from __future__ import annotations

import os
import threading
import time

import rclpy
import uvicorn
from fastapi import FastAPI
from geometry_msgs.msg import Twist
from pydantic import BaseModel, Field
from rclpy.node import Node

CMD_VEL_TOPIC = os.environ.get("CMD_VEL_TOPIC", "/cmd_vel")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "8001"))
PUBLISH_HZ = 20.0  # frecuencia de publicación mientras dura la acción


class CmdVelNode(Node):
    """Nodo ROS2 que publica Twist en /cmd_vel."""

    def __init__(self) -> None:
        super().__init__("ros2_bridge")
        self.publisher = self.create_publisher(Twist, CMD_VEL_TOPIC, 10)
        self.get_logger().info(f"ros2-bridge publicando en {CMD_VEL_TOPIC}")

    def publish_twist(self, linear: float, angular: float) -> None:
        msg = Twist()
        msg.linear.x = float(linear)
        msg.angular.z = float(angular)
        self.publisher.publish(msg)

    def execute_action(self, linear: float, angular: float, duration_s: float) -> None:
        """Publica la velocidad durante `duration_s` segundos y luego detiene."""
        period = 1.0 / PUBLISH_HZ
        deadline = time.monotonic() + duration_s
        while time.monotonic() < deadline:
            self.publish_twist(linear, angular)
            time.sleep(period)
        # Detención explícita al terminar
        self.publish_twist(0.0, 0.0)


# ----- Estado global del nodo (se inicializa en el lifespan) -------------
_node: CmdVelNode | None = None
_executor_thread: threading.Thread | None = None
# Serializa las acciones: no dejamos que dos órdenes se pisen los motores.
_action_lock = threading.Lock()


def _ros_spin(node: CmdVelNode) -> None:
    """Mantiene vivo el nodo ROS2 en un hilo de fondo."""
    rclpy.spin(node)


app = FastAPI(title="ros2-bridge")


class ActionRequest(BaseModel):
    linear: float = Field(0.0, ge=-1.0, le=1.0)
    angular: float = Field(0.0, ge=-1.0, le=1.0)
    duration_s: float = Field(0.0, ge=0.0, le=10.0)


@app.on_event("startup")
def _startup() -> None:
    global _node, _executor_thread
    rclpy.init()
    _node = CmdVelNode()
    _executor_thread = threading.Thread(target=_ros_spin, args=(_node,), daemon=True)
    _executor_thread.start()


@app.on_event("shutdown")
def _shutdown() -> None:
    if _node is not None:
        _node.publish_twist(0.0, 0.0)  # detener por si acaso
        _node.destroy_node()
    rclpy.shutdown()


@app.get("/health")
def health():
    return {"status": "ok", "topic": CMD_VEL_TOPIC, "ros_ok": rclpy.ok()}


@app.post("/execute")
def execute(req: ActionRequest):
    """Ejecuta la acción en el carrito publicando en /cmd_vel."""
    assert _node is not None, "nodo ROS2 no inicializado"
    # Lock: una acción a la vez. Si llega otra mientras se ejecuta, espera.
    with _action_lock:
        _node.execute_action(req.linear, req.angular, req.duration_s)
    return {
        "executed": True,
        "published": {
            "linear": req.linear,
            "angular": req.angular,
            "duration_s": req.duration_s,
        },
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=BRIDGE_PORT)
