"""
POST /v1/sessions/{session_id}/size-recommendation — compute recommendation
GET  /v1/sessions/{session_id}/size-recommendation — retrieve recommendation
REQ-400-03 → REQ-400-08
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.exceptions import BrandNotFoundError, SessionNotFoundError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db import models
from app.schemas.common import ConfidenceLevel, JobStatus
from app.schemas.size import (
    ConfidenceInfo,
    SizeRecommendationRequest,
    SizeRecommendationResponse,
)
from app.services.size_mapping_service import compute_size_recommendation

router = APIRouter(prefix="/sessions", tags=["Size Recommendation"])


def _build_response(rec: models.SizeRecommendation, brand_name: str) -> SizeRecommendationResponse:
    return SizeRecommendationResponse(
        status=JobStatus.complete,
        brand=brand_name,
        product_type=rec.product_type,
        recommended_size=rec.recommended_size,
        size_equivalents=rec.get_size_equivalents(),
        fit_preference_applied=rec.fit_preference,
        confidence=ConfidenceInfo(
            score=rec.confidence_score or 0.0,
            level=ConfidenceLevel(rec.confidence_level or "Medium"),
            low_confidence=rec.low_confidence,
            uncertain_measurements=[],
        ),
        tier_used=rec.tier_used,
        recapture_suggested=rec.recapture_suggested,
    )


@router.post("/{session_id}/size-recommendation", response_model=SizeRecommendationResponse)
def create_size_recommendation(
    session_id: str,
    payload: SizeRecommendationRequest,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Compute a brand-specific size recommendation from the session's measurements.
    Applies fit preference (slim/regular/relaxed) and confidence scoring.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    brand = db.query(models.Brand).filter(models.Brand.id == payload.brand_id).first()
    if not brand:
        raise BrandNotFoundError(payload.brand_id)

    rec = compute_size_recommendation(
        session_id=session_id,
        brand_id=payload.brand_id,
        product_type=payload.product_type,
        fit_preference=payload.fit_preference.value,
        db=db,
    )

    if rec is None:
        return SizeRecommendationResponse(
            status=JobStatus.failed,
            recapture_suggested=True,
        )

    return _build_response(rec, brand.name)


@router.get("/{session_id}/size-recommendation", response_model=SizeRecommendationResponse)
def get_size_recommendation(
    session_id: str,
    brand_id: str,
    product_type: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve a previously computed size recommendation.
    Query params: brand_id, product_type
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    rec = (
        db.query(models.SizeRecommendation)
        .filter(
            models.SizeRecommendation.session_id == session_id,
            models.SizeRecommendation.brand_id == brand_id,
            models.SizeRecommendation.product_type == product_type,
        )
        .first()
    )

    if rec is None:
        return SizeRecommendationResponse(status=JobStatus.queued)

    brand = db.query(models.Brand).filter(models.Brand.id == brand_id).first()
    brand_name = brand.name if brand else brand_id

    return _build_response(rec, brand_name)
