import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Check, CheckCircle2, ChevronRight, Eye, LockKeyhole, Ruler, ScanFace, ScanLine, ShieldCheck, Sparkles, Target, WandSparkles } from 'lucide-react';
import heroBg from './assets/hero-bg.jpg';
import heroImg from './assets/hero.png';
import { Navbar } from './components/Navbar';

const workflowSteps = [
  { label: 'Enter height', detail: 'Your height gives the measurement engine its real-world scale.', icon: Ruler, metric: '178 cm', type: 'height' },
  { label: 'Guided front photo', detail: 'Live framing cues make a consistent front capture feel effortless.', icon: Camera, metric: 'Framed', type: 'front' },
  { label: 'Guided side photo', detail: 'A second angle adds the depth and profile information that matters.', icon: ScanFace, metric: 'Aligned', type: 'side' },
  { label: 'AI landmark detection', detail: 'Thirteen visible body landmarks are mapped and ready for review.', icon: Target, metric: '13 / 13', type: 'landmarks' },
  { label: 'Measurement engine', detail: 'Spatial relationships become clear, useful measurements—not a black box.', icon: Sparkles, metric: 'Ready', type: 'measure' },
  { label: 'Brand size intelligence', detail: 'Your measurements are translated against the fit profile of each brand.', icon: WandSparkles, metric: 'M', type: 'brand' },
  { label: 'Confidence score', detail: 'A transparent quality signal shows when every input is strong enough.', icon: CheckCircle2, metric: '98%', type: 'confidence' },
  { label: 'Recommended fit', detail: 'A size recommendation you can use with clarity, not crossed fingers.', icon: Check, metric: 'Just right', type: 'fit' },
];

/* ── Bento card visual headers (CSS-animated, no framer-motion) ─── */

function BentoVisualCapture() {
  return (
    <div className="bento-visual bento-visual--capture">
      <span className="capture-corner capture-corner--tl" />
      <span className="capture-corner capture-corner--tr" />
      <span className="capture-corner capture-corner--bl" />
      <span className="capture-corner capture-corner--br" />
      <span className="capture-person"><i /><b /></span>
      <span className="capture-status"><i /> Framing looks good</span>
    </div>
  );
}

function BentoVisualLandmarks() {
  return (
    <div className="bento-visual bento-visual--landmarks">
      <div className="landmark-figure" aria-hidden="true">
        <span className="landmark-head" />
        <span className="landmark-body" />
        {[['shoulders', 'L shoulder'], ['chest', 'Chest'], ['waist', 'Waist'], ['hips', 'Hips'], ['knees', 'Knees']].map(([name, label]) => <span className={`landmark-point landmark-point--${name}`} key={name} title={label} />)}
      </div>
      <span className="landmark-note">13 points mapped</span>
    </div>
  );
}

function BentoVisualGradient() {
  return (
    <div className="bento-visual bento-visual--measurements">
      {[['Chest', '96 cm'], ['Waist', '78 cm'], ['Hip', '98 cm']].map(([label, value]) => (
        <div className="measure-preview-row" key={label}><span>{label}</span><i /><strong>{value}</strong></div>
      ))}
    </div>
  );
}

function BentoVisualSizing() {
  return (
    <div className="bento-visual bento-visual--sizing">
      <div className="bento-size-panel bento-size-panel--left">
        <span className="bento-size-label">XS</span>
        <span className="bento-size-tag bento-size-tag--muted">Too small</span>
      </div>
      <div className="bento-size-panel bento-size-panel--center">
        <span className="bento-size-label">M</span>
        <span className="bento-size-tag bento-size-tag--match">Perfect fit</span>
      </div>
      <div className="bento-size-panel bento-size-panel--right">
        <span className="bento-size-label">XL</span>
        <span className="bento-size-tag bento-size-tag--muted">Too large</span>
      </div>
    </div>
  );
}

function BentoVisualConfidence() {
  return (
    <div className="bento-visual bento-visual--confidence">
      <div className="bento-score-ring">
        <span className="bento-score-num">98</span>
        <small className="bento-score-label">confidence</small>
      </div>
    </div>
  );
}

const bentoItems = [
  {
    title: 'Guided camera capture',
    description: 'Subtle framing feedback removes the awkwardness from getting a useful photo.',
    note: 'Live posture cues',
    icon: Camera,
    visual: <BentoVisualCapture />,
    span: 'bento-item--tall',   /* col-span-1 row-span-2 */
    dark: true,
  },
  {
    title: 'Landmark validation',
    description: 'Every key point stays visible so you are always part of the measurement.',
    note: '13 visible points',
    icon: Target,
    visual: <BentoVisualLandmarks />,
    span: 'bento-item--wide',   /* col-span-2 */
    dark: false,
  },
  {
    title: 'Measurement transparency',
    description: 'Clear visual relationships make each number easy to understand and trust.',
    note: 'Traceable inputs',
    icon: Eye,
    visual: <BentoVisualGradient />,
    span: '',
    dark: false,
  },
  {
    title: 'Brand-aware sizing',
    description: 'A medium is not universal. We read the fit language each brand actually uses.',
    note: 'Fit-profile aware',
    icon: WandSparkles,
    visual: <BentoVisualSizing />,
    span: 'bento-item--wide',   /* col-span-2 */
    dark: false,
  },
  {
    title: 'Confidence scoring',
    description: 'One calm signal tells you when your scan is ready for a recommendation.',
    note: '98% confidence',
    icon: ShieldCheck,
    visual: <BentoVisualConfidence />,
    span: '',
    dark: true,
  },
];

export default function LandingPage() {
  return <div className="lp">
    <section aria-label="Introduction" style={{ position: 'relative', width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: `url(${heroBg})`, backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'var(--color-canvas)', opacity: 0.3, zIndex: 0 }} aria-hidden="true" />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px', background: 'linear-gradient(to bottom, transparent 0%, var(--color-canvas) 100%)', zIndex: 0 }} aria-hidden="true" />
      <Navbar variant="transparent" inApp={false} />
      <div className="lp-hero" style={{ position: 'relative', zIndex: 10, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center', padding: 'var(--space-6) var(--space-4)', maxWidth: 'none', margin: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', margin: 'auto 0' }}>
          <p className="lp-eyebrow" style={{ justifyContent: 'center', color: 'var(--color-ink)' }}><span className="lp-eyebrow__dot" aria-hidden="true" style={{ backgroundColor: 'var(--color-brass)' }} />Precision body measurement</p>
          <h1 className="lp-h1" style={{ fontSize: 'clamp(3rem, 7vw, 5rem)', lineHeight: 1.05, margin: 0, color: 'var(--color-ink)' }}>Your tape measure,<br /><em>reimagined.</em></h1>
          <p className="lp-lead" style={{ maxWidth: '600px', margin: '0 auto', fontSize: 'var(--text-lg)', color: 'var(--color-ink-muted)' }}>Two guided photos. A full set of body measurements. Size recommendations for every brand you buy from.</p>
          <div className="lp-hero__actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'var(--space-2)' }}><Link to="/app" className="button lp-cta-primary">Take your measurements <ArrowRight size={18} aria-hidden="true" /></Link><p className="lp-cta-sub" style={{ marginTop: 'var(--space-3)', color: 'var(--color-ink-muted)', fontWeight: 500 }}>Free · Results in under 2 minutes</p></div>
        </div>
      </div>
    </section>
    <div className="lp-ruler-divider" aria-hidden="true" />
    <section className="lp-section lp-section--mid workflow-section" aria-labelledby="how-it-works-heading"><div className="lp-section__inner"><p className="lp-eyebrow lp-eyebrow--mid">Simple steps</p><h2 id="how-it-works-heading" className="lp-h2">How it works</h2><p className="workflow-subhead">Two photos. A height. Full measurements—ready in under two minutes.</p><Workflow /></div></section>
    <div className="lp-ruler-divider" aria-hidden="true" />
    <section className="lp-section capabilities-section" aria-labelledby="features-heading"><div className="lp-section__inner"><p className="lp-eyebrow lp-eyebrow--mid">Built different</p><h2 id="features-heading" className="lp-h2"><span>A measurement experience</span><br /><span>designed to show its work.</span></h2><p className="capabilities-subhead">Clear cues and traceable inputs make every recommendation easier to trust.</p><BentoCapabilities /></div></section>
    <section className="lp-cta-band" aria-labelledby="cta-heading">
      <div className="lp-cta-band__inner">
        <div className="lp-ruler-strip lp-ruler-strip--light" aria-hidden="true" />
        <div className="lp-cta-band__copy">
          <p className="lp-eyebrow lp-eyebrow--inverse">Ready to measure</p>
          <h2 id="cta-heading" className="lp-h2 lp-h2--inverse">Know your size,<br />for every brand.</h2>
          <p className="lp-cta-band__sub">No measuring tape. No guesswork. No returning because the M doesn't fit.</p>
          <div className="lp-cta-band__proof" aria-label="Measurement benefits"><span><Check size={14} aria-hidden="true" /> Under 2 minutes</span><span><ShieldCheck size={14} aria-hidden="true" /> Private by design</span></div>
          <Link to="/app" className="button lp-cta-primary lp-cta-primary--inverse">Start measuring <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <aside className="cta-fit-note" aria-label="Example Measora fit recommendation">
          <div className="cta-fit-note__header"><span>Measora fit note</span><ScanLine size={16} aria-hidden="true" /></div>
          <div className="cta-fit-note__size"><small>Recommended size</small><strong>M</strong><span>Just right</span></div>
          <div className="cta-fit-note__rows"><span>Chest <i /><b>96 cm</b></span><span>Waist <i /><b>78 cm</b></span><span>Hip <i /><b>98 cm</b></span></div>
          <div className="cta-fit-note__footer"><span><i /> 98% confidence</span><span>Ready</span></div>
        </aside>
      </div>
    </section>
    <footer className="lp-footer"><div className="lp-footer__inner"><Link className="brand" to="/" aria-label="Measora home"><span className="brand-mark" style={{ width: 30, height: 30 }}><ScanLine size={15} /></span><span>Measora</span></Link><p className="lp-footer__copy">© {new Date().getFullYear()} Measora. Measurements are estimates — always verify for critical applications.</p></div></footer>
  </div>;
}

function Workflow() {
  const [active, setActive] = useState(0);
  const [targetActive, setTargetActive] = useState(0);
  // Content must never depend on a scroll observer to become readable.
  // The observer only enhances the active progress state below.
  const [visible] = useState(() => workflowSteps.map((_, index) => index));
  const sectionRef = useRef(null);
  const stepRefs = useRef([]);

  useEffect(() => {
    let frame;
    const updateTargetStep = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const readingLine = window.innerHeight * 0.5;
        let nearestIndex = 0;
        let nearestDistance = Infinity;

        stepRefs.current.forEach((element, index) => {
          if (!element) return;
          const rect = element.getBoundingClientRect();
          const stepReadingPoint = rect.top + (rect.height * 0.42);
          const distance = Math.abs(stepReadingPoint - readingLine);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });

        setTargetActive(nearestIndex);
      });
    };

    updateTargetStep();
    window.addEventListener('scroll', updateTargetStep, { passive: true });
    window.addEventListener('resize', updateTargetStep);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateTargetStep);
      window.removeEventListener('resize', updateTargetStep);
    };
  }, []);

  useEffect(() => {
    if (active === targetActive) return undefined;
    // If a user scrolls quickly, animate through each intermediate status
    // rather than visually skipping any step in the progress indicator.
    const timer = window.setTimeout(() => {
      setActive((current) => current + (targetActive > current ? 1 : -1));
    }, 130);
    return () => window.clearTimeout(timer);
  }, [active, targetActive]);

  return (
    <div className="workflow-split" ref={sectionRef}>
      {/* ── Left panel: sticky image ── */}
      <div className="workflow-split__visual" aria-hidden="true">
        <div className="workflow-img-frame">
          <img src={heroImg} alt="" className="workflow-img" />
          {/* floating UI bubble */}
          <div className="workflow-bubble">
            <span className="workflow-bubble__dot" />
            <span className="workflow-bubble__label">Take your measurements</span>
          </div>
          {/* floating scan preview card */}
          <div className="workflow-preview-card">
            <span className="workflow-preview-card__title">Measora Scan</span>
            <div className="workflow-preview-card__rows">
              {['Chest', 'Waist', 'Hip'].map((m) => (
                <div key={m} className="workflow-preview-card__row">
                  <span className="workflow-preview-card__key">{m}</span>
                  <span className="workflow-preview-card__bar" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: scrollable steps ── */}
      <div className="workflow-split__steps">
        {/* <div className="workflow-status" aria-label={`Workflow progress: step ${active + 1} of ${workflowSteps.length}`} role="progressbar" aria-valuemin="1" aria-valuemax={workflowSteps.length} aria-valuenow={active + 1}>
          <span className="workflow-status__current">{String(active + 1).padStart(2, '0')}</span>
          <span className="workflow-status__track" aria-hidden="true"><span style={{ height: `${((active + 1) / workflowSteps.length) * 100}%` }} /></span>
          <span className="workflow-status__total">{String(workflowSteps.length).padStart(2, '0')}</span>
          <span className="workflow-status__label">In progress</span>
        </div> */}
        <div className="workflow-split__rail" aria-hidden="true">
          <span
            className="workflow-split__rail-fill"
            style={{ height: `${((active + 1) / workflowSteps.length) * 100}%` }}
          />
        </div>
        <ol className="workflow-split__list" aria-label="Measora measurement workflow">
          {workflowSteps.map((step, i) => (
            <WorkflowStep
              key={step.label}
              {...step}
              index={i}
              active={i === active}
              visible={visible.includes(i)}
              ref={(el) => (stepRefs.current[i] = el)}
              data-idx={i}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function WorkflowStep({ label, detail, icon: Icon, metric, type, index, active, visible, ...rest }) {
  return (
    <li
      className={`wf-step ${active ? 'is-active' : ''} ${visible ? 'is-visible' : ''}`}
      data-idx={index}
      ref={rest.ref}
    >
      <span className="wf-step__icon" aria-hidden="true">
        <Icon size={20} strokeWidth={1.6} />
      </span>
      <div className="wf-step__body">
        <p className="wf-step__num">Step {String(index + 1).padStart(2, '0')}</p>
        <h3 className="wf-step__label">{label}</h3>
        <p className="wf-step__detail">{detail}</p>
        {metric && (
          <span className="wf-step__metric">{metric}</span>
        )}
      </div>
    </li>
  );
}


function BentoCapabilities() {
  return (
    <div className="bento-grid" aria-label="Measora capabilities">
      {bentoItems.map(({ title, description, note, icon: Icon, visual, span, dark }, i) => (
        <article
          key={title}
          className={`bento-item ${span ?? ''} ${dark ? 'bento-item--dark' : ''}`}
        >
          <div className="bento-item__visual" aria-hidden="true">
            {visual}
          </div>
          <div className="bento-item__body">
            <div className="bento-item__top">
              <span className="bento-item__icon" aria-hidden="true">
                <Icon size={18} strokeWidth={1.65} />
              </span>
              <span className="bento-item__num">0{i + 1}</span>
            </div>
            <p className="bento-item__note">{note}</p>
            <h3 className="bento-item__title">{title}</h3>
            <p className="bento-item__desc">{description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
