/**
 * StepIndicator — Measora Design System
 *
 * Progress bar with ruler-tick track (signature element).
 * The .progress__track uses the ruler-tick CSS background from index.css.
 * The fill is brass-amber and glows softly.
 *
 * Numeric label uses JetBrains Mono via .progress__label.
 */
export function StepIndicator({ currentStep, totalSteps = 5, label }) {
  const progress = Math.max(0, Math.min(100, ((currentStep - 1) / (totalSteps - 1)) * 100));

  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-label={label || `Step ${currentStep} of ${totalSteps}`}
    >
      <div className="progress__track" aria-hidden="true">
        <div className="progress__fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="progress__label" aria-hidden="true">
        {currentStep}/{totalSteps}
      </span>
    </div>
  );
}
