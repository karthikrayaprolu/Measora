"""
Seed script: inserts a set of brands and realistic size charts into the DB.
Called automatically on startup if the brands table is empty.
"""
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import Brand, SizeChartEntry


SEED_DATA = [
    {
        "id": "brand_nike",
        "name": "Nike",
        "supported_products": ["shirt", "tshirt", "footwear"],
        "size_charts": {
            "shirt": [
                {"label": "XS", "systems": {"EU": "XS", "US": "XS", "UK": "XS", "Asian": "S"},
                 "chest": (80, 88), "waist": (64, 72), "shoulder": (38, 40)},
                {"label": "S",  "systems": {"EU": "S",  "US": "S",  "UK": "S",  "Asian": "M"},
                 "chest": (88, 96), "waist": (72, 80), "shoulder": (40, 42)},
                {"label": "M",  "systems": {"EU": "M",  "US": "M",  "UK": "M",  "Asian": "L"},
                 "chest": (96, 104), "waist": (80, 88), "shoulder": (42, 44)},
                {"label": "L",  "systems": {"EU": "L",  "US": "L",  "UK": "L",  "Asian": "XL"},
                 "chest": (104, 112), "waist": (88, 96), "shoulder": (44, 46)},
                {"label": "XL", "systems": {"EU": "XL", "US": "XL", "UK": "XL", "Asian": "XXL"},
                 "chest": (112, 120), "waist": (96, 104), "shoulder": (46, 48)},
                {"label": "XXL","systems": {"EU": "XXL","US": "XXL","UK": "XXL","Asian": "3XL"},
                 "chest": (120, 130), "waist": (104, 114), "shoulder": (48, 50)},
            ],
            "tshirt": [
                {"label": "XS", "systems": {"EU": "XS", "US": "XS", "UK": "XS", "Asian": "S"},
                 "chest": (80, 88), "waist": (64, 72), "shoulder": (38, 40)},
                {"label": "S",  "systems": {"EU": "S",  "US": "S",  "UK": "S",  "Asian": "M"},
                 "chest": (88, 96), "waist": (72, 80), "shoulder": (40, 42)},
                {"label": "M",  "systems": {"EU": "M",  "US": "M",  "UK": "M",  "Asian": "L"},
                 "chest": (96, 104), "waist": (80, 88), "shoulder": (42, 44)},
                {"label": "L",  "systems": {"EU": "L",  "US": "L",  "UK": "L",  "Asian": "XL"},
                 "chest": (104, 112), "waist": (88, 96), "shoulder": (44, 46)},
                {"label": "XL", "systems": {"EU": "XL", "US": "XL", "UK": "XL", "Asian": "XXL"},
                 "chest": (112, 120), "waist": (96, 104), "shoulder": (46, 48)},
            ],
            "footwear": [
                {"label": "7",  "systems": {"EU": "40", "US": "7",  "UK": "6",  "Asian": "250"},
                 "foot_length": (247, 254)},
                {"label": "8",  "systems": {"EU": "41", "US": "8",  "UK": "7",  "Asian": "260"},
                 "foot_length": (254, 261)},
                {"label": "9",  "systems": {"EU": "42", "US": "9",  "UK": "8",  "Asian": "270"},
                 "foot_length": (261, 268)},
                {"label": "10", "systems": {"EU": "43", "US": "10", "UK": "9",  "Asian": "275"},
                 "foot_length": (268, 276)},
                {"label": "11", "systems": {"EU": "44", "US": "11", "UK": "10", "Asian": "285"},
                 "foot_length": (276, 283)},
                {"label": "12", "systems": {"EU": "45", "US": "12", "UK": "11", "Asian": "290"},
                 "foot_length": (283, 290)},
            ],
        },
    },
    {
        "id": "brand_adidas",
        "name": "Adidas",
        "supported_products": ["shirt", "tshirt", "footwear"],
        "size_charts": {
            "shirt": [
                {"label": "S",  "systems": {"EU": "S",  "US": "S",  "UK": "S",  "Asian": "M"},
                 "chest": (86, 94), "waist": (70, 78), "shoulder": (39, 41)},
                {"label": "M",  "systems": {"EU": "M",  "US": "M",  "UK": "M",  "Asian": "L"},
                 "chest": (94, 102), "waist": (78, 86), "shoulder": (41, 43)},
                {"label": "L",  "systems": {"EU": "L",  "US": "L",  "UK": "L",  "Asian": "XL"},
                 "chest": (102, 110), "waist": (86, 94), "shoulder": (43, 45)},
                {"label": "XL", "systems": {"EU": "XL", "US": "XL", "UK": "XL", "Asian": "XXL"},
                 "chest": (110, 118), "waist": (94, 102), "shoulder": (45, 47)},
            ],
            "tshirt": [
                {"label": "S",  "systems": {"EU": "S",  "US": "S",  "UK": "S",  "Asian": "M"},
                 "chest": (86, 94), "waist": (70, 78), "shoulder": (39, 41)},
                {"label": "M",  "systems": {"EU": "M",  "US": "M",  "UK": "M",  "Asian": "L"},
                 "chest": (94, 102), "waist": (78, 86), "shoulder": (41, 43)},
                {"label": "L",  "systems": {"EU": "L",  "US": "L",  "UK": "L",  "Asian": "XL"},
                 "chest": (102, 110), "waist": (86, 94), "shoulder": (43, 45)},
            ],
            "footwear": [
                {"label": "7",  "systems": {"EU": "40", "US": "7",  "UK": "6.5","Asian": "250"},
                 "foot_length": (247, 254)},
                {"label": "8",  "systems": {"EU": "41", "US": "8",  "UK": "7.5","Asian": "260"},
                 "foot_length": (254, 261)},
                {"label": "9",  "systems": {"EU": "42", "US": "9",  "UK": "8.5","Asian": "270"},
                 "foot_length": (261, 268)},
                {"label": "10", "systems": {"EU": "43", "US": "10", "UK": "9.5","Asian": "275"},
                 "foot_length": (268, 276)},
                {"label": "11", "systems": {"EU": "44", "US": "11", "UK": "10.5","Asian":"285"},
                 "foot_length": (276, 283)},
            ],
        },
    },
    {
        "id": "brand_levis",
        "name": "Levi's",
        "supported_products": ["pant"],
        "size_charts": {
            "pant": [
                {"label": "28x30","systems": {"EU": "28x30","US": "28W/30L","UK": "28x30","Asian": "70x76"},
                 "waist": (69, 73), "inseam": (74, 78), "hip": (88, 92)},
                {"label": "30x30","systems": {"EU": "30x30","US": "30W/30L","UK": "30x30","Asian": "76x76"},
                 "waist": (74, 78), "inseam": (74, 78), "hip": (92, 97)},
                {"label": "32x30","systems": {"EU": "32x30","US": "32W/30L","UK": "32x30","Asian": "81x76"},
                 "waist": (79, 83), "inseam": (74, 78), "hip": (97, 102)},
                {"label": "32x32","systems": {"EU": "32x32","US": "32W/32L","UK": "32x32","Asian": "81x81"},
                 "waist": (79, 83), "inseam": (79, 83), "hip": (97, 102)},
                {"label": "34x32","systems": {"EU": "34x32","US": "34W/32L","UK": "34x32","Asian": "86x81"},
                 "waist": (84, 88), "inseam": (79, 83), "hip": (102, 107)},
                {"label": "36x32","systems": {"EU": "36x32","US": "36W/32L","UK": "36x32","Asian": "91x81"},
                 "waist": (89, 93), "inseam": (79, 83), "hip": (107, 113)},
            ],
        },
    },
    {
        "id": "brand_hm",
        "name": "H&M",
        "supported_products": ["shirt", "tshirt", "pant"],
        "size_charts": {
            "shirt": [
                {"label": "XS", "systems": {"EU": "XS", "US": "XS", "UK": "XS", "Asian": "S"},
                 "chest": (82, 88), "waist": (66, 72), "shoulder": (38, 40)},
                {"label": "S",  "systems": {"EU": "S",  "US": "S",  "UK": "S",  "Asian": "M"},
                 "chest": (88, 94), "waist": (72, 78), "shoulder": (40, 42)},
                {"label": "M",  "systems": {"EU": "M",  "US": "M",  "UK": "M",  "Asian": "L"},
                 "chest": (94, 100), "waist": (78, 84), "shoulder": (42, 44)},
                {"label": "L",  "systems": {"EU": "L",  "US": "L",  "UK": "L",  "Asian": "XL"},
                 "chest": (100, 108), "waist": (84, 92), "shoulder": (44, 46)},
                {"label": "XL", "systems": {"EU": "XL", "US": "XL", "UK": "XL", "Asian": "XXL"},
                 "chest": (108, 116), "waist": (92, 100), "shoulder": (46, 48)},
            ],
            "tshirt": [
                {"label": "S",  "systems": {"EU": "S",  "US": "S",  "UK": "S",  "Asian": "M"},
                 "chest": (86, 94), "waist": (70, 78), "shoulder": (40, 42)},
                {"label": "M",  "systems": {"EU": "M",  "US": "M",  "UK": "M",  "Asian": "L"},
                 "chest": (94, 102), "waist": (78, 86), "shoulder": (42, 44)},
                {"label": "L",  "systems": {"EU": "L",  "US": "L",  "UK": "L",  "Asian": "XL"},
                 "chest": (102, 110), "waist": (86, 94), "shoulder": (44, 46)},
            ],
            "pant": [
                {"label": "S",  "systems": {"EU": "S",  "US": "S",  "UK": "S",  "Asian": "M"},
                 "waist": (70, 78), "inseam": (74, 82), "hip": (90, 98)},
                {"label": "M",  "systems": {"EU": "M",  "US": "M",  "UK": "M",  "Asian": "L"},
                 "waist": (78, 86), "inseam": (74, 82), "hip": (98, 106)},
                {"label": "L",  "systems": {"EU": "L",  "US": "L",  "UK": "L",  "Asian": "XL"},
                 "waist": (86, 94), "inseam": (74, 82), "hip": (106, 114)},
            ],
        },
    },
]


def seed_brands(db: Session) -> None:
    """Insert brands and size charts if the brands table is empty."""
    if db.query(Brand).count() > 0:
        return  # already seeded

    for bd in SEED_DATA:
        brand = Brand(
            id=bd["id"],
            name=bd["name"],
        )
        brand.set_supported_products(bd["supported_products"])
        db.add(brand)

        for product_type, entries in bd["size_charts"].items():
            for entry in entries:
                sce = SizeChartEntry(
                    brand_id=bd["id"],
                    product_type=product_type,
                    size_label=entry["label"],
                )
                sce.set_size_systems(entry.get("systems", {}))

                # Body measurements
                if "chest" in entry:
                    sce.chest_min_cm, sce.chest_max_cm = entry["chest"]
                if "waist" in entry:
                    sce.waist_min_cm, sce.waist_max_cm = entry["waist"]
                if "hip" in entry:
                    sce.hip_min_cm, sce.hip_max_cm = entry["hip"]
                if "shoulder" in entry:
                    sce.shoulder_min_cm, sce.shoulder_max_cm = entry["shoulder"]
                if "inseam" in entry:
                    sce.inseam_min_cm, sce.inseam_max_cm = entry["inseam"]

                # Foot measurements
                if "foot_length" in entry:
                    sce.foot_length_min_mm, sce.foot_length_max_mm = entry["foot_length"]

                db.add(sce)

    db.commit()
