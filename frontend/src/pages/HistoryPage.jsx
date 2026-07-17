import { History, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMeasurements, useDeleteMeasurement } from '../api/hooks';
import { Button } from '../components/ui/Button';

export default function HistoryPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: items, isLoading } = useMeasurements(userId);
  const del = useDeleteMeasurement();

  if (!user) {
    return (
      <main className="app-main">
        <header className="page-header"><div><p className="page-eyebrow">Your fittings</p><h1 className="page-title">History</h1></div></header>
        <div className="empty-state card">
          <span className="empty-state__icon"><History /></span>
          <h2 className="section-title">Sign in to view your history</h2>
        </div>
      </main>
    );
  }

  return (
    <main className="app-main">
      <header className="page-header"><div><p className="page-eyebrow">Your fittings</p><h1 className="page-title">History</h1></div></header>
      {isLoading && <div className="card">Loading…</div>}
      {!isLoading && (!items || items.length === 0) && (
        <div className="empty-state card">
          <span className="empty-state__icon"><History /></span>
          <h2 className="section-title">No saved fittings yet</h2>
          <p className="muted">Save measurements from the results screen to build your history.</p>
        </div>
      )}

      {!isLoading && items && items.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(item => (
            <div key={item.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{new Date(item.created_at).toLocaleString()}</div>
                <div style={{ marginTop: 8 }}>
                  {item.measurements.map(m => (
                    <div key={m.iso_name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">{m.iso_name.replaceAll('_', ' ')}</span>
                      <strong>{m.value_cm} cm</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Button variant="danger" onClick={async () => {
                  if (!window.confirm('Delete this saved measurement?')) return;
                  try {
                    await del.mutateAsync({ userId, id: item.id });
                    // no-op; list will refresh via hook
                  } catch (e) {
                    alert('Delete failed');
                  }
                }}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
