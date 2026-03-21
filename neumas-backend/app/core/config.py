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
    ENV: Literal["local", "dev", "staging", "prod"] = Field(
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

    # Redis
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
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

    @property
    def celery_broker(self) -> str:
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def celery_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL

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
    return Settings()


settings = get_settings()
