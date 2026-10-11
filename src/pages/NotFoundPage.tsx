import { Link } from 'react-router-dom';
import { useLang } from '../i18n/strings';

export function NotFoundPage() {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-display text-7xl opacity-20">404</div>
      <h1 className="font-display mt-4 text-2xl">{t('notFound.title')}</h1>
      <p className="mt-2 text-sm opacity-60">{t('notFound.body')}</p>
      <Link
        to="/"
        className="mt-6 rounded-xl bg-[var(--accent-600)] px-5 py-2.5 font-medium text-white"
      >
        {t('notFound.home')}
      </Link>
    </div>
  );
}
