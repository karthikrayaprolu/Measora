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

  // Guards that survive Strict Mode's double-invocation of effects:
  // - initializedRef:  ensures initializeAuth() runs exactly once per lifetime.
  // - subscriptionRef: holds the single active Supabase listener so StrictMode's
  //   second effect run does NOT attach a second subscription (which would cause
  //   Supabase to replay SIGNED_IN a second time, producing duplicate log lines).
  const initializedRef = useRef(false);
  const subscriptionRef = useRef(null);

  useEffect(() => {
    // ── 1. Create the auth state listener exactly once. ───────────────────
    if (!subscriptionRef.current) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          // Gate verbose logging to development builds only.
          if (import.meta.env.DEV) {
            console.log(
              '[Auth] Auth state changed. Event:', _event,
              '| User:', newSession?.user?.id ?? 'null',
            );
          }

          // A real (non-anonymous) SIGNED_IN clears the explicit-sign-out flag
          // so anonymous sessions can be created again on future fresh visits.
          if (_event === 'SIGNED_IN' && newSession?.user && !newSession.user.is_anonymous) {
            sessionStorage.removeItem(SIGNED_OUT_KEY);
          }

          setSession(newSession);
          setUser(newSession?.user ?? null);

          // Safety net: if onAuthStateChange fires before getSession returns,
          // unblock the loading gate so the UI does not hang indefinitely.
          setLoading(false);
        },
      );

      subscriptionRef.current = subscription;
    }

    // ── 2. Run initializeAuth exactly once per component lifetime. ────────
    if (!initializedRef.current) {
      initializedRef.current = true;

      const initializeAuth = async () => {
        try {
          const {
            data: { session: existingSession },
            error: sessionError,
          } = await supabase.auth.getSession();

          if (sessionError) {
            console.error('[Auth] getSession error:', sessionError);
          }

          if (existingSession) {
            // Refresh on app startup. This is especially important after a
            // long inactive production visit, where getSession can restore an
            // expired JWT before the automatic refresh event is delivered.
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            const activeSession = refreshed?.session || existingSession;
            if (refreshError && !activeSession?.access_token) {
              throw refreshError;
            }
            if (import.meta.env.DEV) {
              console.log('[Auth] Restored existing session. User:', activeSession.user?.id);
            }
            sessionStorage.removeItem(SIGNED_OUT_KEY);
            setSession(activeSession);
            setUser(activeSession.user);
            setAuthError(null);
            setLoading(false);
            return;
          }

          // User explicitly signed out   skip anonymous sign-in.
          if (sessionStorage.getItem(SIGNED_OUT_KEY)) {
            if (import.meta.env.DEV) {
              console.log('[Auth] User explicitly signed out   skipping anonymous sign-in.');
            }
            setLoading(false);
            return;
          }

          // No session at all   attempt anonymous sign-in.
          if (import.meta.env.DEV) {
            console.log('[Auth] No session found, attempting anonymous sign-in...');
          }
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();

          if (anonError) {
            console.error('[Auth] Anonymous sign-in failed:', anonError);
            if (anonError.message?.includes('Anonymous sign-ins are disabled')) {
              setAuthError(
                'Anonymous sign-ins are disabled in Supabase. ' +
                'Enable it in: Supabase Dashboard → Authentication → Providers → Anonymous.',
              );
            } else {
              setAuthError(`Sign-in failed: ${anonError.message}`);
            }
            setLoading(false);
            return;
          }

          if (anonData?.session) {
            if (import.meta.env.DEV) {
              console.log('[Auth] Anonymous sign-in successful. User:', anonData.session.user?.id);
            }
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

    // ── Cleanup ───────────────────────────────────────────────────────────
    // On a true component unmount, unsubscribe and clear the ref.
    // On Strict Mode's probe unmount → re-mount, the guard above prevents
    // re-attaching a second subscription on the next effect run.
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, []);

  const handleSignOut = async () => {
    // Set the flag BEFORE calling Supabase so that if initializeAuth fires
    // again it won't create a new anonymous session.
    sessionStorage.setItem(SIGNED_OUT_KEY, '1');
    const result = await supabase.auth.signOut();
    // Clear local state immediately   don't wait for onAuthStateChange.
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
