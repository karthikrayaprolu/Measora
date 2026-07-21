import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

// Key used in sessionStorage to remember that the user explicitly signed out.
// Prevents anonymous re-sign-in on the next page load after sign-out.
const SIGNED_OUT_KEY = 'measora_signed_out';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // ── 1. Subscribe ALWAYS — must happen before initializeAuth so we
    //    never miss a SIGNED_IN / SIGNED_OUT event.
    //    React Strict Mode runs effects twice: the guard below prevents
    //    initializeAuth from running twice, but the subscription is
    //    recreated on every effect run so it is always active.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('[Auth] Auth state changed. Event:', _event, '| User:', newSession?.user?.id ?? 'null');

      // A real (non-anonymous) sign-in clears the explicit-sign-out flag so
      // that anonymous sessions can be created again on future fresh visits.
      if (_event === 'SIGNED_IN' && newSession?.user && !newSession.user.is_anonymous) {
        sessionStorage.removeItem(SIGNED_OUT_KEY);
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    // ── 2. Run initializeAuth exactly once per component lifetime.
    if (!initializedRef.current) {
      initializedRef.current = true;

      const initializeAuth = async () => {
        try {
          const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            console.error('[Auth] getSession error:', sessionError);
          }

          if (existingSession) {
            console.log('[Auth] Restored existing session. User:', existingSession.user?.id);
            sessionStorage.removeItem(SIGNED_OUT_KEY);
            setSession(existingSession);
            setUser(existingSession.user);
            setAuthError(null);
            setLoading(false);
            return;
          }

          // User explicitly signed out — skip anonymous sign-in.
          if (sessionStorage.getItem(SIGNED_OUT_KEY)) {
            console.log('[Auth] User explicitly signed out — skipping anonymous sign-in.');
            setLoading(false);
            return;
          }

          // No session at all — attempt anonymous sign-in.
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
            setLoading(false);
            return;
          }

          if (anonData?.session) {
            console.log('[Auth] Anonymous sign-in successful. User:', anonData.session.user?.id);
            setSession(anonData.session);
            setUser(anonData.session.user);
            setAuthError(null);
          } else {
            console.error('[Auth] signInAnonymously returned no session and no error.');
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
    }

    // Clean up subscription on every effect cleanup (including Strict Mode's
    // intermediate unmount). A fresh subscription is created on the next run.
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    // Set the flag BEFORE calling Supabase so that if initializeAuth fires
    // again it won't create a new anonymous session.
    sessionStorage.setItem(SIGNED_OUT_KEY, '1');
    const result = await supabase.auth.signOut();
    // Clear local state immediately — don't wait for onAuthStateChange.
    setSession(null);
    setUser(null);
    return result;
  };

  const value = {
    session,
    user,
    loading,
    authError,
    signOut: handleSignOut,
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
