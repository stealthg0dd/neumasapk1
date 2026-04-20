#!/usr/bin/env bash
set -euo pipefail

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
