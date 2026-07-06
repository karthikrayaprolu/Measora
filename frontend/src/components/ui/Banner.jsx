import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

const CONFIG = {
  info:    { Icon: Info,          label: 'Info' },
  success: { Icon: CheckCircle2, label: 'Success' },
  warning: { Icon: AlertTriangle, label: 'Warning' },
  error:   { Icon: AlertCircle,  label: 'Error' },
};

/**
 * Banner — Measora Design System
 * Inline status / alert strip with left-accent border.
 *
 * Variants: info | success | warning | error
 * All use semantic colors from the token system.
 */
export function Banner({ type = 'info', message, title, className = '', style }) {
  const { Icon, label } = CONFIG[type] || CONFIG.info;

  return (
    <div
      className={`banner banner--${type} ${className}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-label={label}
      style={style}
    >
      <Icon aria-hidden="true" size={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        {title && <h3 className="banner__title">{title}</h3>}
        <p className="banner__message">{message}</p>
      </div>
    </div>
  );
}
