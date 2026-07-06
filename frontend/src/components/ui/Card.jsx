/**
 * Card — Measora Design System
 *
 * Variants:
 *   default      — standard bordered card
 *   measurement  — with tailor ruler-tick top border (signature element)
 *   bento        — large padded hero card with deeper elevation
 *   raised       — elevated with shadow-md
 *   interactive  — hover lift + brass border accent
 *   error        — danger-tinted surface
 */
export function Card({
  children,
  variant = 'default',
  padding = 'var(--space-5)',
  className = '',
  style,
  as: Tag = 'div',
  ...props
}) {
  const cls = [
    'card',
    variant !== 'default' && `card--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={cls} style={{ padding, ...style }} {...props}>
      {children}
    </Tag>
  );
}
