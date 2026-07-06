"""
POST /v1/sessions/{session_id}/footwear/frames  — upload foot photos
POST /v1/sessions/{session_id}/footwear/measure — trigger foot measurement job
GET  /v1/sessions/{session_id}/footwear/measure — retrieve foot measurements
REQ-3B0-01 → REQ-3B0-06
"""
import os
import threading
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import FileTooLargeError, SessionNotFoundError
from app.core.security import get_current_user
from app.db.database import get_db, SessionLocal
from app.db import models
from app.schemas.common import JobStatus
from app.schemas.footwear import (
    FootCalibration,
    FootFrameUploadResponse,
    FootMeasureJobResponse,
    FootMeasureResultResponse,
    FootMeasurement,
    FootMeasurements,
)
from app.services.footwear_service import detect_a4_paper, run_footwear_measure

router = APIRouter(prefix="/sessions", tags=["Footwear"])


def _bg_footwear(session_id: str):
    db = SessionLocal()
    try:
        run_footwear_measure(session_id, db)
    finally:
        db.close()


@router.post(
    "/{session_id}/footwear/frames",
    response_model=FootFrameUploadResponse,
    status_code=201,
)
async def upload_foot_frame(
    session_id: str,
    view: str = Form(..., description="'top_down' or 'side'"),
    foot: str = Form(..., description="'left' or 'right'"),
    image: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a foot photo (top-down or side view) with A4 reference paper in frame.
    The A4 paper is automatically detected and used for pixel-to-mm calibration.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    content = await image.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise FileTooLargeError(settings.MAX_UPLOAD_SIZE_MB)

    # Detect A4 paper for calibration
    a4_detected, px_per_mm = detect_a4_paper(content)

    # Save frame
    upload_dir = os.path.join(settings.UPLOAD_DIR, session_id, "footwear")
    os.makedirs(upload_dir, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    ext = (image.filename or "foot.jpg").rsplit(".", 1)[-1].lower()
    filename = f"D_{view}_{foot}_{ts}.{ext}"
    file_path = os.path.join(upload_dir, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    frame = models.Frame(
        session_id=session_id,
        pose="D",
        sub_view=view,
        foot=foot,
        file_path=file_path,
        accepted=True,
    )
    db.add(frame)
    db.commit()
    db.refresh(frame)

    return FootFrameUploadResponse(
        frame_id=frame.id,
        view=view,
        foot=foot,
        a4_detected=a4_detected,
        px_per_mm=px_per_mm,
    )


@router.post(
    "/{session_id}/footwear/measure",
    response_model=FootMeasureJobResponse,
    status_code=202,
)
def trigger_footwear_measure(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trigger foot measurement extraction (SAM2 + A4 calibration + measurement).
    Runs in background; poll GET endpoint for results.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    existing = next(
        (j for j in session.jobs if j.job_type == "footwear_measure"), None
    )
    if existing and existing.status == "complete":
        return FootMeasureJobResponse(
            job_id=existing.id, status=JobStatus.complete, estimated_seconds=0
        )

    if existing is None:
        job = models.Job(
            session_id=session_id,
            job_type="footwear_measure",
            status="queued",
            estimated_seconds=8,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
    else:
        job = existing

    t = threading.Thread(target=_bg_footwear, args=(session_id,), daemon=True)
    t.start()

    return FootMeasureJobResponse(
        job_id=job.id, status=JobStatus.queued, estimated_seconds=8
    )


@router.get("/{session_id}/footwear/measure", response_model=FootMeasureResultResponse)
def get_footwear_measure(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve foot measurement results (foot length, width, arch length in mm).
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    job = next((j for j in session.jobs if j.job_type == "footwear_measure"), None)

    if job is None or job.status in ("queued", "processing"):
        return FootMeasureResultResponse(status=JobStatus(job.status if job else "queued"))
    if job.status == "failed":
        return FootMeasureResultResponse(status=JobStatus.failed)

    result = job.get_result()
    raw_m = result.get("measurements", {})
    cal = result.get("calibration", {})

    def _parse_foot(data: dict) -> Optional[FootMeasurement]:
        if not data:
            return None
        return FootMeasurement(
            length_mm=data.get("length_mm"),
            width_mm=data.get("width_mm"),
            arch_length_mm=data.get("arch_length_mm"),
        )

    return FootMeasureResultResponse(
        status=JobStatus.complete,
        measurements=FootMeasurements(
            left_foot=_parse_foot(raw_m.get("left_foot", {})),
            right_foot=_parse_foot(raw_m.get("right_foot", {})),
        ),
        calibration=FootCalibration(
            a4_detected=cal.get("a4_detected", False),
            px_per_mm=cal.get("px_per_mm"),
        ),
    )
