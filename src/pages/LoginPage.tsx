import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, BookOpen, Loader2 } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useAuth, ApiError, isNetworkError } from '../lib/api';

const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'MyLife Journal';

/** Password gate. Wrong password shakes; 429 shows the rate-limit message. */
export function LoginPage() {
  const { t } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(password);
      navigate('/', { replace: true });
    } catch (err) {
      setShake((s) => s + 1);
      if (isNetworkError(err)) setError(t('auth.networkError'));
      else if (err instanceof ApiError && err.status === 429) setError(t('auth.rateLimited'));
      else setError(t('auth.invalid'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--accent-600)] text-white shadow-lg">
            <BookOpen size={30} aria-hidden />
          </span>
          <h1 className="font-display mt-4 text-3xl">{APP_NAME}</h1>
          <p className="mt-1 text-sm opacity-60">{t('app.tagline')}</p>
        </div>

        <div key={shake} className={shake > 0 ? 'animate-[shake_0.4s]' : ''}>
          <form
            onSubmit={submit}
            className="rounded-3xl border border-[var(--cream-200)] bg-[var(--paper)] p-6 shadow-sm"
          >
            <h2 className="font-display text-xl">{t('auth.title')}</h2>
            <p className="mt-1 text-sm opacity-60">{t('auth.subtitle')}</p>

            <label htmlFor="pw" className="mb-1 mt-5 block text-sm font-medium">
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                id="pw"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="current-password"
                autoFocus
                className="w-full rounded-xl border border-[var(--cream-200)] bg-transparent py-2.5 pl-3 pr-11 text-base outline-none focus:border-[var(--accent-500)] focus:ring-2 focus:ring-[var(--accent-500)]/20"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t('auth.hide') : t('auth.show')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 opacity-60 hover:opacity-100"
              >
                {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-red-100 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !password}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-600)] px-6 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
              {busy ? t('auth.signingIn') : t('auth.signIn')}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs opacity-40">{t('app.credit')}</p>
      </div>
    </main>
  );
}
