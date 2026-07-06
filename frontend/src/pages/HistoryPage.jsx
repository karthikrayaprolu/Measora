import { History } from 'lucide-react';

export default function HistoryPage() {
  return (
    <main className="app-main">
      <header className="page-header"><div><p className="page-eyebrow">Your fittings</p><h1 className="page-title">History</h1></div></header>
      <div className="empty-state card">
        <span className="empty-state__icon"><History /></span>
        <h2 className="section-title">No saved fittings yet</h2>
        <p className="muted">Completed measurements will appear here when account history is available.</p>
      </div>
    </main>
  );
}
