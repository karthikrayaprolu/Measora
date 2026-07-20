"""
GET /v1/products
Returns all supported product types with their required/optional poses.
REQ-000-01, REQ-000-02, REQ-000-06
"""
from fastapi import APIRouter

from app.schemas.product import ProductListResponse, ProductResponse

router = APIRouter(prefix="/products", tags=["Products"])

PRODUCT_CATALOGUE = [
    ProductResponse(
        id="shirt",
        label="Shirt",
        required_poses=["A", "B"],
        optional_poses=["C"],
        pose_illustrations={
            "A": "/assets/poses/pose_A.png",
            "B": "/assets/poses/pose_B.png",
            "C": "/assets/poses/pose_C.png",
        },
    ),
    ProductResponse(
        id="tshirt",
        label="T-Shirt",
        required_poses=["A", "B"],
        optional_poses=["C"],
        pose_illustrations={
            "A": "/assets/poses/pose_A.png",
            "B": "/assets/poses/pose_B.png",
            "C": "/assets/poses/pose_C.png",
        },
    ),
    ProductResponse(
        id="pant",
        label="Pant",
        required_poses=["A", "B"],
        optional_poses=[],
        pose_illustrations={
            "A": "/assets/poses/pose_A.png",
            "B": "/assets/poses/pose_B.png",
        },
    ),
    ProductResponse(
        id="footwear",
        label="Footwear",
        required_poses=["D"],
        optional_poses=[],
        pose_illustrations={
            "D": "/assets/poses/pose_D.png",
        },
    ),
]


@router.get("", response_model=ProductListResponse)
def list_products():
    """
    Returns all product types supported by Measora along with their
    required and optional poses and reference illustration URLs.
    """
    return ProductListResponse(products=PRODUCT_CATALOGUE)
