# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY frontend/ ./
RUN npm ci && npm run build

# Stage 2: Build Python venv
FROM almalinux:10 AS python-builder
RUN dnf install -y python3 python3-devel gcc && dnf clean all
WORKDIR /code
COPY requirements.txt .
RUN python3 -m venv venv && \
    venv/bin/pip install --upgrade pip && \
    venv/bin/pip install -r requirements.txt

# Stage 3: Runtime
FROM almalinux:10
RUN dnf install -y python3 && dnf clean all
ENV PYTHONPATH="."
ENV KVIZGAME_FRONTEND_DIR="/code/frontend"
WORKDIR /code
COPY --from=python-builder /code/venv ./venv
COPY kvizgame/ ./kvizgame/
COPY main.py .
COPY --from=frontend-builder /app/dist/ ./frontend/
ENTRYPOINT ["venv/bin/python", "main.py"]
