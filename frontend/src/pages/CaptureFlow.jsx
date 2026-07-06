/**
 * CaptureFlow.jsx — Phase 3 Redesign
 *
 * Captures front + side photos, validates them, then enters the
 * Landmark Correction screen.
 *
 * KEY UX DECISION — Drag Pad:
 *   Landmark correction uses a spatially-decoupled "joystick pad"
 *   at the bottom of the screen (thumb-reachable zone) rather than
 *   direct-drag on the point. This eliminates thumb-occlusion and
 *   enables precise sub-pixel control without the user's finger
 *   blocking what they're trying to see.
 *   A magnifier loupe (72px circle, 3× zoom) renders above the
 *   selected point in the photo, giving precision feedback.
 *
 * ⚠ ASSUMPTION: WebSocket live-guidance messages have shape:
 *   { status: 'ok' | 'adjust' | 'error', message: string }
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Image as ImageIcon,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ZoomIn,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAccurateEstimate,
  useConfirmPoints,
  useFastEstimate,
  useSession,
  useUploadFrame,
  useValidateFrame,
} from '../api/hooks';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StepIndicator } from '../components/ui/StepIndicator';

/* ── Step map ───────────────────────────────────────────────────────── */
const STEP_LABELS = {
  2: 'Before you start',
  3: 'Front photo',
  4: 'Side photo',
  5: 'Check your points',
};

/* ── Point tier helpers ─────────────────────────────────────────────── */
const tierColor = (point) => {
  if (!point) return '#4CAF7D';
  const conf = point.confidence ?? 1;
  if (point.tier === 'LOW' || conf < 0.45) return 'var(--color-danger)';
  if (point.tier === 'MEDIUM' || conf < 0.75) return 'var(--color-brass)';
  return 'var(--color-success)';
};

const POINT_FRIENDLY_NAMES = {
  nose: 'Nose',
  left_ear: 'L. Ear',
  right_ear: 'R. Ear',
  left_eye: 'L. Eye',
  left_shoulder: 'L. Shoulder',
  right_shoulder: 'R. Shoulder',
  left_elbow: 'L. Elbow',
  right_elbow: 'R. Elbow',
  left_wrist: 'L. Wrist',
  right_wrist: 'R. Wrist',
  left_hip: 'L. Hip',
  right_hip: 'R. Hip',
  left_knee: 'L. Knee',
  right_knee: 'R. Knee',
  left_ankle: 'L. Ankle',
  right_ankle: 'R. Ankle',
  left_heel: 'L. Heel',
  right_heel: 'R. Heel',
};

const SCALE_CRITICAL_POINTS = new Set(['nose', 'left_ear', 'right_ear', 'left_ankle', 'right_ankle', 'left_heel', 'right_heel']);

/* ── Drag pad constants ─────────────────────────────────────────────── */
const PAD_RADIUS = 44; // max thumb travel in px from center
const PAD_SCALE = 0.006; // how much pad travel translates to normalized coords

/* ════════════════════════════════════════════════════════════════════
   Main Component
   ════════════════════════════════════════════════════════════════════ */
export default function CaptureFlow() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data: session } = useSession(sessionId);
  const upload = useUploadFrame();
  const validate = useValidateFrame();
  const confirm = useConfirmPoints();
  const fast = useFastEstimate();
  const accurate = useAccurateEstimate();

  const [step, setStep] = useState(2);
  const [direction, setDirection] = useState('forward');
  const [frames, setFrames] = useState({ A: null, B: null });
  const [rejectionError, setRejectionError] = useState(null); // { message, hints }
  const [selectedPoint, setSelectedPoint] = useState(null); // { pose, index }
  const [undo, setUndo] = useState([]);
  const [confirmedCriticalPoints, setConfirmedCriticalPoints] = useState(new Set());

  // Auto-navigate once processing
  const isProcessing = ['fast_processing', 'fast_ready', 'accurate_processing', 'complete'].includes(session?.status);
  useEffect(() => {
    if (isProcessing) navigate(`/app/session/${sessionId}/result`, { replace: true });
  }, [isProcessing, navigate, sessionId]);

  const goTo = (next, dir = 'forward') => {
    setDirection(dir);
    setStep(next);
    setRejectionError(null);
  };

  const goBack = () => {
    if (step <= 2) navigate('/app');
    else if (step === 4 && !frames.A) goTo(3, 'back');
    else goTo(step - 1, 'back');
  };

  /* ── Photo upload + validate chain ─────────────────────────────── */
  const choosePhoto = (event, pose) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setRejectionError(null);
    const url = URL.createObjectURL(file);
    const formData = new FormData();
    formData.append('pose', pose);
    formData.append('image', file);

    upload.mutate({ sessionId, formData }, {
      onSuccess: (response) => {
        validate.mutate({ sessionId, frameId: response.frame_id }, {
          onSuccess: (validation) => {
            if (!validation.accepted) {
              URL.revokeObjectURL(url);
              setRejectionError({
                message: validation.guidance_prompts?.[0] || "This photo couldn't be validated.",
                hints: validation.guidance_prompts?.slice(1) || [],
                frameId: response.frame_id,
              });
              return;
            }
            setFrames(curr => ({
              ...curr,
              [pose]: { id: response.frame_id, url, landmarks: validation.landmarks || [] },
            }));
            // Go to side photo or review
            goTo(pose === 'A' ? 4 : 5);
          },
          onError: () => {
            URL.revokeObjectURL(url);
            setRejectionError({ message: 'Validation check failed. Check your connection.' });
          },
        });
      },
      onError: () => {
        URL.revokeObjectURL(url);
        setRejectionError({ message: 'Upload failed. Check your connection and try again.' });
      },
    });
  };

  /* ── Landmark movement ──────────────────────────────────────────── */
  const movePoint = useCallback((pose, index, absoluteX, absoluteY) => {
    setFrames(curr => {
      const landmarks = [...curr[pose].landmarks];
      const pt = landmarks[index];
      landmarks[index] = {
        ...pt,
        x: Math.max(0, Math.min(1, absoluteX)),
        y: Math.max(0, Math.min(1, absoluteY)),
        confidence: 1,
        tier: 'HIGH',
      };
      return { ...curr, [pose]: { ...curr[pose], landmarks } };
    });
  }, []);

  const selectPoint = (pose, index) => {
    const point = frames[pose].landmarks[index];
    setUndo(curr => [...curr, { pose, index, point: { ...point } }]);
    setSelectedPoint({ pose, index });
    navigator.vibrate?.(20);
  };

  const deselectPoint = () => setSelectedPoint(null);

  const undoPoint = () => {
    const previous = undo.at(-1);
    if (!previous) return;
    setFrames(curr => {
      const landmarks = [...curr[previous.pose].landmarks];
      landmarks[previous.index] = previous.point;
      return { ...curr, [previous.pose]: { ...curr[previous.pose], landmarks } };
    });
    setUndo(curr => curr.slice(0, -1));
    setSelectedPoint(null);
  };

  /* ── Submit ─────────────────────────────────────────────────────── */
  const unconfirmedCriticalPoints = [];
  ['A', 'B'].forEach(pose => {
    frames[pose]?.landmarks?.forEach((pt, index) => {
      if (SCALE_CRITICAL_POINTS.has(pt.name)) {
        if (!confirmedCriticalPoints.has(`${pose}-${index}`)) {
          unconfirmedCriticalPoints.push({ pose, index, name: pt.name });
        }
      }
    });
  });
  const allCriticalConfirmed = frames.A && frames.B && unconfirmedCriticalPoints.length === 0;

  const [submitError, setSubmitError] = useState('');
  const calculating = confirm.isPending || fast.isPending || accurate.isPending;

  const submit = () => {
    if (!frames.A || !frames.B) return;
    setSubmitError('');
    confirm.mutate({ sessionId, frameId: frames.A.id, landmarks: frames.A.landmarks }, {
      onSuccess: () =>
        confirm.mutate({ sessionId, frameId: frames.B.id, landmarks: frames.B.landmarks }, {
          onSuccess: () =>
            fast.mutate(sessionId, {
              onSuccess: () =>
                accurate.mutate(sessionId, {
                  onSuccess: () => navigate(`/app/session/${sessionId}/result`),
                  onError: () => navigate(`/app/session/${sessionId}/result`),
                }),
              onError: () => setSubmitError('Measurement processing failed. Please try again.'),
            }),
          onError: () => setSubmitError('Side photo confirmation failed. Please try again.'),
        }),
      onError: () => setSubmitError('Front photo confirmation failed. Please try again.'),
    });
  };

  const busy = upload.isPending || validate.isPending;
  const animCls = direction === 'forward' ? 'step-animate-forward' : 'step-animate-back';

  return (
    <div className="flow-page">
      <header className="flow-header">
        <div className="flow-header__row">
          <button
            className="icon-button"
            onClick={goBack}
            aria-label="Go back"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="flow-header__title">{STEP_LABELS[step]}</h1>
          <span />
        </div>
      </header>

      <main className="flow-content">
        {/* Photo pair breadcrumb (steps 3-5) */}
        {step >= 3 && (
          <div className="photo-pair" style={{ marginBottom: 'var(--space-4)' }} aria-label="Photo progress">
            <span className={`photo-pair__step photo-pair__step--${step > 3 || frames.A ? 'done' : 'current'}`}>
              {frames.A && <CheckCircle2 size={12} aria-hidden="true" />}
              Front
            </span>
            <div className="photo-pair__divider" aria-hidden="true" />
            <span className={`photo-pair__step photo-pair__step--${
              step > 4 || frames.B ? 'done' : step === 4 ? 'current' : 'future'
            }`}>
              {frames.B && <CheckCircle2 size={12} aria-hidden="true" />}
              Side
            </span>
          </div>
        )}

        {step === 2 && <Guide onContinue={() => goTo(3)} animCls={animCls} />}
        {step === 3 && (
          <Capture
            key="front"
            pose="A"
            busy={busy}
            rejectionError={step === 3 ? rejectionError : null}
            onChoose={choosePhoto}
            animCls={animCls}
          />
        )}
        {step === 4 && (
          <Capture
            key="side"
            pose="B"
            busy={busy}
            rejectionError={step === 4 ? rejectionError : null}
            onChoose={choosePhoto}
            animCls={animCls}
          />
        )}
        {step === 5 && (
          <Review
            frames={frames}
            selectedPoint={selectedPoint}
            onSelectPoint={selectPoint}
            onDeselectPoint={deselectPoint}
            onMovePoint={movePoint}
            onUndo={undoPoint}
            canUndo={undo.length > 0}
            onRetake={(pose) => {
              if (frames[pose]?.url) URL.revokeObjectURL(frames[pose].url);
              setFrames(curr => ({ ...curr, [pose]: null }));
              setSelectedPoint(null);
              goTo(pose === 'A' ? 3 : 4, 'back');
            }}
            onSubmit={submit}
            calculating={calculating}
            submitError={submitError}
            allCriticalConfirmed={allCriticalConfirmed}
            unconfirmedCriticalPoints={unconfirmedCriticalPoints}
            confirmedCriticalPoints={confirmedCriticalPoints}
            onConfirmPoint={() => {
              if (selectedPoint) {
                setConfirmedCriticalPoints(prev => new Set([...prev, `${selectedPoint.pose}-${selectedPoint.index}`]));
                deselectPoint();
              }
            }}
            animCls={animCls}
          />
        )}
      </main>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 1: Guide / Pre-capture tips
   ════════════════════════════════════════════════════════════════════ */
function Guide({ onContinue, animCls }) {
  const tips = [
    {
      title: 'Give yourself space',
      copy: 'Your full body — head to feet — must be visible in each photo.',
    },
    {
      title: 'Wear fitted clothing',
      copy: 'Fitted fabric lets the AI detect your shape accurately. Avoid loose jumpers or coats.',
    },
    {
      title: 'Use even lighting',
      copy: 'Face a window or light source. Avoid strong back-lighting or heavy shadows.',
    },
  ];

  return (
    <div className={animCls} style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 'var(--space-5)' }}>
      <div>
        <p className="page-eyebrow">Before you start</p>
        <h2 className="page-title" style={{ fontSize: 'var(--text-3xl)' }}>
          Set up for a<br />clean scan
        </h2>
        <p className="page-copy">You'll take one front photo and one side profile photo.</p>
      </div>

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <div className="guide-tips">
          {tips.map((tip, i) => (
            <div className="guide-tip" key={tip.title}>
              <span className="guide-tip__number">{i + 1}</span>
              <div>
                <p className="guide-tip__title">{tip.title}</p>
                <p className="guide-tip__copy">{tip.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="banner banner--info"
        style={{ alignItems: 'center' }}
      >
        <ShieldCheck size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
        <p className="banner__message">
          Choose a private space. Your photos are only used for measurement and aren't stored on our servers.
        </p>
      </div>

      <div className="sticky-action">
        <Button fullWidth onClick={onContinue}>
          I'm ready <Check size={18} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 2 & 3: Capture / Upload screen
   ════════════════════════════════════════════════════════════════════ */
function Capture({ pose, busy, rejectionError, onChoose, animCls }) {
  const isFront = pose === 'A';

  // ⚠ ASSUMPTION: WebSocket guidance signals have shape:
  //   { status: 'ok'|'adjust'|'error', message: string }
  // Live guidance is wired to the same session but no WS needed for upload flow.
  // This state is a placeholder for a future WS integration.
  const [guidance] = useState(null); // { status, message }

  return (
    <div className={animCls} style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 'var(--space-4)' }}>
      <div>
        <p className="page-eyebrow">{isFront ? 'Photo 1 of 2' : 'Photo 2 of 2'}</p>
        <h2 className="page-title" style={{ fontSize: 'var(--text-3xl)' }}>
          {isFront ? 'Face the camera' : 'Turn to your side'}
        </h2>
        <p className="page-copy">
          {isFront
            ? 'Stand in front of the camera, arms slightly away from your body.'
            : "Turn 90° to your right. Keep your arm slightly forward so it doesn't hide your hip."}
        </p>
      </div>

      {/* Capture stage */}
      <div className="capture-stage" role="img" aria-label={`${isFront ? 'Front' : 'Side'} pose guide`}>
        {/* Corner ruler-tick alignment marks */}
        <div className="capture-stage__corners" aria-hidden="true">
          <div className="capture-stage__corner-br" />
        </div>

        {/* Silhouette guide */}
        <img
          className="capture-stage__guide"
          src={`/assets/poses/pose_${pose}.png`}
          alt=""
          aria-hidden="true"
        />

        {/* Live guidance chip — WebSocket signal */}
        {guidance && (
          <div
            className={`guidance-chip guidance-chip--${guidance.status}`}
            role="status"
            aria-live="polite"
          >
            {guidance.status === 'ok' && <CheckCircle2 size={12} aria-hidden="true" />}
            {guidance.status === 'adjust' && <AlertCircle size={12} aria-hidden="true" />}
            {guidance.status === 'error' && <AlertCircle size={12} aria-hidden="true" />}
            {guidance.message}
          </div>
        )}

        {/* Loading overlay */}
        {busy && (
          <div className="capture-stage__loading" role="status" aria-label="Checking photo">
            <RefreshCw size={28} className="spin" aria-hidden="true" />
            <p className="capture-stage__loading-label">Checking your photo…</p>
          </div>
        )}
      </div>

      {/* Validation rejection feedback */}
      {rejectionError && (
        <div className="validation-reject" role="alert">
          <p className="validation-reject__heading">
            <AlertCircle size={15} aria-hidden="true" />
            {rejectionError.message}
          </p>
          {rejectionError.hints?.length > 0 && (
            <ul style={{ margin: 0, padding: '0 0 0 var(--space-4)', listStyle: 'disc' }}>
              {rejectionError.hints.map((hint, i) => (
                <li key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', lineHeight: 'var(--leading-loose)' }}>
                  {hint}
                </li>
              ))}
            </ul>
          )}
          <p className="validation-reject__message">Try again with the photo above, or choose a new one.</p>
        </div>
      )}

      {/* Capture / upload actions */}
      <div className="capture-actions">
        <label className="file-label">
          <span className="button button--primary button--full">
            <Camera size={19} aria-hidden="true" />
            {rejectionError ? 'Take photo again' : 'Open camera'}
          </span>
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => onChoose(e, pose)}
          />
        </label>
        <label className="file-label">
          <span className="button button--outline button--full">
            <ImageIcon size={18} aria-hidden="true" />
            Choose from gallery
          </span>
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png"
            disabled={busy}
            onChange={(e) => onChoose(e, pose)}
          />
        </label>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 4: Landmark Correction / Review
   ════════════════════════════════════════════════════════════════════ */
function Review({
  frames,
  selectedPoint,
  onSelectPoint,
  onDeselectPoint,
  onMovePoint,
  onUndo,
  canUndo,
  onRetake,
  onSubmit,
  calculating,
  submitError,
  allCriticalConfirmed,
  unconfirmedCriticalPoints,
  confirmedCriticalPoints,
  onConfirmPoint,
  animCls,
}) {
  const hasLowPoints = Object.values(frames).some(frame =>
    frame?.landmarks?.some(pt => (pt.tier === 'LOW') || (pt.confidence ?? 1) < 0.45)
  );

  return (
    <>
      <div className={animCls} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div>
          <p className="page-eyebrow">Final check</p>
          <h2 className="page-title" style={{ fontSize: 'var(--text-3xl)' }}>
            Review detected<br />points
          </h2>
          <p className="page-copy">
            Tap any <span style={{ color: 'var(--color-brass)', fontWeight: 700 }}>amber</span> or <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>red</span> point to adjust it.
            Precise points produce more accurate measurements.
          </p>
        </div>

        {hasLowPoints && (
          <div
            className="banner banner--warning"
            style={{ alignItems: 'flex-start' }}
          >
            <ZoomIn size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <p className="banner__message">
              Some points need attention. Tap a coloured dot to open the precision editor, then drag the joystick to move it onto the exact joint.
            </p>
          </div>
        )}

        {unconfirmedCriticalPoints.length > 0 && (
          <div className="banner banner--error" style={{ alignItems: 'flex-start' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <p className="banner__message">
              You must confirm the scale-critical points (red) before calculating measurements. Tap each one and place it precisely.
            </p>
          </div>
        )}

        <div className="review-stack">
          {['A', 'B'].map(pose => {
            const frame = frames[pose];
            if (!frame) return null;
            return (
              <FrameReview
                key={pose}
                pose={pose}
                frame={frame}
                selectedPoint={selectedPoint}
                onSelectPoint={onSelectPoint}
                onDeselectPoint={onDeselectPoint}
                onMovePoint={onMovePoint}
                onConfirmPoint={onConfirmPoint}
                onRetake={onRetake}
                confirmedCriticalPoints={confirmedCriticalPoints}
              />
            );
          })}
        </div>

        {canUndo && (
          <button
            onClick={onUndo}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              alignSelf: 'center',
              padding: '0 var(--space-3)',
              minHeight: 40,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-ink-muted)',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
            Undo last move
          </button>
        )}

        {submitError && (
          <Banner type="error" title="Couldn't start calculations" message={submitError} />
        )}

        <div className="sticky-action">
          <Button fullWidth onClick={onSubmit} isLoading={calculating} variant="brass" disabled={!allCriticalConfirmed}>
            Calculate my measurements <Check size={18} aria-hidden="true" />
          </Button>
        </div>
      </div>

    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   FrameReview — single photo with SVG landmark overlay
   ════════════════════════════════════════════════════════════════════ */
function FrameReview({ pose, frame, selectedPoint, onSelectPoint, onDeselectPoint, onMovePoint, onConfirmPoint, onRetake, confirmedCriticalPoints }) {
  const imgRef = useRef(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragCoords, setDragCoords] = useState(null);

  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  const MIN_LABEL_DISTANCE_PX = 20;
  const offsets = useMemo(() => {
    const map = new Map();
    if (dimensions.width === 0 || dimensions.height === 0) return map;

    const points = frame.landmarks.map((p, i) => ({
      index: i,
      x: p.x * dimensions.width,
      y: p.y * dimensions.height,
      dx: 0,
      dy: 0,
    }));

    // Repulsion for labels
    for (let iter = 0; iter < 5; iter++) {
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const p1 = points[i];
          const p2 = points[j];
          
          const l1x = p1.x + p1.dx;
          const l1y = p1.y + p1.dy;
          const l2x = p2.x + p2.dx;
          const l2y = p2.y + p2.dy;
          
          const dist = Math.hypot(l1x - l2x, l1y - l2y);
          if (dist < MIN_LABEL_DISTANCE_PX && dist > 0.001) {
            const push = (MIN_LABEL_DISTANCE_PX - dist) / 2;
            const nx = (l1x - l2x) / dist;
            const ny = (l1y - l2y) / dist;
            
            p1.dx += nx * push;
            p1.dy += ny * push;
            p2.dx -= nx * push;
            p2.dy -= ny * push;
          }
        }
      }
    }
    
    points.forEach(p => {
      if (Math.abs(p.dx) > 0.1 || Math.abs(p.dy) > 0.1) {
        map.set(p.index, { dx: p.dx, dy: p.dy });
      }
    });
    
    return map;
  }, [frame.landmarks, dimensions]);

  const isSelected = (index) =>
    selectedPoint?.pose === pose && selectedPoint?.index === index;

  const handlePointerDown = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Nearest neighbor
    let closestIdx = -1;
    let minDistance = Infinity;
    
    frame.landmarks.forEach((p, i) => {
      const px = p.x * rect.width;
      const py = p.y * rect.height;
      const tx = x * rect.width;
      const ty = y * rect.height;
      const dist = Math.hypot(px - tx, py - ty);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = i;
      }
    });

    if (minDistance <= 40 && closestIdx !== -1) {
      // Tap on point (or close to it)
      onSelectPoint(pose, closestIdx);
      setIsDragging(true);
      setDragCoords({ x, y });
      e.target.setPointerCapture(e.pointerId);
    } else {
      // Tap on empty space
      onDeselectPoint();
    }
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    const selectedIdx = selectedPoint?.pose === pose ? selectedPoint.index : null;
    if (selectedIdx !== null) {
      onMovePoint(pose, selectedIdx, x, y);
    }
    setDragCoords({ x, y });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    setDragCoords(null);
    e.target.releasePointerCapture(e.pointerId);
  };

  // Loupe: show magnified area around selected point using canvas approach
  const selectedIdx = selectedPoint?.pose === pose ? selectedPoint.index : null;
  const selectedPt = selectedIdx != null ? frame.landmarks[selectedIdx] : null;

  return (
    <div className="card" style={{ padding: 'var(--space-3)' }}>
      {/* Header row */}
      <div className="review-card-header">
        <span className="review-card-header__label">
          {pose === 'A' ? 'Front photo' : 'Side photo'}
        </span>
        <Button variant="text" onClick={() => onRetake(pose)} style={{ minHeight: 36, fontSize: 'var(--text-sm)' }}>
          Retake
        </Button>
      </div>

      {/* Photo + SVG overlay */}
      <div 
        className="review-photo-wrap" 
        ref={imgRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        <img
          src={frame.url}
          alt={`${pose === 'A' ? 'Front' : 'Side'} measurement photo`}
          draggable="false"
        />

        <svg aria-label="Detected body landmarks" role="img">
          {frame.landmarks.map((point, index) => {
            const isScaleCritical = SCALE_CRITICAL_POINTS.has(point.name);
            const isConfirmed = confirmedCriticalPoints?.has(`${pose}-${index}`);
            
            // Override color if unconfirmed critical point
            let color = tierColor(point);
            if (isScaleCritical && !isConfirmed) {
              color = '#FF3B30'; // red accent
            } else if (isScaleCritical && isConfirmed) {
              color = 'var(--color-success)';
            }
            
            const selected = isSelected(index);
            const isLow = (point.tier === 'LOW') || (point.confidence ?? 1) < 0.45;
            const name = POINT_FRIENDLY_NAMES[point.name] || point.name;
            const offset = offsets.get(index) || { dx: 0, dy: 0 };
            const hasOffset = Math.abs(offset.dx) > 0.1 || Math.abs(offset.dy) > 0.1;

            return (
              <g
                key={`${point.name ?? index}-${index}`}
                style={{
                  animationDelay: `${index * 25}ms`,
                }}
                className="landmark-enter"
              >
                {/* Connector line for offset labels */}
                {hasOffset && (
                  <line
                    x1={`${point.x * 100}%`}
                    y1={`${point.y * 100}%`}
                    x2={`calc(${point.x * 100}% + ${offset.dx}px)`}
                    y2={`calc(${point.y * 100}% + ${offset.dy}px)`}
                    stroke="var(--color-ink-muted)"
                    strokeWidth="1"
                    opacity="0.6"
                  />
                )}

                {/* Pulse ring for LOW confidence */}
                {(isLow || (isScaleCritical && !isConfirmed)) && !selected && (
                  <circle
                    cx={`${point.x * 100}%`}
                    cy={`${point.y * 100}%`}
                    r={isScaleCritical ? "16" : "14"}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    opacity="0"
                    style={{
                      animation: 'lm-ring-pulse 1.4s ease-out infinite',
                    }}
                  />
                )}

                {/* Selection outer ring */}
                {selected && (
                  <circle
                    cx={`${point.x * 100}%`}
                    cy={`${point.y * 100}%`}
                    r={isScaleCritical ? "16" : "14"}
                    fill="none"
                    stroke="var(--color-brass)"
                    strokeWidth="2"
                    opacity="0.9"
                  />
                )}

                {/* Visible dot */}
                <circle
                  cx={`${point.x * 100}%`}
                  cy={`${point.y * 100}%`}
                  r={selected ? (isScaleCritical ? 11 : 9) : (isScaleCritical ? 8 : 6)}
                  fill={selected ? 'var(--color-brass)' : color}
                  stroke="#fff"
                  strokeWidth={selected ? 2.5 : 1.5}
                  style={{ transition: 'r 160ms ease, fill 200ms ease' }}
                />

                {/* Name label (always visible with collision avoidance) */}
                <foreignObject
                  x={`calc(${point.x * 100}% + ${offset.dx}px)`}
                  y={`calc(${point.y * 100}% + ${offset.dy}px)`}
                  width="1"
                  height="1"
                  overflow="visible"
                  style={{ pointerEvents: 'auto', zIndex: 10, cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectPoint(pose, index);
                    setIsDragging(true);
                    setDragCoords({ x: point.x, y: point.y });
                    e.target.setPointerCapture(e.pointerId);
                  }}
                >
                  <div className="point-label" style={{
                    transform: 'translate(-50%, calc(-100% - 10px))',
                    background: selected ? 'var(--color-brass)' : (isScaleCritical && !isConfirmed ? '#FF3B30' : 'rgba(28, 28, 30, 0.85)'),
                    color: selected || (isScaleCritical && !isConfirmed) ? '#fff' : 'var(--color-white)',
                    fontWeight: isScaleCritical ? 700 : 500
                  }}>
                    {name}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {/* Loupe — shows above selected point while dragging */}
        {selectedPt && imgRef.current && isDragging && dragCoords && (
          <Loupe
            point={{ x: dragCoords.x, y: dragCoords.y }}
            imageUrl={frame.url}
            containerRef={imgRef}
          />
        )}

        {/* Nudge Controls — shows when a point is selected but not dragging */}
        {selectedPt && !isDragging && (
          <NudgeControls 
             point={selectedPt} 
             dimensions={dimensions} 
             onNudge={(dx, dy) => {
               onMovePoint(pose, selectedIdx, selectedPt.x + dx/dimensions.width, selectedPt.y + dy/dimensions.height);
             }}
             onConfirm={() => {
               if (SCALE_CRITICAL_POINTS.has(selectedPt.name)) onConfirmPoint();
               onDeselectPoint();
             }}
             isCritical={SCALE_CRITICAL_POINTS.has(selectedPt.name)}
          />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Loupe — 3× magnifier above the selected point
   ════════════════════════════════════════════════════════════════════ */
function Loupe({ point, imageUrl, containerRef }) {
  const container = containerRef.current;
  if (!container) return null;

  const img = container.querySelector('img');
  if (!img) return null;

  const imgRect = img.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const ZOOM = 3;
  const SIZE = 72;
  const HALF = SIZE / 2;

  // Position in container-local pixels
  const px = point.x * imgRect.width;
  const py = point.y * imgRect.height;

  // Background-position: offset so the point is centered in loupe
  const bgX = -(px * ZOOM - HALF);
  const bgY = -(py * ZOOM - HALF);

  // Offset the loupe 80px above the touch point
  const loupeY = py - 80;
  const displayY = loupeY < HALF ? py + 80 : loupeY; 

  return (
    <div
      className="loupe"
      aria-hidden="true"
      style={{
        left: px,
        top: displayY,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: `${imgRect.width * ZOOM}px ${imgRect.height * ZOOM}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="loupe__crosshair" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NudgeControls — D-pad for pixel-perfect adjustments
   ════════════════════════════════════════════════════════════════════ */
function NudgeControls({ point, dimensions, onNudge, onConfirm, isCritical }) {
  if (!dimensions.width || !dimensions.height) return null;
  
  const px = point.x * dimensions.width;
  const py = point.y * dimensions.height;
  
  return (
    <div style={{
      position: 'absolute',
      left: px,
      top: py + 40,
      transform: 'translateX(-50%)',
      background: 'rgba(28, 28, 30, 0.95)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-2)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-2)',
      boxShadow: 'var(--shadow-md)',
      zIndex: 20,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gap: 4 }}>
        <div />
        <button className="icon-button" onClick={() => onNudge(0, -1)} style={{ background: '#333' }}><ChevronUp size={16}/></button>
        <div />
        <button className="icon-button" onClick={() => onNudge(-1, 0)} style={{ background: '#333' }}><ChevronLeft size={16}/></button>
        <div style={{ width: 36, height: 36 }} />
        <button className="icon-button" onClick={() => onNudge(1, 0)} style={{ background: '#333' }}><ChevronRight size={16}/></button>
        <div />
        <button className="icon-button" onClick={() => onNudge(0, 1)} style={{ background: '#333' }}><ChevronDown size={16}/></button>
        <div />
      </div>
      <Button 
        variant={isCritical ? "brass" : "outline"} 
        onClick={onConfirm} 
        style={{ minHeight: 32, padding: '0 var(--space-3)', fontSize: 'var(--text-xs)' }}
      >
        <Check size={14} style={{ marginRight: 4 }}/> Place
      </Button>
    </div>
  );
}


