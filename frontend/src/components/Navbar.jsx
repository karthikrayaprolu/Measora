import { Link } from 'react-router-dom';
import { ScanLine, Sun, Moon, UserRound } from 'lucide-react';
import { useTheme } from './theme-context';
import { useAuth } from '../contexts/AuthContext';

export function Navbar({ variant = 'solid', inApp = false }) {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  const navClass = variant === 'transparent' ? 'navbar navbar--transparent' : 'navbar navbar--solid';

  return (
    <nav className={navClass} aria-label="Primary navigation">
      <Link className="brand" to="/" aria-label="Measora home">
        <span className="brand-mark"><ScanLine size={19} /></span>
        <span className="brand-text">Measora</span>
      </Link>

      <div className="navbar-actions">
        <button
          className="icon-button"
          onClick={toggleTheme}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        >
          {isDark ? <Sun size={21} /> : <Moon size={21} />}
        </button>

        {!user && (
          <div className="navbar-auth">
            <Link to="/login" className="lp-nav-btn lp-nav-btn--ghost">
              Sign in
            </Link>
            <Link to="/login" className="lp-nav-btn lp-nav-btn--filled">
              Start free
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
