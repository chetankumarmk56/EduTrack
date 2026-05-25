# Use official lightweight Python image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose default FastAPI port
EXPOSE 8000

# Liveness probe — hits the lightweight /health endpoint (no DB required)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Default command. Gunicorn pre-fork master + UvicornWorker:
#   * Multiple workers so a CPU-bound stall in one (e.g. bcrypt) doesn't
#     block every other request on the pod.
#   * Pre-fork survives a panicking worker (master restarts it).
#   * Worker count + timeouts in backend/gunicorn_conf.py.
#
# Override with `command:` in docker-compose if you need a single
# uvicorn process for local debugging.
CMD ["gunicorn", "-c", "gunicorn_conf.py", "app.main:app"]

# DOCKER SCALING NOTES:
# 1. Build: docker build -t edutrack-backend .
# 2. Run: docker run -p 8001:8000 --env-file .env edutrack-backend
# 3. Scale: Use Docker Compose or Kubernetes to manage multiple replicas.
