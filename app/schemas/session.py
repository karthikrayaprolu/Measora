from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import (
    CalibrationMethod,
    FitPreference,
    PoseLabel,
    ProductType,
    SessionStatus,
)


class SessionCreate(BaseModel):
    product_type: ProductType
    height: float = Field(..., gt=0, description="User height in specified unit")
    height_unit: str = Field("cm", description="'cm' or 'inch'")
    calibration_method: CalibrationMethod = CalibrationMethod.height
    optional_poses: List[PoseLabel] = []
    fit_preference: FitPreference = FitPreference.regular
    store_profile: bool = False


class SessionResponse(BaseModel):
    session_id: str
    required_poses: List[str]
    optional_poses: List[str]
    status: SessionStatus
    expires_at: datetime

    model_config = {"from_attributes": True}


class SessionStatusResponse(BaseModel):
    session_id: str
    status: SessionStatus
    required_poses: List[str]
    poses_captured: List[str]
    poses_remaining: List[str]
    fast_estimate_ready: bool
    accurate_estimate_ready: bool

    model_config = {"from_attributes": True}
