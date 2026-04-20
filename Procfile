web: bash start.sh
worker: sh -c 'export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$(pwd)/neumas-backend" && cd neumas-backend && exec celery -A app.core.celery_app worker --loglevel=info --queues=neumas_default,scans,agents,neumas.predictions,neumas.shopping --concurrency=${CELERY_CONCURRENCY:-2} --pool=prefork'
