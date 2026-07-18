import { useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMeasurements, useDeleteMeasurement } from '../api/hooks';
import { Button } from '../components/ui/Button';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function HistoryPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: items, isLoading } = useMeasurements(userId);
  const del = useDeleteMeasurement();
  const [deleteId, setDeleteId] = useState(null);

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
        <div style={{ display: 'grid', gap: 24 }}>
          {items.map(item => (
            <div key={item.id} className="history-card">
              <div className="history-card__header">
                <div className="history-card__title">
                  <h3 className="text-heading-md">{item.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="history-card__date">{format(new Date(item.created_at), 'MMM d, yyyy • h:mm a')}</span>
                    {item.recommended_size && (
                      <span className="history-card__badge">Size: {item.recommended_size}</span>
                    )}
                  </div>
                </div>
                <button 
                  className="icon-button icon-button--danger" 
                  aria-label="Delete measurement"
                  onClick={() => setDeleteId(item.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="history-card__body">
                {item.measurements.map(m => (
                  <div key={m.iso_name} className="history-measure">
                    <span className="history-measure__label">{m.iso_name.replaceAll('_', ' ')}</span>
                    <span className="history-measure__value">
                      {Number(m.value_cm).toFixed(1)} <small>cm</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h3 id="delete-title" className="modal-title">Delete profile</h3>
            <p className="modal-body">Are you sure you want to delete this profile? This action cannot be undone.</p>
            <div className="modal-actions">
              <Button variant="text" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="primary" style={{ backgroundColor: '#ef4444', color: '#fff', borderColor: '#ef4444' }} onClick={async () => {
                try {
                  await del.mutateAsync({ userId, id: deleteId });
                  toast.success('Profile deleted successfully');
                  setDeleteId(null);
                } catch (e) {
                  toast.error('Failed to delete profile');
                }
              }}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
