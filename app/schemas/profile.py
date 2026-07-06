from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel

from app.schemas.estimate import MeasurementEntry


class ProfileMeasurementUpdate(BaseModel):
    measurements: List[MeasurementEntry]


class UserProfileResponse(BaseModel):
    user_id: str
    captured_at: datetime
    age_days: int
    stale_warning: bool
    measurements: List[MeasurementEntry]
    consent_given: bool

    model_config = {"from_attributes": True}


class ProfileRecommendRequest(BaseModel):
    brand_id: str
    product_type: str
    fit_preference: str = "regular"
