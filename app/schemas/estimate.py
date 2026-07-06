from typing import Dict, List, Optional

from pydantic import BaseModel

from app.schemas.common import JobStatus, TierLabel


class CalibrationOverride(BaseModel):
    method: str = "height"
    height_cm: Optional[float] = None


class TriggerEstimateRequest(BaseModel):
    calibration_override: Optional[CalibrationOverride] = None
    use_tier: Optional[TierLabel] = None  # fast | accurate


class JobAcceptedResponse(BaseModel):
    job_id: str
    status: JobStatus
    estimated_seconds: int


class RoughMeasurement(BaseModel):
    chest: Optional[float] = None
    waist: Optional[float] = None
    hip: Optional[float] = None


class FastEstimateResponse(BaseModel):
    status: JobStatus
    tier: str = "fast"
    label: str = "Estimated size"
    size: Optional[str] = None
    rough_measurements_cm: Optional[RoughMeasurement] = None
    processing_time_ms: Optional[int] = None


class MeasurementEntry(BaseModel):
    iso_name: str
    value_cm: float
    residual_error_cm: Optional[float] = None


class AccurateEstimateResponse(BaseModel):
    status: JobStatus
    tier: str = "accurate"
    measurements: Optional[List[MeasurementEntry]] = None
    calibration_method_used: Optional[str] = None
    mesh_fit_residual: Optional[float] = None
    processing_time_ms: Optional[int] = None
