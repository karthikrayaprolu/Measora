import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, RefreshCw, Ruler } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBrands, useResult, useSession, useSizeRecommendation } from '../api/hooks';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export default function ResultPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data: session } = useSession(sessionId);
  const { data: result, isLoading, isError, refetch, isFetching } = useResult(sessionId);
  const productType = session?.product_type || 'shirt';
  const { data: brandsData, isLoading: brandsLoading } = useBrands(productType);
  const recommendationMutation = useSizeRecommendation();
  const [brand, setBrand] = useState('');
  const [expanded, setExpanded] = useState(false);

  const processing = ['queued', 'processing', 'fast_processing', 'accurate_processing'].includes(session?.status);

  if (isLoading || processing) {
    return <ResultLoading sessionId={sessionId} onBack={() => navigate('/app')} />;
  }

  if (isError) {
    return (
      <div className="flow-page"><main className="flow-content">
        <div className="empty-state card">
          <span className="empty-state__icon"><Ruler /></span>
          <h1 className="section-title">Results aren’t ready yet</h1>
          <p className="muted">Processing may still be finishing. Try again in a moment.</p>
          <Button onClick={() => refetch()} isLoading={isFetching}><RefreshCw size={18} />Check again</Button>
        </div>
      </main></div>
    );
  }

  const recommendation = recommendationMutation.data;
  const confidence = recommendation?.confidence;

  return (
    <div className="flow-page">
      <header className="flow-header"><div className="flow-header__row">
        <button className="icon-button" onClick={() => navigate('/app')} aria-label="Back to measurements"><ArrowLeft /></button>
        <h1 className="flow-header__title">Your fit</h1><span />
      </div></header>
      <main className="flow-content" style={{ gap: 20 }}>
        <div>
          <p className="page-eyebrow">Scan complete</p>
          <h2 className="page-title">Your measurements are ready</h2>
          <p className="page-copy">Choose a brand to translate them into a size.</p>
        </div>

        {recommendationMutation.isError && <Banner type="error" title="Recommendation unavailable" message="Try another brand or check your connection." />}

        {recommendation ? (
          <section className="result-hero" aria-live="polite">
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase' }}>
              {brandsData?.brands?.find(item => item.id === brand)?.name || 'Recommended size'}
            </p>
            <div className="result-size">{recommendation.recommended_size || '—'}</div>
            {confidence?.score != null && (
              <span className="confidence"><CheckCircle2 size={16} />{Math.round(confidence.score * 100)}% match</span>
            )}
            <Button variant="text" onClick={() => recommendationMutation.reset()} style={{ color: 'inherit', marginTop: 12 }}>Choose another brand</Button>
          </section>
        ) : (
          <Card style={{ display: 'grid', gap: 16 }}>
            <label className="field">
              <span className="field__label">Brand</span>
              <select className="input" value={brand} onChange={e => setBrand(e.target.value)} disabled={brandsLoading}>
                <option value="">{brandsLoading ? 'Loading brands…' : 'Select a brand'}</option>
                {brandsData?.brands?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <Button fullWidth disabled={!brand} isLoading={recommendationMutation.isPending} onClick={() => recommendationMutation.mutate({
              sessionId,
              payload: {
                brand_id: brand,
                product_type: productType,
                fit_preference: session?.fit_preference || 'regular',
                preferred_size_system: 'EU',
                use_tier: 'accurate',
              },
            })}>Find my size</Button>
          </Card>
        )}

        <section className="card">
          <button className="button button--text button--full" style={{ justifyContent: 'space-between', padding: 16 }} onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Ruler size={19} />Body measurements</span>
            <ChevronDown style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
          </button>
          {expanded && (
            <div className="measurement-list" style={{ padding: '0 20px 8px' }}>
              {result?.measurements?.length ? result.measurements.map(item => (
                <div className="measurement-row" key={item.iso_name}>
                  <span className="muted" style={{ textTransform: 'capitalize' }}>{item.iso_name.replaceAll('_', ' ')}</span>
                  <strong>{item.value_cm} cm</strong>
                </div>
              )) : <p className="muted">No detailed measurements were returned.</p>}
            </div>
          )}
        </section>

        <div className="sticky-action">
          <Button fullWidth onClick={() => navigate('/app')}>Measure another item</Button>
        </div>
      </main>
    </div>
  );
}

function ResultLoading({ onBack }) {
  return (
    <div className="flow-page">
      <header className="flow-header"><div className="flow-header__row"><button className="icon-button" onClick={onBack} aria-label="Back"><ArrowLeft /></button><h1 className="flow-header__title">Calculating your fit</h1><span /></div></header>
      <main className="flow-content">
        <div className="empty-state" aria-live="polite">
          <span className="empty-state__icon"><RefreshCw className="spin" /></span>
          <h2 className="section-title">Building your measurements</h2>
          <p className="muted">This usually takes a short moment. You can keep this screen open.</p>
        </div>
        <div className="skeleton" style={{ height: 190 }} />
      </main>
    </div>
  );
}
