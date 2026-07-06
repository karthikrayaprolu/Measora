from enum import Enum


class ProductType(str, Enum):
    shirt = "shirt"
    tshirt = "tshirt"
    pant = "pant"
    footwear = "footwear"


class PoseLabel(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class CalibrationMethod(str, Enum):
    height = "height"
    reference_card = "reference_card"
    lidar = "lidar"


class FitPreference(str, Enum):
    slim = "slim"
    regular = "regular"
    relaxed = "relaxed"


class SessionStatus(str, Enum):
    awaiting_capture = "awaiting_capture"
    capturing = "capturing"
    fast_processing = "fast_processing"
    fast_ready = "fast_ready"
    accurate_processing = "accurate_processing"
    complete = "complete"
    failed = "failed"


class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    complete = "complete"
    failed = "failed"


class TierLabel(str, Enum):
    fast = "fast"
    accurate = "accurate"


class ConfidenceLevel(str, Enum):
    high = "High"
    medium = "Medium"
    low = "Low"
