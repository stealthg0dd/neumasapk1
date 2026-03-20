# Neumas Backend

Intelligent inventory management API for hospitality properties.

## Overview

Neumas provides AI-powered inventory management for hotels, restaurants, and other hospitality businesses. The backend offers:

- **Vision-based scanning**: Analyze shelf photos to detect inventory items
- **Consumption patterns**: Learn usage patterns from historical data
- **Demand forecasting**: Predict future inventory needs
- **Smart shopping lists**: Auto-generate optimized procurement lists
- **Budget optimization**: Stay within budget while meeting needs

## Technology Stack

- **Framework**: FastAPI with async/await
- **Python**: 3.12+
- **Database**: Supabase (PostgreSQL)
- **Caching**: Redis
- **Task Queue**: Celery
- **AI/ML**: OpenAI, Anthropic
- **Logging**: structlog (JSON)
- **Validation**: Pydantic v2

## Quick Start

### Prerequisites

- Python 3.12+
- Redis
- Supabase account
- Docker & Docker Compose (for containerized deployment)

### Local Development

```bash
# Clone and setup
git clone https://github.com/neumas/neumas-backend.git
cd neumas-backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows

# Install dependencies
pip install -e ".[dev]"

# Copy environment file
cp .env.example .env
# Edit .env with your credentials

# Run development server
uvicorn app.main:app --reload
```

### Running with Docker

```bash
# Build and run all services (API, Redis, Celery)
docker-compose up -d

# Build and run only the API (requires external Redis)
docker-compose up -d app redis

# View logs
docker-compose logs -f app
docker-compose logs -f celery-worker

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

### Running Tests

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage report
pytest --cov=app --cov-report=html --cov-report=term-missing

# Run specific test file
pytest tests/test_auth.py -v

# Run tests matching a pattern
pytest -k "test_login" -v

# Run with verbose output
pytest -vvs
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`. All configuration is done via environment variables:

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin) | `eyJhbG...` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (public) | `eyJhbG...` |
| `SUPABASE_JWT_SECRET` | JWT secret for token validation | `your-jwt-secret` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |

#### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENV` | Environment (`dev`, `staging`, `prod`) | `dev` |
| `DEBUG` | Enable debug mode | `false` |
| `HOST` | Server bind host | `0.0.0.0` |
| `PORT` | Server bind port | `8000` |
| `WORKERS` | Gunicorn worker count | `4` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000` |
| `OPENAI_API_KEY` | OpenAI API key for vision | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key (fallback) | `sk-ant-...` |
| `GOOGLE_API_KEY` | Google AI API key (fallback) | `AIza...` |
| `CELERY_BROKER_URL` | Celery broker (defaults to REDIS_URL) | |
| `CELERY_RESULT_BACKEND` | Celery backend (defaults to REDIS_URL) | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT token expiry | `60` |

### Environment-Specific Behavior

| Feature | Development (`ENV=dev`) | Production (`ENV=prod`) |
|---------|------------------------|-------------------------|
| `/docs` | Public access | Admin auth required |
| `/redoc` | Public access | Admin auth required |
| `/openapi.json` | Public access | Admin auth required |
| Logging format | Colored console | JSON structured |
| Error details | Full stack traces | Generic messages |
| Debug mode | Enabled | Disabled |

## API Endpoints

### Health

- `GET /health` - Liveness check
- `GET /ready` - Readiness check with dependency status

### Authentication

- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/signup` - Create account
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user

### Scans

- `POST /api/scan/` - Create and process a scan
- `POST /api/scan/upload` - Get upload URLs for images
- `GET /api/scan/{id}` - Get scan details
- `GET /api/scan/{id}/results` - Get processed results
- `POST /api/scan/{id}/approve` - Approve and apply results

### Inventory

- `GET /api/inventory/` - List inventory items
- `POST /api/inventory/` - Create item
- `GET /api/inventory/{id}` - Get item details
- `PATCH /api/inventory/{id}` - Update item
- `POST /api/inventory/{id}/quantity` - Set quantity
- `POST /api/inventory/{id}/adjust` - Adjust quantity
- `GET /api/inventory/low-stock` - Get low stock items

### Predictions

- `POST /api/predictions/forecast` - Generate demand forecast
- `POST /api/predictions/stockouts` - Predict stockouts
- `POST /api/predictions/patterns/analyze` - Analyze consumption
- `GET /api/predictions/patterns/{item_id}` - Get item patterns

### Shopping

- `GET /api/shopping/` - List shopping lists
- `POST /api/shopping/` - Create manual list
- `POST /api/shopping/generate` - Auto-generate list
- `GET /api/shopping/{id}` - Get list details
- `POST /api/shopping/{id}/items` - Add item
- `POST /api/shopping/{id}/optimize` - Budget optimization

### Admin

- `GET /api/admin/stats` - System statistics
- `GET /api/admin/organizations` - List organizations
- `GET /api/admin/users` - List users

## Project Structure

```
neumas-backend/
├── app/
│   ├── api/
│   │   ├── deps.py          # Dependency injection
│   │   └── routes/          # API route handlers
│   ├── core/
│   │   ├── config.py        # Settings management
│   │   ├── security.py      # JWT, password hashing
│   │   ├── logging.py       # Structured logging
│   │   └── celery_app.py    # Celery configuration
│   ├── db/
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── supabase_client.py
│   │   └── repositories/    # Data access layer
│   ├── schemas/             # Pydantic models
│   ├── services/            # Business logic
│   │   ├── auth_service.py
│   │   ├── orchestration_service.py
│   │   ├── vision_agent.py
│   │   ├── pattern_agent.py
│   │   ├── predict_agent.py
│   │   ├── shopping_agent.py
│   │   └── budget_agent.py
│   └── main.py              # FastAPI application
├── tests/
├── docker-compose.yml
├── Dockerfile
└── pyproject.toml
```

## Testing

```bash
# Run all tests
pytest

# With coverage
pytest --cov=app --cov-report=html

# Specific test file
pytest tests/test_auth.py -v
```

## Smoke Test

The smoke test exercises the full MVP happy path against a running API instance. It requires no test framework — just `httpx`.

```bash
# Against a local server (default: http://localhost:8000)
python -m scripts.smoke_test

# Inside a running Docker container
docker exec -it <app-container> python -m scripts.smoke_test

# Against a remote instance
API_URL=https://staging.neumas.example.com python -m scripts.smoke_test
```

### What it tests

| Step | Endpoint | Assertion |
|------|----------|-----------|
| 0 | `GET /health` | `status == "healthy"` |
| 1 | `POST /api/auth/signup` | Returns `access_token` + `profile.org_id` + `profile.property_id` |
| 2 | `POST /api/auth/login` | Returns fresh `access_token` |
| 3 | `GET /api/inventory/` | 200, auth accepted |
| 4 | `POST /api/inventory/` | Item created (201) |
| 4b | `GET /api/inventory/` | "Milk 1L" present in list |
| 5 | `POST /api/predictions/forecast` | 200/202 (skipped if not yet implemented) |
| 6 | `POST /api/scan/upload` | Returns `scan_id` |
| 7 | `GET /api/scan/{id}/status` | Status field present (polls up to 60 s) |
| 8 | `POST /api/shopping-list/generate` | 200/202 |
| 9 | `GET /api/shopping-list/{id}` | List appears (non-fatal if Celery not running) |

Exits `0` on success, `1` on any `FAIL` step. `SKIP` steps are informational.

### Environment overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:8000` | Base URL of the running API |
| `SMOKE_EMAIL` | `neumas-smoke-<ts>@example.com` | Test account email |
| `SMOKE_PASSWORD` | `SmokeTest!999` | Test account password |
| `SMOKE_SCAN_POLLS` | `12` | Max polling iterations for scan completion |
| `SMOKE_POLL_SLEEP` | `5` | Seconds between poll attempts |

## Development

### Code Quality

```bash
# Format code
ruff format .

# Lint
ruff check .

# Type check
mypy app
```

### Pre-commit Hooks

```bash
pip install pre-commit
pre-commit install
```

## Deployment

### Production

The application is designed for deployment with Gunicorn + Uvicorn workers:

```bash
gunicorn app.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000
```

### Celery Workers

```bash
celery -A app.core.celery_app worker \
    --loglevel=info \
    --queues=neumas.default,neumas.scans,neumas.predictions,neumas.agents
```

## License

Proprietary - All rights reserved.
