# Measora — Stage B Implementation Plan: SMPL Mesh Tier

## Background

Stage A fixed the unit-confusion bugs and brought measurements into a plausible range. Stage B replaces the ellipse-formula approach with a parametric 3D body model, eliminating two accuracy ceilings that Stage A cannot address:

1. **Ellipse shape assumption** — human torso cross-sections aren't ellipses. For a typical male with a 90 cm chest, the ellipse formula underestimates by ~3–5 cm compared to the real perimeter.
2. **2-view depth blindness** — the Stage A pipeline averages one front width and one side depth per body region. Asymmetric bodies, loose clothing, and non-standard poses all fool it.

---

## Prerequisites

> [!IMPORTANT]
> **Stage B must not begin until Stage A passes its exit criteria:**
> - All automated sanity checks pass (shoulder 35–55 cm, chest 80–130 cm, waist 60–120 cm, hip 80–135 cm, inseam 70–95 cm) for a 170 cm reference subject.
> - Manual verification with 3+ real test subjects shows plausible outputs and `scale_mismatch` flag rate is being monitored in staging.

---

## Open Questions / Decisions Required Before Coding Starts

> [!CAUTION]
> **SMPL commercial license.** The SMPL body model (including all `.pkl` / `.npz` weight files) is **not free for commercial use**. The IP is owned by Max-Planck-Gesellschaft (MPG); Meshcapade holds the exclusive commercial sub-licensing rights. You must contact **smpl@max-planck-innovation.de** or **sales@meshcapade.com** and obtain a commercial license before shipping this feature. The code can be written before the license arrives, but the model files cannot be used in production without it.
>
> **Action required:** Initiate commercial license inquiry now, in parallel with development. This has a non-zero lead time.

> [!IMPORTANT]
> **Model choice: SMPL vs SMPL-X.**
> - SMPL: body only (72 pose params + 10 shape params). Lighter, faster, sufficient for garment sizing.
> - SMPL-X: body + hands + face (119 pose params + 10 shape params). Heavier, unnecessary for sizing.
> - **Recommendation: SMPL** — garment sizing does not need hand or face geometry. SMPL is ~2x faster to optimize and its vertex topology is simpler to slice anatomically.

> [!IMPORTANT]
> **Fitting strategy: regression vs. optimization.**
> - **Regression (e.g., HMR2, CLIFF):** One forward pass through a pretrained network. Fast (~100 ms GPU, ~2 s CPU), but accuracy depends on training distribution. Most pretrained models are research-licensed (same SMPL constraint applies).
> - **Optimization (SMPLify-style):** Start from a neutral pose, minimize reprojection + silhouette loss using Adam. Slower (5–30 s GPU, 60–120 s CPU), no additional pretrained weights needed beyond the SMPL model itself. More tunable for this specific input distribution (studio-style 2-photo app photos).
> - **Recommended hybrid approach:** Use regression as initialization (MediaPipe landmarks -> linear solve for beta), then run a short optimization loop to refine. This gives regression-level speed on typical cases and falls back gracefully to pure optimization when regression diverges.

---

## Architecture

### Where the new code lives

```
app/services/
    accurate_tier_service.py       <- Stage A (ellipse, unchanged during B)
    mesh_tier_service.py           <- NEW: Stage B orchestrator
    smpl_body_model.py             <- NEW: SMPL model wrapper + measurement extractor
    mesh_optimizer.py              <- NEW: PyTorch optimization loop
    fast_tier_service.py           <- unchanged
    pose_service.py                <- unchanged
    circumference_correction.py    <- unchanged (still used by Stage A)
```

The `mesh_tier_service.py` module runs **in parallel with** (not replacing) `accurate_tier_service.py` during the A/B comparison phase (B5). Traffic is cut over to Stage B only after it demonstrates a measurable improvement. The feature is gated by a new `MESH_TIER_ENABLED` config flag.

---

## Proposed Changes

---

### B1 — SMPL model wrapper + measurement extractor

#### [NEW] [smpl_body_model.py](file:///d:/Measora/app/services/smpl_body_model.py)

Responsibilities:
- Load SMPL model file (`.pkl`) from a configurable path (`settings.SMPL_MODEL_PATH`).
- Given shape params beta (10-dim) and pose params theta (72-dim), generate a watertight 3D mesh (vertices + faces) using the SMPL linear blend skinning equation.
- Scale mesh to real-world cm using `user_height_cm` (same anchoring role as Stage A).
- Expose `extract_measurements(mesh, user_height_cm)` returning a dict of ISO 8559-1 measurements.

**Anatomical cross-sectioning (trimesh):**

SMPL has a fixed vertex topology with known anatomical landmark vertex indices across all body shapes. Use pre-defined SMPL vertex index sets for chest, waist, and hip planes.

For circumferences: `mesh.section(plane_origin=landmark_point, plane_normal=[0,1,0])` -> `.to_planar()` -> `.length`. The trimesh path length IS the true perimeter — not an ellipse approximation.

For lengths (shoulder width, inseam, torso): Euclidean distance between specific named SMPL vertex indices.

**Key SMPL vertex indices to hardcode** (standard, same across all SMPL shapes):
```python
SMPL_LANDMARKS = {
    # Cross-section plane origin vertices
    "chest_plane_vertex":  3076,   # sternal midpoint level
    "waist_plane_vertex":  1805,   # umbilicus level
    "hip_plane_vertex":    1806,   # greater trochanter level
    "neck_plane_vertex":   3050,   # throat level
    # Point-to-point length landmarks
    "left_shoulder":       2819,
    "right_shoulder":      6573,
    "left_wrist":          5361,
    "right_wrist":         2108,
    "left_hip_inner":      875,
    "right_hip_inner":     4350,
    "left_ankle":          3334,
    "right_ankle":         6728,
    "neck_base":           3049,
    "mid_waist_back":      3015,
}
```

**Height-based scale application:**
```python
def scale_mesh_to_cm(mesh, user_height_cm):
    model_height = mesh.vertices[:, 1].max() - mesh.vertices[:, 1].min()
    scale_factor = user_height_cm / model_height
    scaled = mesh.copy()
    scaled.vertices *= scale_factor
    return scaled
```

**Circumference extraction:**
```python
def extract_circumference(mesh_cm, plane_vertex_idx):
    origin = mesh_cm.vertices[plane_vertex_idx]
    section = mesh_cm.section(plane_origin=origin, plane_normal=[0, 1, 0])
    if section is None:
        return 0.0
    path_2d, _ = section.to_planar()
    return path_2d.length  # true perimeter in cm
```

---

### B2 — PyTorch optimization loop

#### [NEW] [mesh_optimizer.py](file:///d:/Measora/app/services/mesh_optimizer.py)

Responsibilities:
- Accept: front+side MediaPipe landmark lists, front+side segmentation masks (pixel-space, from Stage A's `_get_segmentation_widths`), `user_height_cm`.
- Produce: optimized shape params beta (10-dim), theta (72-dim), and `mesh_fit_residual` in pixels.

**Two-phase fitting:**

**Phase 1 — beta initialization from landmarks (CPU-only, fast):**

The SMPL body model provides a linear mapping from beta to joint positions via its joint regressor matrix. Given 2D landmark observations from the front and side views, solve for beta via least-squares. This is ~10 ms on CPU and provides a far better starting point than beta=0 (neutral shape), dramatically reducing Phase 2 iteration count.

```
Objective:
  min_beta  ||J(beta)[front_joints, Y_axis] - front_lms_y_cm||^2
          + ||J(beta)[side_joints,  Y_axis] - side_lms_y_cm||^2
          + lambda_beta * ||beta||^2    (shape regularizer)
Solver: scipy.optimize.least_squares (bounded, -3 <= beta_i <= 3)
```

**Phase 2 — shape refinement via silhouette IoU loss (PyTorch):**

Using the beta from Phase 1 as starting point, refine with:
```
Loss = lambda_kp  * L_keypoint_reprojection
     + lambda_sil * L_silhouette_IoU
     + lambda_b   * ||beta||^2   (shape prior)
     + lambda_t   * ||theta||^2  (pose prior)
Optimizer: Adam, lr=0.01, 50-100 iterations (GPU) / 20 iterations (CPU)
```

- Keypoint reprojection: project SMPL 3D joints to 2D using known camera model (orthographic projection is sufficient for studio photos; weak perspective if needed).
- Silhouette IoU: rasterize the SMPL mesh to a binary mask and compute 1 - IoU against the segmentation mask from `_get_segmentation_widths`. Use PyTorch3D's SoftSilhouetteShader for differentiable gradients if available; fall back to non-differentiable scipy Nelder-Mead if not.

**CPU-only fallback:** If no GPU, Phase 2 runs with 20 iterations of scipy's Nelder-Mead on the binary IoU. Slower (~60 s) but yields reasonable results for CPU-only deployments.

**Residual:** After fitting, `mesh_fit_residual = mean_per_joint_2D_reprojection_error` in pixels.

---

### B3 — Main mesh tier service orchestrator

#### [NEW] [mesh_tier_service.py](file:///d:/Measora/app/services/mesh_tier_service.py)

This is the orchestrator, analogous to `accurate_tier_service.py`.

```python
def extract_mesh_measurements(
    user_height_cm: float,
    frames_a: List[models.Frame],   # front frames
    frames_b: List[models.Frame],   # side frames
) -> Tuple[List[Tuple[str, float, float, bool]], bool, Dict]:
    """
    Stage B: SMPL mesh fitting pipeline.
    Returns the SAME interface as extract_accurate_measurements() so
    the A/B comparison and eventual cutover require no API changes.
    """
    # 1. Parse landmarks + read image dims (reuse Stage A helpers)
    # 2. Get segmentation masks (reuse _get_segmentation_widths)
    # 3. Run mesh_optimizer.fit_smpl(front_lms, side_lms, front_masks, side_masks, height)
    #    -> returns beta, theta, mesh_fit_residual
    # 4. Build SMPL mesh from (beta, theta) via smpl_body_model
    # 5. Scale mesh to cm using user_height_cm
    # 6. Extract circumferences via trimesh cross-sections (B1)
    # 7. Extract lengths via vertex distances (B1)
    # 8. Apply BODY_WIDTH_RANGES guards (B4, imported from accurate_tier_service)
    # 9. Return (validated_measurements, scale_mismatch, raw_dimensions)
```

**Reuse from Stage A (no duplication):**
- `_parse_landmarks()` — import from `accurate_tier_service`
- `_read_image_dims()` — import from `accurate_tier_service`
- `_get_segmentation_widths()` — import from `accurate_tier_service`
- `_apply_width_range_guard()` + `BODY_WIDTH_RANGES` — import from `accurate_tier_service`

---

### B4 — Guard rails carry over (no new code)

`mesh_tier_service.py` imports and applies the same `_apply_width_range_guard()` and `BODY_WIDTH_RANGES` from `accurate_tier_service.py`. A bad mesh fit can still produce outlier circumferences. The guard is cheap insurance regardless of pipeline sophistication.

---

### B5 — A/B comparison framework

#### [MODIFY] [accurate_tier_service.py](file:///d:/Measora/app/services/accurate_tier_service.py)

In `run_accurate_estimate()`, when `settings.MESH_TIER_ENABLED=True`:
1. Run existing `extract_accurate_measurements()` (Stage A) — result is authoritative.
2. **Also** run `extract_mesh_measurements()` (Stage B) in the same background thread.
3. Store both results in job's `result_json`: `{"stage_a": {...}, "stage_b": {...}}`.
4. Public API surface unchanged — clients still see Stage A result.
5. Both sets logged for offline comparison.

#### [MODIFY] [estimates.py](file:///d:/Measora/app/routers/estimates.py)

Extend the existing debug endpoint (`GET /accurate-estimate/debug`) to expose both Stage A and Stage B intermediate values when `DEBUG_MEASUREMENTS=True && MESH_TIER_ENABLED=True`. This is the primary tool for the B5 validation work.

---

### B6 — Cutover and rollout

#### [MODIFY] [config.py](file:///d:/Measora/app/core/config.py)

```python
MESH_TIER_ENABLED: bool = False    # Stage B runs silently in parallel
MESH_TIER_PRIMARY: bool = False    # Stage B becomes the authoritative result
SMPL_MODEL_PATH: str = "./app/models/smpl/SMPL_NEUTRAL.pkl"
SMPL_NUM_BETAS: int = 10
MESH_FIT_MAX_ITER_GPU: int = 100
MESH_FIT_MAX_ITER_CPU: int = 20
```

#### [MODIFY] [models.py](file:///d:/Measora/app/db/models.py)

Add to the `Session` model:
```python
mesh_fit_residual     = Column(Float)   # per-session median reprojection error (px)
```

Add to `Measurement` model (optional, for per-measurement mesh residuals):
```python
mesh_residual_px = Column(Float)
```

#### [MODIFY] [common.py](file:///d:/Measora/app/schemas/common.py)

```python
class TierLabel(str, Enum):
    fast     = "fast"
    accurate = "accurate"
    mesh     = "mesh"      # new
```

**Rollout sequence:**
1. `MESH_TIER_ENABLED=True, MESH_TIER_PRIMARY=False` — Stage B silent parallel run, Stage A authoritative. Monitor for 1+ weeks in staging.
2. A/B compare vs. tape ground truth on 10+ subjects. If Stage B MAE <= Stage A MAE - 1 cm on key circumferences: proceed.
3. `MESH_TIER_PRIMARY=True` — Stage B is authoritative, Stage A runs as fallback only.
4. Monitor `mesh_fit_residual` in production. Auto-fallback to Stage A if median residual > 15 px.

---

### B7 — New dependencies

```
# Add to pip requirements / pyproject.toml
torch>=2.0              # SMPL forward pass + Phase 2 optimization
trimesh>=4.0            # Mesh cross-sectioning + perimeter computation
scipy>=1.11             # Phase 1 least-squares beta solve
smplx>=1.0.0            # Official SMPL/SMPL-X Python library

# Optional (Phase 2 differentiable silhouette — builds from source):
pytorch3d               # Differentiable rendering for silhouette IoU loss
                        # Not on PyPI — requires CUDA build matching torch version
                        # Pipeline falls back to scipy IoU if unavailable
```

> [!WARNING]
> `pytorch3d` requires a CUDA build environment matching your PyTorch version. It cannot be installed via `pip install pytorch3d` on most systems. Plan for this in your Docker/deployment setup. The pipeline degrades gracefully without it (scipy fallback), so it is optional but recommended for GPU deployments.

---

## Execution Order

| # | ID | Task | New/Modified File(s) | Depends on |
|---|----|---------|--------------------|------------|
| 1 | B0 | Obtain commercial SMPL license from Meshcapade/MPG | — | Stage A verified |
| 2 | B1a | SMPL model loader + height scaling | smpl_body_model.py [NEW] | B0 |
| 3 | B1b | trimesh cross-section measurement extractor | smpl_body_model.py [NEW] | B1a |
| 4 | B1c | Unit test: beta=0 neutral shape -> known circumferences | tests/test_smpl_body_model.py [NEW] | B1b |
| 5 | B2a | Phase 1: beta init from landmarks (least-squares, CPU) | mesh_optimizer.py [NEW] | B1a |
| 6 | B2b | Phase 2: silhouette IoU refinement (PyTorch/scipy) | mesh_optimizer.py [NEW] | B2a |
| 7 | B2c | Unit test: synthetic landmarks -> beta within +/-3 sigma | tests/test_mesh_optimizer.py [NEW] | B2b |
| 8 | B3 | Mesh tier orchestrator | mesh_tier_service.py [NEW] | B1, B2 |
| 9 | B4 | Wire BODY_WIDTH_RANGES guard into mesh tier | mesh_tier_service.py | B3 |
| 10 | B5a | Config flags + dual-run A/B logic in run_accurate_estimate | config.py, accurate_tier_service.py | B3 |
| 11 | B7 | DB schema: mesh_fit_residual column + TierLabel.mesh enum | models.py, common.py | B3 |
| 12 | B5b | A/B validation on 3-5 Stage A test subjects | — | B5a |
| 13 | B5c | Expand validation set to 10+ subjects; compare vs. tape | — | B5b |
| 14 | B6 | MESH_TIER_PRIMARY flag + result routing + fallback logic | accurate_tier_service.py, estimates.py | B5c shows improvement |

---

## Verification Plan

### Automated (per-PR gates)

**B1 fixture test — neutral SMPL body measurements:**
The SMPL neutral body (beta=0, theta=0) has well-documented reference dimensions (~176 cm male). Confirm:
- Chest circumference: 88–96 cm
- Waist circumference: 74–82 cm
- Hip circumference: 92–100 cm
- Shoulder width: 40–46 cm

**B2 sanity test:**
Feed Stage A's MediaPipe landmarks from a known test frame into the Phase 1 solver. Confirm `||beta||_2 < 5` (no extreme body shape) and `mesh_fit_residual < 30 px` on the same frame.

**B4 guard test:**
Force a converged beta that produces a 150 cm waist estimate -> confirm `_apply_width_range_guard` clips and sets `scale_mismatch=True`.

### A/B validation (gate before cutover, step B5c)

Run Stage A and Stage B pipelines on the same frames for 10+ subjects with known tape measurements covering:
- Slim / average / stocky body types
- Fitted / moderate / loose clothing

**Cutover criteria:**
- Stage B mean absolute error on chest + waist + hip <= Stage A MAE - 1 cm (measured against tape ground truth).
- Stage B `mesh_fit_residual` median < 15 px (good fit quality indicator).
- No catastrophic failures (no output outside BODY_WIDTH_RANGES that the guard doesn't catch).

**Target accuracy (per REQ-NFR-02):** ±1–2 cm on torso circumferences under standard conditions. Stage A's realistic ceiling with the ellipse formula is ±3–5 cm, so Stage B needs to beat that by at least 1 cm average to justify the switch.

---

## What Stage B Does NOT Change

| Item | Status |
|------|--------|
| API contract (endpoints, request/response schemas) | No change — same measurements, same field names |
| Fast Tier pipeline | No change |
| Frame upload / validation / pose service | No change |
| Stage A code during A/B phase | No change — runs in parallel |
| Anthropometric range guards (BODY_WIDTH_RANGES) | Reused as-is via import |
| File lifecycle / deletion policy | No change |
| DB measurement columns (iso_name, value_cm, residual_error_cm, was_clipped) | No change — same schema |
