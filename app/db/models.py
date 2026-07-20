import json
import uuid
from datetime import datetime, timezone

def utcnow():
    return datetime.now(timezone.utc)


from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


def _new_id() -> str:
    return str(uuid.uuid4()).replace("-", "")[:16]


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------
class Session(Base):
    __tablename__ = "sessions"

    id = Column(String(16), primary_key=True, default=_new_id)
    user_id = Column(String(64), nullable=False, index=True)
    product_type = Column(String(32), nullable=False)
    height_cm = Column(Float, nullable=False)
    calibration_method = Column(String(32), default="height")
    fit_preference = Column(String(16), default="regular")
    optional_poses = Column(Text, default="[]")
    store_profile = Column(Boolean, default=False)
    has_scale_mismatch = Column(Boolean, default=False)
    status = Column(String(32), default="awaiting_capture")
    created_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    frames = relationship("Frame", back_populates="session", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="session", cascade="all, delete-orphan")
    measurements = relationship("Measurement", back_populates="session", cascade="all, delete-orphan")
    size_recommendations = relationship("SizeRecommendation", back_populates="session", cascade="all, delete-orphan")

    def get_optional_poses(self) -> list:
        try:
            return json.loads(self.optional_poses or "[]")
        except Exception:
            return []

    def set_optional_poses(self, poses: list):
        self.optional_poses = json.dumps(poses)


# ---------------------------------------------------------------------------
# Frame
# ---------------------------------------------------------------------------
class Frame(Base):
    __tablename__ = "frames"

    id = Column(String(16), primary_key=True, default=_new_id)
    session_id = Column(String(16), ForeignKey("sessions.id"), nullable=False, index=True)
    pose = Column(String(4), nullable=False)
    sub_view = Column(String(16))
    foot = Column(String(8))
    file_path = Column(String(512), nullable=False)
    accepted = Column(Boolean, default=True)
    landmarks_json = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    session = relationship("Session", back_populates="frames")


# ---------------------------------------------------------------------------
# Job (background processing)
# ---------------------------------------------------------------------------
class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(16), primary_key=True, default=_new_id)
    session_id = Column(String(16), ForeignKey("sessions.id"), nullable=False, index=True)
    job_type = Column(String(32), nullable=False)  # fast_estimate | accurate_estimate | footwear_measure
    status = Column(String(16), default="queued")  # queued | processing | complete | failed
    result_json = Column(Text)
    estimated_seconds = Column(Integer)
    processing_time_ms = Column(Integer)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    session = relationship("Session", back_populates="jobs")

    def get_result(self) -> dict:
        try:
            return json.loads(self.result_json or "{}")
        except Exception:
            return {}

    def set_result(self, data: dict):
        self.result_json = json.dumps(data)


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------
class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(String(16), primary_key=True, default=_new_id)
    session_id = Column(String(16), ForeignKey("sessions.id"), nullable=False, index=True)
    tier = Column(String(16), nullable=False)
    iso_name = Column(String(64), nullable=False)
    value_cm = Column(Float, nullable=False)
    residual_error_cm = Column(Float)
    was_clipped = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    session = relationship("Session", back_populates="measurements")


# ---------------------------------------------------------------------------
# SizeRecommendation
# ---------------------------------------------------------------------------
class SizeRecommendation(Base):
    __tablename__ = "size_recommendations"

    id = Column(String(16), primary_key=True, default=_new_id)
    session_id = Column(String(16), ForeignKey("sessions.id"), nullable=False, index=True)
    brand_id = Column(String(16), nullable=False)
    product_type = Column(String(32), nullable=False)
    recommended_size = Column(String(16), nullable=False)
    size_equivalents = Column(Text, default="{}")
    fit_preference = Column(String(16))
    confidence_score = Column(Float)
    confidence_level = Column(String(8))
    low_confidence = Column(Boolean, default=False)
    recapture_suggested = Column(Boolean, default=False)
    tier_used = Column(String(16))
    share_token = Column(String(32))
    dominant_constraint = Column(String(64))
    created_at = Column(DateTime, default=utcnow)

    session = relationship("Session", back_populates="size_recommendations")

    def get_size_equivalents(self) -> dict:
        try:
            return json.loads(self.size_equivalents or "{}")
        except Exception:
            return {}

    def set_size_equivalents(self, data: dict):
        self.size_equivalents = json.dumps(data)


# ---------------------------------------------------------------------------
# Brand
# ---------------------------------------------------------------------------
class Brand(Base):
    __tablename__ = "brands"

    id = Column(String(16), primary_key=True, default=_new_id)
    name = Column(String(128), nullable=False)
    supported_products = Column(Text, default="[]")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    size_chart_entries = relationship(
        "SizeChartEntry", back_populates="brand", cascade="all, delete-orphan"
    )

    def get_supported_products(self) -> list:
        try:
            return json.loads(self.supported_products or "[]")
        except Exception:
            return []

    def set_supported_products(self, products: list):
        self.supported_products = json.dumps(products)


# ---------------------------------------------------------------------------
# SizeChartEntry
# ---------------------------------------------------------------------------
class SizeChartEntry(Base):
    __tablename__ = "size_chart_entries"

    id = Column(String(16), primary_key=True, default=_new_id)
    brand_id = Column(String(16), ForeignKey("brands.id"), nullable=False, index=True)
    product_type = Column(String(32), nullable=False)
    size_label = Column(String(16), nullable=False)
    size_systems = Column(Text, default="{}")  # {"EU": "M", "US": "M", ...}

    # Body measurements (cm)
    chest_min_cm = Column(Float)
    chest_max_cm = Column(Float)
    waist_min_cm = Column(Float)
    waist_max_cm = Column(Float)
    hip_min_cm = Column(Float)
    hip_max_cm = Column(Float)
    neck_min_cm = Column(Float)
    neck_max_cm = Column(Float)
    shoulder_min_cm = Column(Float)
    shoulder_max_cm = Column(Float)
    inseam_min_cm = Column(Float)
    inseam_max_cm = Column(Float)

    # Foot measurements (mm)
    foot_length_min_mm = Column(Float)
    foot_length_max_mm = Column(Float)
    foot_width_min_mm = Column(Float)
    foot_width_max_mm = Column(Float)

    created_at = Column(DateTime, default=utcnow)

    brand = relationship("Brand", back_populates="size_chart_entries")

    def get_size_systems(self) -> dict:
        try:
            return json.loads(self.size_systems or "{}")
        except Exception:
            return {}

    def set_size_systems(self, data: dict):
        self.size_systems = json.dumps(data)


# ---------------------------------------------------------------------------
# UserProfile
# ---------------------------------------------------------------------------
class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(String(16), primary_key=True, default=_new_id)
    user_id = Column(String(64), nullable=False, index=True)
    profile_name = Column(String(128), default="My Measurements")
    measurements = Column(Text, default="[]")
    confidence_scores = Column(Text, default="{}")
    capture_metadata = Column(Text, default="{}")
    consent_given = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def get_measurements(self) -> list:
        try:
            return json.loads(self.measurements or "[]")
        except Exception:
            return []

    def set_measurements(self, data: list):
        self.measurements = json.dumps(data)

    def get_confidence_scores(self) -> dict:
        try:
            return json.loads(self.confidence_scores or "{}")
        except Exception:
            return {}

    def set_confidence_scores(self, data: dict):
        self.confidence_scores = json.dumps(data)


# ---------------------------------------------------------------------------
# SavedMeasurement
# ---------------------------------------------------------------------------
class SavedMeasurement(Base):
    __tablename__ = "saved_measurements"

    id = Column(String(16), primary_key=True, default=_new_id)
    user_id = Column(String(64), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    measurements_json = Column(Text, default="[]")
    recommended_size = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    def get_measurements(self) -> list:
        try:
            return json.loads(self.measurements_json or "[]")
        except Exception:
            return []

    def set_measurements(self, data: list):
        self.measurements_json = json.dumps(data)

# ---------------------------------------------------------------------------
# TrainingDataLog
# ---------------------------------------------------------------------------
class TrainingDataLog(Base):
    __tablename__ = "training_data_logs"

    id = Column(String(16), primary_key=True, default=_new_id)
    session_id = Column(String(16), ForeignKey("sessions.id"), nullable=True, index=True)
    user_id = Column(String(64), nullable=True, index=True)
    
    height_cm = Column(Float)
    raw_dimensions_json = Column(Text) # chest_w, chest_d, waist_w, etc.
    computed_measurements_json = Column(Text)
    
    confidence_tier = Column(String(16))
    has_scale_mismatch = Column(Boolean)
    any_clipped = Column(Boolean)
    
    ground_truth_json = Column(Text) # From UserProfile.measurements
    
    created_at = Column(DateTime, default=utcnow)
