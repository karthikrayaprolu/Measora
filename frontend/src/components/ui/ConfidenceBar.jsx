/**
 * ConfidenceBar — Measora Design System (SIGNATURE ELEMENT)
 *
 * Shows AI confidence as a bar with ruler-tick track.
 * Three tiers:
 *   high   (>= 0.75): green fill
 *   medium (0.45–0.75): brass-amber fill  
 *   low    (< 0.45):  red fill, pulsing animation
 *
 * Usage:
 *   <ConfidenceBar value={0.85} label="Shoulder confidence" />
 */
export function ConfidenceBar({ value = 0, label, showLabel = true, className = '' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tier = value >= 0.75 ? 'high' : value >= 0.45 ? 'medium' : 'low';
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <div className={`confidence-bar-wrap ${className}`} style={{ display: 'grid', gap: 6 }}>
      {(label || showLabel) && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}>
          {label && (
            <span style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-ink-muted)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}>
              {label}
            </span>
          )}
          {showLabel && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: tier === 'high'
                ? 'var(--color-success)'
                : tier === 'medium'
                ? 'var(--color-brass)'
                : 'var(--color-danger)',
              letterSpacing: '0.03em',
            }}>
              {pct}% · {tierLabel}
            </span>
          )}
        </div>
      )}

      <div
        className="confidence-bar"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ? `${label}: ${pct}% (${tierLabel})` : `Confidence: ${pct}%`}
      >
        <div
          className={`confidence-bar__fill confidence-bar__fill--${tier}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
