import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, CheckCircle2, ScanLine, Ruler } from 'lucide-react';

/* ════════════════════════════════════════════════════════════════════
   Measora Landing Page — Phase 4 Hero Redesign (bug-fix pass)

   Fixes in this pass (see landing.css for the actual rule changes):
   1. Navbar: "Sign in" and "Start free" now share one base button class
      (.lp-nav-btn) with modifiers, so height/padding/radius match exactly.
   2. CTA buttons: unified padding formula via .button so "Take your
      measurements" and "Start measuring" no longer size inconsistently.
   3. Hero visual: measurement chips moved into a dedicated
      .lp-hero__chips column so they can never overlap the panel edge.
      On mobile they drop below the image as a simple legend row instead
      of floating over it.
   ════════════════════════════════════════════════════════════════════ */

import { useAuth } from './contexts/AuthContext';

function useAnimatedCounter(endValue, duration = 1500, decimals = 0) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const prefs = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (prefs.matches) {
      setValue(endValue);
      return;
    }

    let startTime = null;
    let animationFrame;

    const animate = (time) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      setValue(endValue * easeProgress);
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [endValue, duration]);

  return value.toFixed(decimals);
}

export default function LandingPage() {
  const { user } = useAuth();
  const animatedPoints = useAnimatedCounter(13, 1500, 0);
  const animatedAccuracy = useAnimatedCounter(1, 1500, 0);
  const animatedPhotos = useAnimatedCounter(2, 1500, 0);

  return (
    <div className="lp">

      {/* ── FULL-SCREEN HERO & NAV ─────────────────────────────────────── */}
      <section
        aria-label="Introduction"
        style={{
          position: 'relative',
          width: '100vw',
          maxWidth: '100vw',
          minHeight: '100vh',
          marginLeft: 'calc(-50vw + 50%)',
          marginRight: 'calc(-50vw + 50%)',
          display: 'flex',
          flexDirection: 'column',
          backgroundImage: "url('/src/assets/hero-bg.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Overlay: Subtle white wash (no blur) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.4)',
            zIndex: 0
          }}
          aria-hidden="true"
        />

        {/* Subtle fade at the bottom to transition smoothly to the next section */}
        <div
          style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            height: '120px',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, var(--lp-bg, #ffffff) 100%)',
            zIndex: 0
          }}
          aria-hidden="true"
        />

        {/* ── NAV (Transparent over image) ──────────────────────────────── */}
        <nav className="lp-nav" aria-label="Public navigation" style={{ position: 'relative', zIndex: 10, background: 'transparent', borderBottom: 'none' }}>
          <Link className="brand" to="/">
            <span className="brand-mark"><ScanLine size={18} /></span>
            <span style={{ color: 'var(--color-ink)' }}>Measora</span>
          </Link>
          <div className="lp-nav-btns">
            {user ? (
              <Link to="/app" className="lp-nav-btn lp-nav-btn--filled">
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-nav-btn lp-nav-btn--ghost" style={{ color: 'var(--color-ink)' }}>
                  Sign in
                </Link>
                <Link to="/login" className="lp-nav-btn lp-nav-btn--filled">
                  Start free
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* ── HERO CONTENT ─────────────────────────────────────────────── */}
        <div
          className="lp-hero"
          style={{
            position: 'relative',
            zIndex: 10,
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between', /* Pushes stats to bottom */
            alignItems: 'center',
            textAlign: 'center',
            padding: 'var(--space-6) var(--space-4)',
            maxWidth: 'none',
            margin: 0
          }}
        >
          {/* Centered Main Content */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', margin: 'auto 0' }}>
            <p className="lp-eyebrow" style={{ justifyContent: 'center', color: 'var(--color-ink)' }}>
              <span className="lp-eyebrow__dot" aria-hidden="true" style={{ backgroundColor: 'var(--color-brass)' }} />
              Precision body measurement
            </p>

            <h1 className="lp-h1" style={{ fontSize: 'clamp(3rem, 7vw, 5rem)', lineHeight: 1.05, margin: 0, color: '#1a1a1a' }}>
              Your tape&nbsp;measure,<br />
              <em>reimagined.</em>
            </h1>

            <p className="lp-lead" style={{ maxWidth: '600px', margin: '0 auto', fontSize: 'var(--text-lg)', color: '#2a2a2a' }}>
              Two guided photos. A full set of body measurements.
              Size recommendations for every brand you buy from.
            </p>

            <div className="lp-hero__actions" style={{ justifyContent: 'center', marginTop: 'var(--space-2)' }}>
              <Link to="/app" className="button lp-cta-primary">
                Take your measurements
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <p className="lp-cta-sub" style={{ marginTop: 'var(--space-3)', color: '#2a2a2a', fontWeight: 500 }}>
                Free · No account required · Results in under 2 minutes
              </p>
            </div>
          </div>

          {/* Stat row (anchored to bottom) */}
          {/* <div className="lp-stats" style={{ width: '100%', maxWidth: '900px', justifyContent: 'space-between', padding: '0 var(--space-4)', marginTop: 'var(--space-8)' }}>
            <div className="lp-stat" style={{ alignItems: 'center', gap: '0.25rem' }}>
              <span className="lp-stat__value" style={{ fontSize: '3rem', color: '#1a1a1a' }}>{animatedPoints}</span>
              <span className="lp-stat__label" style={{ textAlign: 'center', fontSize: 'var(--text-base)', color: '#2a2a2a' }}>Body points detected</span>
            </div>
            <div className="lp-stat" style={{ alignItems: 'center', gap: '0.25rem' }}>
              <span className="lp-stat__value" style={{ fontSize: '3rem', color: '#1a1a1a' }}>±{animatedAccuracy}<span style={{ fontSize: '0.5em', fontWeight: 500 }}>cm</span></span>
              <span className="lp-stat__label" style={{ textAlign: 'center', fontSize: 'var(--text-base)', color: '#2a2a2a' }}>Measurement accuracy</span>
            </div>
            <div className="lp-stat" style={{ alignItems: 'center', gap: '0.25rem' }}>
              <span className="lp-stat__value" style={{ fontSize: '3rem', color: '#1a1a1a' }}>{animatedPhotos}</span>
              <span className="lp-stat__label" style={{ textAlign: 'center', fontSize: 'var(--text-base)', color: '#2a2a2a' }}>Photos, that's it</span>
            </div>
          </div> */}
        </div>
      </section>

      {/* ── RULER DIVIDER ─────────────────────────────────────────────── */}
      <div className="lp-ruler-divider" aria-hidden="true" />

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="lp-section lp-section--mid" aria-labelledby="how-it-works-heading">
        <div className="lp-section__inner">
          <p className="lp-eyebrow lp-eyebrow--mid">How it works</p>
          <h2 id="how-it-works-heading" className="lp-h2">
            From camera to confident choice
          </h2>
          <div className="lp-steps">
            <Step
              number="01"
              title="Set your baseline"
              body="Enter your height and choose a fit preference. That's the only data we need before the camera."
            />
            <Step
              number="02"
              title="Two guided photos"
              body="Front-facing, then side profile. Corner alignment marks show you exactly where to stand."
            />
            <Step
              number="03"
              title="Review the points"
              body="The AI detects 13 body landmarks. You confirm them — or use the precision drag-pad to correct any that are off."
            />
            <Step
              number="04"
              title="Shop with confidence"
              body="Translate your measurements into brand-specific sizing for shirts, trousers, and more."
            />
          </div>
        </div>
      </section>

      {/* ── RULER DIVIDER ─────────────────────────────────────────────── */}
      <div className="lp-ruler-divider" aria-hidden="true" />

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <section className="lp-section" aria-labelledby="features-heading">
        <div className="lp-section__inner">
          <p className="lp-eyebrow lp-eyebrow--mid">Built different</p>
          <h2 id="features-heading" className="lp-h2">
            Precision where it matters
          </h2>
          <div className="lp-features">
            <Feature
              icon={Camera}
              title="Pose guidance, not guesswork"
              body="Corner tick marks, a silhouette overlay, and real-time framing feedback guide the photo without needing a tripod."
            />
            <Feature
              icon={Ruler}
              title="Measurement-first design"
              body="Every number is traced back to specific body landmark positions, not an algorithm black box. You can see and correct every point."
            />
            <Feature
              icon={CheckCircle2}
              title="Brand-aware sizing"
              body="Body measurements vary by brand. Measora translates your centimetres into the right size for each brand's cut table."
            />
          </div>
        </div>
      </section>

      {/* ── CTA BAND ──────────────────────────────────────────────────── */}
      <section className="lp-cta-band" aria-labelledby="cta-heading">
        <div className="lp-cta-band__inner">
          {/* Ruler ticks across the top of the band */}
          <div className="lp-ruler-strip lp-ruler-strip--light" aria-hidden="true" />
          <p className="lp-eyebrow lp-eyebrow--inverse">Ready to measure</p>
          <h2 id="cta-heading" className="lp-h2 lp-h2--inverse">
            Know your size,<br />for every brand.
          </h2>
          <p className="lp-cta-band__sub">
            No measuring tape. No guesswork. No returning because the M doesn't fit.
          </p>
          <Link to="/app" className="button lp-cta-primary lp-cta-primary--inverse">
            Start measuring <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <Link className="brand" to="/" aria-label="Measora home">
            <span className="brand-mark" style={{ width: 28, height: 28 }}><ScanLine size={14} /></span>
            <span style={{ fontSize: 'var(--text-sm)' }}>Measora</span>
          </Link>
          <p className="lp-footer__copy">
            © {new Date().getFullYear()} Measora. Measurements are estimates — always verify for critical applications.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */
function Step({ number, title, body }) {
  return (
    <article className="lp-step">
      <span className="lp-step__number" aria-hidden="true">{number}</span>
      <h3 className="lp-step__title">{title}</h3>
      <p className="lp-step__body">{body}</p>
    </article>
  );
}

function Feature({ icon: Icon, title, body }) {
  return (
    <article className="lp-feature">
      <span className="lp-feature__icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <h3 className="lp-feature__title">{title}</h3>
      <p className="lp-feature__body">{body}</p>
    </article>
  );
}
