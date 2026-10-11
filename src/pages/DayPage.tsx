import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useEntries, isNetworkError } from '../lib/api';
import { formatLong, relativeDay } from '../lib/dates';
import { EntryCard } from '../components/EntryCard';
import { CardSkeleton, EmptyState } from '../components/Feedback';

/** All entries for one calendar day. */
export function DayPage() {
  const { t, lang } = useLang();
  const { date = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useEntries({
    from: date,
    to: date,
    per_page: 100,
    sort: 'desc',
  });

  const rel = relativeDay(date, lang);
  const count = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/calendar')}
        className="inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
      >
        <ArrowLeft size={16} aria-hidden />
        {t('calendar.title')}
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl capitalize">{formatLongSafe(date, lang, formatLong)}</h1>
          <p className="mt-0.5 text-sm opacity-60">
            {rel && <span className="font-medium text-[var(--accent-600)]">{rel} · </span>}
            {count === 1 ? t('day.oneEntry') : `${count} ${t('day.entries')}`}
          </p>
        </div>
        <Link
          to={`/new?date=${date}`}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-600)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus size={18} aria-hidden />
          {t('day.addEntry')}
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isError ? (
        <EmptyState
          title={isNetworkError(error) ? t('offline.title') : t('error.generic')}
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-xl bg-[var(--accent-600)] px-4 py-2 text-sm font-medium text-white"
            >
              {t('common.retry')}
            </button>
          }
        />
      ) : count === 0 ? (
        <EmptyState
          title={t('calendar.noEntries')}
          body={t('calendar.viewDay')}
          action={
            <Link
              to={`/new?date=${date}`}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-600)] px-5 py-2.5 font-medium text-white"
            >
              <Plus size={18} aria-hidden />
              {t('calendar.addEntry')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {data!.items.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatLongSafe(date: string, lang: 'es' | 'en', fmt: (d: string, l: 'es' | 'en') => string): string {
  try {
    return fmt(date, lang);
  } catch {
    return date;
  }
}
