import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useCalendar, isNetworkError } from '../lib/api';
import { addMonths, formatMonthYear, todayYMD } from '../lib/dates';
import { CalendarMonth } from '../components/CalendarMonth';
import { EmptyState, Skeleton } from '../components/Feedback';

export function CalendarPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const today = todayYMD();
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const { data, isLoading, isError, error, refetch } = useCalendar(ym.y, ym.m);

  const shift = (delta: number) => {
    const n = addMonths(ym.y, ym.m, delta);
    setYm(n);
  };

  const years: number[] = [];
  const cy = Number(today.slice(0, 4));
  for (let y = cy + 1; y >= 1990; y--) years.push(y);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl">{t('calendar.title')}</h1>
        <button
          type="button"
          onClick={() => setYm({ y: cy, m: Number(today.slice(5, 7)) })}
          className="rounded-xl border border-[var(--cream-200)] px-3 py-1.5 text-sm hover:bg-[var(--cream-100)]"
        >
          {t('common.today')}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="previous month"
          className="rounded-xl border border-[var(--cream-200)] p-2 hover:bg-[var(--cream-100)]"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <select
            value={ym.m}
            onChange={(e) => setYm({ y: ym.y, m: Number(e.target.value) })}
            aria-label={t('search.month')}
            className="rounded-xl border border-[var(--cream-200)] bg-transparent px-2 py-1.5 text-sm font-medium capitalize"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', { month: 'long' }).format(new Date(2026, i, 1))}
              </option>
            ))}
          </select>
          <select
            value={ym.y}
            onChange={(e) => setYm({ y: Number(e.target.value), m: ym.m })}
            aria-label={t('search.year')}
            className="rounded-xl border border-[var(--cream-200)] bg-transparent px-2 py-1.5 text-sm font-medium"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="next month"
          className="rounded-xl border border-[var(--cream-200)] p-2 hover:bg-[var(--cream-100)]"
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      <p className="font-display text-lg capitalize opacity-80">{formatMonthYear(ym.y, ym.m, lang)}</p>

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : isError ? (
        <EmptyState
          title={isNetworkError(error) ? t('offline.title') : t('error.generic')}
          body={t('offline.message')}
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
      ) : (
        <CalendarMonth
          year={ym.y}
          month={ym.m}
          days={data?.days ?? []}
          onSelectDay={(date) => navigate(`/day/${date}`)}
        />
      )}
    </div>
  );
}
