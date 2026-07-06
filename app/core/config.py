from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Measora API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = "postgresql://user:password@localhost/dbname"
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""

    SECRET_KEY: str = "your-supabase-jwt-secret-here"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 20

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
