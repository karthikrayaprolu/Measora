import time
from datetime import datetime, timezone
import math
import json
import cv2
import logging
import numpy as np
from typing import List, Tuple, Dict, Optional
from sqlalchemy.orm import Session as DBSession
from app.db import models
from app.core.config import settings
from app.services.circumference_correction import get_correction_factor
import os

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# A5: Anthropometric range guards.
# Applied to raw widths/depths in cm BEFORE the ellipse formula.
# If a value falls outside this range it is almost certainly a scale/unit
# error   clip it and flag scale_mismatch=True so the caller knows.
# ---------------------------------------------------------------------------
BODY_WIDTH_RANGES: Dict[str, Tuple[float, float]] = {
    "chest_w":  (20.0, 80.0),
    "waist_w":  (15.0, 75.0),
    "hip_w":    (20.0, 80.0),
    "chest_d":  (10.0, 50.0),
    "waist_d":  (8.0,  45.0),
    "hip_d":    (10.0, 55.0),
}

# A3: Visibility threshold for heel vs ankle landmark selection
_HEEL_VIS_THRESHOLD: float = 0.5


# ---------------------------------------------------------------------------
# FakeLandmark / parsing
# ---------------------------------------------------------------------------

class FakeLandmark:
    def __init__(self, x, y, z, visibility):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = visibility


def _parse_landmarks(landmarks_json: str) -> List[FakeLandmark]:
    from app.services.pose_service import MP_TO_COCO
    parsed = json.loads(landmarks_json)
    coco_to_mp = {v: k for k, v in MP_TO_COCO.items()}
    landmarks = [FakeLandmark(0, 0, 0, 0) for _ in range(33)]
    for pt in parsed:
        name = pt.get("name")
        if name in coco_to_mp:
            idx = coco_to_mp[name]
            landmarks[idx] = FakeLandmark(
                pt["x"], pt["y"], pt.get("z", 0.0), pt.get("confidence", 1.0)
            )
    return landmarks


# ---------------------------------------------------------------------------
# A7: Image dimension reader with explicit file-existence check
# ---------------------------------------------------------------------------

def _read_image_dims(file_path: str) -> Tuple[int, int]:
    """
    Read (img_w, img_h) from an image file on disk.

    Raises FileNotFoundError with a clear message if the file is missing  
    so that callers get a visible error instead of a silent wrong-dimension
    fallback that would corrupt every subsequent measurement.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"Frame file missing at processing time: {file_path!r}. "
            "Ensure frame files are not deleted before accurate estimate runs."
        )
    img = cv2.imread(file_path)
    if img is None:
        raise ValueError(f"Could not decode image at {file_path!r}")
    h, w = img.shape[:2]
    return w, h


# ---------------------------------------------------------------------------
# A1 + A3: Pixel-space height computation (replaces old _get_height_m)
# ---------------------------------------------------------------------------

def _get_height_px(
    landmarks: List[FakeLandmark], img_w: int, img_h: int
) -> float:
    """
    Compute body height in **pixels** by converting all normalized landmark
    coordinates (0.0–1.0) to pixel space before any distance computation.

    This is aspect-ratio safe: the result is independent of whether the image
    is 3:4, 9:16, or any other ratio   unlike the old normalized-unit approach
    which produced heights that varied with aspect ratio and caused ~1.78× scale
    errors on typical 9:16 portrait photos.

    Landmark selection (A3):
    - Primary foot reference: heels (29=left_heel, 30=right_heel) when
      .visibility >= _HEEL_VIS_THRESHOLD.
    - Fallback: ankles (27=left_ankle, 28=right_ankle) when heels are not
      sufficiently visible.
    - Uses the actual .visibility field   NOT the old ".y > 0" proxy.

    Returns:
        height_px: estimated head-to-foot height in pixels (always >= 1.0).
    """
    # --- Head top estimate ---
    nose = landmarks[0]
    nose_py = nose.y * img_h

    shoulder_py_vals = []
    for lm in (landmarks[11], landmarks[12]):   # left/right shoulder
        if lm.visibility > _HEEL_VIS_THRESHOLD or lm.y > 0:
            shoulder_py_vals.append(lm.y * img_h)
    shoulder_py = (
        sum(shoulder_py_vals) / len(shoulder_py_vals)
        if shoulder_py_vals
        else nose_py + 0.1 * img_h
    )
    # Head top ≈ 1/3 of the nose-to-shoulder span above the nose
    head_top_py = nose_py - abs(shoulder_py - nose_py) * 0.33

    # --- Foot reference: heels primary, ankles fallback (A3) ---
    # Index pairs: (heel_idx, ankle_idx) for left and right sides
    foot_py_vals = []
    for heel_idx, ankle_idx in ((29, 27), (30, 28)):
        heel  = landmarks[heel_idx]
        ankle = landmarks[ankle_idx]
        if heel.visibility >= _HEEL_VIS_THRESHOLD:
            foot_py_vals.append(heel.y * img_h)
        elif ankle.visibility >= _HEEL_VIS_THRESHOLD:
            foot_py_vals.append(ankle.y * img_h)

    if not foot_py_vals:
        # Last resort: take whatever has any y-position recorded
        for lm in (landmarks[29], landmarks[30], landmarks[27], landmarks[28]):
            if lm.y > 0:
                foot_py_vals.append(lm.y * img_h)

    # Use the lowest visible foot point (max y, since y increases downward in image coords)
    foot_py = max(foot_py_vals) if foot_py_vals else img_h * 0.95

    height_px = abs(foot_py - head_top_py)
    return max(height_px, 1.0)  # guard against degenerate zero


# ---------------------------------------------------------------------------
# A5: Anthropometric range guard helper
# ---------------------------------------------------------------------------

def _apply_width_range_guard(
    key: str, value_cm: float, scale_mismatch_flag: bool
) -> Tuple[float, bool]:
    """
    Clip a raw width/depth (cm) to the anthropometric plausible range for that
    measurement key. If the value is out of range: clip it to the boundary AND
    set scale_mismatch=True so the caller knows a guard fired.

    This is the primary defence against the bug class where a unit error
    produces widths like 97 cm (hip half-width) that pass silently into the
    ellipse formula and produce circumferences of 215 cm.
    """
    lo, hi = BODY_WIDTH_RANGES.get(key, (0.0, 9999.0))
    if value_cm < lo or value_cm > hi:
        clipped = max(lo, min(hi, value_cm))
        logger.warning(
            "Anthropometric guard fired for '%s': raw=%.2f cm clipped to %.2f cm "
            "(allowed range [%.1f, %.1f] cm). Setting scale_mismatch=True.",
            key, value_cm, clipped, lo, hi,
        )
        return clipped, True
    return value_cm, scale_mismatch_flag


# ---------------------------------------------------------------------------
# Module-level helper: average visible landmark y-coordinate for a group
# ---------------------------------------------------------------------------

def _visible_group_y(lms: List[FakeLandmark], indices: Tuple[int, ...], label: str) -> float:
    """Average only observed joints; side poses deliberately omit one side."""
    values = [lms[index].y for index in indices if lms[index].visibility >= 0.3]
    if not values:
        raise ValueError(f"Missing visible {label} landmark for measurement.")
    return sum(values) / len(values)


# ---------------------------------------------------------------------------
# A2: Segmentation width reader   returns raw PIXEL widths (not normalized)
# ---------------------------------------------------------------------------

def _get_segmentation_widths(img_path: str, y_ratios: List[float]) -> List[float]:
    """
    For each y_ratio (0.0–1.0 fraction of image height), return the width of
    the person silhouette mask at that row in **raw pixels** (A2 fix).

    Callers are responsible for applying `scale_px_to_cm` to convert to cm  
    unit conversion is kept in one place (the caller) to prevent drift.

    Returns 0.0 for rows where the mask has no body coverage.
    """
    # The Windows MediaPipe segmentation-mask bridge can abort the interpreter
    # (ChannelSize 1 vs 4) before Python exception handling is possible.
    # Landmark-derived width/depth fallbacks below are safe and deterministic.
    return [0.0] * len(y_ratios)

    from app.services.pose_service import detect_pose, mp
    if not mp:
        return [0.0] * len(y_ratios)
    try:
        with open(img_path, "rb") as f:
            image_bytes = f.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return [0.0] * len(y_ratios)

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = detect_pose(img_rgb)

        if not results.segmentation_masks:
            return [0.0] * len(y_ratios)

        mask = results.segmentation_masks[0].numpy_view()
        if len(mask.shape) > 2:
            mask = mask[:, :, 0]
        binary_mask = mask > 0.5
        h, w = binary_mask.shape

        widths_px = []
        for y_ratio in y_ratios:
            y_idx = int(y_ratio * h)
            if y_idx < 0 or y_idx >= h:
                widths_px.append(0.0)
                continue
            row = binary_mask[y_idx, :]
            indices = np.where(row)[0]
            if len(indices) > 0:
                # A2 fix: return raw pixel width   do NOT divide by w
                widths_px.append(float(indices[-1] - indices[0]))
            else:
                widths_px.append(0.0)
        return widths_px
    except Exception as e:
        logger.warning("Segmentation error in _get_segmentation_widths: %s", e)
        return [0.0] * len(y_ratios)


# ---------------------------------------------------------------------------
# Stable body-outline extraction (used by Accurate Tier)
# ---------------------------------------------------------------------------

def _get_silhouette_widths(
    img_path: str,
    y_ratios: List[float],
    landmarks: List[FakeLandmark],
) -> List[float]:
    """Measure torso widths from an OpenCV foreground silhouette.

    MediaPipe segmentation masks are disabled because their Windows bridge can
    crash the interpreter. GrabCut is seeded from accepted pose landmarks and
    produces an image-specific front width or side depth. It deliberately
    raises on weak extraction: fixed body-depth defaults are not trustworthy.

    Torso x-boundary clamping: each row is scanned only within a horizontal
    window derived from the shoulder and hip landmarks (+ 15% margin). This
    prevents the arms   which are spread away from the body   from being
    counted as part of the torso width.
    """
    image = cv2.imread(img_path, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not decode image for silhouette extraction: {img_path!r}")
    height, width = image.shape[:2]
    visible = [lm for lm in landmarks if lm.visibility >= 0.3 and 0 <= lm.x <= 1 and 0 <= lm.y <= 1]
    # Side poses intentionally retain only the camera-facing landmarks, so a
    # valid accepted side frame commonly has just a handful of points rather than
    # a full bilateral skeleton. Two body landmarks are enough to seed GrabCut.
    if len(visible) < 2:
        raise ValueError("Not enough visible landmarks to measure the body outline.")

    min_x, max_x = min(lm.x for lm in visible), max(lm.x for lm in visible)
    min_y, max_y = min(lm.y for lm in visible), max(lm.y for lm in visible)
    margin_x = max(0.08, (max_x - min_x) * 0.18)
    margin_y = max(0.03, (max_y - min_y) * 0.04)
    left = max(0, int((min_x - margin_x) * width))
    top = max(0, int((min_y - margin_y) * height))
    right = min(width, int((max_x + margin_x) * width))
    bottom = min(height, int((max_y + margin_y) * height))
    if right - left < width * 0.12 or bottom - top < height * 0.35:
        raise ValueError("Person is too small or cropped for body-outline measurement.")

    mask = np.zeros((height, width), np.uint8)
    bg_model, fg_model = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(image, mask, (left, top, right - left, bottom - top), bg_model, fg_model, 4, cv2.GC_INIT_WITH_RECT)
    foreground = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype("uint8")
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

    centre_x = int(np.median([lm.x for lm in visible]) * width)

    # Build torso x-bounds from shoulder (11,12) and hip (23,24) landmarks.
    # We use only those specific torso landmarks that are visible and clamp each
    # row scan to this range (+15% margin) so spread arms are excluded.
    torso_lm_indices = (11, 12, 23, 24)
    torso_xs = [
        landmarks[i].x for i in torso_lm_indices
        if landmarks[i].visibility >= 0.3 and 0 <= landmarks[i].x <= 1
    ]
    if torso_xs:
        torso_margin = max(0.05, (max(torso_xs) - min(torso_xs)) * 0.15)
        torso_left_px  = max(0, int((min(torso_xs) - torso_margin) * width))
        torso_right_px = min(width, int((max(torso_xs) + torso_margin) * width))
    else:
        # Fallback: no clamping if torso landmarks unavailable
        torso_left_px, torso_right_px = 0, width

    widths = []
    for y_ratio in y_ratios:
        y_idx = int(y_ratio * height)
        if not 0 <= y_idx < height:
            raise ValueError("A required body measurement row is outside the image.")
        row = foreground[y_idx]
        # Clamp the row to the torso x-window before finding segments
        clamped_row = row.copy()
        clamped_row[:torso_left_px] = 0
        clamped_row[torso_right_px:] = 0
        transitions = np.diff(np.r_[0, clamped_row > 0, 0].astype(np.int8))
        starts, ends = np.where(transitions == 1)[0], np.where(transitions == -1)[0]
        segments = [(start, end) for start, end in zip(starts, ends) if end - start >= width * 0.025]
        if not segments:
            raise ValueError("Could not isolate the body outline at a required measurement point.")
        central_segments = [segment for segment in segments if segment[0] <= centre_x < segment[1]]
        start, end = max(central_segments or segments, key=lambda segment: segment[1] - segment[0])
        widths.append(float(end - start))
    return widths



# ---------------------------------------------------------------------------
# Fast Tier extraction  (A6: now accepts file paths for pixel-space scaling)
# ---------------------------------------------------------------------------

def extract_measurements(
    user_height_cm: float,
    front_landmarks_json: str,
    side_landmarks_json: str,
    front_img_path: str = "",
    side_img_path: str = "",
) -> List[Tuple[str, float, float]]:
    """
    Legacy rough extraction used by Fast Tier.

    A6 change: now accepts optional file paths so it can read actual image
    dimensions and compute a pixel-space scale factor (same A1 fix as the
    accurate tier). Falls back to a safe 9:16 portrait default if no path
    is given, rather than silently using normalized-unit math.
    """
    if not front_landmarks_json or not side_landmarks_json:
        raise ValueError("Both front and side landmarks are required.")

    front = _parse_landmarks(front_landmarks_json)
    side  = _parse_landmarks(side_landmarks_json)

    # Read actual image dimensions; fall back to safe 9:16 portrait default
    _DEFAULT_W, _DEFAULT_H = 1080, 1920
    front_img_w, front_img_h = _DEFAULT_W, _DEFAULT_H
    side_img_w,  side_img_h  = _DEFAULT_W, _DEFAULT_H

    if front_img_path:
        try:
            front_img_w, front_img_h = _read_image_dims(front_img_path)
        except Exception as e:
            logger.warning(
                "Fast Tier: could not read front image dims from %r: %s   "
                "falling back to %dx%d default.",
                front_img_path, e, _DEFAULT_W, _DEFAULT_H,
            )
    if side_img_path:
        try:
            side_img_w, side_img_h = _read_image_dims(side_img_path)
        except Exception as e:
            logger.warning(
                "Fast Tier: could not read side image dims from %r: %s   "
                "falling back to %dx%d default.",
                side_img_path, e, _DEFAULT_W, _DEFAULT_H,
            )

    # A1: pixel-space height → scale factor in cm/pixel
    front_height_px = _get_height_px(front, front_img_w, front_img_h)
    side_height_px  = _get_height_px(side,  side_img_w,  side_img_h)

    scale_front = user_height_cm / front_height_px  # cm/pixel
    scale_side  = user_height_cm / side_height_px   # cm/pixel

    logger.info(
        "Fast Tier scale factors   front: %.4f cm/px (height_px=%.1f), "
        "side: %.4f cm/px (height_px=%.1f)",
        scale_front, front_height_px, scale_side, side_height_px,
    )

    # A4: warn if the two independent scale factors diverge materially
    if front_height_px > 0:
        sf_diff = abs(scale_front - scale_side) / scale_front
        if sf_diff > settings.SCALE_MISMATCH_THRESHOLD:
            logger.warning(
                "Fast Tier scale mismatch: front=%.4f cm/px, side=%.4f cm/px "
                "(%.1f%% > %.0f%% threshold). Check pose/framing.",
                scale_front, scale_side,
                sf_diff * 100, settings.SCALE_MISMATCH_THRESHOLD * 100,
            )

    def _dist_2d_px(lms, i1, i2, iw, ih):
        p1, p2 = lms[i1], lms[i2]
        return math.sqrt(((p1.x - p2.x) * iw) ** 2 + ((p1.y - p2.y) * ih) ** 2)

    def _dist_x_px(lms, i1, i2, iw):
        return abs(lms[i1].x - lms[i2].x) * iw

    shoulder_width = _dist_2d_px(front, 11, 12, front_img_w, front_img_h) * scale_front
    hip_width      = _dist_2d_px(front, 23, 24, front_img_w, front_img_h) * scale_front
    waist_width    = hip_width * 0.9

    # Side pose only returns ONE shoulder (camera-facing side); default depth to 60% of shoulder_width
    chest_depth = shoulder_width * 0.6

    hip_depth = _dist_x_px(side, 23, 24, side_img_w) * scale_side
    if hip_depth < 5:
        hip_depth = hip_width * 0.7
    waist_depth = hip_depth * 0.9

    # A5: apply anthropometric range guards on the scaled half-widths before ellipse
    scale_mismatch = False
    ellipse_inputs = {
        "chest_w": shoulder_width * 1.1,
        "waist_w": waist_width    * 1.1,
        "hip_w":   hip_width      * 1.15,
        "chest_d": chest_depth    * 1.2,
        "waist_d": waist_depth    * 1.1,
        "hip_d":   hip_depth      * 1.1,
    }
    for k in ellipse_inputs:
        ellipse_inputs[k], scale_mismatch = _apply_width_range_guard(
            k, ellipse_inputs[k], scale_mismatch
        )

    def _ellipse_perimeter(width_cm, depth_cm):
        a = width_cm / 2.0
        b = depth_cm / 2.0
        return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))

    chest_circ = _ellipse_perimeter(ellipse_inputs["chest_w"], ellipse_inputs["chest_d"])
    waist_circ = _ellipse_perimeter(ellipse_inputs["waist_w"], ellipse_inputs["waist_d"])
    hip_circ   = _ellipse_perimeter(ellipse_inputs["hip_w"],   ellipse_inputs["hip_d"])
    neck_circ  = _ellipse_perimeter(shoulder_width * 0.35,     shoulder_width * 0.35)

    left_sleeve  = (_dist_2d_px(front, 11, 13, front_img_w, front_img_h)
                    + _dist_2d_px(front, 13, 15, front_img_w, front_img_h))
    right_sleeve = (_dist_2d_px(front, 12, 14, front_img_w, front_img_h)
                    + _dist_2d_px(front, 14, 16, front_img_w, front_img_h))
    sleeve_length = ((left_sleeve + right_sleeve) / 2.0) * scale_front

    left_inseam  = _dist_2d_px(front, 23, 27, front_img_w, front_img_h)
    right_inseam = _dist_2d_px(front, 24, 28, front_img_w, front_img_h)
    inseam_length = ((left_inseam + right_inseam) / 2.0) * scale_front

    torso_length = (
        (_dist_2d_px(front, 11, 23, front_img_w, front_img_h)
         + _dist_2d_px(front, 12, 24, front_img_w, front_img_h)) / 2.0
    ) * scale_front

    measurements = [
        ("chest_circumference", round(chest_circ,   1), 1.2),
        ("waist_circumference", round(waist_circ,   1), 1.0),
        ("hip_circumference",   round(hip_circ,     1), 1.2),
        ("neck_circumference",  round(neck_circ,    1), 0.5),
        ("shoulder_width",      round(shoulder_width, 1), 0.5),
        ("sleeve_length",       round(sleeve_length, 1), 0.8),
        ("torso_length",        round(torso_length,  1), 0.8),
        ("inseam_length",       round(inseam_length, 1), 0.9),
    ]

    return measurements


# ---------------------------------------------------------------------------
# Accurate Tier extraction
# ---------------------------------------------------------------------------

def extract_accurate_measurements(
    user_height_cm: float,
    frames_a: List[models.Frame],
    frames_b: List[models.Frame],
) -> Tuple[List[Tuple[str, float, float, bool]], bool, Dict]:
    """
    Pixel-space body measurement extraction for the Accurate Tier.

    Key invariants (Stage A fixes):
    - A1: all distances computed in pixel space using actual image dimensions.
    - A2: segmentation widths returned in pixels; scale applied at call site.
    - A3: heels (29/30) used as primary foot landmark; ankles (27/28) as fallback.
    - A4: front and side scale factors computed independently from their own images.
    - A5: anthropometric range guards applied to raw cm widths before ellipse formula.
    - A7: explicit FileNotFoundError if a frame file is missing at processing time.
    """
    if not frames_a or not frames_b:
        raise ValueError("Both front and side frames are required.")

    def _dist_2d_px(lms, i1, i2, iw, ih):
        p1, p2 = lms[i1], lms[i2]
        return math.sqrt(((p1.x - p2.x) * iw) ** 2 + ((p1.y - p2.y) * ih) ** 2)

    def _ellipse_perimeter(width_cm, depth_cm):
        a = width_cm / 2.0
        b = depth_cm / 2.0
        return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))

    # ── Front frames ──────────────────────────────────────────────────────
    front_props: List[Dict] = []
    front_sfs:   List[float] = []
    front_debug: List[Dict]  = []

    for frame in frames_a:
        if not frame.landmarks_json:
            continue

        # A7: raises FileNotFoundError if file is gone
        img_w, img_h = _read_image_dims(frame.file_path)

        front = _parse_landmarks(frame.landmarks_json)
        height_px = _get_height_px(front, img_w, img_h)
        if height_px <= 0:
            continue

        # A1: scale factor in cm/pixel, anchored to user_height_cm
        scale_px_to_cm = user_height_cm / height_px
        front_sfs.append(scale_px_to_cm)
        front_debug.append({"frame_id": getattr(frame, "id", "?"),
                             "height_px": round(height_px, 1),
                             "scale_px_to_cm": round(scale_px_to_cm, 6)})

        # y_ratios from normalized landmark coords   used as image-height fractions
        chest_y = _visible_group_y(front, (11, 12), "shoulder")
        hip_y   = _visible_group_y(front, (23, 24), "hip")
        waist_y = chest_y + (hip_y - chest_y) * 0.6

        # A2: segmentation widths in raw pixels; we convert to cm here using THIS frame's scale
        silhouette_widths_px = _get_silhouette_widths(frame.file_path, [chest_y, waist_y, hip_y], front)
        chest_w_cm, waist_w_cm, hip_w_cm = [value * scale_px_to_cm for value in silhouette_widths_px]

        shoulder_w_cm = _dist_2d_px(front, 11, 12, img_w, img_h) * scale_px_to_cm

        left_sl  = (_dist_2d_px(front, 11, 13, img_w, img_h)
                    + _dist_2d_px(front, 13, 15, img_w, img_h))
        right_sl = (_dist_2d_px(front, 12, 14, img_w, img_h)
                    + _dist_2d_px(front, 14, 16, img_w, img_h))
        sleeve_l_cm = ((left_sl + right_sl) / 2.0) * scale_px_to_cm

        left_in  = _dist_2d_px(front, 23, 27, img_w, img_h)
        right_in = _dist_2d_px(front, 24, 28, img_w, img_h)
        inseam_l_cm = ((left_in + right_in) / 2.0) * scale_px_to_cm

        torso_l_cm = (
            (_dist_2d_px(front, 11, 23, img_w, img_h)
             + _dist_2d_px(front, 12, 24, img_w, img_h)) / 2.0
        ) * scale_px_to_cm

        front_props.append({
            "chest_w":   chest_w_cm,
            "waist_w":   waist_w_cm,
            "hip_w":     hip_w_cm,
            "shoulder_w": shoulder_w_cm,
            "sleeve_l":  sleeve_l_cm,
            "inseam_l":  inseam_l_cm,
            "torso_l":   torso_l_cm,
        })

    # ── Side frames ───────────────────────────────────────────────────────
    side_props: List[Dict] = []
    side_sfs:   List[float] = []
    side_debug: List[Dict]  = []

    for frame in frames_b:
        if not frame.landmarks_json:
            continue

        # A7: raises FileNotFoundError if file is gone
        img_w, img_h = _read_image_dims(frame.file_path)

        side = _parse_landmarks(frame.landmarks_json)
        height_px = _get_height_px(side, img_w, img_h)
        if height_px <= 0:
            continue

        # A4: independent scale factor for the side image   never cross-applied
        scale_px_to_cm = user_height_cm / height_px
        side_sfs.append(scale_px_to_cm)
        side_debug.append({"frame_id": getattr(frame, "id", "?"),
                            "height_px": round(height_px, 1),
                            "scale_px_to_cm": round(scale_px_to_cm, 6)})

        chest_y = _visible_group_y(side, (11, 12), "shoulder")
        hip_y   = _visible_group_y(side, (23, 24), "hip")
        waist_y = chest_y + (hip_y - chest_y) * 0.6

        # A2: segmentation depths in pixels; convert using THIS frame's scale (A4)
        silhouette_depths_px = _get_silhouette_widths(frame.file_path, [chest_y, waist_y, hip_y], side)
        chest_d_cm, waist_d_cm, hip_d_cm = [value * scale_px_to_cm for value in silhouette_depths_px]

        side_props.append({
            "chest_d": chest_d_cm,
            "waist_d": waist_d_cm,
            "hip_d":   hip_d_cm,
        })

    if not front_props or not side_props:
        raise ValueError("Valid landmarks missing in frames.")

    # ── Scale factor comparison (A4) ──────────────────────────────────────
    median_sf_front = float(np.median(front_sfs))
    median_sf_side  = float(np.median(side_sfs))
    logger.info(
        "Accurate Tier scale factors   front: %.4f cm/px, side: %.4f cm/px",
        median_sf_front, median_sf_side,
    )

    scale_mismatch = False
    sf_diff_pct = abs(median_sf_front - median_sf_side) / median_sf_front
    if sf_diff_pct > settings.SCALE_MISMATCH_THRESHOLD:
        scale_mismatch = True
        logger.warning(
            "Scale mismatch detected: front=%.4f cm/px, side=%.4f cm/px "
            "(%.1f%% divergence > %.0f%% threshold). "
            "This likely indicates a pose or framing problem in one of the photos.",
            median_sf_front, median_sf_side,
            sf_diff_pct * 100, settings.SCALE_MISMATCH_THRESHOLD * 100,
        )

    # ── Median averaging across burst frames ──────────────────────────────
    f_avg = {k: float(np.median([p[k] for p in front_props])) for k in front_props[0]}
    s_avg = {k: float(np.median([p[k] for p in side_props]))  for k in side_props[0]}

    # ── A5: Anthropometric range guards before ellipse formula ────────────
    for key in ("chest_w", "waist_w", "hip_w"):
        f_avg[key], scale_mismatch = _apply_width_range_guard(key, f_avg[key], scale_mismatch)
    for key in ("chest_d", "waist_d", "hip_d"):
        s_avg[key], scale_mismatch = _apply_width_range_guard(key, s_avg[key], scale_mismatch)

    # ── Ellipse → circumferences ──────────────────────────────────────────
    chest_raw  = _ellipse_perimeter(f_avg["chest_w"], s_avg["chest_d"])
    waist_raw  = _ellipse_perimeter(f_avg["waist_w"], s_avg["waist_d"])
    hip_raw    = _ellipse_perimeter(f_avg["hip_w"],   s_avg["hip_d"])

    chest_circ = chest_raw * get_correction_factor(f_avg["chest_w"], s_avg["chest_d"])
    waist_circ = waist_raw * get_correction_factor(f_avg["waist_w"], s_avg["waist_d"])
    hip_circ   = hip_raw   * get_correction_factor(f_avg["hip_w"],   s_avg["hip_d"])
    neck_circ  = _ellipse_perimeter(f_avg["shoulder_w"] * 0.35, f_avg["shoulder_w"] * 0.35)

    measurements = [
        ("chest_circumference", round(chest_circ,        1), 0.5),
        ("waist_circumference", round(waist_circ,        1), 0.5),
        ("hip_circumference",   round(hip_circ,          1), 0.5),
        ("neck_circumference",  round(neck_circ,         1), 0.5),
        ("shoulder_width",      round(f_avg["shoulder_w"], 1), 0.5),
        ("sleeve_length",       round(f_avg["sleeve_l"],   1), 0.5),
        ("torso_length",        round(f_avg["torso_l"],    1), 0.5),
        ("inseam_length",       round(f_avg["inseam_l"],   1), 0.5),
    ]

    # ── Sanity checks on final circumferences ─────────────────────────────
    validated: List[Tuple[str, float, float, bool]] = []
    cross_image_measurements = {"chest_circumference", "waist_circumference", "hip_circumference"}

    for iso, val, res in measurements:
        new_res   = res
        new_val   = val
        was_clipped = False

        if scale_mismatch and iso in cross_image_measurements:
            new_res *= settings.SCALE_MISMATCH_PENALTY_MULTIPLIER

        if iso == "waist_circumference" and val > round(chest_circ + 5, 1):
            new_res     = 5.0
            new_val     = round(chest_circ + 5, 1)
            was_clipped = True

        if iso == "inseam_length":
            min_inseam = 0.35 * user_height_cm
            max_inseam = 0.60 * user_height_cm
            if val < min_inseam:
                new_res     = 5.0
                new_val     = min_inseam
                was_clipped = True
            elif val > max_inseam:
                new_res     = 5.0
                new_val     = max_inseam
                was_clipped = True

        validated.append((iso, new_val, new_res, was_clipped))

    # ── Build raw_dimensions dict (includes debug info for A8) ────────────
    raw_dimensions: Dict = {
        "chest_w_cm":  round(f_avg["chest_w"],  2),
        "chest_d_cm":  round(s_avg["chest_d"],  2),
        "waist_w_cm":  round(f_avg["waist_w"],  2),
        "waist_d_cm":  round(s_avg["waist_d"],  2),
        "hip_w_cm":    round(f_avg["hip_w"],     2),
        "hip_d_cm":    round(s_avg["hip_d"],     2),
        "scale_divergence_pct": round(sf_diff_pct * 100, 2),
        "recapture_required": sf_diff_pct > settings.SCALE_MISMATCH_RETAKE_THRESHOLD,
        # Debug fields (always populated; exposed only when DEBUG_MEASUREMENTS=True in A8)
        "_debug": {
            "front_frames": front_debug,
            "side_frames":  side_debug,
            "median_scale_front_cm_per_px": round(median_sf_front, 6),
            "median_scale_side_cm_per_px":  round(median_sf_side,  6),
            "scale_divergence_pct":         round(sf_diff_pct * 100, 2),
        },
    }

    return validated, scale_mismatch, raw_dimensions


# ---------------------------------------------------------------------------
# Job runner
# ---------------------------------------------------------------------------

def run_accurate_estimate(session_id: str, db: DBSession) -> None:
    job = (
        db.query(models.Job)
        .filter(
            models.Job.session_id == session_id,
            models.Job.job_type == "accurate_estimate",
        )
        .first()
    )
    if not job:
        return

    job.status = "processing"
    db.commit()

    t_start = time.time()
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    frames_a = (
        db.query(models.Frame)
        .filter(
            models.Frame.session_id == session_id,
            models.Frame.pose == "A",
            models.Frame.accepted == True,
        )
        .all()
    )
    frames_b = (
        db.query(models.Frame)
        .filter(
            models.Frame.session_id == session_id,
            models.Frame.pose == "B",
            models.Frame.accepted == True,
        )
        .all()
    )

    try:
        if not session or not frames_a or not frames_b:
            raise ValueError("Session or required frames (A and B) missing.")

        measurements, scale_mismatch, raw_dimensions = extract_accurate_measurements(
            session.height_cm, frames_a, frames_b
        )
        session.has_scale_mismatch = scale_mismatch

        for iso_name, value_cm, residual, was_clipped in measurements:
            existing = (
                db.query(models.Measurement)
                .filter(
                    models.Measurement.session_id == session_id,
                    models.Measurement.iso_name   == iso_name,
                    models.Measurement.tier        == "accurate",
                )
                .first()
            )
            if existing:
                existing.value_cm          = value_cm
                existing.residual_error_cm = residual
                existing.was_clipped       = was_clipped
            else:
                m = models.Measurement(
                    session_id=session_id,
                    tier="accurate",
                    iso_name=iso_name,
                    value_cm=value_cm,
                    residual_error_cm=residual,
                    was_clipped=was_clipped,
                )
                db.add(m)

        elapsed_ms = int((time.time() - t_start) * 1000)

        # Strip internal _debug key from the public result unless debug mode is on
        public_raw_dimensions = {k: v for k, v in raw_dimensions.items() if k != "_debug"}

        result = {
            "status": "complete",
            "tier": "accurate",
            "measurements": [
                {"iso_name": n, "value_cm": v, "residual_error_cm": r, "was_clipped": c}
                for n, v, r, c in measurements
            ],
            "raw_dimensions":         public_raw_dimensions,
            "calibration_method_used": session.calibration_method,
            "processing_time_ms":     elapsed_ms,
        }
        # A8: include debug info in stored result when debug mode enabled
        if settings.DEBUG_MEASUREMENTS:
            result["_debug"] = raw_dimensions.get("_debug", {})

        job.set_result(result)
        job.status = "complete"
        job.processing_time_ms = elapsed_ms
        session.status = "complete"

        # Optionally persist measurements to the user's profile (if requested)
        try:
            if session.store_profile:
                profile = (
                    db.query(models.UserProfile)
                    .filter(models.UserProfile.user_id == session.user_id)
                    .first()
                )
                measurements_list = [
                    {"iso_name": n, "value_cm": v, "residual_error_cm": r}
                    for n, v, r, c in measurements
                ]
                if profile is None:
                    profile = models.UserProfile(user_id=session.user_id)
                    profile.set_measurements(measurements_list)
                    db.add(profile)
                else:
                    profile.set_measurements(measurements_list)
                    profile.updated_at = datetime.now(timezone.utc)
        except Exception:
            logger.exception("Failed to persist user profile measurements")

        # A9 (Q1 resolution): Remove stored image files after processing to avoid
        # retaining PII images. Deletion is consolidated here   the redundant
        # shutil.rmtree in _bg_accurate (estimates.py) has been removed.
        try:
            all_frames = frames_a + frames_b
            for frame in all_frames:
                try:
                    if frame.file_path and os.path.exists(frame.file_path):
                        os.remove(frame.file_path)
                    frame.file_path = ""
                except Exception:
                    logger.exception("Failed to delete frame file: %s", getattr(frame, "file_path", None))
        except Exception:
            logger.exception("Failed to cleanup frame files")

    except Exception as e:
        logger.exception("Accurate estimate failed for session %s: %s", session_id, e)
        try:
            db.rollback()
        except Exception:
            logger.exception("Failed to rollback DB session for session %s", session_id)

        try:
            job.status = "failed"
            job.set_result({"error": str(e)})
            if session:
                session.status = "failed"
            db.commit()
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            logger.exception("Failed to mark job failed in DB for session %s", session_id)
        return

    db.commit()
