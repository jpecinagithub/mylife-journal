import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useStats, isNetworkError } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { BarChart, DonutChart } from '../components/Charts';
import { EmptyState } from '../components/Feedback';

export function StatsPage() {
  const { t } = useLang();
  const { data, isLoading, isError, error, refetch } = useStats();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">{t('stats.title')}</h1>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--cream-100)]" />
          ))}
        </div>
      ) : isError || !data ? (
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
      ) : data.totalEntries === 0 ? (
        <EmptyState title={t('stats.empty')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t('stats.totalEntries')} value={data.totalEntries} />
            <StatCard label={t('stats.totalPhotos')} value={data.totalPhotos} />
            <StatCard
              label={t('stats.yearsActive')}
              value={data.yearsActive.length}
              sub={data.yearsActive.slice(-3).join(' · ')}
            />
            <StatCard
              label={t('stats.avgRating')}
              value={data.averageRating !== null ? data.averageRating.toFixed(1) : '—'}
              sub={data.averageRating !== null ? <Star size={11} className="inline fill-amber-400 text-amber-400" aria-hidden /> : undefined}
            />
          </div>

          {data.byCategory.length > 0 && (
            <section className="rounded-2xl border border-[var(--cream-200)] p-4 shadow-sm sm:p-6">
              <h2 className="font-display mb-4 text-lg">{t('stats.byCategory')}</h2>
              <DonutChart
                data={[...data.byCategory]
                  .sort((a, b) => b.count - a.count)
                  .map((c) => ({ label: c.name, value: c.count, color: c.color }))}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {data.byCategory.map((c) => (
                  <Link
                    key={c.slug}
                    to={`/timeline?category=${encodeURIComponent(c.slug)}`}
                    className="text-xs text-[var(--accent-600)] hover:underline"
                  >
                    {c.name} →
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.perYear.length > 0 && (
            <section className="rounded-2xl border border-[var(--cream-200)] p-4 shadow-sm sm:p-6">
              <h2 className="font-display mb-4 text-lg">{t('stats.byYear')}</h2>
              <BarChart
                data={[...data.perYear]
                  .sort((a, b) => a.year - b.year)
                  .map((p) => ({ label: String(p.year), value: p.count }))}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
