import logging
import math
import traceback
import numpy as np
import cv2
import os
import threading
from typing import Dict, List, Tuple
from app.schemas.frame import ValidationResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MediaPipe initialisation   runs once at import time.
# If the package is missing or the model file is absent the rest of the
# module degrades gracefully: human-detection is skipped and pose validation
# returns a safe "unavailable" result instead of crashing.
# ---------------------------------------------------------------------------
pose_estimator = None
mp = None

try:
    import mediapipe as mp  # noqa: F401  (reassigns module-level ``mp``)
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    _model_path = os.path.join(
        os.path.dirname(__file__), "..", "models", "pose_landmarker.task"
    )
    if not os.path.exists(_model_path):
        raise FileNotFoundError(
            f"MediaPipe model not found at: {os.path.abspath(_model_path)}"
        )

    _base_options = python.BaseOptions(model_asset_path=_model_path)
    _options = vision.PoseLandmarkerOptions(
        base_options=_base_options,
        output_segmentation_masks=False,
    )
    pose_estimator = vision.PoseLandmarker.create_from_options(_options)
    logger.info("MediaPipe PoseLandmarker initialised successfully")
except Exception:  # broad catch: ImportError, FileNotFoundError, native crashes
    logger.warning(
        "MediaPipe failed to initialise   pose detection unavailable.\n%s",
        traceback.format_exc(),
    )
    mp = None
    pose_estimator = None

# Exported flag   lets callers (e.g. the validate endpoint) know whether
# pose detection is available without re-importing mediapipe themselves.
mp_available: bool = pose_estimator is not None

# Mapping MediaPipe landmark indices to COCO format
MP_TO_COCO = {
    0: "nose",
    7: "left_ear",
    8: "right_ear",
    11: "left_shoulder",
    12: "right_shoulder",
    13: "left_elbow",
    14: "right_elbow",
    15: "left_wrist",
    16: "right_wrist",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
    29: "left_heel",
    30: "right_heel",
}

# MediaPipe task runners are not safe to share across simultaneous request and
# background-worker threads. Concurrent `detect` calls can abort the Python
# process at native level instead of raising a catchable exception.
_pose_detector_lock = threading.Lock()


def contains_human(image_bytes: bytes) -> bool:
    """Return True when MediaPipe detects a human pose in the image.

    **Fail-open policy:** if MediaPipe is unavailable (model missing, library
    not installed, or native crash at startup) this function returns ``True``
    so that uploads are not blocked.  Pose and framing quality are enforced
    separately by the ``validate_frame`` / validate endpoint.  This is the
    correct trade-off: a missed bad photo is recoverable (the user is prompted
    to retake); a false rejection of every photo is a total service outage.
    """
    if not mp_available or pose_estimator is None:
        # MediaPipe unavailable   let the upload proceed; validate endpoint
        # will apply whatever checks are possible without full pose detection.
        logger.warning(
            "contains_human: MediaPipe unavailable   skipping pre-upload human check"
        )
        return True

    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return False

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = detect_pose(img_rgb)
        return bool(results and results.pose_landmarks)
    except Exception:
        logger.warning("contains_human: detection raised an error\n%s", traceback.format_exc())
        # Fail open on unexpected errors too   don't block the user.
        return True


MIN_LANDMARK_CONFIDENCE = 0.65


def detect_pose(image_rgb: np.ndarray):
    """Run MediaPipe pose detection with exclusive access to the task runner."""
    if not mp_available or pose_estimator is None:
        return None
    try:
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        with _pose_detector_lock:
            return pose_estimator.detect(mp_image)
    except Exception:
        logger.warning("detect_pose raised an error\n%s", traceback.format_exc())
        return None

def _calculate_angle(a, b, c):
    """Calculate angle between three points in 2D."""
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    radians = np.arctan2(c[1] - b[1], c[0] - b[0]) - np.arctan2(a[1] - b[1], a[0] - b[0])
    angle = np.abs(radians * 180.0 / np.pi)
    if angle > 180.0:
        angle = 360 - angle
    return angle

def validate_frame(
    image_bytes: bytes,
    pose: str,
    session_height_cm: float,
    product_type: str = "pant",
) -> Tuple[ValidationResult, List[str], float]:
    
    # 0. Early Lighting & Contrast Check (before expensive AI)
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return ValidationResult(reason="INVALID_IMAGE"), ["Invalid image data"], 0.0

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    brightness = np.mean(gray)
    contrast = np.std(gray)
    if brightness < 40 or contrast < 20:
        res = ValidationResult(lighting_ok=False, reason="POOR_LIGHTING")
        return res, ["Lighting too low or poor contrast   move to a brighter area"], 0.0

    if not mp_available or pose_estimator is None:
        # Pose detection unavailable   return a soft pass so the upload is not
        # permanently blocked. The UI will still show guidance prompts.
        return (
            ValidationResult(
                pose_match_confidence=0.9,
                full_body_visible=True,
                lighting_ok=True,
                framing_ok=True,
                camera_angle_ok=True,
                reason="DETECTION_UNAVAILABLE",
            ),
            ["Pose detection is temporarily unavailable. Your photo has been accepted; results may be less accurate."],
            0.9,
        )

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = detect_pose(img_rgb)

    if not results.pose_landmarks:
        return ValidationResult(reason="NO_PERSON"), ["No person detected in frame"], 0.0

    landmarks = results.pose_landmarks[0]
    
    # 1. Check Visibility of Core Joints (handle side profile occlusions by using max of left/right)
    # We only care that the body spans from head to ankle.
    core_groups = [
        [0],          # Nose
        [11, 12],     # Shoulders
        [13, 14],     # Elbows
        [15, 16],     # Wrists
        [23, 24],     # Hips
        [25, 26],     # Knees
        [27, 28]      # Ankles
    ]

    for group in core_groups:
        max_vis = max([landmarks[idx].visibility for idx in group if idx < len(landmarks)], default=0)
        # For coordinates, check if at least one visible point in the group is inside the frame (0 to 1)
        in_frame = any(
            0 <= landmarks[idx].x <= 1 and 0 <= landmarks[idx].y <= 1 
            for idx in group if idx < len(landmarks) and landmarks[idx].visibility > 0.3
        )
        
        if max_vis < 0.3 or not in_frame:
            res = ValidationResult(lighting_ok=True, full_body_visible=False, reason="LOW_CONFIDENCE_LANDMARK")
            return res, ["Step back or adjust lighting   full body must be clearly visible head-to-toe"], 0.0

    full_body_visible = True

    # 2. Check Framing using bounding box of all landmarks
    req_y = [lm.y for lm in landmarks if lm.visibility > 0.3]
    if not req_y:
        return ValidationResult(reason="NO_PERSON"), ["No person detected"], 0.0
        
    min_y, max_y = min(req_y), max(req_y)
    person_height_ratio = max_y - min_y
    
    framing_ok = 0.2 <= person_height_ratio <= 0.98
    if not framing_ok:
        res = ValidationResult(lighting_ok=True, full_body_visible=True, framing_ok=False, reason="OUT_OF_FRAME")
        return res, ["Adjust your distance from the camera. Fill 20% to 98% of the frame."], 0.0

    # NEW: Check if arms are relaxed at sides (wrists should be lower than hips, y increases downwards)
    # Wrists: 15, 16. Hips: 23, 24.
    l_wrist, r_wrist = landmarks[15], landmarks[16]
    l_hip, r_hip = landmarks[23], landmarks[24]
    
    if l_wrist.y < (l_hip.y - 0.1) or r_wrist.y < (r_hip.y - 0.1):
        res = ValidationResult(lighting_ok=True, full_body_visible=True, framing_ok=True, camera_angle_ok=True, reason="ARMS_NOT_RELAXED")
        return res, ["Keep your arms fully relaxed down at your sides."], 0.0

    # Arm separation check: ensure arms aren't flush against the torso
    if pose == "A":
        # Need some x-distance between wrist and hip
        if abs(l_wrist.x - l_hip.x) < 0.03 or abs(r_wrist.x - r_hip.x) < 0.03:
            res = ValidationResult(lighting_ok=True, full_body_visible=True, framing_ok=True, camera_angle_ok=True, reason="ARMS_TOO_CLOSE")
            return res, ["Move your arms slightly away from your torso so we can see your body outline clearly."], 0.0

    # 3. Check Pose Match
    pose_match_confidence = 0.0
    if pose == "A":
        l_shoulder = [landmarks[11].x, landmarks[11].y]
        l_elbow = [landmarks[13].x, landmarks[13].y]
        l_hip = [landmarks[23].x, landmarks[23].y]
        r_shoulder = [landmarks[12].x, landmarks[12].y]
        r_elbow = [landmarks[14].x, landmarks[14].y]
        r_hip = [landmarks[24].x, landmarks[24].y]
        
        l_arm_angle = _calculate_angle(l_elbow, l_shoulder, l_hip)
        r_arm_angle = _calculate_angle(r_elbow, r_shoulder, r_hip)
        
        # Relaxed A-pose thresholds: allow 5 to 90 degrees (just not completely raised)
        if 5 < l_arm_angle < 90 and 5 < r_arm_angle < 90:
            pose_match_confidence = 0.95
        else:
            pose_match_confidence = 0.4 
    elif pose == "B":
        shoulder_dist = abs(landmarks[11].x - landmarks[12].x)
        # Relaxed side profile threshold: allow up to 20% width separation
        if shoulder_dist < 0.2:
            pose_match_confidence = 0.95
        else:
            pose_match_confidence = 0.4
    else:
        pose_match_confidence = 0.95

    # 4. Check Camera Angle via Z-depth (REMOVED)
    # MediaPipe's synthetic Z-depth is highly unreliable for static 2D images, causing false "steep angle" rejections.
    camera_angle_ok = True

    result = ValidationResult(
        pose_match_confidence=pose_match_confidence,
        full_body_visible=True,
        lighting_ok=True,
        framing_ok=True,
        camera_angle_ok=True,
        baggy_clothing_flag=False,
    )

    prompts = []
    if not pose_match_confidence > 0.75: 
        prompts.append("Pose does not match the required template")
        result.reason = "POOR_POSE_MATCH"

    return result, prompts, pose_match_confidence

def run_keypoint_estimation(image_bytes: bytes, pose: str = "A") -> List[Dict]:
    if not mp_available or pose_estimator is None:
        return []

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = detect_pose(img_rgb)

    keypoints = []
    if results.pose_landmarks:
        lms = results.pose_landmarks[0]
        
        # 1. First pass: map raw points and assign tiers
        raw_map = {}
        for idx, name in MP_TO_COCO.items():
            lm = lms[idx]
            vis = lm.visibility
            if vis >= 0.85: tier = "HIGH"
            elif vis >= MIN_LANDMARK_CONFIDENCE: tier = "MEDIUM"
            else: tier = "LOW"
            
            raw_map[name] = {
                "name": name,
                "x": lm.x,
                "y": lm.y,
                "z": getattr(lm, 'z', 0.0),
                "confidence": vis,
                "tier": tier,
                "inferred": False
            }
            
        # SUPPRESS UNUSED LANDMARKS FOR FRONT AND SIDE PHOTOS
        filtered_map = {}
        
        if pose == "A":
            # Front pose requires all bilateral body points but no eyes/ears
            FRONT_INDICES = {0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 30}
            for k, v in raw_map.items():
                idx = [i for i, name in MP_TO_COCO.items() if name == k][0]
                if idx in FRONT_INDICES:
                    filtered_map[k] = v
        
        elif pose == "B":
            # Side pose requires only the camera-facing side
            left_indices = [11, 13, 15, 23, 25, 27]
            right_indices = [12, 14, 16, 24, 26, 28]
            
            left_vis = sum(lms[i].visibility for i in left_indices) / len(left_indices)
            right_vis = sum(lms[i].visibility for i in right_indices) / len(right_indices)
            
            if left_vis > right_vis:
                # Left side is facing camera
                head_idx = 0 if lms[0].visibility > lms[7].visibility else 7
                SIDE_INDICES = {head_idx, 11, 23, 25, 27, 29}
            else:
                # Right side is facing camera
                head_idx = 0 if lms[0].visibility > lms[8].visibility else 8
                SIDE_INDICES = {head_idx, 12, 24, 26, 28, 30}
                
            for k, v in raw_map.items():
                idx = [i for i, name in MP_TO_COCO.items() if name == k][0]
                if idx in SIDE_INDICES:
                    filtered_map[k] = v

        raw_map = filtered_map

        # OUTLIER DETECTION
        high_points = [p for p in raw_map.values() if p["tier"] == "HIGH"]
        if high_points:
            min_x = min(p["x"] for p in high_points)
            max_x = max(p["x"] for p in high_points)
            min_y = min(p["y"] for p in high_points)
            max_y = max(p["y"] for p in high_points)
            
            # Add dynamic margin, bounded to a reasonable minimum
            margin_x = max(0.15, (max_x - min_x) * 0.3)
            margin_y = max(0.15, (max_y - min_y) * 0.15)
            
            for p in raw_map.values():
                if p["tier"] != "HIGH":
                    if (p["x"] < min_x - margin_x or p["x"] > max_x + margin_x or 
                        p["y"] < min_y - margin_y or p["y"] > max_y + margin_y):
                        p["tier"] = "LOW"
                        p["confidence"] = 0.0
            
        # 2. Inference Pass
        # SYMMETRY INFERENCE (Only for Front Pose 'A')
        if pose == "A":
            pairs = [("left_shoulder", "right_shoulder"), ("left_hip", "right_hip"), 
                     ("left_knee", "right_knee"), ("left_ankle", "right_ankle"),
                     ("left_elbow", "right_elbow"), ("left_wrist", "right_wrist")]
            nose = raw_map.get("nose")
            if nose and nose["tier"] in ["HIGH", "MEDIUM"]:
                for left, right in pairs:
                    if left in raw_map and right in raw_map:
                        l_pt = raw_map[left]
                        r_pt = raw_map[right]
                        if l_pt["tier"] == "LOW" and r_pt["tier"] == "HIGH":
                            l_pt["x"] = nose["x"] - (r_pt["x"] - nose["x"])
                            l_pt["y"] = r_pt["y"]
                            l_pt["tier"] = "MEDIUM"
                            l_pt["inferred"] = True
                        elif r_pt["tier"] == "LOW" and l_pt["tier"] == "HIGH":
                            r_pt["x"] = nose["x"] + (nose["x"] - l_pt["x"])
                            r_pt["y"] = l_pt["y"]
                            r_pt["tier"] = "MEDIUM"
                            r_pt["inferred"] = True

        # KINEMATIC INFERENCE
        # If elbow is LOW but shoulder and wrist are HIGH, interpolate
        chains = [
            ("left_shoulder", "left_elbow", "left_wrist"),
            ("right_shoulder", "right_elbow", "right_wrist"),
            ("left_hip", "left_knee", "left_ankle"),
            ("right_hip", "right_knee", "right_ankle")
        ]
        for a, b, c in chains:
            if a in raw_map and b in raw_map and c in raw_map:
                pt_a, pt_b, pt_c = raw_map[a], raw_map[b], raw_map[c]
                if pt_b["tier"] == "LOW" and pt_a["tier"] == "HIGH" and pt_c["tier"] == "HIGH":
                    pt_b["x"] = (pt_a["x"] + pt_c["x"]) / 2.0
                    pt_b["y"] = (pt_a["y"] + pt_c["y"]) / 2.0
                    pt_b["tier"] = "MEDIUM"
                    pt_b["inferred"] = True

        keypoints = list(raw_map.values())
            
    return keypoints
