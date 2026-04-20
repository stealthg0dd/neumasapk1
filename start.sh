#!/usr/bin/env bash
set -euo pipefail

# Diagnostic: show what Railway actually resolved for Redis vars.
# If you see '${REDISPORT}' here, remove the manual Railway variable that
# references it and let the Redis plugin inject the raw values directly.
echo "[neumas] REDISHOST=${REDISHOST:-<unset>}" >&2
echo "[neumas] REDISPORT=${REDISPORT:-<unset>}" >&2
echo "[neumas] REDISUSER=${REDISUSER:-<unset>}" >&2
echo "[neumas] REDISPASSWORD=<redacted, len=${#REDISPASSWORD}>" >&2

# Make the installed package importable even if pip editable-install metadata
# isn't fully propagated in this Nixpacks environment.
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$(pwd)/neumas-backend"

cd neumas-backend

exec gunicorn app.main:app \
  --workers "${GUNICORN_WORKERS:-4}" \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT:-8000}" \
  --timeout "${GUNICORN_TIMEOUT:-120}" \
  --graceful-timeout 30 \
  --keep-alive 5 \
  --access-logfile - \
  --error-logfile - \
  --capture-output \
  --enable-stdio-inheritance
