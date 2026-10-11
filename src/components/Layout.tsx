import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  CalendarDays, ListOrdered, Search, BarChart3, Plus, Menu, X, LogOut,
  FolderOpen, Upload, Settings as SettingsIcon, Globe,
} from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useAuth } from '../lib/api';
import { ThemeToggle } from './ThemeToggle';
import { OfflineBanner } from './OfflineBanner';

function NavItem({ to, icon: Icon, label, onClick }: { to: string; icon: typeof Search; label: string; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
          isActive ? 'bg-[var(--accent-600)] text-white' : 'hover:bg-[var(--cream-100)]'
        }`
      }
    >
      <Icon size={18} aria-hidden />
      {label}
    </NavLink>
  );
}

function LanguageSelect() {
  const { lang, setLang, t } = useLang();
  return (
    <label className="flex items-center gap-2 text-sm">
      <Globe size={16} aria-hidden className="opacity-60" />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as 'es' | 'en')}
        className="rounded-lg border border-[var(--cream-200)] bg-transparent px-2 py-1 text-sm"
        aria-label={t('common.language')}
      >
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}

const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'MyLife Journal';

/** App shell: desktop sidebar, mobile top bar + bottom nav with a big "+" . */
export function Layout() {
  const { t } = useLang();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = [
    { to: '/calendar', icon: CalendarDays, label: t('nav.calendar') },
    { to: '/timeline', icon: ListOrdered, label: t('nav.timeline') },
    { to: '/search', icon: Search, label: t('nav.search') },
    { to: '/stats', icon: BarChart3, label: t('nav.stats') },
  ];
  const secondary = [
    { to: '/categories', icon: FolderOpen, label: t('nav.categories') },
    { to: '/import', icon: Upload, label: t('nav.import') },
    { to: '/settings', icon: SettingsIcon, label: t('nav.settings') },
  ];

  return (
    <div className="min-h-screen">
      {/* ---------------- desktop sidebar ---------------- */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-[var(--cream-200)] bg-[var(--paper)] p-4 md:flex">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 flex items-center gap-2 px-2 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-600)] font-display text-xl text-white">
            M
          </span>
          <span className="font-display text-lg leading-tight">{APP_NAME}</span>
        </button>
        <nav className="flex flex-col gap-1" aria-label="primary">
          <NavItem to="/" icon={ListOrdered} label={t('nav.home')} />
          {primary.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
        <div className="mt-4 border-t border-[var(--cream-200)] pt-4">
          <nav className="flex flex-col gap-1" aria-label="secondary">
            {secondary.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>
        </div>
        <div className="mt-auto space-y-3 border-t border-[var(--cream-200)] pt-4">
          <div className="flex items-center justify-between px-2">
            <LanguageSelect />
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm opacity-70 hover:bg-[var(--cream-100)] hover:opacity-100"
          >
            <LogOut size={18} aria-hidden />
            {t('nav.logout')}
          </button>
          <p className="px-2 text-[11px] opacity-40">{t('app.credit')}</p>
        </div>
      </aside>

      {/* ---------------- mobile top bar ---------------- */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--cream-200)] bg-[var(--paper)]/95 px-4 py-3 backdrop-blur md:hidden">
        <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-600)] font-display text-lg text-white">
            M
          </span>
          <span className="font-display text-base">{APP_NAME}</span>
        </button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* ---------------- content ---------------- */}
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:pt-6 md:ml-60 md:max-w-none md:px-8 md:pb-16 lg:mx-auto lg:max-w-3xl lg:pl-8">
        <Outlet />
        <footer className="mt-12 border-t border-[var(--cream-200)] pt-4 text-center text-xs opacity-40">
          {t('app.credit')}
        </footer>
      </main>

      {/* ---------------- mobile bottom nav ---------------- */}
      <nav
        aria-label="primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--cream-200)] bg-[var(--paper)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="grid grid-cols-5 items-end px-2 py-1.5">
          {primary.slice(0, 2).map((n) => (
            <BottomTab key={n.to} {...n} />
          ))}
          <div className="flex justify-center">
            <NavLink
              to="/new"
              aria-label={t('dashboard.newEntry')}
              className="flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-[var(--accent-600)] text-white shadow-lg transition hover:scale-105"
            >
              <Plus size={26} aria-hidden />
            </NavLink>
          </div>
          <BottomTab to="/search" icon={Search} label={t('nav.search')} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label={t('a11y.openMenu')}
            className="flex flex-col items-center gap-1 py-2 text-[11px] opacity-70"
          >
            <Menu size={22} aria-hidden />
            {t('nav.more')}
          </button>
        </div>
      </nav>

      {/* ---------------- "more" sheet ---------------- */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-[var(--paper)] p-5 pb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl">{t('nav.more')}</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label={t('common.close')}
                className="rounded-full p-2 hover:bg-[var(--cream-100)]"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              <NavItem to="/" icon={ListOrdered} label={t('nav.home')} onClick={() => setMoreOpen(false)} />
              {secondary.map((n) => (
                <NavItem key={n.to} {...n} onClick={() => setMoreOpen(false)} />
              ))}
            </nav>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--cream-200)] px-2 pt-4">
              <LanguageSelect />
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cream-200)] px-3 py-2 text-sm"
              >
                <LogOut size={16} aria-hidden />
                {t('nav.logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineBanner />
    </div>
  );
}

function BottomTab({ to, icon: Icon, label }: { to: string; icon: typeof Search; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 py-2 text-[11px] ${isActive ? 'text-[var(--accent-600)]' : 'opacity-60'}`
      }
    >
      <Icon size={22} aria-hidden />
      {label}
    </NavLink>
  );
}
