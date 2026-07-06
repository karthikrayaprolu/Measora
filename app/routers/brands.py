"""
GET /v1/brands                             — list all brands (filterable)
GET /v1/brands/{brand_id}/size-charts      — get brand size chart
REQ-400-01, REQ-400-02, REQ-400-07, REQ-400-08
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.exceptions import BrandNotFoundError
from app.db.database import get_db
from app.db import models
from app.schemas.brand import (
    BrandListResponse,
    BrandResponse,
    SizeChartEntrySchema,
    SizeChartResponse,
)

router = APIRouter(prefix="/brands", tags=["Brands"])


@router.get("", response_model=BrandListResponse)
def list_brands(
    product_type: Optional[str] = Query(None, description="Filter by product type"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """
    List all brands in the size chart database.
    Optionally filter by product type (shirt, tshirt, pant, footwear).
    REQ-400-01, REQ-400-07
    """
    query = db.query(models.Brand)
    all_brands = query.all()

    if product_type:
        all_brands = [
            b for b in all_brands
            if product_type in b.get_supported_products()
        ]

    total = len(all_brands)
    start = (page - 1) * limit
    page_brands = all_brands[start: start + limit]

    brand_responses = [
        BrandResponse(
            id=b.id,
            name=b.name,
            supported_products=b.get_supported_products(),
        )
        for b in page_brands
    ]

    return BrandListResponse(brands=brand_responses, total=total, page=page)


@router.get("/{brand_id}/size-charts", response_model=SizeChartResponse)
def get_size_chart(
    brand_id: str,
    product_type: str = Query(..., description="Product type: shirt, tshirt, pant, footwear"),
    db: Session = Depends(get_db),
):
    """
    Retrieve a brand's size chart for a specific product type.
    Includes all regional size systems (EU, US, UK, Asian).
    REQ-400-01, REQ-400-02, REQ-400-07, REQ-400-08
    """
    brand = db.query(models.Brand).filter(models.Brand.id == brand_id).first()
    if not brand:
        raise BrandNotFoundError(brand_id)

    entries = (
        db.query(models.SizeChartEntry)
        .filter(
            models.SizeChartEntry.brand_id == brand_id,
            models.SizeChartEntry.product_type == product_type,
        )
        .all()
    )

    # Collect all size systems present in this chart
    all_systems: set = set()
    entry_schemas: List[SizeChartEntrySchema] = []
    for e in entries:
        systems = e.get_size_systems()
        all_systems.update(systems.keys())
        entry_schemas.append(
            SizeChartEntrySchema(
                size_label=e.size_label,
                size_systems=systems,
                chest_min_cm=e.chest_min_cm,
                chest_max_cm=e.chest_max_cm,
                waist_min_cm=e.waist_min_cm,
                waist_max_cm=e.waist_max_cm,
                hip_min_cm=e.hip_min_cm,
                hip_max_cm=e.hip_max_cm,
                shoulder_min_cm=e.shoulder_min_cm,
                shoulder_max_cm=e.shoulder_max_cm,
                inseam_min_cm=e.inseam_min_cm,
                inseam_max_cm=e.inseam_max_cm,
                foot_length_min_mm=e.foot_length_min_mm,
                foot_length_max_mm=e.foot_length_max_mm,
            )
        )

    return SizeChartResponse(
        brand_id=brand_id,
        product_type=product_type,
        size_systems=sorted(all_systems),
        entries=entry_schemas,
    )
