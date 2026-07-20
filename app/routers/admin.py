"""
POST   /v1/admin/brands                           — add a new brand
PUT    /v1/admin/brands/{brand_id}/size-charts    — update brand size charts
DELETE /v1/admin/brands/{brand_id}                — remove a brand
REQ-400-07, REQ-NFR-08
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import BrandNotFoundError
from app.core.security import get_admin_user
from app.db.database import get_db
from app.db import models
from app.schemas.brand import (
    BrandCreateRequest,
    BrandResponse,
    SizeChartUpdateRequest,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/brands", response_model=BrandResponse, status_code=201)
def create_brand(
    payload: BrandCreateRequest,
    admin_user: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Add a new brand to the size chart catalogue.
    Admin only.
    """
    brand = models.Brand(name=payload.name)
    brand.set_supported_products(payload.supported_products)
    db.add(brand)
    db.commit()
    db.refresh(brand)

    return BrandResponse(
        id=brand.id,
        name=brand.name,
        supported_products=brand.get_supported_products(),
    )


@router.put("/brands/{brand_id}/size-charts", response_model=dict)
def update_size_charts(
    brand_id: str,
    product_type: str,
    payload: SizeChartUpdateRequest,
    admin_user: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Replace the full size chart for a brand + product type.
    Supports all regional size systems (EU, US, UK, Asian).
    Admin only. REQ-400-07, REQ-400-08
    """
    brand = db.query(models.Brand).filter(models.Brand.id == brand_id).first()
    if not brand:
        raise BrandNotFoundError(brand_id)

    # Delete existing entries for this brand+product
    db.query(models.SizeChartEntry).filter(
        models.SizeChartEntry.brand_id == brand_id,
        models.SizeChartEntry.product_type == product_type,
    ).delete()

    # Insert new entries
    for entry in payload.entries:
        sce = models.SizeChartEntry(
            brand_id=brand_id,
            product_type=product_type,
            size_label=entry.size_label,
            chest_min_cm=entry.chest_min_cm,
            chest_max_cm=entry.chest_max_cm,
            waist_min_cm=entry.waist_min_cm,
            waist_max_cm=entry.waist_max_cm,
            hip_min_cm=entry.hip_min_cm,
            hip_max_cm=entry.hip_max_cm,
            shoulder_min_cm=entry.shoulder_min_cm,
            shoulder_max_cm=entry.shoulder_max_cm,
            inseam_min_cm=entry.inseam_min_cm,
            inseam_max_cm=entry.inseam_max_cm,
            foot_length_min_mm=entry.foot_length_min_mm,
            foot_length_max_mm=entry.foot_length_max_mm,
        )
        sce.set_size_systems(entry.size_systems)
        db.add(sce)

    # Update supported products list
    supported = brand.get_supported_products()
    if product_type not in supported:
        supported.append(product_type)
        brand.set_supported_products(supported)

    brand.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "brand_id": brand_id,
        "product_type": product_type,
        "entries_updated": len(payload.entries),
        "message": "Size chart updated successfully",
    }


@router.delete("/brands/{brand_id}", status_code=204)
def delete_brand(
    brand_id: str,
    admin_user: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Remove a brand and all its size chart entries.
    Admin only. REQ-400-07
    """
    brand = db.query(models.Brand).filter(models.Brand.id == brand_id).first()
    if not brand:
        raise BrandNotFoundError(brand_id)

    db.delete(brand)
    db.commit()
    return None
