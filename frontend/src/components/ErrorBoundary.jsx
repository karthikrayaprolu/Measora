import { Component } from 'react';
import { Button } from './ui/Button';

export class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="app-main app-main--narrow">
        <div className="empty-state card">
          <h1 className="section-title">Something went wrong</h1>
          <p className="muted">Your measurement data is safe. Reload the app to continue.</p>
          <Button onClick={() => window.location.reload()}>Reload app</Button>
        </div>
      </main>
    );
  }
}
