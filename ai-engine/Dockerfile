# AI Engine — Cloud Run deployment image (Phase 3 ops fix)
# Deterministic Dockerfile so `gcloud run deploy --source .` uses Docker instead
# of Google's Python buildpack, which tried to fetch a runtime image for the
# exact pin in .python-version (3.11.9) that isn't in the serverless-runtimes
# registry → MANIFEST_UNKNOWN build failure. python:3.11-slim comes from Docker
# Hub and always resolves.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Install runtime dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Application code only (tests, venv, .env are excluded via .dockerignore).
COPY app ./app

# Cloud Run sets $PORT (default 8080). Bind to it; fall back to 8080 locally.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
