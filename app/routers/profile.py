"""
GET    /v1/users/{user_id}/profile           — retrieve stored measurement profile
PUT    /v1/users/{user_id}/profile           — update measurement values
DELETE /v1/users/{user_id}/profile           — delete profile (GDPR)
POST   /v1/users/{user_id}/profile/recommend — recommend from stored profile
REQ-500-03 → REQ-500-06, REQ-500-04
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import ProfileNotFoundError, SessionNotFoundError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db import models
from app.schemas.estimate import MeasurementEntry
from app.schemas.profile import ProfileMeasurementUpdate, ProfileRecommendRequest, UserProfileResponse
from app.schemas.common import ConfidenceLevel
from app.schemas.size import ConfidenceInfo, SizeRecommendationResponse
from app.services.size_mapping_service import compute_size_recommendation

router = APIRouter(prefix="/users", tags=["User Profile"])

STALE_DAYS = 180  # Flag profiles older than 6 months


@router.get("/{user_id}/profile", response_model=UserProfileResponse)
def get_profile(
    user_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve the user's stored measurement profile.
    On subsequent purchases, this profile can be used to skip re-capture.
    """
    profile = (
        db.query(models.UserProfile)
        .filter(models.UserProfile.user_id == user_id)
        .first()
    )
    if not profile:
        raise ProfileNotFoundError(user_id)

    age_days = (datetime.utcnow() - profile.created_at).days
    measurements = [MeasurementEntry(**m) for m in profile.get_measurements()]

    return UserProfileResponse(
        user_id=profile.user_id,
        captured_at=profile.created_at,
        age_days=age_days,
        stale_warning=age_days > STALE_DAYS,
        measurements=measurements,
        consent_given=profile.consent_given,
    )


@router.put("/{user_id}/profile", response_model=UserProfileResponse)
def update_profile(
    user_id: str,
    payload: ProfileMeasurementUpdate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Manually update or correct stored measurement values.
    REQ-500-06
    """
    profile = (
        db.query(models.UserProfile)
        .filter(models.UserProfile.user_id == user_id)
        .first()
    )
    if not profile:
        raise ProfileNotFoundError(user_id)

    existing = {m["iso_name"]: m for m in profile.get_measurements()}
    for m in payload.measurements:
        existing[m.iso_name] = m.model_dump()

    profile.set_measurements(list(existing.values()))
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)

    age_days = (datetime.utcnow() - profile.created_at).days
    measurements = [MeasurementEntry(**m) for m in profile.get_measurements()]

    return UserProfileResponse(
        user_id=profile.user_id,
        captured_at=profile.created_at,
        age_days=age_days,
        stale_warning=age_days > STALE_DAYS,
        measurements=measurements,
        consent_given=profile.consent_given,
    )


@router.delete("/{user_id}/profile", status_code=204)
def delete_profile(
    user_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete the user's measurement profile (GDPR/PDPA right to erasure).
    REQ-500-03, REQ-500-06
    """
    profile = (
        db.query(models.UserProfile)
        .filter(models.UserProfile.user_id == user_id)
        .first()
    )
    if not profile:
        raise ProfileNotFoundError(user_id)

    db.delete(profile)
    db.commit()
    return None


@router.post("/{user_id}/profile/recommend")
def recommend_from_profile(
    user_id: str,
    payload: ProfileRecommendRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a size recommendation from the user's stored profile —
    no new capture session required.
    REQ-500-04
    """
    profile = (
        db.query(models.UserProfile)
        .filter(models.UserProfile.user_id == user_id)
        .first()
    )
    if not profile:
        raise ProfileNotFoundError(user_id)

    brand = db.query(models.Brand).filter(models.Brand.id == payload.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{payload.brand_id}' not found")

    # Build measurements dict from profile
    measurements_list = profile.get_measurements()
    measurements = {m["iso_name"]: m["value_cm"] for m in measurements_list}

    # Use the size mapping algorithm directly (without a session)
    from app.services.size_mapping_service import (
        _score_entry,
        CONFIDENCE_HIGH,
        CONFIDENCE_MED,
        FIT_OFFSET,
        FitPreference,
    )
    from app.db.models import SizeChartEntry

    entries = (
        db.query(SizeChartEntry)
        .filter(
            SizeChartEntry.brand_id == payload.brand_id,
            SizeChartEntry.product_type == payload.product_type,
        )
        .all()
    )

    if not entries:
        return {"message": "No size chart found for this brand/product combination"}

    scored = [
        (entry, *_score_entry(entry, measurements, payload.product_type))
        for entry in entries
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    best_entry, best_score, in_range = scored[0]

    offset = FIT_OFFSET.get(FitPreference(payload.fit_preference), 0)
    idx = entries.index(best_entry)
    adjusted_idx = max(0, min(len(entries) - 1, idx + offset))
    chosen = entries[adjusted_idx]

    if best_score >= CONFIDENCE_HIGH and in_range:
        level = ConfidenceLevel.high
    elif best_score >= CONFIDENCE_MED:
        level = ConfidenceLevel.medium
    else:
        level = ConfidenceLevel.low

    return {
        "brand": brand.name,
        "product_type": payload.product_type,
        "recommended_size": chosen.size_label,
        "size_equivalents": chosen.get_size_systems(),
        "fit_preference_applied": payload.fit_preference,
        "confidence": {
            "score": round(best_score, 4),
            "level": level.value,
            "low_confidence": level == ConfidenceLevel.low,
        },
        "source": "stored_profile",
        "profile_age_days": (datetime.utcnow() - profile.created_at).days,
    }
