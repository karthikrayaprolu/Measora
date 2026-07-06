from typing import Dict, List, Optional

from pydantic import BaseModel


class ValidationResult(BaseModel):
    pose_match_confidence: float = 0.0
    full_body_visible: bool = False
    lighting_ok: bool = False
    framing_ok: bool = False
    camera_angle_ok: bool = False
    baggy_clothing_flag: bool = False
    reason: Optional[str] = None


class FrameUploadResponse(BaseModel):
    frame_id: str
    pose: str
    accepted: bool
    poses_remaining: List[str]
    all_poses_captured: bool

    model_config = {"from_attributes": True}


class FrameValidateResponse(BaseModel):
    frame_id: str
    pose: str
    validation: ValidationResult
    accepted: bool
    guidance_prompts: List[str]
    landmarks: List[Dict] = []

    model_config = {"from_attributes": True}

class FrameConfirmPointsRequest(BaseModel):
    landmarks: List[Dict]
