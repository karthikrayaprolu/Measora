"""
POST /v1/sessions          — create a new measurement session
GET  /v1/sessions/{id}     — get session status
REQ-000-01 → REQ-000-07, REQ-100-09
"""
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.exceptions import SessionNotFoundError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db import models
from app.schemas.common import ProductType, SessionStatus
from app.schemas.session import SessionCreate, SessionResponse, SessionStatusResponse

router = APIRouter(prefix="/sessions", tags=["Sessions"])

# Required poses per product type - SnapMeasureAI model mandates A (Front) and B (Side) for everything
REQUIRED_POSES: dict = {
    "shirt": ["A", "B"],
    "tshirt": ["A", "B"],
    "pant": ["A", "B"],
    "footwear": ["A", "B"], # Future proofing, footwear might use D, but the prompt says ALL products.
}


def _to_height_cm(height: float, unit: str) -> float:
    if unit.lower() in ("inch", "inches", "in"):
        return round(height * 2.54, 2)
    return height


@router.post("", response_model=SessionResponse, status_code=201)
def create_session(
    payload: SessionCreate,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new Measora measurement session.
    Returns session_id and the list of poses the user must capture.
    """
    height_cm = _to_height_cm(payload.height, payload.height_unit)
    product_type = payload.product_type.value
    required = REQUIRED_POSES.get(product_type, ["A", "B"])
    optional = [p.value for p in payload.optional_poses]

    session = models.Session(
        user_id=user_id,
        product_type=product_type,
        height_cm=height_cm,
        calibration_method=payload.calibration_method.value,
        fit_preference=payload.fit_preference.value,
        store_profile=payload.store_profile,
        status=SessionStatus.awaiting_capture.value,
        expires_at=datetime.utcnow() + timedelta(hours=2),
    )
    session.set_optional_poses(optional)
    db.add(session)
    db.commit()
    db.refresh(session)

    return SessionResponse(
        session_id=session.id,
        required_poses=required,
        optional_poses=optional,
        status=SessionStatus.awaiting_capture,
        expires_at=session.expires_at,
    )


@router.get("/{session_id}", response_model=SessionStatusResponse)
def get_session_status(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Poll the overall status of a session, including which poses have been
    captured and whether Fast/Accurate Tier results are ready.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    captured = [f.pose for f in session.frames if f.accepted]
    required = REQUIRED_POSES.get(session.product_type, [])
    remaining = [p for p in required if p not in captured]

    fast_job = next(
        (j for j in session.jobs if j.job_type == "fast_estimate"), None
    )
    acc_job = next(
        (j for j in session.jobs if j.job_type == "accurate_estimate"), None
    )

    return SessionStatusResponse(
        session_id=session.id,
        status=SessionStatus(session.status),
        required_poses=required,
        poses_captured=list(set(captured)),
        poses_remaining=remaining,
        fast_estimate_ready=fast_job is not None and fast_job.status == "complete",
        accurate_estimate_ready=acc_job is not None and acc_job.status == "complete",
    )
