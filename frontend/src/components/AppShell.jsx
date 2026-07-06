import { NavLink, Link } from 'react-router-dom';
import { History, Moon, Ruler, ScanLine, Sun, UserRound } from 'lucide-react';
import { useTheme } from './theme-context';

export function AppShell({ children }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <div className="app-page">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark"><ScanLine size={19} /></span>
          <span>Measora</span>
        </Link>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="icon-button" onClick={toggleTheme} aria-label={`Use ${isDark ? 'light' : 'dark'} theme`}>
            {isDark ? <Sun size={21} /> : <Moon size={21} />}
          </button>
          <Link to="/app/profile" className="icon-button" aria-label="Profile">
            <UserRound size={21} />
          </Link>
        </div>
      </header>
      {children}
      <nav className="tabbar" aria-label="Primary navigation">
        <Tab to="/app" end icon={Ruler}>Measure</Tab>
        <Tab to="/app/history" icon={History}>History</Tab>
        <Tab to="/app/profile" icon={UserRound}>Profile</Tab>
      </nav>
    </div>
  );
}

function Tab({ to, icon: Icon, children, end }) {
  return (
    <NavLink to={to} end={end} className="tabbar__item">
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
          <span>{children}</span>
        </>
      )}
    </NavLink>
  );
}
