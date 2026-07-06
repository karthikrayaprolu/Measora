/**
 * MeasurementRow — Measora Design System
 *
 * Displays a single body measurement in a list.
 * Label uses body type (Plus Jakarta Sans, muted).
 * Value uses data type (JetBrains Mono, tabular numerics).
 *
 * Usage:
 *   <MeasurementRow label="Chest circumference" value="102.4" unit="cm" />
 */
export function MeasurementRow({ label, value, unit = 'cm', confidence, isLast = false }) {
  return (
    <div
      className="measurement-row"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
      }}
    >
      <span className="measurement-row__label">{label}</span>
      <span className="measurement-row__value">
        {value}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          fontWeight: 400,
          color: 'var(--color-ink-faint)',
          marginLeft: 3,
        }}>
          {unit}
        </span>
      </span>
    </div>
  );
}

/**
 * MeasurementCard — wraps a list of MeasurementRows in a
 * card with the signature ruler-tick top border.
 *
 * Usage:
 *   <MeasurementCard title="Your Measurements">
 *     <MeasurementRow label="Chest" value="102.4" />
 *     <MeasurementRow label="Waist" value="88.1" isLast />
 *   </MeasurementCard>
 */
export function MeasurementCard({ title, subtitle, children, style }) {
  return (
    <div className="card card--measurement" style={{ padding: 0, ...style }}>
      {(title || subtitle) && (
        <div style={{ padding: 'var(--space-5) var(--space-5) var(--space-3)' }}>
          {title && (
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-2xl)',
              fontWeight: 600,
              letterSpacing: 'var(--tracking-tight)',
            }}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{
              margin: 'var(--space-1) 0 0',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-ink-muted)',
            }}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div className="measurement-list" style={{ padding: '0 var(--space-5) var(--space-5)' }}>
        {children}
      </div>
    </div>
  );
}
