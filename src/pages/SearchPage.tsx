import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useEntries, useCategories, isNetworkError, type EntryFilters } from '../lib/api';
import { EntryCard } from '../components/EntryCard';
import { SearchFilters } from '../components/SearchFilters';
import { CardSkeleton, EmptyState } from '../components/Feedback';

/** Full-text search + filters, server-side via useEntries. */
export function SearchPage() {
  const { t } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const tagParam = searchParams.get('tag') ?? '';

  const [query, setQuery] = useState(tagParam);
  const [debounced, setDebounced] = useState(tagParam);
  const [filters, setFilters] = useState<EntryFilters>({ per_page: 20, sort: 'desc' });

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(id);
  }, [query]);

  // consume the ?tag= param once
  useEffect(() => {
    if (tagParam) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: categories } = useCategories();
  const activeFilters: EntryFilters = useMemo(
    () => ({ ...filters, search: debounced || undefined }),
    [filters, debounced],
  );
  const hasQuery =
    debounced.length > 0 ||
    Boolean(filters.category || filters.year || filters.month || filters.from || filters.to || filters.rating || filters.hasPhotos);

  const results = useEntries(activeFilters, { enabled: hasQuery });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">{t('search.title')}</h1>

      <div className="relative">
        <SearchIcon size={18} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.title')}
          autoFocus
          className="w-full rounded-2xl border border-[var(--cream-200)] bg-[var(--paper)] py-3 pl-10 pr-10 text-base shadow-sm outline-none focus:border-[var(--accent-500)] focus:ring-2 focus:ring-[var(--accent-500)]/20"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('common.close')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 opacity-60 hover:opacity-100"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      <SearchFilters filters={filters} categories={categories ?? []} onChange={setFilters} />

      {!hasQuery ? (
        <EmptyState title={t('search.hint')} />
      ) : results.isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : results.isError ? (
        <EmptyState
          title={isNetworkError(results.error) ? t('offline.title') : t('error.generic')}
          action={
            <button
              type="button"
              onClick={() => void results.refetch()}
              className="rounded-xl bg-[var(--accent-600)] px-4 py-2 text-sm font-medium text-white"
            >
              {t('common.retry')}
            </button>
          }
        />
      ) : (
        <>
          <p className="text-sm opacity-60">
            {results.data!.total === 1 ? t('search.oneResult') : `${results.data!.total} ${t('search.results')}`}
          </p>
          {results.data!.total === 0 ? (
            <EmptyState title={t('search.noResults')} body={t('search.noResultsBody')} />
          ) : (
            <div className="space-y-3">
              {results.data!.items.map((e) => (
                <EntryCard key={e.id} entry={e} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
