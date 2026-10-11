import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Layers } from 'lucide-react';
import { useLang } from '../i18n/strings';
import {
  apiFetch, entriesSearchParams, normalizePaginated, useCategories,
  isNetworkError, type EntryDTO,
} from '../lib/api';
import { formatMonthYear } from '../lib/dates';
import { EntryCard } from '../components/EntryCard';
import { CardSkeleton, EmptyState } from '../components/Feedback';
import { CategoryBadge } from '../components/CategoryBadge';

const PER_PAGE = 20;

function groupByMonth(items: EntryDTO[]): { key: string; items: EntryDTO[] }[] {
  const map = new Map<string, EntryDTO[]>();
  for (const e of items) {
    const k = e.event_date.slice(0, 7);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

/** Full journal timeline: infinite scroll, sort toggle, month grouping, category chips. */
export function TimelinePage() {
  const { t, lang } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  const [grouped, setGrouped] = useState(true);
  const [catSlug, setCatSlug] = useState<string | undefined>(searchParams.get('category') ?? undefined);
  const { data: categories } = useCategories();

  const pickCategory = (slug: string | undefined) => {
    setCatSlug(slug);
    setSearchParams(slug ? { category: slug } : {}, { replace: true });
  };

  const query = useInfiniteQuery({
    queryKey: ['entries', { category: catSlug, sort, per_page: PER_PAGE, infinite: true }],
    queryFn: ({ pageParam }) =>
      apiFetch<unknown>(`/api/entries?${entriesSearchParams({ category: catSlug, sort, per_page: PER_PAGE, page: pageParam })}`)
        .then(normalizePaginated<EntryDTO>),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
    retry: 1,
  });

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl">
          {t('timeline.title')}
          {total > 0 && <span className="ml-2 text-base opacity-50">{total}</span>}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSort((s) => (s === 'desc' ? 'asc' : 'desc'))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--cream-200)] px-3 py-1.5 text-sm hover:bg-[var(--cream-100)]"
            aria-pressed={sort === 'asc'}
          >
            {sort === 'desc' ? <ArrowDownWideNarrow size={16} aria-hidden /> : <ArrowUpNarrowWide size={16} aria-hidden />}
            {sort === 'desc' ? t('timeline.newest') : t('timeline.oldest')}
          </button>
          <button
            type="button"
            onClick={() => setGrouped((g) => !g)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm ${
              grouped ? 'border-[var(--accent-500)] bg-[var(--accent-600)]/10' : 'border-[var(--cream-200)] hover:bg-[var(--cream-100)]'
            }`}
            aria-pressed={grouped}
          >
            <Layers size={16} aria-hidden />
            {t('timeline.groupByMonth')}
          </button>
        </div>
      </div>

      {(categories?.length ?? 0) > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t('timeline.filter.category')}>
          <button
            type="button"
            onClick={() => pickCategory(undefined)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              !catSlug ? 'bg-[var(--accent-600)] text-white' : 'border border-[var(--cream-200)] hover:bg-[var(--cream-100)]'
            }`}
          >
            {t('common.all')}
          </button>
          {categories!.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pickCategory(catSlug === c.slug ? undefined : c.slug)}
              className={`shrink-0 rounded-full px-1 py-0.5 ${catSlug === c.slug ? 'ring-2 ring-[var(--accent-500)]' : 'opacity-90 hover:opacity-100'}`}
              aria-pressed={catSlug === c.slug}
            >
              <CategoryBadge category={c} size="sm" />
            </button>
          ))}
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : query.isError ? (
        <EmptyState
          title={isNetworkError(query.error) ? t('offline.title') : t('error.generic')}
          body={t('offline.message')}
          action={
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-xl bg-[var(--accent-600)] px-4 py-2 text-sm font-medium text-white"
            >
              {t('common.retry')}
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState title={t('timeline.empty.title')} body={t('timeline.empty.body')} />
      ) : grouped ? (
        <div className="space-y-6">
          {groupByMonth(items).map((g) => {
            const [y, m] = g.key.split('-').map(Number);
            return (
              <section key={g.key}>
                <h2 className="font-display mb-2 text-lg capitalize opacity-80">
                  {formatMonthYear(y, m, lang)}
                </h2>
                <div className="space-y-3">
                  {g.items.map((e) => (
                    <EntryCard key={e.id} entry={e} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden className="h-1" />
      {query.isFetchingNextPage && (
        <div className="space-y-3">
          <CardSkeleton />
        </div>
      )}
      {!query.hasNextPage && items.length > 0 && (
        <p className="py-6 text-center text-sm opacity-50">{t('timeline.end')}</p>
      )}
    </div>
  );
}
