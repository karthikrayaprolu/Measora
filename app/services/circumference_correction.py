"""
Standalone module for circumference correction.

Currently uses a simple linear curve based on depth/width ratio to 
correct the baseline ellipse perimeter approximation. 
This can later be replaced with a trained regression model.
"""

def get_correction_factor(width_cm: float, depth_cm: float) -> float:
    """
    Returns a multiplier for the raw ellipse-based circumference.
    
    A higher depth-to-width ratio indicates a rounder torso.
    The ellipse perimeter formula often underestimates true body circumference
    when the body approaches a rounder shape due to fat distribution.
    
    Correction curve:
    - ratio <= 0.60 (flat): multiplier = 1.0 (no correction)
    - ratio 0.60 to 1.0: linearly scale multiplier from 1.0 to 1.05 (+5%)
    - ratio >= 1.0 (very round): multiplier = 1.05 (+5%)
    """
    if width_cm <= 0:
        return 1.0
        
    ratio = depth_cm / width_cm
    
    if ratio <= 0.60:
        return 1.0
    elif ratio >= 1.0:
        return 1.05
    else:
        # Linear interpolation between 0.60 and 1.0 mapping to 1.0 to 1.05
        # slope = (1.05 - 1.0) / (1.0 - 0.60) = 0.05 / 0.40 = 0.125
        return 1.0 + (ratio - 0.60) * 0.125
