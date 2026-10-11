import { RotateCcw } from 'lucide-react';
import { useLang } from '../i18n/strings';
import type { CategoryView, EntryFilters } from '../lib/api';

interface Props {
  filters: EntryFilters;
  categories: CategoryView[];
  onChange: (f: EntryFilters) => void;
}

const inputCls =
  'w-full rounded-xl border border-[var(--cream-200)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent-500)]';

// Computed once at module load — the year list doesn't change during a session.
const YEARS: number[] = (() => {
  const ys: number[] = [];
  const cy = new Date().getFullYear();
  for (let y = cy + 1; y >= 1990; y--) ys.push(y);
  return ys;
})();

export function SearchFilters({ filters, categories, onChange }: Props) {
  const { t, lang } = useLang();
  const years = YEARS;

  const set = (patch: Partial<EntryFilters>) => onChange({ ...filters, page: 1, ...patch });
  const hasActive =
    filters.category || filters.year || filters.month || filters.from || filters.to ||
    filters.rating || filters.hasPhotos;

  return (
    <div className="rounded-2xl border border-[var(--cream-200)] bg-[var(--paper)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('search.filters')}</h3>
        {hasActive && (
          <button
            type="button"
            onClick={() => onChange({ search: filters.search, page: 1, per_page: filters.per_page, sort: filters.sort })}
            className="inline-flex items-center gap-1 text-xs text-[var(--accent-600)] hover:underline"
          >
            <RotateCcw size={12} aria-hidden />
            {t('search.clearFilters')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs opacity-60">{t('search.category')}</span>
          <select
            value={filters.category ?? ''}
            onChange={(e) => set({ category: e.target.value || undefined })}
            className={inputCls}
          >
            <option value="">{t('common.all')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs opacity-60">{t('search.year')}</span>
          <select
            value={filters.year ?? ''}
            onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : undefined })}
            className={inputCls}
          >
            <option value="">{t('common.all')}</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs opacity-60">{t('search.month')}</span>
          <select
            value={filters.month ?? ''}
            onChange={(e) => set({ month: e.target.value ? Number(e.target.value) : undefined })}
            className={inputCls}
          >
            <option value="">{t('common.all')}</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', { month: 'long' }).format(new Date(2026, i, 1))}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs opacity-60">{t('search.from')}</span>
          <input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => set({ from: e.target.value || undefined })}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs opacity-60">{t('search.to')}</span>
          <input
            type="date"
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(e) => set({ to: e.target.value || undefined })}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs opacity-60">{t('search.rating')}</span>
          <select
            value={filters.rating ?? ''}
            onChange={(e) => set({ rating: e.target.value ? Number(e.target.value) : undefined })}
            className={inputCls}
          >
            <option value="">{t('common.all')}</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>≥ {r} ★</option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(filters.hasPhotos)}
          onChange={(e) => set({ hasPhotos: e.target.checked || undefined })}
          className="h-4 w-4 accent-[var(--accent-600)]"
        />
        {t('search.hasPhotos')}
      </label>
    </div>
  );
}
