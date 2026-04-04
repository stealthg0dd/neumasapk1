# neumas-health-agent

A lightweight health-monitoring sidecar for the Neumas platform.

## What it does

1. **Monitors** `neumas-backend` — polls `/health` on the configured interval.
2. **Registers** itself with the ctech router-system on startup.
3. **Sends heartbeats** to the router-system every `HEARTBEAT_INTERVAL_SECONDS` (default 5 min), reporting `ok` or `degraded` based on the last backend check.
4. **Exposes** its own `/health` endpoint so Railway keeps the container running.

## Local development

```bash
cd neumas-health-agent
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn main:app --reload --port 8001
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEUMAS_BACKEND_URL` | `https://neumas-production.up.railway.app` | Backend URL to monitor |
| `AGENT_OS_URL` | _(required)_ | ctech router-system base URL |
| `AGENT_OS_API_KEY` | _(required)_ | ctech API key |
| `HEARTBEAT_INTERVAL_SECONDS` | `300` | Check / heartbeat interval |
| `BASE_URL` | `http://localhost:8001` | Public URL of this service |
| `APP_VERSION` | `0.1.0` | Version reported to registry |
| `ENVIRONMENT` | `production` | Runtime environment |

## Railway deployment

The service is configured in `railway.toml` and built with Nixpacks.  
Set the env vars above in the Railway service settings.
