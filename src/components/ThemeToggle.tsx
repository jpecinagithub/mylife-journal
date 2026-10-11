import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useLang } from '../i18n/strings';

type Mode = 'light' | 'dark' | 'system';
const KEY = 'mylife-theme';

function readMode(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function applyMode(mode: Mode) {
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** Cycles light → dark → system. Renders as a compact icon button. */
export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { t } = useLang();
  const [mode, setMode] = useState<Mode>(readMode);

  useEffect(() => {
    applyMode(mode);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => mode === 'system' && applyMode('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const next = () => {
    const n: Mode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    setMode(n);
    try {
      localStorage.setItem(KEY, n);
    } catch {
      /* ignore */
    }
  };

  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  const label = t(`common.theme.${mode}`);
  return (
    <button
      type="button"
      onClick={next}
      title={`${t('common.theme')}: ${label}`}
      aria-label={t('a11y.toggleTheme')}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--cream-200)] px-3 py-2 text-sm hover:bg-[var(--cream-100)]"
    >
      <Icon size={16} aria-hidden />
      {showLabel && <span>{label}</span>}
    </button>
  );
}
