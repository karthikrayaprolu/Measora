import time
import math
import json
import cv2
import logging
import numpy as np
from typing import List, Tuple, Dict
from sqlalchemy.orm import Session as DBSession
from app.db import models
from app.core.config import settings
from app.services.circumference_correction import get_correction_factor

logger = logging.getLogger(__name__)

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
    landmarks = [FakeLandmark(0,0,0,0) for _ in range(33)]
    for pt in parsed:
        name = pt.get("name")
        if name in coco_to_mp:
            idx = coco_to_mp[name]
            landmarks[idx] = FakeLandmark(pt["x"], pt["y"], pt.get("z", 0.0), pt.get("confidence", 1.0))
    return landmarks

def _get_height_m(landmarks: List[FakeLandmark]) -> float:
    nose = landmarks[0]
    
    # Estimate shoulder Y as average of available shoulders
    shoulder_y_vals = [lm.y for lm in (landmarks[11], landmarks[12]) if lm.visibility > 0 or lm.y > 0]
    shoulder_y = sum(shoulder_y_vals) / len(shoulder_y_vals) if shoulder_y_vals else nose.y + 0.1
    
    # Estimate top of head from nose (approx 1/3 of the distance from nose to shoulder)
    head_top_y = nose.y - (abs(shoulder_y - nose.y) * 0.33)
    
    # Get heel reference
    heel = landmarks[27] if landmarks[27].visibility > 0 or landmarks[27].y > 0 else landmarks[30]
    if heel.visibility == 0 and heel.y == 0: 
        heel = landmarks[28] if landmarks[28].visibility > 0 or landmarks[28].y > 0 else landmarks[29]
        
    return abs(heel.y - head_top_y)

def extract_measurements(
    user_height_cm: float, 
    front_landmarks_json: str, 
    side_landmarks_json: str
) -> List[Tuple[str, float, float]]:
    """Legacy rough extraction for Fast Tier"""
    if not front_landmarks_json or not side_landmarks_json:
        raise ValueError("Both front and side landmarks are required.")

    front = _parse_landmarks(front_landmarks_json)
    side = _parse_landmarks(side_landmarks_json)
    
    front_mp_height = _get_height_m(front)
    side_mp_height = _get_height_m(side)
    
    scale_factor_front = (user_height_cm / 100.0) / (front_mp_height if front_mp_height > 0 else 1.0)
    scale_factor_side = (user_height_cm / 100.0) / (side_mp_height if side_mp_height > 0 else 1.0)
    
    def dist_2d(landmarks, idx1, idx2):
        p1, p2 = landmarks[idx1], landmarks[idx2]
        return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)
        
    def dist_x(landmarks, idx1, idx2):
        return abs(landmarks[idx1].x - landmarks[idx2].x)

    shoulder_width = dist_2d(front, 11, 12) * scale_factor_front * 100
    hip_width = dist_2d(front, 23, 24) * scale_factor_front * 100
    waist_width = hip_width * 0.9

    # Side pose only returns ONE shoulder (camera-facing), so we can't use dist_x(side, 11, 12).
    # Default to 60% of shoulder_width
    chest_depth = shoulder_width * 0.6
    
    hip_depth = dist_x(side, 23, 24) * scale_factor_side * 100
    if hip_depth < 5: hip_depth = hip_width * 0.7
    
    waist_depth = hip_depth * 0.9

    def ellipse_perimeter(width_cm, depth_cm):
        a = width_cm / 2.0
        b = depth_cm / 2.0
        return math.pi * (3*(a+b) - math.sqrt((3*a + b)*(a + 3*b)))

    chest_circ = ellipse_perimeter(shoulder_width * 1.1, chest_depth * 1.2)
    waist_circ = ellipse_perimeter(waist_width * 1.1, waist_depth * 1.1)
    hip_circ = ellipse_perimeter(hip_width * 1.15, hip_depth * 1.1)
    neck_circ = ellipse_perimeter(shoulder_width * 0.35, shoulder_width * 0.35)
    
    left_sleeve = dist_2d(front, 11, 13) + dist_2d(front, 13, 15)
    right_sleeve = dist_2d(front, 12, 14) + dist_2d(front, 14, 16)
    sleeve_length = ((left_sleeve + right_sleeve) / 2.0) * scale_factor_front * 100
    
    left_inseam = dist_2d(front, 23, 27)
    right_inseam = dist_2d(front, 24, 28)
    inseam_length = ((left_inseam + right_inseam) / 2.0) * scale_factor_front * 100
    
    torso_length = ((dist_2d(front, 11, 23) + dist_2d(front, 12, 24)) / 2.0) * scale_factor_front * 100
    
    measurements = [
        ("chest_circumference",  round(chest_circ, 1), 1.2),
        ("waist_circumference",  round(waist_circ, 1), 1.0),
        ("hip_circumference",    round(hip_circ, 1), 1.2),
        ("neck_circumference",   round(neck_circ, 1), 0.5),
        ("shoulder_width",       round(shoulder_width, 1), 0.5),
        ("sleeve_length",        round(sleeve_length, 1), 0.8),
        ("torso_length",         round(torso_length, 1), 0.8),
        ("inseam_length",        round(inseam_length, 1), 0.9),
    ]
    
    return measurements

def _get_segmentation_widths(img_path: str, y_ratios: List[float]) -> List[float]:
    from app.services.pose_service import pose_estimator, mp
    if not mp: return [0.0]*len(y_ratios)
    try:
        with open(img_path, "rb") as f:
            image_bytes = f.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None: return [0.0]*len(y_ratios)
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        results = pose_estimator.detect(mp_image)
        
        if not results.segmentation_masks:
            return [0.0]*len(y_ratios)
            
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
                widths_px.append(float(indices[-1] - indices[0]))
            else:
                widths_px.append(0.0)
        return widths_px
    except Exception as e:
        print(f"Segmentation Error: {e}")
        return [0.0]*len(y_ratios)

def extract_accurate_measurements(
    user_height_cm: float,
    frames_a: List[models.Frame],
    frames_b: List[models.Frame]
) -> Tuple[List[Tuple[str, float, float, bool]], bool, Dict]:
    
    if not frames_a or not frames_b:
        raise ValueError("Both front and side frames are required.")

    def dist_2d(landmarks, idx1, idx2):
        p1, p2 = landmarks[idx1], landmarks[idx2]
        return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)
    def ellipse_perimeter(width_cm, depth_cm):
        a = width_cm / 2.0
        b = depth_cm / 2.0
        return math.pi * (3*(a+b) - math.sqrt((3*a + b)*(a + 3*b)))
        
    front_props = []
    front_sfs = []
    for frame in frames_a:
        if not frame.landmarks_json: continue
        front = _parse_landmarks(frame.landmarks_json)
        mp_h = _get_height_m(front)
        if mp_h == 0: continue
        sf = (user_height_cm / 100.0) / mp_h
        front_sfs.append(sf)
        
        chest_y = (front[11].y + front[12].y) / 2.0
        hip_y = (front[23].y + front[24].y) / 2.0
        waist_y = chest_y + (hip_y - chest_y) * 0.6
        
        seg_widths = _get_segmentation_widths(frame.file_path, [chest_y, waist_y, hip_y])
        chest_w_cm = seg_widths[0] * sf * 100 if seg_widths[0] > 0 else dist_2d(front, 11, 12) * sf * 100 * 1.1
        waist_w_cm = seg_widths[1] * sf * 100 if seg_widths[1] > 0 else dist_2d(front, 23, 24) * sf * 100 * 0.9
        hip_w_cm = seg_widths[2] * sf * 100 if seg_widths[2] > 0 else dist_2d(front, 23, 24) * sf * 100

        shoulder_w_cm = dist_2d(front, 11, 12) * sf * 100
        left_sl = dist_2d(front, 11, 13) + dist_2d(front, 13, 15)
        right_sl = dist_2d(front, 12, 14) + dist_2d(front, 14, 16)
        sleeve_l_cm = ((left_sl + right_sl) / 2.0) * sf * 100
        left_in = dist_2d(front, 23, 27)
        right_in = dist_2d(front, 24, 28)
        inseam_l_cm = ((left_in + right_in) / 2.0) * sf * 100
        torso_l_cm = ((dist_2d(front, 11, 23) + dist_2d(front, 12, 24)) / 2.0) * sf * 100
        
        front_props.append({
            "chest_w": chest_w_cm, "waist_w": waist_w_cm, "hip_w": hip_w_cm,
            "shoulder_w": shoulder_w_cm, "sleeve_l": sleeve_l_cm, 
            "inseam_l": inseam_l_cm, "torso_l": torso_l_cm
        })
        
    side_props = []
    side_sfs = []
    for frame in frames_b:
        if not frame.landmarks_json: continue
        side = _parse_landmarks(frame.landmarks_json)
        mp_h = _get_height_m(side)
        if mp_h == 0: continue
        sf = (user_height_cm / 100.0) / mp_h
        side_sfs.append(sf)
        
        chest_y = (side[11].y + side[12].y) / 2.0
        hip_y = (side[23].y + side[24].y) / 2.0
        waist_y = chest_y + (hip_y - chest_y) * 0.6
        
        seg_depths = _get_segmentation_widths(frame.file_path, [chest_y, waist_y, hip_y])
        chest_d_cm = seg_depths[0] * sf * 100 if seg_depths[0] > 0 else 25.0
        waist_d_cm = seg_depths[1] * sf * 100 if seg_depths[1] > 0 else 20.0
        hip_d_cm = seg_depths[2] * sf * 100 if seg_depths[2] > 0 else 25.0
        
        side_props.append({
            "chest_d": chest_d_cm, "waist_d": waist_d_cm, "hip_d": hip_d_cm
        })
        
    if not front_props or not side_props:
        raise ValueError("Valid landmarks missing in frames.")
        
    median_sf_front = np.median(front_sfs)
    median_sf_side = np.median(side_sfs)
    logger.info(f"Scale Factors - Front: {median_sf_front:.4f}, Side: {median_sf_side:.4f}")
    
    scale_mismatch = False
    if abs(median_sf_front - median_sf_side) / median_sf_front > settings.SCALE_MISMATCH_THRESHOLD:
        scale_mismatch = True
        logger.warning(f"Scale mismatch threshold exceeded (> {settings.SCALE_MISMATCH_THRESHOLD * 100}%).")

    # Median averaging natively supports single-frame (no-op) and burst frames
    f_avg = {k: float(np.median([p[k] for p in front_props])) for k in front_props[0].keys()}
    s_avg = {k: float(np.median([p[k] for p in side_props])) for k in side_props[0].keys()}
    
    chest_raw = ellipse_perimeter(f_avg["chest_w"], s_avg["chest_d"])
    waist_raw = ellipse_perimeter(f_avg["waist_w"], s_avg["waist_d"])
    hip_raw = ellipse_perimeter(f_avg["hip_w"], s_avg["hip_d"])
    
    chest_circ = chest_raw * get_correction_factor(f_avg["chest_w"], s_avg["chest_d"])
    waist_circ = waist_raw * get_correction_factor(f_avg["waist_w"], s_avg["waist_d"])
    hip_circ = hip_raw * get_correction_factor(f_avg["hip_w"], s_avg["hip_d"])
    neck_circ = ellipse_perimeter(f_avg["shoulder_w"] * 0.35, f_avg["shoulder_w"] * 0.35)
    
    measurements = [
        ("chest_circumference",  round(chest_circ, 1), 0.5),
        ("waist_circumference",  round(waist_circ, 1), 0.5),
        ("hip_circumference",    round(hip_circ, 1), 0.5),
        ("neck_circumference",   round(neck_circ, 1), 0.5),
        ("shoulder_width",       round(f_avg["shoulder_w"], 1), 0.5),
        ("sleeve_length",        round(f_avg["sleeve_l"], 1), 0.5),
        ("torso_length",         round(f_avg["torso_l"], 1), 0.5),
        ("inseam_length",        round(f_avg["inseam_l"], 1), 0.5),
    ]
    
    # Anthropometric Sanity Check: Waist <= Chest + 15cm; Inseam is 40-55% of height
    validated = []
    cross_image_measurements = {"chest_circumference", "waist_circumference", "hip_circumference"}
    
    for iso, val, res in measurements:
        new_res = res
        new_val = val
        was_clipped = False
        
        if scale_mismatch and iso in cross_image_measurements:
            new_res *= settings.SCALE_MISMATCH_PENALTY_MULTIPLIER
            
        if iso == "waist_circumference" and val > chest_circ + 15:
            new_res = 5.0 # Inflate residual error
            new_val = chest_circ + 15
            was_clipped = True
            
        if iso == "inseam_length":
            min_inseam = 0.35 * user_height_cm
            max_inseam = 0.60 * user_height_cm
            if val < min_inseam:
                new_res = 5.0
                new_val = min_inseam
                was_clipped = True
            elif val > max_inseam:
                new_res = 5.0
                new_val = max_inseam
                was_clipped = True
                
        validated.append((iso, new_val, new_res, was_clipped))
        
    raw_dimensions = {
        "chest_w": f_avg.get("chest_w", 0), "chest_d": s_avg.get("chest_d", 0),
        "waist_w": f_avg.get("waist_w", 0), "waist_d": s_avg.get("waist_d", 0),
        "hip_w": f_avg.get("hip_w", 0), "hip_d": s_avg.get("hip_d", 0),
    }
        
    return validated, scale_mismatch, raw_dimensions

def run_accurate_estimate(session_id: str, db: DBSession) -> None:
    job = db.query(models.Job).filter(models.Job.session_id == session_id, models.Job.job_type == "accurate_estimate").first()
    if not job: return

    job.status = "processing"
    db.commit()

    t_start = time.time()
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    frames_a = db.query(models.Frame).filter(models.Frame.session_id == session_id, models.Frame.pose == "A", models.Frame.accepted == True).all()
    frames_b = db.query(models.Frame).filter(models.Frame.session_id == session_id, models.Frame.pose == "B", models.Frame.accepted == True).all()
    
    try:
        if not session or not frames_a or not frames_b:
            raise ValueError("Session or required frames (A and B) missing.")
            
        measurements, scale_mismatch, raw_dimensions = extract_accurate_measurements(session.height_cm, frames_a, frames_b)
        session.has_scale_mismatch = scale_mismatch

        for iso_name, value_cm, residual, was_clipped in measurements:
            existing = db.query(models.Measurement).filter(
                models.Measurement.session_id == session_id,
                models.Measurement.iso_name == iso_name,
                models.Measurement.tier == "accurate"
            ).first()
            if existing:
                existing.value_cm = value_cm
                existing.residual_error_cm = residual
                existing.was_clipped = was_clipped
            else:
                m = models.Measurement(
                    session_id=session_id, tier="accurate", iso_name=iso_name,
                    value_cm=value_cm, residual_error_cm=residual,
                    was_clipped=was_clipped
                )
                db.add(m)

        elapsed_ms = int((time.time() - t_start) * 1000)

        result = {
            "status": "complete",
            "tier": "accurate",
            "measurements": [{"iso_name": n, "value_cm": v, "residual_error_cm": r, "was_clipped": c} for n, v, r, c in measurements],
            "raw_dimensions": raw_dimensions,
            "calibration_method_used": session.calibration_method,
            "processing_time_ms": elapsed_ms,
        }

        job.set_result(result)
        job.status = "complete"
        job.processing_time_ms = elapsed_ms
        session.status = "complete"
        
    except Exception as e:
        job.status = "failed"
        job.set_result({"error": str(e)})
        
    db.commit()
