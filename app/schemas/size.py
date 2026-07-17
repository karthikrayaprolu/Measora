from typing import Dict, List, Optional

from pydantic import BaseModel

from app.schemas.common import ConfidenceLevel, FitPreference, JobStatus, TierLabel


class SizeRecommendationRequest(BaseModel):
    brand_id: str = "brand_nike"
    product_type: str
    fit_preference: FitPreference = FitPreference.regular
    preferred_size_system: str = "EU"
    use_tier: TierLabel = TierLabel.accurate


class ConfidenceInfo(BaseModel):
    score: float
    level: ConfidenceLevel
    low_confidence: bool
    uncertain_measurements: List[str] = []


class SizeRecommendationResponse(BaseModel):
    status: JobStatus
    brand: Optional[str] = None
    product_type: Optional[str] = None
    recommended_size: Optional[str] = None
    size_equivalents: Optional[Dict[str, str]] = None
    fit_preference_applied: Optional[str] = None
    confidence: Optional[ConfidenceInfo] = None
    tier_used: Optional[str] = None
    recapture_suggested: bool = False
