import sys

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Measora API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False  # Must be explicitly set to True in local dev via .env

    DATABASE_URL: str = "postgresql://user:password@localhost/dbname"
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""

    SECRET_KEY: str = "your-supabase-jwt-secret-here"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 20

    # CORS — comma-separated origins; parsed in main.py
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,capacitor://localhost"

    # Base URL of the deployed frontend (used for shareable result links)
    FRONTEND_BASE_URL: str = "https://measora.io"

    SCALE_MISMATCH_THRESHOLD: float = 0.03
    SCALE_MISMATCH_PENALTY_MULTIPLIER: float = 1.5

    SIZE_MATCH_WEIGHTS: dict = {
        "shirt": {"chest": 0.5, "shoulder": 0.3, "waist": 0.2},
        "tshirt": {"chest": 0.5, "shoulder": 0.3, "waist": 0.2},
        "pant": {"waist": 0.5, "hip": 0.3, "inseam": 0.2},
        "footwear": {"foot_length": 1.0}
    }

    ENABLE_TRAINING_DATA_LOGGING: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

# Guard: fail fast if SECRET_KEY is still the placeholder value.
# This prevents the app from silently starting in production with no real secret.
_PLACEHOLDER = "your-supabase-jwt-secret-here"
if settings.SECRET_KEY == _PLACEHOLDER:
    print(
        "FATAL: SECRET_KEY is still set to the placeholder value. "
        "Set a real Supabase JWT secret in the .env file or deployment environment.",
        file=sys.stderr,
    )
    sys.exit(1)
