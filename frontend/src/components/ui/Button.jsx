import { Loader2 } from 'lucide-react';

/**
 * Button — Measora Design System
 *
 * Variants:
 *   primary   — navy fill  (default actions)
 *   brass     — amber fill (precision/capture context ONLY — sparingly)
 *   secondary — muted surface
 *   outline   — bordered ghost
 *   text      — inline link style
 *
 * States: default | hover | active | disabled | loading
 */
export function Button({
  children,
  variant = 'primary',
  fullWidth = false,
  isLoading = false,
  disabled = false,
  className = '',
  type = 'button',
  as: Tag,
  ...props
}) {
  const cls = [
    'button',
    `button--${variant}`,
    fullWidth && 'button--full',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (Tag) {
    return <Tag className={cls} {...props}>{children}</Tag>;
  }

  return (
    <button type={type} disabled={disabled || isLoading} className={cls} {...props}>
      {isLoading && <Loader2 aria-hidden="true" size={18} className="spin" />}
      {children}
    </button>
  );
}
