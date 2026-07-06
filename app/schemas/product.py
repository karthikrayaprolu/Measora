from typing import Dict, List, Optional

from pydantic import BaseModel

from app.schemas.common import PoseLabel, ProductType


class PoseIllustrations(BaseModel):
    A: Optional[str] = None
    B: Optional[str] = None
    C: Optional[str] = None
    D: Optional[str] = None


class ProductResponse(BaseModel):
    id: ProductType
    label: str
    required_poses: List[PoseLabel]
    optional_poses: List[PoseLabel]
    pose_illustrations: Dict[str, str]


class ProductListResponse(BaseModel):
    products: List[ProductResponse]
