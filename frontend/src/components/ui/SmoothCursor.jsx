/**
 * SmoothCursor   exponential lerp cursor. Zero bounce, zero oscillation.
 *
 * Why lerp instead of spring?
 *   Spring physics (stiffness + velocity carry-over) can overshoot the target
 *   and oscillate, especially after fast direction changes. A lerp approaches
 *   the target asymptotically and is mathematically guaranteed never to cross
 *   it   so there is no shake or bounce, ever.
 *
 * Feel tuning:
 *   CURSOR_LERP  0.17  → snappy but still has weight
 *   TRAIL_LERP   0.09  → visibly lags behind, feels physical
 *
 * All animation writes go directly to DOM refs   zero React re-renders
 * in the hot path for buttery 60/120fps performance.
 */

import { useCallback, useEffect, useRef } from 'react';

const CURSOR_LERP = 0.17;   // 0→1: higher = tighter follow
const TRAIL_LERP = 0.09;   // trail lags further behind
const SPEED_SCALE = 0.014;  // px/frame → stretch amount
const MAX_STRETCH = 1.7;    // max y-scale elongation
const IDLE_MS = 150;    // ms quiet → snap stretch back to 1

export function SmoothCursor() {
  const wrapRef = useRef(null);
  const dotRef = useRef(null);
  const trailRef = useRef(null);

  const animate = useCallback(() => {
    const state = {
      cx: -200, cy: -200,   // cursor current position
      tx: -200, ty: -200,   // trail current position
      mx: -200, my: -200,   // live mouse target
      angle: -90,
      lastMoveAt: 0,
      visible: false,
      raf: null,
    };

    const wrap = wrapRef.current;
    const dot = dotRef.current;
    const trail = trailRef.current;
    if (!wrap || !dot || !trail) return;

    const loop = () => {
      /* ── Cursor: lerp toward mouse ── */
      state.cx += (state.mx - state.cx) * CURSOR_LERP;
      state.cy += (state.my - state.cy) * CURSOR_LERP;

      /* ── Trail: lerp toward cursor ── */
      state.tx += (state.cx - state.tx) * TRAIL_LERP;
      state.ty += (state.cy - state.ty) * TRAIL_LERP;

      /* ── Speed = distance cursor moved this frame ── */
      const dx = state.cx - state.tx;
      const dy = state.cy - state.ty;
      const speed = Math.sqrt(dx * dx + dy * dy);

      /* ── Angle follows direction of travel ── */
      if (speed > 0.4) {
        state.angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      }

      /* ── Stretch: elongate on speed, relax when idle ── */
      const idle = performance.now() - state.lastMoveAt > IDLE_MS;
      const stretch = idle ? 1 : Math.min(MAX_STRETCH, 1 + speed * SPEED_SCALE);

      /* ── Write to DOM   no React state ── */
      dot.style.transform = [
        `translate3d(${state.cx}px, ${state.cy}px, 0)`,
        `rotate(${state.angle}deg)`,
        `scaleY(${stretch})`,
      ].join(' ');

      trail.style.transform = `translate3d(${state.tx}px, ${state.ty}px, 0)`;
      trail.style.opacity = String(Math.min(0.45, speed * 0.06));

      state.raf = requestAnimationFrame(loop);
    };

    const onMove = (e) => {
      state.mx = e.clientX;
      state.my = e.clientY;
      state.lastMoveAt = performance.now();
      if (!state.visible) {
        state.visible = true;
        wrap.style.opacity = '1';
      }
    };

    const onLeave = () => {
      state.visible = false;
      wrap.style.opacity = '0';
    };

    const onEnter = () => {
      if (state.mx > -100) {
        state.visible = true;
        wrap.style.opacity = '1';
      }
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    state.raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      if (state.raf) cancelAnimationFrame(state.raf);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;

    document.documentElement.style.cursor = 'none';
    const cleanup = animate();

    return () => {
      document.documentElement.style.cursor = '';
      cleanup?.();
    };
  }, [animate]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{ opacity: 0, transition: 'opacity 0.2s ease', pointerEvents: 'none' }}
    >
      {/* Trailing dot */}
      <div
        ref={trailRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 10,
          height: 10,
          marginLeft: -5,
          marginTop: -5,
          borderRadius: '50%',
          background: 'var(--color-brass)',
          opacity: 0,
          zIndex: 99998,
          willChange: 'transform, opacity',
        }}
      />

      {/* Main cursor */}
      <div
        ref={dotRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 20,
          height: 20,
          marginLeft: -10,
          marginTop: -10,
          zIndex: 99999,
          willChange: 'transform',
        }}
      >
        {/* Ring */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '1.5px solid var(--color-brass)',
          opacity: 0.7,
        }} />
        {/* Centre dot */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--color-brass)',
          boxShadow: '0 0 8px 2px rgba(184,124,54,0.55)',
        }} />
      </div>
    </div>
  );
}
