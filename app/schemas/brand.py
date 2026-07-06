from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel


class SizeChartEntrySchema(BaseModel):
    size_label: str
    size_systems: Dict[str, str]
    chest_min_cm: Optional[float] = None
    chest_max_cm: Optional[float] = None
    waist_min_cm: Optional[float] = None
    waist_max_cm: Optional[float] = None
    hip_min_cm: Optional[float] = None
    hip_max_cm: Optional[float] = None
    shoulder_min_cm: Optional[float] = None
    shoulder_max_cm: Optional[float] = None
    inseam_min_cm: Optional[float] = None
    inseam_max_cm: Optional[float] = None
    foot_length_min_mm: Optional[float] = None
    foot_length_max_mm: Optional[float] = None

    model_config = {"from_attributes": True}


class BrandResponse(BaseModel):
    id: str
    name: str
    supported_products: List[str]

    model_config = {"from_attributes": True}


class BrandListResponse(BaseModel):
    brands: List[BrandResponse]
    total: int
    page: int


class SizeChartResponse(BaseModel):
    brand_id: str
    product_type: str
    size_systems: List[str]
    entries: List[SizeChartEntrySchema]


class BrandCreateRequest(BaseModel):
    name: str
    supported_products: List[str]


class SizeChartUpdateRequest(BaseModel):
    entries: List[SizeChartEntrySchema]
