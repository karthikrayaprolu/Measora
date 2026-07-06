import { useNavigate } from 'react-router-dom';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { useProducts } from '../api/hooks';
import { Button } from '../components/ui/Button';

/* ── Custom SVG motifs — measurement-line based, not stock icons ────── */

function ShirtMotif() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Shirt silhouette with measurement lines */}
      <path d="M10 3 L6 7 L2 6 L2 22 L26 22 L26 6 L22 7 L18 3" />
      <path d="M10 3 Q14 6 18 3" />
      {/* Shoulder measurement tick */}
      <line x1="6" y1="9" x2="6" y2="11" strokeWidth="1" opacity="0.6"/>
      <line x1="22" y1="9" x2="22" y2="11" strokeWidth="1" opacity="0.6"/>
      <line x1="6" y1="10" x2="22" y2="10" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5"/>
    </svg>
  );
}

function PantsMotif() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Trousers silhouette */}
      <path d="M5 3 L23 3 L23 9 L19 9 L16 25 L14 25 L12 9 L9 9 L5 9 Z" />
      {/* Inseam measurement tick */}
      <line x1="9.5" y1="9" x2="9.5" y2="25" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5"/>
      <line x1="8" y1="25" x2="11" y2="25" strokeWidth="1" opacity="0.6"/>
    </svg>
  );
}

function FootwearMotif() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Shoe silhouette */}
      <path d="M4 18 Q4 14 8 12 L14 10 L18 10 Q22 10 23 14 L24 18 Q20 22 4 20 Z" />
      {/* Length tick marks */}
      <line x1="4" y1="21" x2="24" y2="21" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5"/>
      <line x1="4" y1="19.5" x2="4" y2="22.5" strokeWidth="1" opacity="0.6"/>
      <line x1="24" y1="19.5" x2="24" y2="22.5" strokeWidth="1" opacity="0.6"/>
    </svg>
  );
}

const CATEGORIES = [
  {
    id: 'shirt',
    label: 'Shirts & tops',
    measures: 'Chest · Shoulders · Sleeves · Torso',
    Motif: ShirtMotif,
    soon: false,
  },
  {
    id: 'pant',
    label: 'Trousers & jeans',
    measures: 'Waist · Hips · Inseam · Rise',
    Motif: PantsMotif,
    soon: false,
  },
  {
    id: 'footwear',
    label: 'Footwear',
    measures: 'Shoe sizing · Foot length · Width',
    Motif: FootwearMotif,
    soon: true,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoading, isError, refetch, isFetching } = useProducts();

  const handleSelect = (id, soon) => {
    if (soon) return; // graceful no-op; card is still visible
    navigate(`/app/session/new/${id}`);
  };

  return (
    <main className="app-main app-main--narrow">
      <header className="page-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <p className="page-eyebrow">New fitting</p>
        <h1 className="page-title">What are we<br />measuring?</h1>
        <p className="page-copy">Choose a category to start. We'll guide you through two quick photos.</p>
      </header>

      {isLoading && <CategorySkeleton />}

      {isError && (
        <div className="empty-state card" role="alert">
          <span className="empty-state__icon"><AlertCircle aria-hidden="true" /></span>
          <h2 className="section-title">Couldn't load categories</h2>
          <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>Check your connection and try again.</p>
          <Button onClick={() => refetch()} isLoading={isFetching} variant="outline">
            <RefreshCw size={16} aria-hidden="true" /> Try again
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="category-grid" role="list">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              role="listitem"
              className={[
                'category-card',
                cat.id === 'footwear' ? 'category-card--full' : '',
                cat.soon ? 'category-card--soon' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleSelect(cat.id, cat.soon)}
              aria-disabled={cat.soon}
              aria-label={cat.soon ? `${cat.label} — coming soon` : `Measure ${cat.label}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <span className="category-card__icon">
                  <cat.Motif />
                </span>
                {cat.soon && (
                  <span className="coming-soon-badge" aria-label="In progress">
                    Coming soon
                  </span>
                )}
              </div>

              <div>
                <h2 className="category-card__name">{cat.label}</h2>
                <p className="category-card__measures">{cat.measures}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function CategorySkeleton() {
  return (
    <div className="category-grid" aria-label="Loading measurement categories">
      <div className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
      <div className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
      <div className="skeleton category-card--full" style={{ height: 110, borderRadius: 'var(--radius-lg)' }} />
    </div>
  );
}
