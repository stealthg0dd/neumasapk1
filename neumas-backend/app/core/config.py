"""
Application configuration using pydantic-settings.
Centralizes all environment variables and settings.
"""

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Environment
    ENV: Literal["local", "dev", "staging", "prod", "test"] = Field(
        default="local",
        description="Application environment",
    )
    DEBUG: bool = Field(default=False, description="Debug mode")

    # Base URL -- used by smoke_test and any outbound links (e.g. emails)
    BASE_URL: str = Field(
        default="http://localhost:8000",
        description="Public base URL of this deployment (no trailing slash)",
    )
    DEV_MODE: bool = Field(
        default=False,
        description=(
            "When True, replace all LLM calls with deterministic stubs. "
            "Lets you run the full pipeline without any API keys."
        ),
    )

    # Application
    APP_NAME: str = Field(default="Neumas API", description="Application name")
    APP_VERSION: str = Field(default="0.1.0", description="Application version")
    API_V1_PREFIX: str = Field(default="/api", description="API version prefix")

    # Server
    HOST: str = Field(default="0.0.0.0", description="Server host")
    PORT: int = Field(default=8000, description="Server port")
    WORKERS: int = Field(default=4, description="Number of Gunicorn workers")

    # CORS (comma-separated string in env, parsed to list)
    # Use "*" to allow all origins (development only).
    # In production set to your exact frontend URL, e.g.:
    #   CORS_ORIGINS=https://neumas-web.up.railway.app,https://neumas.app
    CORS_ORIGINS: str = Field(
        default="http://localhost:3000,http://localhost:8080,http://localhost:3001",
        description="Allowed CORS origins (comma-separated). Use * for all.",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS into a list."""
        if not self.CORS_ORIGINS:
            return ["*"]
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        return origins

    # Supabase (optional - app will start in degraded mode without these)
    SUPABASE_URL: str = Field(
        default="", description="Supabase project URL"
    )
    SUPABASE_SERVICE_ROLE_KEY: str = Field(
        default="", description="Supabase service role key for admin operations (bypasses RLS)"
    )
    SUPABASE_ANON_KEY: str = Field(
        default="", description="Supabase anon key for user-scoped RLS queries"
    )
    SUPABASE_JWT_SECRET: str = Field(
        default="", description="Supabase JWT secret for local token validation"
    )

    # Database (direct connection for SQLAlchemy)
    DATABASE_URL: str = Field(
        default="",
        description="PostgreSQL connection URL for SQLAlchemy",
    )

    # Redis — composite URL or individual Railway vars (whichever is available)
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )
    REDIS_PRIVATE_URL: str = Field(
        default="",
        description="Railway internal Redis URL (preferred over REDIS_URL when set)",
    )
    # Individual Railway Redis plugin vars — used to reconstruct the URL when
    # REDIS_PRIVATE_URL is missing or carries wrong/empty credentials.
    # REDISPORT is str (not int) because Railway can inject the literal text
    # "${REDISPORT}" when variable-substitution references are unresolved, and
    # pydantic would crash trying to cast that string to int.  We parse it
    # safely inside _resolved_redis_url using _safe_env().
    REDISHOST: str = Field(default="", description="Railway Redis host")
    REDISPORT: str = Field(default="6379", description="Railway Redis port (kept as str to survive unresolved Railway var-refs)")
    REDISPASSWORD: str = Field(default="", description="Railway Redis password")
    REDISUSER: str = Field(default="default", description="Railway Redis user")

    # Internal admin (insights generation, maintenance hooks)
    ADMIN_SECRET_KEY: str = Field(
        default="change-me",
        description="Secret for POST /api/insights/generate and similar internal endpoints",
    )

    # AI/LLM API Keys
    OPENAI_API_KEY: str = Field(default="", description="OpenAI API key")
    ANTHROPIC_API_KEY: str = Field(default="", description="Anthropic API key")
    GOOGLE_API_KEY: str = Field(default="", description="Google AI (Gemini) API key")

    # JWT Settings
    JWT_ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=60, description="Access token expiry in minutes"
    )

    # Celery
    CELERY_BROKER_URL: str = Field(
        default="", description="Celery broker URL (defaults to REDIS_URL)"
    )
    CELERY_RESULT_BACKEND: str = Field(
        default="", description="Celery result backend URL (defaults to REDIS_URL)"
    )
    CELERY_TASK_ALWAYS_EAGER: bool = Field(
        default=False,
        description=(
            "Run Celery tasks synchronously in-process. "
            "Automatically True when ENV=test so CI never needs a live broker."
        ),
    )

    @property
    def celery_always_eager(self) -> bool:
        """True in test env or when CELERY_TASK_ALWAYS_EAGER is set."""
        return self.CELERY_TASK_ALWAYS_EAGER or self.ENV == "test"

    # Agent OS / Router-system registration
    AGENT_OS_URL: str = Field(
        default="",
        description="Base URL of the agent OS (router-system) service. Leave empty to skip registration.",
    )
    AGENT_OS_API_KEY: str = Field(
        default="",
        description="API key for authenticating with the agent OS.",
    )

    # Sentry
    SENTRY_DSN: str = Field(
        default="",
        description="Sentry DSN for error tracking. Leave empty to disable Sentry.",
    )
    SENTRY_TRACES_SAMPLE_RATE: float = Field(
        default=0.1,
        description="Sentry performance tracing sample rate (0.0–1.0). Use 1.0 in dev.",
    )

    # Supabase Storage
    STORAGE_BUCKET_RECEIPTS: str = Field(
        default="scans",
        validation_alias=AliasChoices("STORAGE_BUCKET_RECEIPTS", "SUPABASE_SCANS_BUCKET"),
        description="Supabase Storage bucket name for receipt/scan images",
    )
    STORAGE_PUBLIC_RECEIPTS: bool = Field(
        default=False,
        validation_alias=AliasChoices("STORAGE_PUBLIC_RECEIPTS", "SCANS_PUBLIC_READ"),
        description=(
            "Serve receipt images via public URL instead of signed URLs. "
            "Set True only when the bucket is configured as public (dev convenience). "
            "Production should keep this False and use signed URLs."
        ),
    )
    STORAGE_SIGNED_URL_EXPIRY: int = Field(
        default=3600,
        description="Expiry in seconds for signed storage URLs (default: 1 hour)",
    )

    @staticmethod
    def _safe_env(key: str, default: str) -> str:
        """Read an env var and fall back to *default* if the value looks like an
        unresolved Railway variable reference (starts with '$') or is the literal
        string 'None'.  This prevents pydantic/urllib from choking on values such
        as '${REDISPORT}' that Railway injects when variable substitution hasn't
        been wired up in the dashboard.
        """
        import os as _os
        val = _os.getenv(key, default)
        if not val or val.startswith("$") or val == "None":
            return default
        return val

    @property
    def _resolved_redis_url(self) -> str:
        """Pick the best available Redis URL and normalise the scheme.

        Priority (Railway monorepo deployment):
        1. Individual vars (REDISHOST/REDISPORT/REDISPASSWORD) read via
           _safe_env() — immune to unresolved '${VAR}' Railway references.
        2. CELERY_BROKER_URL — explicit operator override.
        3. REDIS_PRIVATE_URL — Railway composite internal URL (may lack password).
        4. REDIS_URL — external composite URL / local-dev fallback.
        """
        from urllib.parse import quote_plus

        host = self._safe_env("REDISHOST", "")
        if host:
            port = self._safe_env("REDISPORT", "6379")
            raw_password = self._safe_env("REDISPASSWORD", "")
            password = quote_plus(raw_password) if raw_password else ""
            if password:
                url = f"redis://:{password}@{host}:{port}/0"
            else:
                url = f"redis://{host}:{port}/0"
        elif self.CELERY_BROKER_URL and not self.CELERY_BROKER_URL.startswith("$"):
            url = self.CELERY_BROKER_URL
        else:
            url = self.REDIS_PRIVATE_URL or self.REDIS_URL

        # Railway sometimes provides rediss:// (TLS). Celery needs redis://
        # on private networking where TLS termination is handled upstream.
        if url.startswith("rediss://"):
            url = "redis://" + url[len("rediss://"):]
        return url

    @property
    def redis_url_redacted(self) -> str:
        """Resolved Redis URL with the password masked — safe to log."""
        url = self._resolved_redis_url
        try:
            from urllib.parse import urlparse, urlunparse
            p = urlparse(url)
            if p.password:
                masked_netloc = f"{p.username}:***@{p.hostname}:{p.port}"
                url = urlunparse(p._replace(netloc=masked_netloc))
        except Exception:  # noqa: BLE001
            url = "<unparseable>"
        return url

    @property
    def celery_broker(self) -> str:
        return self._resolved_redis_url

    @property
    def celery_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self._resolved_redis_url

    @property
    def is_production(self) -> bool:
        return self.ENV == "prod"

    @property
    def is_development(self) -> bool:
        return self.ENV in ("local", "dev")


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Uses lru_cache to avoid re-reading environment on every call.
    """
    s = Settings()
    # Emit a single diagnostic line at process startup so Railway logs show
    # exactly which Redis URL was resolved and which source won.
    import sys
    source = (
        "individual-vars" if s.REDISHOST
        else "CELERY_BROKER_URL" if s.CELERY_BROKER_URL
        else "REDIS_PRIVATE_URL" if s.REDIS_PRIVATE_URL
        else "REDIS_URL"
    )
    print(
        f"[neumas] redis_url={s.redis_url_redacted!r} source={source!r}",
        file=sys.stderr,
        flush=True,
    )
    return s


settings = get_settings()
