"""
GET /v1/sessions/{session_id}/result         — final output (Confirmed size)
GET /v1/sessions/{session_id}/result/export  — shareable export link
REQ-500-01, REQ-500-02, REQ-500-07
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import SessionNotFoundError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db import models
from app.schemas.common import ConfidenceLevel
from app.schemas.estimate import MeasurementEntry

router = APIRouter(prefix="/sessions", tags=["Result"])


@router.get("/{session_id}/result")
def get_result(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the complete, final output for the session.
    This is the payload the UI uses to render the Output screen:
      - Confirmed size (brand-specific)
      - All ISO 8559-1 measurements
      - Confidence score + level
      - Re-capture suggestion if confidence is low
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    # Get the most recent size recommendation (any brand)
    rec = (
        db.query(models.SizeRecommendation)
        .filter(models.SizeRecommendation.session_id == session_id)
        .order_by(models.SizeRecommendation.created_at.desc())
        .first()
    )

    # Get accurate-tier measurements
    db_measurements = (
        db.query(models.Measurement)
        .filter(
            models.Measurement.session_id == session_id,
            models.Measurement.tier == "accurate",
        )
        .all()
    )

    # Fall back to fast-tier measurements if accurate not ready
    measurements = []
    tier = "fast"
    label = "Estimated size"
    
    if db_measurements:
        measurements = [
            {
                "iso_name": m.iso_name, 
                "value_cm": m.value_cm, 
                "residual_error_cm": m.residual_error_cm,
                "was_clipped": getattr(m, "was_clipped", False)
            }
            for m in db_measurements
        ]
        tier = "accurate"
        label = "Confirmed size"
    else:
        # Check fast estimate job
        fast_job = (
            db.query(models.Job)
            .filter(models.Job.session_id == session_id, models.Job.job_type == "fast_estimate")
            .first()
        )
        if fast_job and fast_job.result_json:
            result_data = fast_job.get_result()
            rough = result_data.get("rough_measurements_cm", {})
            measurements = [
                {"iso_name": f"{k}_circumference", "value_cm": v, "residual_error_cm": 0.0}
                for k, v in rough.items()
            ]

    result = {
        "session_id": session_id,
        "label": label,
        "tier": tier,
        "measurements": measurements,
    }

    if rec:
        result.update(
            {
                "recommended_size": rec.recommended_size,
                "size_equivalents": rec.get_size_equivalents(),
                "confidence": {
                    "score": rec.confidence_score,
                    "level": rec.confidence_level,
                    "low_confidence": rec.low_confidence,
                },
                "recapture_suggested": rec.recapture_suggested,
                "share_token": rec.share_token,
                "dominant_constraint": getattr(rec, "dominant_constraint", None),
            }
        )

    return result


@router.get("/{session_id}/result/export")
def export_result(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a shareable public link for the size recommendation result.
    REQ-500-07
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    rec = (
        db.query(models.SizeRecommendation)
        .filter(models.SizeRecommendation.session_id == session_id)
        .order_by(models.SizeRecommendation.created_at.desc())
        .first()
    )

    token = rec.share_token if rec else "no_recommendation"
    expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat() + "Z"

    return {
        "share_url": f"https://measora.io/result/{token}",
        "expires_at": expires_at,
    }
