import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  // Guard: prevent ensureSession from running more than once (e.g., React Strict Mode double-mount)
  const initializedRef = useRef(false);

  useEffect(() => {
    // Only run once — React Strict Mode mounts effects twice in development;
    // the ref prevents a second anonymous sign-in on the re-mount.
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initializeAuth = async () => {
      try {
        const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[Auth] getSession error:', sessionError);
        }

        if (existingSession) {
          console.log('[Auth] Restored existing session. User:', existingSession.user?.id);
          setSession(existingSession);
          setUser(existingSession.user);
          setAuthError(null);
          setLoading(false);
          return;
        }

        // No existing session — attempt anonymous sign-in
        console.log('[Auth] No session found, attempting anonymous sign-in...');
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();

        if (anonError) {
          console.error('[Auth] Anonymous sign-in failed:', anonError);
          if (anonError.message?.includes('Anonymous sign-ins are disabled')) {
            setAuthError(
              'Anonymous sign-ins are disabled in Supabase. ' +
              'Enable it in: Supabase Dashboard → Authentication → Providers → Anonymous.'
            );
          } else {
            setAuthError(`Sign-in failed: ${anonError.message}`);
          }
          return;
        }

        if (anonData?.session) {
          console.log('[Auth] Anonymous sign-in successful. User:', anonData.session.user?.id);
          setSession(anonData.session);
          setUser(anonData.session.user);
          setAuthError(null);
        } else {
          console.error('[Auth] signInAnonymously returned no session and no error. Check Supabase config.');
          setAuthError('Could not create a session. Please check Supabase configuration.');
        }
      } catch (err) {
        console.error('[Auth] Unexpected error during auth init:', err);
        setAuthError(`Unexpected auth error: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Single auth state change subscription — unsubscribed on unmount only
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[Auth] Auth state changed. Event:', _event, '| User:', session?.user?.id ?? 'null');
      setSession(session);
      setUser(session?.user ?? null);
      // Don't toggle loading here — it's only meant for the initial mount
    });

    return () => subscription.unsubscribe();
  }, []); // empty deps — run once on mount, clean up on unmount

  const value = {
    session,
    user,
    loading,
    authError,
    signOut: () => supabase.auth.signOut(),
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
