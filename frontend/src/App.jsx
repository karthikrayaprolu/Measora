import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';

const LandingPage = lazy(() => import('./LandingPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SessionConfig = lazy(() => import('./pages/SessionConfig'));
const CaptureFlow = lazy(() => import('./pages/CaptureFlow'));
const ResultPage = lazy(() => import('./pages/ResultPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));

function RouteLoader() {
  return <main className="app-main"><div className="skeleton" style={{ height: 180 }} aria-label="Loading page" /></main>;
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <AuthProvider>
        <Toaster position="bottom-center" />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/app/session/new/:productId" element={
            <ProtectedRoute><SessionConfig /></ProtectedRoute>
          } />
          <Route path="/app/session/:sessionId/capture" element={
            <ProtectedRoute><CaptureFlow /></ProtectedRoute>
          } />
          <Route path="/app/session/:sessionId/result" element={
            <ProtectedRoute><ResultPage /></ProtectedRoute>
          } />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/history" element={<HistoryPage />} />
          <Route path="/app/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthProvider>
    </Suspense>
  );
}

function AppLayout() {
  return <AppShell><Outlet /></AppShell>;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) return <RouteLoader />;
  if (!user) return <Navigate to="/login" replace />;
  
  return children;
}
