"""
POST /v1/sessions/{session_id}/frames                    — upload a captured frame
POST /v1/sessions/{session_id}/frames/{frame_id}/validate — validate an uploaded frame
REQ-100-07, REQ-100-08, REQ-100-04, REQ-100-05, REQ-100-06
"""
import json
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import (
    FileTooLargeError,
    FrameNotFoundError,
    SessionNotFoundError,
)
from app.core.security import get_current_user
from app.db.database import get_db
from app.db import models
from app.schemas.frame import FrameUploadResponse, FrameValidateResponse, ValidationResult, FrameConfirmPointsRequest
from app.services.pose_service import validate_frame, run_keypoint_estimation

router = APIRouter(prefix="/sessions", tags=["Frames"])

REQUIRED_POSES = {
    "shirt": ["A", "B"],
    "tshirt": ["A", "B"],
    "pant": ["A", "B"],
    "footwear": ["A", "B"],
}


@router.post("/{session_id}/frames", response_model=FrameUploadResponse, status_code=201)
async def upload_frame(
    session_id: str,
    pose: str = Form(..., description="Pose label: A, B, C, or D"),
    sub_view: Optional[str] = Form(None, description="For Pose D: 'top_down' or 'side'"),
    foot: Optional[str] = Form(None, description="For Pose D: 'left' or 'right'"),
    image: UploadFile = File(..., description="JPEG or PNG image, max 20 MB"),
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a captured still frame for the specified pose.
    Automatically accepted on upload (validation can be run separately).
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    # Check file size
    content = await image.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise FileTooLargeError(settings.MAX_UPLOAD_SIZE_MB)

    # Save file to disk
    upload_dir = os.path.join(settings.UPLOAD_DIR, session_id)
    os.makedirs(upload_dir, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    ext = (image.filename or "frame.jpg").rsplit(".", 1)[-1].lower()
    filename = f"{pose}_{sub_view or 'na'}_{foot or 'na'}_{ts}.{ext}"
    file_path = os.path.join(upload_dir, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # Persist frame record
    frame = models.Frame(
        session_id=session_id,
        pose=pose.upper(),
        sub_view=sub_view,
        foot=foot,
        file_path=file_path,
        accepted=True,
    )
    db.add(frame)

    # Update session status
    if session.status == "awaiting_capture":
        session.status = "capturing"

    db.commit()
    db.refresh(frame)

    # Determine remaining poses
    captured = [f.pose for f in session.frames if f.accepted]
    required = REQUIRED_POSES.get(session.product_type, [])
    remaining = [p for p in required if p not in captured]

    return FrameUploadResponse(
        frame_id=frame.id,
        pose=frame.pose,
        accepted=True,
        poses_remaining=remaining,
        all_poses_captured=len(remaining) == 0,
    )


@router.post(
    "/{session_id}/frames/{frame_id}/validate",
    response_model=FrameValidateResponse,
)
def validate_uploaded_frame(
    session_id: str,
    frame_id: str,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Run server-side pose validation on an already-uploaded frame.
    Useful as a fallback when the WebSocket live-guidance was not used.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    frame = (
        db.query(models.Frame)
        .filter(models.Frame.id == frame_id, models.Frame.session_id == session_id)
        .first()
    )
    if not frame:
        raise FrameNotFoundError(frame_id)

    # Read stored image
    try:
        with open(frame.file_path, "rb") as f:
            image_bytes = f.read()
    except FileNotFoundError:
        image_bytes = b""

    validation, prompts, confidence = validate_frame(
        image_bytes=image_bytes,
        pose=frame.pose,
        session_height_cm=session.height_cm,
        product_type=session.product_type,
    )
    
    landmarks = run_keypoint_estimation(image_bytes, pose=frame.pose)

    accepted = (
        validation.pose_match_confidence >= 0.75
        and validation.full_body_visible
        and validation.lighting_ok
        and validation.framing_ok
        and validation.camera_angle_ok
    )

    # Threshold Check: If >2 LOW confidence points remain after inference, force retake
    if accepted:
        if frame.pose == "A":
            # Front photo: all points are expected to be visible (after symmetry inference)
            low_points = [p for p in landmarks if p.get("tier") == "LOW"]
            missing_count = len(low_points)
        else:
            # Side photo: expect half the body to be occluded. Check if BOTH sides are missing.
            missing_count = 0
            tier_map = {p["name"]: p.get("tier") for p in landmarks}
            groups = [
                ["nose"], ["left_eye"], 
                ["left_shoulder", "right_shoulder"],
                ["left_elbow", "right_elbow"],
                ["left_wrist", "right_wrist"],
                ["left_hip", "right_hip"],
                ["left_knee", "right_knee"],
                ["left_ankle", "right_ankle"]
            ]
            for group in groups:
                best_tier = "LOW"
                for name in group:
                    if tier_map.get(name) in ["HIGH", "MEDIUM"]:
                        best_tier = "HIGH"
                if best_tier == "LOW" and any(name in tier_map for name in group):
                    missing_count += 1

        if missing_count > 2:
            accepted = False
            validation.reason = "TOO_MANY_LOW_CONFIDENCE_POINTS"
            if frame.pose == "B":
                prompts.append("This photo needs to be retaken. Ensure your body is turned 90 degrees and try moving your near arm slightly forward, away from your body, so it doesn't block your hips/legs.")
            else:
                prompts.append("This photo needs to be retaken for accurate results. Too many body parts are obscured or unclear.")

    frame.accepted = accepted
    db.commit()

    return FrameValidateResponse(
        frame_id=frame.id,
        pose=frame.pose,
        validation=validation,
        accepted=accepted,
        guidance_prompts=prompts,
        landmarks=landmarks,
    )


@router.post("/{session_id}/frames/{frame_id}/confirm-points")
def confirm_frame_points(
    session_id: str,
    frame_id: str,
    payload: FrameConfirmPointsRequest,
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Accept user-confirmed (or adjusted) landmarks and save them to the frame.
    """
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise SessionNotFoundError(session_id)

    frame = (
        db.query(models.Frame)
        .filter(models.Frame.id == frame_id, models.Frame.session_id == session_id)
        .first()
    )
    if not frame:
        raise FrameNotFoundError(frame_id)

    frame.landmarks_json = json.dumps(payload.landmarks)
    db.commit()


    return {"status": "success"}
