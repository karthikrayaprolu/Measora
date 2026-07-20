"""
GET    /v1/users/{user_id}/profile           — retrieve stored measurement profile
PUT    /v1/users/{user_id}/profile           — update measurement values
DELETE /v1/users/{user_id}/profile           — delete profile (GDPR)
POST   /v1/users/{user_id}/profile/recommend — recommend from stored profile
REQ-500-03 → REQ-500-06, REQ-500-04
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import ProfileNotFoundError, SessionNotFoundError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db import models
from app.schemas.estimate import MeasurementEntry
from app.schemas.profile import (
    ProfileMeasurementUpdate,
    ProfileRecommendRequest,
    UserProfileResponse,
    SavedMeasurementCreate,
    SavedMeasurementResponse,
)
from app.schemas.common import ConfidenceLevel
from app.schemas.size import ConfidenceInfo, SizeRecommendationResponse
from app.services.size_mapping_service import (
    compute_size_recommendation,
    _score_entry,
    CONFIDENCE_HIGH,
    CONFIDENCE_MED,
    FIT_OFFSET,
    FitPreference,
)
from app.db.models import SizeChartEntry

router = APIRouter(prefix="/users", tags=["User Profile"])

@router.get("/{user_id}/profiles", response_model=List[SavedMeasurementResponse])
def list_profiles(
    user_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List all saved measurement profiles for a user.
    """
    profiles = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).order_by(models.UserProfile.created_at.desc()).all()
    results = []
    for p in profiles:
        results.append(SavedMeasurementResponse(
            id=p.id,
            name=p.profile_name or "My Measurements",
            measurements=[MeasurementEntry(**m) for m in p.get_measurements()],
            created_at=p.created_at
        ))
    return results

@router.post("/{user_id}/profiles", response_model=SavedMeasurementResponse, status_code=201)
def create_profile(
    user_id: str,
    payload: SavedMeasurementCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save a new measurement profile.
    """
    profile = models.UserProfile(
        user_id=user_id,
        profile_name=payload.name,
    )
    profile.set_measurements([m.model_dump() for m in payload.measurements])
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return SavedMeasurementResponse(
        id=profile.id,
        name=profile.profile_name,
        measurements=[MeasurementEntry(**m) for m in profile.get_measurements()],
        created_at=profile.created_at
    )

@router.delete("/{user_id}/profiles/{profile_id}", status_code=204)
def delete_specific_profile(
    user_id: str,
    profile_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete a specific measurement profile.
    """
    profile = db.query(models.UserProfile).filter(models.UserProfile.id == profile_id, models.UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(profile)
    db.commit()
    return None

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

    age_days = (datetime.now(timezone.utc) - profile.created_at).days
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
    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)

    age_days = (datetime.now(timezone.utc) - profile.created_at).days
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
        "profile_age_days": (datetime.now(timezone.utc) - profile.created_at).days,
    }


@router.post("/{user_id}/measurements", response_model=SavedMeasurementResponse, status_code=201)
def save_measurement_set(
    user_id: str,
    payload: SavedMeasurementCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save a named measurement set to the user's history.
    """
    if current_user != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    profile = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).first()
    # create profile record if missing
    if not profile:
        profile = models.UserProfile(user_id=user_id)
        db.add(profile)

    saved = models.SavedMeasurement(user_id=user_id, name=payload.name, recommended_size=payload.recommended_size)
    saved.set_measurements([m.model_dump() for m in payload.measurements])
    db.add(saved)
    db.commit()
    db.refresh(saved)

    return SavedMeasurementResponse(id=saved.id, name=saved.name, measurements=saved.get_measurements(), created_at=saved.created_at, recommended_size=saved.recommended_size)


@router.get("/{user_id}/measurements", response_model=List[SavedMeasurementResponse])
def list_measurement_sets(
    user_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    items = (
        db.query(models.SavedMeasurement)
        .filter(models.SavedMeasurement.user_id == user_id)
        .order_by(models.SavedMeasurement.created_at.desc())
        .all()
    )

    return [SavedMeasurementResponse(id=i.id, name=i.name, measurements=i.get_measurements(), created_at=i.created_at, recommended_size=i.recommended_size) for i in items]


@router.delete("/{user_id}/measurements/{measurement_id}", status_code=204)
def delete_measurement_set(
    user_id: str,
    measurement_id: str,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    item = (
        db.query(models.SavedMeasurement)
        .filter(models.SavedMeasurement.user_id == user_id, models.SavedMeasurement.id == measurement_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    db.delete(item)
    db.commit()
    return None
