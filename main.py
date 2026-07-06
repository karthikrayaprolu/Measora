"""
Measora API — FastAPI Application Entry Point
Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8000
Docs at:  http://localhost:8000/docs
"""
import os

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import Base, engine, get_db, SessionLocal
from app.db import models  # noqa: F401 — ensures all models are registered
from app.db.seed import seed_brands

from app.routers import (
    admin,
    brands,
    estimates,
    footwear,
    frames,
    products,
    profile,
    result,
    sessions,
    size_recommendation,
)

# ─── App init ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Measora body-measurement API: AI-powered size recommendation from photos. "
        "Implements a full pipeline: Live Capture → Fast Tier (RTMW + HybrIK) → "
        "Accurate Tier (SMPLify-X) → ISO 8559-1 measurements → Brand size mapping."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ─── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    # Create all DB tables
    Base.metadata.create_all(bind=engine)

    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Seed initial brand and size-chart data
    db = SessionLocal()
    try:
        seed_brands(db)
    finally:
        db.close()


# ─── Health check ──────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


# ─── Include all REST routers under /v1 ───────────────────────────────────────
PREFIX = "/v1"

app.include_router(products.router, prefix=PREFIX)
app.include_router(sessions.router, prefix=PREFIX)
app.include_router(frames.router, prefix=PREFIX)
app.include_router(estimates.router, prefix=PREFIX)
app.include_router(footwear.router, prefix=PREFIX)
app.include_router(size_recommendation.router, prefix=PREFIX)
app.include_router(result.router, prefix=PREFIX)
app.include_router(profile.router, prefix=PREFIX)
app.include_router(brands.router, prefix=PREFIX)
app.include_router(admin.router, prefix=PREFIX)


# ─── WebSocket endpoint ────────────────────────────────────────────────────────
# Removed Live Guidance WebSocket logic for 2-photo flow
