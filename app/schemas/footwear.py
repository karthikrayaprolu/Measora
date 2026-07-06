from typing import Optional

from pydantic import BaseModel

from app.schemas.common import JobStatus


class FootMeasurement(BaseModel):
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    arch_length_mm: Optional[float] = None


class FootMeasurements(BaseModel):
    left_foot: Optional[FootMeasurement] = None
    right_foot: Optional[FootMeasurement] = None


class FootCalibration(BaseModel):
    a4_detected: bool
    px_per_mm: Optional[float] = None


class FootFrameUploadResponse(BaseModel):
    frame_id: str
    view: str
    foot: str
    a4_detected: bool
    px_per_mm: Optional[float] = None


class FootMeasureJobResponse(BaseModel):
    job_id: str
    status: JobStatus
    estimated_seconds: int


class FootMeasureResultResponse(BaseModel):
    status: JobStatus
    measurements: Optional[FootMeasurements] = None
    calibration: Optional[FootCalibration] = None
