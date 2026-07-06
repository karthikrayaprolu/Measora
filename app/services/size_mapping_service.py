"""
Size mapping service.
Compares body measurements against brand size charts to produce
a brand-native size recommendation with confidence score.
"""
import json
import uuid
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import models
from app.schemas.common import ConfidenceLevel, FitPreference

CONFIDENCE_HIGH = 0.80
CONFIDENCE_MED = 0.60

FIT_OFFSET = {
    FitPreference.slim: -1,
    FitPreference.regular: 0,
    FitPreference.relaxed: 1,
}

def _log_training_data(
    session_id: str,
    user_id: str,
    height_cm: float,
    db_measurements: List[models.Measurement],
    rec: models.SizeRecommendation,
    has_scale_mismatch: bool,
    any_clipped: bool,
    db: Session,
):
    try:
        job = db.query(models.Job).filter(
            models.Job.session_id == session_id, 
            models.Job.job_type == "accurate_estimate"
        ).first()
        raw_dims = "{}"
        if job and job.result_json:
            result_data = job.get_result()
            raw_dims = json.dumps(result_data.get("raw_dimensions", {}))
            
        computed_measurements = [
            {"iso_name": m.iso_name, "value_cm": m.value_cm, "residual_error_cm": m.residual_error_cm, "was_clipped": getattr(m, "was_clipped", False)}
            for m in db_measurements
        ]
        
        user_profile = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).first()
        ground_truth = user_profile.measurements if user_profile else "[]"
        
        log_entry = models.TrainingDataLog(
            session_id=session_id,
            user_id=user_id,
            height_cm=height_cm,
            raw_dimensions_json=raw_dims,
            computed_measurements_json=json.dumps(computed_measurements),
            confidence_tier=rec.confidence_level,
            has_scale_mismatch=has_scale_mismatch,
            any_clipped=any_clipped,
            ground_truth_json=ground_truth
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"Failed to log training data: {e}")

def _score_entry(
    entry: models.SizeChartEntry,
    measurements: Dict[str, float],
    product_type: str,
) -> Tuple[float, bool, Optional[str]]:
    """
    Score a single size chart entry against user measurements.
    Returns (match_score 0-1, is_in_range, dominant_constraint).
    """
    checks: List[Tuple[str, Optional[float], Optional[float], Optional[float]]] = []

    if product_type in ("shirt", "tshirt"):
        checks = [
            ("chest", entry.chest_min_cm,    entry.chest_max_cm,    measurements.get("chest_circumference")),
            ("waist", entry.waist_min_cm,    entry.waist_max_cm,    measurements.get("waist_circumference")),
            ("shoulder", entry.shoulder_min_cm, entry.shoulder_max_cm, measurements.get("shoulder_width")),
        ]
    elif product_type == "pant":
        checks = [
            ("waist", entry.waist_min_cm,   entry.waist_max_cm,   measurements.get("waist_circumference")),
            ("inseam", entry.inseam_min_cm,  entry.inseam_max_cm,  measurements.get("inseam_length")),
            ("hip", entry.hip_min_cm,     entry.hip_max_cm,     measurements.get("hip_circumference")),
        ]
    elif product_type == "footwear":
        checks = [
            ("foot_length", entry.foot_length_min_mm, entry.foot_length_max_mm, measurements.get("foot_length_mm")),
        ]

    if not checks or all(v is None for _, _, _, v in checks):
        return 0.0, False

    scores_with_weights = []
    total_weight = 0.0
    
    weight_map = settings.SIZE_MATCH_WEIGHTS.get(product_type, {})

    lowest_score = float('inf')
    dominant_constraint = None
    
    for name, lo, hi, val in checks:
        if val is None or lo is None or hi is None:
            continue
            
        weight = weight_map.get(name, 1.0)
        score = 0.0
        
        if lo <= val <= hi:
            # Score based on how centred the value is in the range
            centre = (lo + hi) / 2
            half = (hi - lo) / 2
            score = 1.0 - abs(val - centre) / half * 0.5
        else:
            # Out of range — penalise
            if val < lo:
                score = max(0.0, 1.0 - (lo - val) / (lo + 1e-9))
            else:
                score = max(0.0, 1.0 - (val - hi) / (hi + 1e-9))
                
        if score < lowest_score:
            lowest_score = score
            dominant_constraint = name
                
        scores_with_weights.append(score * weight)
        total_weight += weight

    if not scores_with_weights or total_weight == 0:
        return 0.0, False, None

    avg = sum(scores_with_weights) / total_weight
    in_range = all(
        lo <= val <= hi
        for _, lo, hi, val in checks
        if lo is not None and hi is not None and val is not None
    )
    return round(avg, 4), in_range, dominant_constraint


def compute_size_recommendation(
    session_id: str,
    brand_id: str,
    product_type: str,
    fit_preference: str,
    db: Session,
) -> Optional[models.SizeRecommendation]:
    """
    Main entry point: compute and persist size recommendation for a session.
    """
    brand = db.query(models.Brand).filter(models.Brand.id == brand_id).first()
    if not brand:
        return None
        
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    has_scale_mismatch = session.has_scale_mismatch if session else False

    # Gather measurements
    db_measurements = (
        db.query(models.Measurement)
        .filter(
            models.Measurement.session_id == session_id,
            models.Measurement.tier == "accurate",
        )
        .all()
    )

    # Also check fast tier if accurate not available
    if not db_measurements:
        db_measurements = (
            db.query(models.Measurement)
            .filter(models.Measurement.session_id == session_id)
            .all()
        )

    tier_used = db_measurements[0].tier if db_measurements else "fast"

    measurements: Dict[str, float] = {m.iso_name: m.value_cm for m in db_measurements}

    # For footwear, pull from footwear job result
    if product_type == "footwear":
        fw_job = (
            db.query(models.Job)
            .filter(
                models.Job.session_id == session_id,
                models.Job.job_type == "footwear_measure",
                models.Job.status == "complete",
            )
            .first()
        )
        if fw_job:
            fw_result = fw_job.get_result()
            fw_m = fw_result.get("measurements", {})
            # Use right foot if available, else left
            foot_data = fw_m.get("right_foot") or fw_m.get("left_foot") or {}
            if foot_data.get("length_mm"):
                measurements["foot_length_mm"] = foot_data["length_mm"]
            if foot_data.get("width_mm"):
                measurements["foot_width_mm"] = foot_data["width_mm"]

    # Get size chart entries
    entries = (
        db.query(models.SizeChartEntry)
        .filter(
            models.SizeChartEntry.brand_id == brand_id,
            models.SizeChartEntry.product_type == product_type,
        )
        .all()
    )

    if not entries:
        return None

    # Score each entry
    scored = [(entry, *_score_entry(entry, measurements, product_type)) for entry in entries]
    scored.sort(key=lambda x: x[1], reverse=True)

    best_entry, best_score, in_range, dominant_constraint = scored[0]

    # Apply fit preference offset (slim → smaller, relaxed → larger)
    offset = FIT_OFFSET.get(FitPreference(fit_preference), 0)
    idx = entries.index(best_entry)
    adjusted_idx = max(0, min(len(entries) - 1, idx + offset))
    chosen_entry = entries[adjusted_idx]

    residuals = [m.residual_error_cm for m in db_measurements if m.residual_error_cm is not None]
    avg_residual = sum(residuals) / len(residuals) if residuals else 0.0

    # Confidence
    if best_score >= CONFIDENCE_HIGH and in_range:
        conf_level = ConfidenceLevel.high
    elif best_score >= CONFIDENCE_MED:
        conf_level = ConfidenceLevel.medium
    else:
        conf_level = ConfidenceLevel.low

    if avg_residual > 3.0 or tier_used != "accurate":
        conf_level = ConfidenceLevel.low
        
    any_clipped = any(getattr(m, "was_clipped", False) for m in db_measurements)
    if has_scale_mismatch or any_clipped:
        if conf_level == ConfidenceLevel.high:
            conf_level = ConfidenceLevel.medium

    low_confidence = conf_level == ConfidenceLevel.low
    recapture = low_confidence or (avg_residual > 3.0)

    # Persist recommendation
    existing = (
        db.query(models.SizeRecommendation)
        .filter(
            models.SizeRecommendation.session_id == session_id,
            models.SizeRecommendation.brand_id == brand_id,
            models.SizeRecommendation.product_type == product_type,
        )
        .first()
    )

    share_token = str(uuid.uuid4()).replace("-", "")[:16]

    if existing:
        rec = existing
    else:
        rec = models.SizeRecommendation(
            session_id=session_id,
            brand_id=brand_id,
            product_type=product_type,
        )
        db.add(rec)

    rec.recommended_size = chosen_entry.size_label
    rec.set_size_equivalents(chosen_entry.get_size_systems())
    rec.fit_preference = fit_preference
    rec.confidence_score = round(best_score, 4)
    rec.confidence_level = conf_level.value
    rec.low_confidence = low_confidence
    rec.recapture_suggested = recapture
    rec.tier_used = tier_used
    rec.share_token = share_token
    rec.dominant_constraint = dominant_constraint
    db.commit()
    db.refresh(rec)
    
    if settings.ENABLE_TRAINING_DATA_LOGGING:
        _log_training_data(
            session_id=session_id,
            user_id=session.user_id if session else None,
            height_cm=session.height_cm if session else 0.0,
            db_measurements=db_measurements,
            rec=rec,
            has_scale_mismatch=has_scale_mismatch,
            any_clipped=any_clipped,
            db=db
        )
        
    return rec
