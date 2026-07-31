import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkStatus } from './components/NetworkStatus';
import './index.css';
import App from './App.jsx';

// ── Browser-extension noise suppression ───────────────────────────────────────
// MetaMask (and some other wallet extensions) inject inpage.js / contentscript.js
// into every page and log "Failed to connect to MetaMask" unhandled rejections
// when the extension's background service worker isn't running. These errors come
// entirely from the extension   not from any Measora code   and cannot be fixed
// here. The filter below silently drops them so they don't pollute the console
// or trigger Sentry/error-monitoring alerts. It is intentionally narrow and only
// suppresses strings that uniquely identify MetaMask extension errors.
if (typeof window !== 'undefined') {
  // ── Suppress MetaMask "unhandled rejection" console errors ──
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event?.reason?.message ?? '';
    if (
      msg.includes('MetaMask extension not found') ||
      msg.includes('Failed to connect to MetaMask')
    ) {
      event.preventDefault();
    }
  });

  // ── Suppress MetaMask "ObjectMultiplex orphaned data" console.warn ──
  // contentscript.js from the MetaMask extension emits these warnings when its
  // background service worker goes idle. They are entirely extension-internal
  // and contain no actionable information for the Measora app.
  const _origWarn = console.warn.bind(console);
  console.warn = (...args) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.includes('ObjectMultiplex') && first.includes('orphaned data')) {
      return; // drop silently
    }
    _origWarn(...args);
  };
}



const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <NetworkStatus />
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
