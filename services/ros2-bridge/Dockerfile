# ros2-bridge — usa la imagen oficial de ROS2 Jazzy (incluye rclpy y geometry_msgs)
FROM ros:jazzy-ros-base

# Dependencias HTTP. rclpy/geometry_msgs ya vienen en la imagen de ROS.
# Usamos el python del sistema (gestionado por ROS); --break-system-packages
# es necesario en imágenes Debian recientes con PEP 668.
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip \
    && pip3 install --no-cache-dir --break-system-packages \
        "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.7" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY app ./app

EXPOSE 8001

# Hacemos source del entorno ROS2 y arrancamos el bridge.
# `exec` para que las señales (SIGTERM de docker) lleguen al proceso python.
CMD ["bash", "-c", "source /opt/ros/jazzy/setup.bash && exec python3 -m app.main"]
