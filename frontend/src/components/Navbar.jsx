import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ScanLine, Sun, Moon, UserRound, LogOut, Settings } from 'lucide-react';
import { useTheme } from './theme-context';
import { useAuth } from '../contexts/AuthContext';

export function Navbar({ variant = 'solid', inApp = false }) {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const navClass = variant === 'transparent' ? 'navbar navbar--transparent' : 'navbar navbar--solid';

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate('/', { replace: true });
  };

  // Derive avatar info
  const email = user?.email;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name;
  const isAnonymous = user?.is_anonymous || !email;
  const avatarLetter = displayName
    ? displayName[0].toUpperCase()
    : email
    ? email[0].toUpperCase()
    : null;

  return (
    <nav className={navClass} aria-label="Primary navigation">
      <Link className="brand" to="/" aria-label="Measora home">
        <span className="brand-mark"><ScanLine size={19} /></span>
        <span className="brand-text">Measora</span>
      </Link>

      <div className="navbar-actions">
        {/* Theme toggle */}
        <button
          className="icon-button"
          onClick={toggleTheme}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        >
          {isDark ? <Sun size={21} /> : <Moon size={21} />}
        </button>

        {/* Not logged in */}
        {!user && (
          <div className="navbar-auth">
            <Link to="/login" className="lp-nav-btn lp-nav-btn--ghost">Sign in</Link>
            <Link to="/login" className="lp-nav-btn lp-nav-btn--filled">Start free</Link>
          </div>
        )}

        {/* Logged in — avatar button + dropdown */}
        {user && (
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              id="btn-user-menu"
              aria-label="User menu"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => setMenuOpen(o => !o)}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: isAnonymous
                  ? 'var(--color-surface-raised)'
                  : 'linear-gradient(135deg, var(--color-brass), var(--color-brass-dark))',
                border: menuOpen
                  ? '2px solid var(--color-brass)'
                  : '2px solid var(--color-border)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
                color: isAnonymous ? 'var(--color-ink-muted)' : '#fff',
                flexShrink: 0,
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
                boxShadow: menuOpen ? '0 0 0 3px color-mix(in srgb, var(--color-brass) 20%, transparent)' : 'none',
              }}
            >
              {avatarLetter ?? <UserRound size={18} />}
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div
                role="menu"
                aria-label="User options"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  minWidth: 220,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  overflow: 'hidden',
                  zIndex: 200,
                  animation: 'fadeSlideDown 120ms ease',
                }}
              >
                {/* User info header */}
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--color-border)',
                  pointerEvents: 'none',
                }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName || (isAnonymous ? 'Guest account' : email)}
                  </p>
                  {!isAnonymous && displayName && (
                    <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {email}
                    </p>
                  )}
                </div>

                {/* Profile link */}
                <Link
                  to="/app/profile"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 16px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-ink)',
                    textDecoration: 'none',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Settings size={16} style={{ color: 'var(--color-ink-muted)' }} />
                  Profile &amp; settings
                </Link>

                {/* Divider */}
                <div style={{ height: 1, background: 'var(--color-border)', margin: '0 16px' }} />

                {/* Sign out */}
                <button
                  id="btn-navbar-sign-out"
                  role="menuitem"
                  onClick={handleSignOut}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--color-danger)',
                    fontFamily: 'var(--font-sans)',
                    textAlign: 'left',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-danger-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
