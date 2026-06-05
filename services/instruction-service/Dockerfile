# instruction-service — imagen con uv
FROM python:3.12-slim

# Instala uv (gestor de paquetes/entorno) copiándolo de la imagen oficial
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copia primero los manifiestos para aprovechar la cache de capas
COPY pyproject.toml ./

# Crea el entorno e instala dependencias (sin instalar el proyecto como paquete)
RUN uv sync --no-install-project

# Copia el código de la aplicación
COPY app ./app

EXPOSE 8000

# Arranca uvicorn dentro del entorno gestionado por uv
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
