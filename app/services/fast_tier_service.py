import time
from typing import Dict, Optional
from sqlalchemy.orm import Session as DBSession
from app.db import models

# Import the new actual MediaPipe extraction engine
from app.services.accurate_tier_service import extract_measurements

_ROUGH_SIZE_TABLE = [
    (0,   88,  "XS"),
    (88,  96,  "S"),
    (96,  104, "M"),
    (104, 112, "L"),
    (112, 120, "XL"),
    (120, 999, "XXL"),
]

def _pick_size(chest_cm: float) -> str:
    for lo, hi, label in _ROUGH_SIZE_TABLE:
        if lo <= chest_cm < hi:
            return label
    return "XXL"

def run_fast_estimate(session_id: str, db: DBSession) -> None:
    """
    Background task: runs Fast Tier using actual MediaPipe extraction.
    """
    job = db.query(models.Job).filter(models.Job.session_id == session_id, models.Job.job_type == "fast_estimate").first()
    if not job:
        return

    job.status = "processing"
    db.commit()

    t_start = time.time()
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    frame_a = db.query(models.Frame).filter(models.Frame.session_id == session_id, models.Frame.pose == "A").order_by(models.Frame.created_at.desc()).first()
    frame_b = db.query(models.Frame).filter(models.Frame.session_id == session_id, models.Frame.pose == "B").order_by(models.Frame.created_at.desc()).first()

    try:
        if not session or not frame_a or not frame_b:
            raise ValueError("Session or required frames (A and B) missing.")
            
        # Run real computer vision to extract measurements
        measurements = extract_measurements(session.height_cm, frame_a.landmarks_json, frame_b.landmarks_json)
        meas_dict = {m[0]: m[1] for m in measurements}
        
        chest_cm = meas_dict.get("chest_circumference", 100.0)
        size_label = _pick_size(chest_cm)

        # Write all extracted measurements to DB
        db.query(models.Measurement).filter(
            models.Measurement.session_id == session_id,
            models.Measurement.tier == "fast"
        ).delete()

        for m_tuple in measurements:
            m = models.Measurement(
                session_id=session_id, 
                tier="fast", 
                iso_name=m_tuple[0],
                value_cm=m_tuple[1], 
                residual_error_cm=m_tuple[2] if len(m_tuple) > 2 else 0.0
            )
            db.add(m)

        elapsed_ms = int((time.time() - t_start) * 1000)

        result = {
            "status": "complete",
            "tier": "fast",
            "label": "Estimated size",
            "size": size_label,
            "processing_time_ms": elapsed_ms,
        }

        job.set_result(result)
        job.status = "complete"
        job.processing_time_ms = elapsed_ms
        session.status = "fast_ready"
        
    except Exception as e:
        job.status = "failed"
        job.set_result({"error": str(e)})
        
    db.commit()
