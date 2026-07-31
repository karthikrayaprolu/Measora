import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Camera, Check, CheckCircle2, ChevronDown, Eye, LockKeyhole,
  Ruler, ScanFace, ScanLine, ShieldCheck, Sparkles, Target, WandSparkles,
} from 'lucide-react';
import heroBg from './assets/hero-bg.jpg';
import heroImg from './assets/hero.png';
import './bento-svg.css';
import './cta-cards.css';
import './privacy-visual.css';
import './testimonials.css';
import './faq-visual.css';
import './workflow-dynamic.css';
import './buttons-premium.css';
import './scrollbar-premium.css';
import { Navbar } from './components/Navbar';

const workflowSteps = [
  { label: 'Enter height', detail: 'Your height gives the measurement engine its real-world scale.', icon: Ruler, metric: '178 cm', type: 'height' },
  { label: 'Guided front photo', detail: 'Live framing cues make a consistent front capture feel effortless.', icon: Camera, metric: 'Framed', type: 'front' },
  { label: 'Guided side photo', detail: 'A second angle adds the depth and profile information that matters.', icon: ScanFace, metric: 'Aligned', type: 'side' },
  { label: 'AI landmark detection', detail: 'Thirteen visible body landmarks are mapped and ready for review.', icon: Target, metric: '13 / 13', type: 'landmarks' },
  { label: 'Measurement engine', detail: 'Spatial relationships become clear, useful measurements not a black box.', icon: Sparkles, metric: 'Ready', type: 'measure' },
  { label: 'Brand size intelligence', detail: 'Your measurements are translated against the fit profile of each brand.', icon: WandSparkles, metric: 'M', type: 'brand' },
  { label: 'Confidence score', detail: 'A transparent quality signal shows when every input is strong enough.', icon: CheckCircle2, metric: '98%', type: 'confidence' },
  { label: 'Recommended fit', detail: 'A size recommendation you can use with clarity, not crossed fingers.', icon: Check, metric: 'Just right', type: 'fit' },
];

const trustStats = [
  { value: '2 min', label: 'average time to a result' },
  { value: '13', label: 'body landmarks mapped per scan' },
  { value: '0', label: 'photos stored on our servers' },
  { value: '98%', label: 'average confidence score' },
];

const testimonials = [
  {
    quote: 'I used to order two sizes of every dress just to be safe. Since using Measora, I only order my recommended size and it fits perfectly every time.',
    name: 'Sarah Jenkins',
    detail: 'Student',
  },
  {
    quote: 'The guided photos take literally seconds. It’s so much easier than fumbling with a tape measure, and way more accurate than I expected.',
    name: 'Marcus Chen',
    detail: 'Student',
  },
  {
    quote: 'As someone whose body type doesn’t fit standard size charts, Measora taking into account different brand fits has completely changed how I shop.',
    name: 'Elena Rodriguez',
    detail: 'Student',
  },
];

const faqs = [
  {
    q: 'What happens to my photos?',
    a: 'Photos are processed to extract measurements and are not stored after your scan completes. Only the resulting numbers — your measurements and size recommendations — are saved to your account.',
  },
  {
    q: 'How accurate is the measurement engine?',
    a: 'Measora reports a confidence score with every scan so you can see when lighting, framing, or posture may have affected accuracy, rather than presenting every result as equally reliable.',
  },
  {
    q: 'Which brands are supported?',
    a: 'Measora maps your measurements against the published fit profile of each supported brand, so recommendations reflect how that brand actually cuts garments — not a generic size chart.',
  },
  {
    q: 'Is it free?',
    a: 'Taking your measurements and getting a size recommendation is free. You can rescan any time your body changes.',
  },
];


export default function LandingPage() {
  return (
    <div className="lp">
      <section aria-label="Introduction" className="lp-hero-section" style={{ backgroundImage: `url(${heroBg})` }}>
        <div className="lp-hero-section__scrim" aria-hidden="true" />
        <div className="lp-hero-section__fade" aria-hidden="true" />
        <Navbar variant="transparent" inApp={false} />
        <div className="lp-hero">
          <div className="lp-hero__content">
            <p className="lp-eyebrow lp-hero__eyebrow">
              <span className="lp-eyebrow__dot" aria-hidden="true" />
              Precision body measurement
            </p>
            <h1 className="lp-h1 lp-hero__title">
              Your tape measure,<br /><em>reimagined.</em>
            </h1>
            <p className="lp-lead lp-hero__lead">
              Two guided photos. A full set of body measurements. Size recommendations for every brand you buy from.
            </p>
            <div className="lp-hero__actions">
              <Link to="/app" className="button lp-cta-primary">
                Take your measurements <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <p className="lp-cta-sub">Free · Results in under 2 minutes · No photos stored</p>
            </div>
          </div>

          {/* <ul className="lp-trust-bar" aria-label="Measora at a glance">
            {trustStats.map((stat) => (
              <li key={stat.label} className="lp-trust-bar__item">
                <span className="lp-trust-bar__value">{stat.value}</span>
                <span className="lp-trust-bar__label">{stat.label}</span>
              </li>
            ))}
          </ul> */}
        </div>
      </section>

      <div className="lp-ruler-divider" aria-hidden="true" />

      <section className="lp-section lp-section--mid workflow-section" aria-labelledby="how-it-works-heading">
        <div className="lp-section__inner">
          <p className="lp-eyebrow lp-eyebrow--mid">Simple steps</p>
          <h2 id="how-it-works-heading" className="lp-h2">How it works</h2>
          <p className="workflow-subhead">Two photos. A height. Full measurements ready in under two minutes.</p>
          <Workflow />
        </div>
      </section>


      <div className="lp-ruler-divider" aria-hidden="true" />

      <section className="lp-section lp-privacy-section" aria-labelledby="privacy-heading">
        <div className="lp-section__inner lp-privacy">
          <div className="lp-privacy__icon" aria-hidden="true">
            <LockKeyhole size={28} strokeWidth={1.5} />
          </div>
          <div className="lp-privacy__copy">
            <p className="lp-eyebrow lp-eyebrow--mid">Privacy by design</p>
            <h2 id="privacy-heading" className="lp-h2">Your photos do the math, then they're gone.</h2>
            <p className="lp-privacy__lead">
              Each photo is processed to extract measurements the moment your scan completes. We keep the
              resulting numbers so you can reuse them   we don't keep the photos.
            </p>
            <ul className="lp-privacy__list">
              <li><Check size={16} aria-hidden="true" /> Photos are not stored after processing</li>
              <li><Check size={16} aria-hidden="true" /> Only your measurements and size results are saved</li>
              <li><Check size={16} aria-hidden="true" /> You can delete your measurement history at any time</li>
            </ul>
          </div>
          <PrivacyVisual />
        </div>
      </section>

      <div className="lp-ruler-divider" aria-hidden="true" />

      <section className="lp-section testimonial-section" aria-labelledby="testimonials-heading">
        <div className="lp-section__inner">
          <p className="lp-eyebrow lp-eyebrow--mid">From people who've used it</p>
          <h2 id="testimonials-heading" className="lp-h2">Fewer returns. More confidence at checkout.</h2>
          <div className="testimonial-grid-premium">
            {testimonials.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </div>
        </div>
      </section>

      <div className="lp-ruler-divider" aria-hidden="true" />

      <section className="lp-section faq-section" aria-labelledby="faq-heading">
        <div className="lp-section__inner lp-faq-split">
          <div className="lp-faq-split__visual" aria-hidden="true">
            <FAQVisual />
          </div>
          <div className="lp-faq-split__content">
            <p className="lp-eyebrow lp-eyebrow--mid">Good to know</p>
            <h2 id="faq-heading" className="lp-h2">Questions, answered.</h2>
            <FAQList />
          </div>
        </div>
      </section>

      <section className="lp-cta-band" aria-labelledby="cta-heading">
        <div className="lp-cta-band__inner">
          <div className="lp-ruler-strip lp-ruler-strip--light" aria-hidden="true" />
          <div className="lp-cta-band__copy">
            <p className="lp-eyebrow lp-eyebrow--inverse">Ready to measure</p>
            <h2 id="cta-heading" className="lp-h2 lp-h2--inverse">Know your size,<br />for every brand.</h2>
            <p className="lp-cta-band__sub">No measuring tape. No guesswork. No returning because the M doesn't fit.</p>
            <div className="lp-cta-band__proof" aria-label="Measurement benefits">
              <span><Check size={14} aria-hidden="true" /> Under 2 minutes</span>
              <span><ShieldCheck size={14} aria-hidden="true" /> Private by design</span>
            </div>
            <Link to="/app" className="button lp-cta-primary lp-cta-primary--inverse">
              Start measuring <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="cta-fit-note-group" aria-label="Example Measora fit recommendations">
            <aside className="cta-fit-note cta-fit-note--side cta-fit-note--left cta-fit-note--reverse" aria-label="Example Measora fit recommendation (S)">
              <div className="cta-fit-note__header"><span>Measora fit note</span><ScanLine size={16} aria-hidden="true" /></div>
              <div className="cta-fit-note__size"><small>Recommended size</small><strong>S</strong><span>Too small</span></div>
              <div className="cta-fit-note__rows">
                <span>Chest <i /><b>88 cm</b></span>
                <span>Waist <i /><b>70 cm</b></span>
                <span>Hip <i /><b>90 cm</b></span>
              </div>
              <div className="cta-fit-note__footer"><span><i /> 98% confidence</span><span>Ready</span></div>
            </aside>

            <aside className="cta-fit-note cta-fit-note--center" aria-label="Example Measora fit recommendation">
              <div className="cta-fit-note__header"><span>Measora fit note</span><ScanLine size={16} aria-hidden="true" /></div>
              <div className="cta-fit-note__size"><small>Recommended size</small><strong>M</strong><span>Just right</span></div>
              <div className="cta-fit-note__rows">
                <span>Chest <i /><b>96 cm</b></span>
                <span>Waist <i /><b>78 cm</b></span>
                <span>Hip <i /><b>98 cm</b></span>
              </div>
              <div className="cta-fit-note__footer"><span><i /> 98% confidence</span><span>Ready</span></div>
            </aside>

            <aside className="cta-fit-note cta-fit-note--side cta-fit-note--right" aria-label="Example Measora fit recommendation (L)">
              <div className="cta-fit-note__header"><span>Measora fit note</span><ScanLine size={16} aria-hidden="true" /></div>
              <div className="cta-fit-note__size"><small>Recommended size</small><strong>L</strong><span>Too large</span></div>
              <div className="cta-fit-note__rows">
                <span>Chest <i /><b>104 cm</b></span>
                <span>Waist <i /><b>86 cm</b></span>
                <span>Hip <i /><b>106 cm</b></span>
              </div>
              <div className="cta-fit-note__footer"><span><i /> 98% confidence</span><span>Ready</span></div>
            </aside>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <Link className="brand" to="/" aria-label="Measora home">
            <span className="brand-mark"><ScanLine size={15} /></span>
            <span>Measora</span>
          </Link>
          <nav className="lp-footer__links" aria-label="Footer">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Contact</Link>
          </nav>
          <p className="lp-footer__copy">
            © {new Date().getFullYear()} Measora. Measurements are estimates   always verify for critical applications.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FAQList() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <dl className="faq-list">
      {faqs.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div className="faq-item" key={item.q}>
            <dt>
              <button
                type="button"
                className="faq-item__trigger"
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                id={`faq-trigger-${i}`}
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
              >
                {item.q}
                <ChevronDown size={18} aria-hidden="true" className="faq-item__chevron" />
              </button>
            </dt>
            <dd
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-trigger-${i}`}
              className="faq-item__panel"
              hidden={!isOpen}
            >
              <p>{item.a}</p>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Workflow() {
  const [active, setActive] = useState(0);
  const [targetActive, setTargetActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible] = useState(() => workflowSteps.map((_, index) => index));
  const sectionRef = useRef(null);
  const stepRefs = useRef([]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
    if (active !== targetActive) {
      setActive(targetActive);
    }
  }, [active, targetActive]);

  return (
    <div className="workflow-split" ref={sectionRef}>
      <div className="workflow-split__visual" aria-hidden="true">
        <WorkflowDynamicVisual activeIndex={active} />
      </div>

      <div className="workflow-split__steps">
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

function WorkflowStep({ label, detail, icon: Icon, metric, index, active, visible, ...rest }) {
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
        {metric && <span className="wf-step__metric">{metric}</span>}
      </div>
    </li>
  );
}

function PrivacyVisual() {
  return (
    <div className="privacy-visual-container" aria-hidden="true">
      <div className="privacy-visual">
        <svg viewBox="0 0 160 160" className="pv-svg">
          <rect x="30" y="20" width="100" height="120" rx="8" className="pv-card" />
          <circle cx="80" cy="55" r="18" className="pv-avatar-head" />
          <path d="M45 120 C 45 85, 115 85, 115 120" className="pv-avatar-body" />
          <line x1="20" y1="20" x2="140" y2="20" className="pv-laser" />
          <g className="pv-math-dots">
            {[...Array(25)].map((_, i) => (
              <circle key={i} cx={40 + (i % 5) * 20} cy={35 + Math.floor(i / 5) * 22} r="2" />
            ))}
          </g>
          <g className="pv-secure-lock">
            <rect x="64" y="76" width="32" height="24" rx="4" />
            <path d="M72 76 V64 A8 8 0 0 1 88 64 V76" fill="none" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function TestimonialCard({ quote, name, detail }) {
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  return (
    <div
      ref={cardRef}
      className="testimonial-card-premium"
      onMouseMove={handleMouseMove}
    >
      <div className="testimonial-card-premium__inner">
        <div className="tc-quote-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
        </div>
        <blockquote>“{quote}”</blockquote>
        <figcaption>
          <div className="tc-avatar">{name.charAt(0)}</div>
          <div className="tc-meta">
            <span className="tc-name">{name}</span>
            <span className="tc-detail">{detail}</span>
          </div>
        </figcaption>
      </div>
    </div>
  );
}

function FAQVisual() {
  return (
    <div className="faq-visual-container">
      <div className="faq-visual">
        <div className="fv-q-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div className="fv-a-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <div className="fv-dots">
          <span className="fv-dot"></span>
          <span className="fv-dot"></span>
          <span className="fv-dot"></span>
        </div>
      </div>
    </div>
  );
}

function WorkflowDynamicVisual({ activeIndex }) {
  return (
    <div className="wd-visual-container">
      {/* Step 0: Height */}
      <div className="wd-layer" data-active={activeIndex === 0}>
        <div className="wd-ruler">
          <div className="wd-ruler-track">
            <div className="wd-ruler-fill" />
            <div className="wd-ruler-handle">178</div>
          </div>
        </div>
      </div>

      {/* Step 1 & 2: Photos */}
      <div className="wd-layer" data-active={activeIndex === 1 || activeIndex === 2} data-step={activeIndex}>
        <div className="wd-silhouette">
          <div className="wd-person" />
        </div>
        <div className="wd-badge" style={{ marginTop: '20px' }}>
          <Camera size={16} /> {activeIndex === 1 ? 'Front view' : 'Side profile'}
        </div>
      </div>

      {/* Step 3 & 4: Landmarks & Engine */}
      <div className="wd-layer" data-active={activeIndex === 3 || activeIndex === 4} data-step={activeIndex}>
        <div className="wd-landmarks">
          <svg viewBox="0 0 100 180">
            <path className="wd-line" d="M30 40 L70 40 L80 90 L20 90 Z" fill="none" />
            <path className="wd-line" d="M50 40 L50 140" fill="none" />
            <circle className="wd-dot" cx="50" cy="20" r="4" />
            <circle className="wd-dot" cx="30" cy="40" r="4" />
            <circle className="wd-dot" cx="70" cy="40" r="4" />
            <circle className="wd-dot" cx="20" cy="90" r="4" />
            <circle className="wd-dot" cx="80" cy="90" r="4" />
            <circle className="wd-dot" cx="40" cy="140" r="4" />
            <circle className="wd-dot" cx="60" cy="140" r="4" />
          </svg>
        </div>
        <div className="wd-badge" style={{ marginTop: '20px' }}>
          {activeIndex === 3 ? <Target size={16} /> : <Sparkles size={16} />}
          {activeIndex === 3 ? 'Mapping points' : 'Extracting geometry'}
        </div>
      </div>

      {/* Step 5: Brand Match */}
      <div className="wd-layer" data-active={activeIndex === 5}>
        <div className="wd-brand-match">
          <div className="wd-shirt-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46L16 2a8.59 8.59 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path></svg>
          </div>
          <div className="wd-brand-label">Brand Fit Data</div>
        </div>
      </div>

      {/* Step 6: Confidence */}
      <div className="wd-layer" data-active={activeIndex === 6}>
        <div className="wd-radial-progress">
          <svg viewBox="0 0 100 100">
            <circle className="wd-radial-bg" cx="50" cy="50" r="40" />
            <circle className="wd-radial-fill" cx="50" cy="50" r="40" />
          </svg>
          <span>98%</span>
        </div>
      </div>

      {/* Step 7: Recommended fit */}
      <div className="wd-layer" data-active={activeIndex === 7}>
        <div className="wd-fit-card">
          <div className="wd-fit-size">M</div>
          <div className="wd-fit-badge">Just Right</div>
        </div>
      </div>
    </div>
  );
}

