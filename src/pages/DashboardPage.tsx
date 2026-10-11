import { Link } from 'react-router-dom';
import { Plus, CalendarDays, ArrowRight, Images } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useEntries, useStats, isNetworkError } from '../lib/api';
import { todayYMD, formatLong } from '../lib/dates';
import { EntryCard } from '../components/EntryCard';
import { CardSkeleton, EmptyState } from '../components/Feedback';
import { StatCard } from '../components/StatCard';

function greetingKey(): 'dashboard.greeting.morning' | 'dashboard.greeting.afternoon' | 'dashboard.greeting.evening' {
  const h = new Date().getHours();
  if (h < 13) return 'dashboard.greeting.morning';
  if (h < 21) return 'dashboard.greeting.afternoon';
  return 'dashboard.greeting.evening';
}

export function DashboardPage() {
  const { t, lang } = useLang();
  const stats = useStats();
  const latest = useEntries({ per_page: 5, sort: 'desc' });

  const today = todayYMD();
  const month = today.slice(0, 7);
  const monthCount = stats.data?.perYear.find((p) => p.year === Number(today.slice(0, 4)))?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">{t(greetingKey())}</h1>
          <p className="mt-1 text-sm opacity-60">
            {formatLong(today, lang)} · {t('dashboard.subtitle')}
          </p>
        </div>
        <Link
          to="/new"
          className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent-600)] px-5 py-3 font-semibold text-white shadow-md transition hover:scale-[1.02]"
        >
          <Plus size={20} aria-hidden />
          {t('dashboard.newEntry')}
        </Link>
      </div>

      {stats.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--cream-100)]" />
          ))}
        </div>
      ) : stats.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t('dashboard.totalEntries')} value={stats.data.totalEntries} />
          <StatCard label={t('dashboard.totalPhotos')} value={stats.data.totalPhotos} sub={t('common.photos')} />
          <StatCard label={t('dashboard.thisYear')} value={monthCount} sub={today.slice(0, 4)} />
          <StatCard
            label={t('stats.yearsActive')}
            value={stats.data.yearsActive.length}
            sub={stats.data.yearsActive.slice(-3).join(' · ')}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">{t('dashboard.latest')}</h2>
        <Link to="/timeline" className="inline-flex items-center gap-1 text-sm text-[var(--accent-600)] hover:underline">
          {t('dashboard.viewAll')}
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>

      {latest.isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : latest.isError ? (
        <EmptyState
          title={isNetworkError(latest.error) ? t('offline.title') : t('error.generic')}
          body={t('offline.message')}
          action={
            <button
              type="button"
              onClick={() => void latest.refetch()}
              className="rounded-xl bg-[var(--accent-600)] px-4 py-2 text-sm font-medium text-white"
            >
              {t('common.retry')}
            </button>
          }
        />
      ) : latest.data && latest.data.items.length > 0 ? (
        <div className="space-y-3">
          {latest.data.items.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={t('dashboard.empty.title')}
          body={t('dashboard.empty.body')}
          action={
            <Link
              to="/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-600)] px-5 py-2.5 font-medium text-white"
            >
              <Plus size={18} aria-hidden />
              {t('dashboard.empty.cta')}
            </Link>
          }
        />
      )}

      <Link
        to="/calendar"
        className="flex items-center justify-between rounded-2xl border border-[var(--cream-200)] p-4 shadow-sm transition hover:shadow-md"
      >
        <span className="inline-flex items-center gap-3">
          <span className="rounded-xl bg-[var(--cream-100)] p-2.5">
            <CalendarDays size={20} aria-hidden />
          </span>
          <span>
            <span className="block font-medium">{t('dashboard.openCalendar')}</span>
            <span className="block text-xs opacity-60">
              {month} · <Images size={11} className="inline" aria-hidden /> {t('common.photos')}
            </span>
          </span>
        </span>
        <ArrowRight size={18} aria-hidden className="opacity-50" />
      </Link>
    </div>
  );
}
