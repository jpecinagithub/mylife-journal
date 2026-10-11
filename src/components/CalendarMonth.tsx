import { useLang } from '../i18n/strings';
import { WEEKDAY_LABELS, formatLong, monthGrid, parseYMD } from '../lib/dates';
import type { CalendarDay } from '../lib/api';

interface Props {
  year: number;
  month: number;
  /** Per-day entry data (preferred). */
  days?: CalendarDay[];
  /** Legacy/contract-test shorthand: dates that count as "active". */
  activeDays?: string[];
  selectedDate?: string;
  onSelectDay?: (date: string) => void;
}

/**
 * Month calendar grid, weeks starting MONDAY.
 * - today gets a ring, selected day a filled background
 * - per-day category dots (max 3 + "+n"); `activeDays` marks days with a dot
 * - arrow keys move between days (roving focus via data-date)
 */
export function CalendarMonth({ year, month, days = [], activeDays = [], selectedDate, onSelectDay }: Props) {
  const { t, lang } = useLang();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weeks = monthGrid(year, month);

  const focusDay = (from: string, delta: number) => {
    try {
      const { y, m, d } = parseYMD(from);
      const dt = new Date(Date.UTC(y, m - 1, d + delta));
      const target = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
      document.querySelector<HTMLButtonElement>(`[data-day="${target}"]`)?.focus();
    } catch {
      /* ignore */
    }
  };

  return (
    <div aria-label={t('calendar.title')} className="select-none">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS[lang].map((w) => (
          <div key={w} className="py-1 text-center text-xs font-semibold uppercase opacity-50">
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map((cell) => {
            const info = byDate.get(cell.date);
            const count = info?.count ?? 0;
            const cats = info?.categories ?? [];
            const shown = cats.slice(0, 3);
            const extra = cats.length - shown.length;
            const selected = selectedDate === cell.date;
            const active = count > 0 || activeDays.includes(cell.date);
            return (
              <button
                key={cell.date}
                type="button"
                data-day={cell.date}
                data-active={active || undefined}
                aria-selected={selected}
                aria-label={t('a11y.dayCell', { date: formatLong(cell.date, lang), count })}
                onClick={() => onSelectDay?.(cell.date)}
                onKeyDown={(e) => {
                  const map: Record<string, number> = {
                    ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
                  };
                  const delta = map[e.key];
                  if (delta !== undefined) {
                    e.preventDefault();
                    focusDay(cell.date, delta);
                  }
                }}
                className={`flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-xl px-1 py-1.5 text-sm transition sm:min-h-16 ${
                  selected
                    ? 'bg-[var(--accent-600)] font-semibold text-white'
                    : cell.isToday
                      ? 'ring-2 ring-[var(--accent-500)]'
                      : 'hover:bg-[var(--cream-100)]'
                } ${cell.inMonth ? '' : 'opacity-35'}`}
              >
                <span className={cell.isToday && !selected ? 'font-bold text-[var(--accent-600)]' : ''}>
                  {Number(cell.date.slice(8, 10))}
                </span>
                {active && (
                  <span className="flex items-center gap-0.5" aria-hidden>
                    {shown.map((c) => (
                      <span
                        key={c.slug}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                    {shown.length === 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-500)]" />
                    )}
                    {extra > 0 && (
                      <span className={`text-[9px] leading-none ${selected ? 'text-white/90' : 'opacity-60'}`}>
                        +{extra}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
