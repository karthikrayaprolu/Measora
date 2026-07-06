import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreateSession } from '../api/hooks';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { StepIndicator } from '../components/ui/StepIndicator';

/* ── Constants ─────────────────────────────────────────────────────── */
const HEIGHT_MIN_CM = 140;
const HEIGHT_MAX_CM = 220;
const HEIGHT_DEFAULT_CM = 175;

const FIT_OPTIONS = [
  {
    id: 'slim',
    label: 'Slim',
    desc: 'Close to the body',
    Silhouette: SlimSilhouette,
  },
  {
    id: 'regular',
    label: 'Regular',
    desc: 'A little room to move',
    Silhouette: RegularSilhouette,
  },
  {
    id: 'relaxed',
    label: 'Relaxed',
    desc: 'Drapes loosely',
    Silhouette: RelaxedSilhouette,
  },
];

/* ── Silhouette SVGs — shirt cross-section showing fabric gap ───────── */
function SlimSilhouette() {
  /* Body outline close, fabric almost touching — minimal gap */
  return (
    <svg width="40" height="72" viewBox="0 0 40 72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      {/* Body */}
      <ellipse cx="20" cy="14" rx="7" ry="8" strokeDasharray="2 2" opacity="0.5" />
      {/* Torso — slim */}
      <path d="M13 22 Q10 36 11 56 L14 56 L14 36 L20 38 L26 36 L26 56 L29 56 Q30 36 27 22" />
      {/* Fabric line — very close to body */}
      <path d="M11 22 Q8 36 9 58" opacity="0.35" strokeWidth="1" />
      <path d="M29 22 Q32 36 31 58" opacity="0.35" strokeWidth="1" />
      {/* Shoulder measurement tick */}
      <line x1="13" y1="68" x2="27" y2="68" strokeWidth="0.8" opacity="0.4" />
      <line x1="13" y1="66" x2="13" y2="70" strokeWidth="1" opacity="0.5" />
      <line x1="27" y1="66" x2="27" y2="70" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function RegularSilhouette() {
  /* Moderate gap between body and fabric */
  return (
    <svg width="44" height="72" viewBox="0 0 44 72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <ellipse cx="22" cy="14" rx="7" ry="8" strokeDasharray="2 2" opacity="0.5" />
      <path d="M15 22 Q12 36 13 56 L16 56 L16 36 L22 38 L28 36 L28 56 L31 56 Q32 36 29 22" />
      {/* Fabric — modest gap */}
      <path d="M12 22 Q8 36 9 58" opacity="0.35" strokeWidth="1" />
      <path d="M32 22 Q36 36 35 58" opacity="0.35" strokeWidth="1" />
      <line x1="12" y1="68" x2="32" y2="68" strokeWidth="0.8" opacity="0.4" />
      <line x1="12" y1="66" x2="12" y2="70" strokeWidth="1" opacity="0.5" />
      <line x1="32" y1="66" x2="32" y2="70" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function RelaxedSilhouette() {
  /* Noticeable gap — fabric billows outward */
  return (
    <svg width="52" height="72" viewBox="0 0 52 72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <ellipse cx="26" cy="14" rx="7" ry="8" strokeDasharray="2 2" opacity="0.5" />
      <path d="M19 22 Q16 36 17 56 L20 56 L20 36 L26 38 L32 36 L32 56 L35 56 Q36 36 33 22" />
      {/* Fabric — significant drape */}
      <path d="M14 21 Q8 34 7 58" opacity="0.35" strokeWidth="1" />
      <path d="M38 21 Q44 34 45 58" opacity="0.35" strokeWidth="1" />
      <line x1="9" y1="68" x2="43" y2="68" strokeWidth="0.8" opacity="0.4" />
      <line x1="9" y1="66" x2="9" y2="70" strokeWidth="1" opacity="0.5" />
      <line x1="43" y1="66" x2="43" y2="70" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

/* ── Unit conversion helpers ────────────────────────────────────────── */
function cmToFtIn(cm) {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { ft, inches };
}
function ftInToCm(ft, inches) {
  return Math.round((ft * 12 + inches) * 2.54);
}

/* ── Main component ─────────────────────────────────────────────────── */
export default function SessionConfig() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { mutate: createSession, isPending, isError } = useCreateSession();

  // Flow state
  const [step, setStep] = useState(1); // 1=height, 2=fit, 3=consent
  const [direction, setDirection] = useState('forward');

  // Form state
  const [heightCm, setHeightCm] = useState(HEIGHT_DEFAULT_CM);
  const [unit, setUnit] = useState('cm'); // 'cm' | 'ftin'
  const [ftVal, setFtVal] = useState(5);
  const [inVal, setInVal] = useState(9);
  const [fit, setFit] = useState('regular');
  const [storeProfile, setStoreProfile] = useState(false); // privacy-first: default off

  // Height validation
  const heightOk = heightCm >= HEIGHT_MIN_CM && heightCm <= HEIGHT_MAX_CM;
  const [heightTouched, setHeightTouched] = useState(false);
  const showHeightError = heightTouched && !heightOk;

  // Sync unit conversions
  const syncCmFromFtIn = useCallback((ft, inches) => {
    const cm = ftInToCm(ft, inches);
    setHeightCm(Math.max(HEIGHT_MIN_CM, Math.min(HEIGHT_MAX_CM, cm)));
  }, []);

  const handleSlider = (e) => {
    const val = Number(e.target.value);
    setHeightCm(val);
    const { ft, inches } = cmToFtIn(val);
    setFtVal(ft);
    setInVal(inches);
    setHeightTouched(true);
  };

  const handleCmInput = (e) => {
    const val = Number(e.target.value);
    setHeightCm(val);
    const { ft, inches } = cmToFtIn(val);
    setFtVal(ft);
    setInVal(inches);
    setHeightTouched(true);
  };

  const handleFtChange = (e) => {
    const ft = Number(e.target.value);
    setFtVal(ft);
    syncCmFromFtIn(ft, inVal);
    setHeightTouched(true);
  };

  const handleInChange = (e) => {
    const inches = Number(e.target.value);
    setInVal(inches);
    syncCmFromFtIn(ftVal, inches);
    setHeightTouched(true);
  };

  const switchUnit = (u) => {
    if (u === unit) return;
    if (u === 'ftin') {
      const { ft, inches } = cmToFtIn(heightCm);
      setFtVal(ft); setInVal(inches);
    }
    setUnit(u);
  };

  const goTo = (nextStep, dir = 'forward') => {
    setDirection(dir);
    setStep(nextStep);
  };

  const goBack = () => {
    if (step === 1) navigate('/app');
    else goTo(step - 1, 'back');
  };

  const submit = () => {
    createSession({
      product_type: productId,
      height: heightCm,
      height_unit: 'cm',
      calibration_method: 'height',
      optional_poses: [],
      fit_preference: fit,
      store_profile: storeProfile,
    }, {
      onSuccess: data => navigate(`/app/session/${data.session_id}/capture`),
    });
  };

  const animCls = direction === 'forward' ? 'step-animate-forward' : 'step-animate-back';

  /* ── Step title map ─────────────────────────────────────────────── */
  const stepTitles = ['Your height', 'Your fit', 'Your data'];

  return (
    <div className="flow-page">
      <header className="flow-header">
        <div className="flow-header__row">
          <button
            className="icon-button"
            onClick={goBack}
            aria-label={step === 1 ? 'Back to categories' : 'Back to previous step'}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="flow-header__title">{stepTitles[step - 1]}</h1>
          <span />
        </div>
      </header>

      <main className="flow-content">
        <StepIndicator currentStep={step} totalSteps={3} label={`Step ${step} of 3`} />

        {/* ── STEP 1: HEIGHT ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className={animCls} key="step-height" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 'var(--space-5)' }}>
            <div>
              <p className="page-eyebrow">{productId} fitting</p>
              <h2 className="page-title" style={{ fontSize: 'var(--text-3xl)' }}>How tall are you?</h2>
              <p className="page-copy">Used to set the scale of your photos.</p>
            </div>

            {/* Unit toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div className="unit-toggle" role="group" aria-label="Height unit">
                <button
                  className="unit-toggle__btn"
                  aria-pressed={unit === 'cm'}
                  onClick={() => switchUnit('cm')}
                  type="button"
                >
                  cm
                </button>
                <button
                  className="unit-toggle__btn"
                  aria-pressed={unit === 'ftin'}
                  onClick={() => switchUnit('ftin')}
                  type="button"
                >
                  ft · in
                </button>
              </div>
            </div>

            {/* Instrument display */}
            <div className="height-display" aria-live="polite" aria-label={`Height: ${heightCm} centimetres`}>
              {unit === 'cm' ? (
                <>
                  <input
                    className="height-display__value"
                    type="number"
                    inputMode="numeric"
                    min={HEIGHT_MIN_CM}
                    max={HEIGHT_MAX_CM}
                    value={heightCm}
                    onChange={handleCmInput}
                    onBlur={() => setHeightTouched(true)}
                    aria-label="Height in centimetres"
                    style={{ background: 'transparent', border: 'none', outline: 'none', textAlign: 'center', width: '100%', maxWidth: 180, padding: 0 }}
                  />
                  <span className="height-display__unit">cm</span>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', justifyContent: 'center' }}>
                    <input
                      className="height-display__value"
                      type="number"
                      inputMode="numeric"
                      min={4}
                      max={7}
                      value={ftVal}
                      onChange={handleFtChange}
                      onBlur={() => setHeightTouched(true)}
                      aria-label="Feet"
                      style={{ background: 'transparent', border: 'none', outline: 'none', textAlign: 'right', width: 80, padding: 0 }}
                    />
                    <span className="height-display__unit">ft</span>
                    <input
                      className="height-display__value"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={11}
                      value={inVal}
                      onChange={handleInChange}
                      onBlur={() => setHeightTouched(true)}
                      aria-label="Inches"
                      style={{ background: 'transparent', border: 'none', outline: 'none', textAlign: 'right', width: 80, padding: 0 }}
                    />
                    <span className="height-display__unit">in</span>
                  </div>
                </>
              )}
            </div>

            {/* Slider */}
            <div>
              <input
                className="height-slider"
                type="range"
                min={HEIGHT_MIN_CM}
                max={HEIGHT_MAX_CM}
                step={1}
                value={heightCm}
                onChange={handleSlider}
                aria-label={`Height slider, ${heightCm} cm`}
                aria-valuemin={HEIGHT_MIN_CM}
                aria-valuemax={HEIGHT_MAX_CM}
                aria-valuenow={heightCm}
              />
              <div className="height-slider-labels">
                <span>{HEIGHT_MIN_CM} cm</span>
                <span>{HEIGHT_MAX_CM} cm</span>
              </div>
            </div>

            {/* Inline error */}
            {showHeightError && (
              <p className="field-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                Enter a height between {HEIGHT_MIN_CM} and {HEIGHT_MAX_CM} cm.
              </p>
            )}

            <div className="sticky-action">
              <Button
                fullWidth
                onClick={() => { setHeightTouched(true); if (heightOk) goTo(2); }}
                disabled={!heightOk && heightTouched}
              >
                Continue <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: FIT ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className={animCls} key="step-fit" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 'var(--space-5)' }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 'var(--text-3xl)' }}>Choose your fit</h2>
              <p className="page-copy">How do you like clothes to feel against you?</p>
            </div>

            <div className="fit-grid" role="group" aria-label="Fit preference">
              {FIT_OPTIONS.map(({ id, label, desc, Silhouette }) => (
                <button
                  key={id}
                  className="fit-card"
                  aria-pressed={fit === id}
                  onClick={() => setFit(id)}
                  type="button"
                >
                  <div className="fit-card__figure">
                    <Silhouette />
                  </div>
                  <span className="fit-card__name">{label}</span>
                  <p className="fit-card__desc">{desc}</p>
                </button>
              ))}
            </div>

            <div className="sticky-action">
              <Button fullWidth onClick={() => goTo(3)}>
                Continue <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: CONSENT ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className={animCls} key="step-consent" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 'var(--space-5)' }}>
            <div>
              <h2 className="page-title" style={{ fontSize: 'var(--text-3xl)' }}>Save your<br />measurements?</h2>
              <p className="page-copy">This is optional. Your fitting works either way.</p>
            </div>

            {/* What gets saved — plain language */}
            <div className="consent-card">
              <div className="consent-card__header">
                <span className="consent-card__icon">
                  <ShieldCheck size={20} aria-hidden="true" />
                </span>
                <div>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700 }}>What gets saved</p>
                  <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-ink-faint)' }}>If you choose to save</p>
                </div>
              </div>
              <ul className="consent-list">
                <li>Your height ({heightCm} cm)</li>
                <li>Your body measurements in centimetres</li>
                <li>Your fit preference ({fit})</li>
                <li>Nothing from your photos — photos aren't stored</li>
              </ul>
            </div>

            {/* Choice — privacy first: "no" is pre-selected */}
            <div className="consent-options" role="radiogroup" aria-label="Save preference">
              <label className="consent-option">
                <input
                  type="radio"
                  name="store-profile"
                  checked={storeProfile === true}
                  onChange={() => setStoreProfile(true)}
                />
                <div>
                  <p className="consent-option__label">Yes, save to my profile</p>
                  <p className="consent-option__sub">Measurements carry over for future fittings.</p>
                </div>
              </label>

              <label className="consent-option">
                <input
                  type="radio"
                  name="store-profile"
                  checked={storeProfile === false}
                  onChange={() => setStoreProfile(false)}
                />
                <div>
                  <p className="consent-option__label">No, this fitting only</p>
                  <p className="consent-option__sub">Results visible today. Nothing saved to your profile.</p>
                </div>
              </label>
            </div>

            {isError && (
              <Banner
                type="error"
                title="Couldn't start fitting"
                message="Check your connection and try again."
              />
            )}

            <div className="sticky-action">
              <Button fullWidth isLoading={isPending} onClick={submit}>
                Start the fitting <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
