import { useState } from 'react';
import { LogOut, User, Mail, ShieldCheck, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Sign out error:', err);
      setLoggingOut(false);
      setShowConfirm(false);
    }
  };

  // Derive display info from user object
  const email = user?.email;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name;
  const isAnonymous = user?.is_anonymous || !email;
  const avatarLetter = displayName
    ? displayName[0].toUpperCase()
    : email
    ? email[0].toUpperCase()
    : '?';

  return (
    <main className="app-main">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Settings</p>
          <h1 className="page-title">Profile</h1>
          <p className="page-copy">Manage your account and preferences.</p>
        </div>
      </header>

      {/* ── Account Card ─────────────────────────────────────── */}
      <section className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: '20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          {/* Avatar */}
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-brass), var(--color-brass-dark))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--text-xl)',
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
            letterSpacing: '-0.5px',
          }}>
            {isAnonymous ? <User size={24} /> : avatarLetter}
          </div>

          {/* User info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {displayName && (
              <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </p>
            )}
            {email ? (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
                Guest account
              </p>
            )}
          </div>

          {/* Verified badge */}
          {!isAnonymous && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--text-xs)',
              color: 'var(--color-success)',
              fontWeight: 600,
              background: 'var(--color-success-bg)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 8px',
              flexShrink: 0,
            }}>
              <ShieldCheck size={13} />
              Verified
            </span>
          )}
        </div>

        {/* Email row (if not shown above) */}
        {email && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: '14px 20px',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <Mail size={17} style={{ color: 'var(--color-ink-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
              {email}
            </span>
          </div>
        )}
      </section>

      {/* ── Sign Out ─────────────────────────────────────────── */}
      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!showConfirm ? (
          <button
            id="btn-sign-out"
            onClick={() => setShowConfirm(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: '18px 20px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-danger)',
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              textAlign: 'left',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-danger-bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <LogOut size={20} />
            <span style={{ flex: 1 }}>Sign out</span>
            <ChevronRight size={18} style={{ opacity: 0.5 }} />
          </button>
        ) : (
          <div style={{ padding: '20px' }}>
            <p style={{
              margin: '0 0 16px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-ink-muted)',
              lineHeight: 1.5,
            }}>
              Are you sure you want to sign out? You'll be redirected to the home page.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={loggingOut}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Cancel
              </button>
              <button
                id="btn-confirm-sign-out"
                onClick={handleSignOut}
                disabled={loggingOut}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: 'var(--color-danger)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: loggingOut ? 'not-allowed' : 'pointer',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: '#fff',
                  fontFamily: 'var(--font-sans)',
                  opacity: loggingOut ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                {loggingOut ? (
                  <>
                    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="2" x2="12" y2="6" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                      <line x1="2" y1="12" x2="6" y2="12" />
                      <line x1="18" y1="12" x2="22" y2="12" />
                      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                    </svg>
                    Signing out…
                  </>
                ) : (
                  <>
                    <LogOut size={16} />
                    Yes, sign out
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
