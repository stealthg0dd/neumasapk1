#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SENDGRID_API_KEY:-}" ]]; then
  echo "WARNING SENDGRID_API_KEY not set — weekly digest emails will not send" >&2
fi

celery -A app.core.celery_app worker \
  --loglevel=info \
  --queues=neumas_default,scans,agents,neumas.predictions,neumas.shopping,alerts,reports,evaluation \
  --concurrency="${CELERY_CONCURRENCY:-2}" &
worker_pid="$!"

celery -A app.core.celery_app beat \
  --loglevel=info \
  --schedule=./celerybeat-schedule &
beat_pid="$!"

trap 'kill "$worker_pid" "$beat_pid" 2>/dev/null || true' TERM INT
wait -n "$worker_pid" "$beat_pid"
exit_code="$?"
kill "$worker_pid" "$beat_pid" 2>/dev/null || true
exit "$exit_code"
