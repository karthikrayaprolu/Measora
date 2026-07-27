/**
 * Highlighter — human-drawn annotation effect using rough-notation.
 *
 * Supports: highlight | underline | circle | box | bracket |
 *           strike-through | crossed-off
 *
 * delay (ms)   → stagger multiple annotations so they draw sequentially
 * isView=true  → fires when element enters the viewport (default)
 * isView=false → fires immediately on mount (use for above-the-fold content)
 */

import { useEffect, useRef } from 'react';
import { annotate } from 'rough-notation';

export function Highlighter({
  children,
  color = '#F5E8D2',
  action = 'highlight',
  strokeWidth = 1.5,
  animationDuration = 600,
  iterations = 2,
  padding = 2,
  multiline = true,
  isView = true,
  delay = 0,          // ms before the annotation starts drawing
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const annotation = annotate(el, {
      type: action,
      color,
      strokeWidth,
      animationDuration,
      iterations,
      padding,
      multiline,
    });

    let timer;
    const show = () => {
      timer = setTimeout(() => annotation.show(), delay);
    };

    if (!isView) {
      show();
      return () => { clearTimeout(timer); annotation.remove(); };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          show();
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      annotation.remove();
    };
  }, [action, color, strokeWidth, animationDuration, iterations, padding, multiline, isView, delay]);

  return (
    <span ref={ref} style={{ display: 'inline' }}>
      {children}
    </span>
  );
}
