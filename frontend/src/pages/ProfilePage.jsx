import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../components/theme-context';

export default function ProfilePage() {
  const { theme, setTheme } = useTheme();
  return (
    <main className="app-main">
      <header className="page-header"><div><p className="page-eyebrow">Preferences</p><h1 className="page-title">Profile</h1><p className="page-copy">Control how Measora looks on this device.</p></div></header>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 14 }}>Appearance</h2>
        <div className="segmented" aria-label="Color theme">
          <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Sun size={17} /> Light</button>
          <button aria-pressed={theme === 'system'} onClick={() => setTheme('system')}>Auto</button>
          <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={17} /> Dark</button>
        </div>
      </section>
    </main>
  );
}
