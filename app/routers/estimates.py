"""
POST /v1/sessions/{session_id}/fast-estimate      — trigger Fast Tier
GET  /v1/sessions/{session_id}/fast-estimate      — retrieve Fast Tier result
POST /v1/sessions/{session_id}/accurate-estimate  — trigger Accurate Tier
GET  /v1/sessions/{session_id}/accurate-estimate  — retrieve Accurate Tier result
REQ-200-01 → REQ-200-08, REQ-300-01 → REQ-300-09
"""
import os
import shutil
import threading

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import SessionNotFoundError
from app.core.security import get_current_user
from app.db.database import get_db, SessionLocal
from app.db import models
from app.schemas.common import JobStatus
from app.schemas.estimate import (
    AccurateEstimateResponse,
    FastEstimateResponse,
    JobAcceptedResponse,
    MeasurementEntry,
    RoughMeasurement,
    TriggerEstimateRequest,
)
from app.services.fast_tier_service import run_fast_estimate
from app.services.accurate_tier_service import run_accurate_estimate

router = APIRouter(prefix="/sessions", tags=["Estimates"])


def _bg_fast(session_id: str):
    """Thin wrapper that opens its own DB session for the background thread."""
    db = SessionLocal()
    try:
        run_fast_estimate(session_id, db)
    finally:
        db.close()


def _bg_accurate(session_id: str):
    db = SessionLocal()
    try:
        run_accurate_estimate(session_id, db)
    finally:
        db.close()
        # Delete uploaded images once processing is complete
        upload_dir = os.path.join(settings.UPLOAD_DIR, session_id)
        if os.path.exists(upload_dir):
            try:
                shutil.rmtree(upload_dir)
            except Exception:
                pass


# ─────────────────────────── FAST TIER ────────────────────────────────────────

@router.post(
    "/{session_id}/fast-estimate",
    response_model=JobAcceptedResponse,
    status_code=202,
)
def trigger_fast_estimate(
    session_id: str,
    payload: TriggerEstimateRequest = TriggerEstimateRequest(),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trigger the Fast Tier pipeline (RTMW → SAM2 → HybrIK/CLIFF → scale → size label).
    Returns 202 immediately; poll GET endpoint for result.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    # Idempotent: reuse existing job if already queued/complete
    existing = next(
        (j for j in session.jobs if j.job_type == "fast_estimate"), None
    )
    if existing and existing.status == "complete":
        return JobAcceptedResponse(
            job_id=existing.id,
            status=JobStatus.complete,
            estimated_seconds=0,
        )

    if existing is None:
        job = models.Job(
            session_id=session_id,
            job_type="fast_estimate",
            status="queued",
            estimated_seconds=2,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
    else:
        job = existing

    # Run in background thread (avoids blocking the event loop)
    t = threading.Thread(target=_bg_fast, args=(session_id,), daemon=True)
    t.start()

    return JobAcceptedResponse(
        job_id=job.id,
        status=JobStatus.queued,
        estimated_seconds=2,
    )


@router.get("/{session_id}/fast-estimate", response_model=FastEstimateResponse)
def get_fast_estimate(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Poll / retrieve the Fast Tier result.
    Returns the estimated size and rough measurements when ready.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    job = next((j for j in session.jobs if j.job_type == "fast_estimate"), None)

    if job is None or job.status == "queued":
        return FastEstimateResponse(status=JobStatus.queued)
    if job.status == "processing":
        return FastEstimateResponse(status=JobStatus.processing)
    if job.status == "failed":
        return FastEstimateResponse(status=JobStatus.failed)

    result = job.get_result()
    rough = result.get("rough_measurements_cm", {})

    return FastEstimateResponse(
        status=JobStatus.complete,
        tier="fast",
        label="Estimated size",
        size=result.get("size"),
        rough_measurements_cm=RoughMeasurement(**rough) if rough else None,
        processing_time_ms=result.get("processing_time_ms"),
    )


# ─────────────────────────── ACCURATE TIER ────────────────────────────────────

@router.post(
    "/{session_id}/accurate-estimate",
    response_model=JobAcceptedResponse,
    status_code=202,
)
def trigger_accurate_estimate(
    session_id: str,
    payload: TriggerEstimateRequest = TriggerEstimateRequest(),
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trigger the Accurate Tier pipeline (EasyMocap/SMPLify-X multi-pose optimisation).
    Returns 202 immediately; poll GET endpoint for result.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    existing = next(
        (j for j in session.jobs if j.job_type == "accurate_estimate"), None
    )
    if existing and existing.status == "complete":
        return JobAcceptedResponse(
            job_id=existing.id,
            status=JobStatus.complete,
            estimated_seconds=0,
        )

    if existing is None:
        job = models.Job(
            session_id=session_id,
            job_type="accurate_estimate",
            status="queued",
            estimated_seconds=45,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
    else:
        job = existing

    t = threading.Thread(target=_bg_accurate, args=(session_id,), daemon=True)
    t.start()

    return JobAcceptedResponse(
        job_id=job.id,
        status=JobStatus.queued,
        estimated_seconds=45,
    )


@router.get("/{session_id}/accurate-estimate", response_model=AccurateEstimateResponse)
def get_accurate_estimate(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Poll / retrieve the Accurate Tier result.
    Returns ISO 8559-1 measurements with residual errors when ready.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    job = next((j for j in session.jobs if j.job_type == "accurate_estimate"), None)

    if job is None or job.status == "queued":
        return AccurateEstimateResponse(status=JobStatus.queued)
    if job.status == "processing":
        return AccurateEstimateResponse(status=JobStatus.processing)
    if job.status == "failed":
        return AccurateEstimateResponse(status=JobStatus.failed)

    result = job.get_result()
    measurements = [
        MeasurementEntry(**m) for m in result.get("measurements", [])
    ]

    return AccurateEstimateResponse(
        status=JobStatus.complete,
        tier="accurate",
        measurements=measurements,
        calibration_method_used=result.get("calibration_method_used"),
        mesh_fit_residual=result.get("mesh_fit_residual"),
        processing_time_ms=result.get("processing_time_ms"),
    )
