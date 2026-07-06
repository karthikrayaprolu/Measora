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
            "A": "https://cdn.measora.io/poses/shirt_front.png",
            "B": "https://cdn.measora.io/poses/shirt_side.png",
            "C": "https://cdn.measora.io/poses/shirt_back.png",
        },
    ),
    ProductResponse(
        id="tshirt",
        label="T-Shirt",
        required_poses=["A", "B"],
        optional_poses=["C"],
        pose_illustrations={
            "A": "https://cdn.measora.io/poses/tshirt_front.png",
            "B": "https://cdn.measora.io/poses/tshirt_side.png",
            "C": "https://cdn.measora.io/poses/tshirt_back.png",
        },
    ),
    ProductResponse(
        id="pant",
        label="Pant",
        required_poses=["A", "B"],
        optional_poses=[],
        pose_illustrations={
            "A": "https://cdn.measora.io/poses/pant_front.png",
            "B": "https://cdn.measora.io/poses/pant_side.png",
        },
    ),
    ProductResponse(
        id="footwear",
        label="Footwear",
        required_poses=["D"],
        optional_poses=[],
        pose_illustrations={
            "D": "https://cdn.measora.io/poses/foot_topdown.png",
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
