import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, MapPin, Star, CalendarDays } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useEntry, useDeleteEntry, photoSrc, photoThumbSrc, isNetworkError, type PhotoView } from '../lib/api';
import { formatLong } from '../lib/dates';
import { CategoryBadge } from '../components/CategoryBadge';
import { Lightbox } from '../components/Lightbox';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Skeleton, EmptyState } from '../components/Feedback';

/** Full entry detail: gallery + lightbox, edit/delete, back navigation. */
export function EntryPage() {
  const { t, lang } = useLang();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: entry, isLoading, isError, error, refetch } = useEntry(id);
  const del = useDeleteEntry();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !entry) {
    return (
      <EmptyState
        title={isNetworkError(error) ? t('offline.title') : t('error.notFound')}
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
    );
  }

  const photos = entry.photos as PhotoView[];
  const backTo = `/day/${entry.event_date}`;

  const doDelete = async () => {
    try {
      await del.mutateAsync(entry.id);
      setConfirmDelete(false);
      navigate(backTo, { replace: true });
    } catch {
      /* error surfaces via del.error below */
    }
  };

  return (
    <article className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft size={16} aria-hidden />
          {t('entry.backToCalendar')}
        </button>
        <div className="flex items-center gap-1">
          <Link
            to={`/entry/${entry.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--cream-200)] px-3 py-1.5 text-sm hover:bg-[var(--cream-100)]"
          >
            <Pencil size={15} aria-hidden />
            {t('common.edit')}
          </Link>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-900/20"
          >
            <Trash2 size={15} aria-hidden />
            {t('common.delete')}
          </button>
        </div>
      </div>

      <header>
        <div className="flex flex-wrap items-center gap-2 text-sm opacity-60">
          <CalendarDays size={14} aria-hidden />
          <time dateTime={entry.event_date} className="capitalize">{formatLong(entry.event_date, lang)}</time>
        </div>
        <h1 className="font-display mt-1 text-3xl leading-tight">{entry.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CategoryBadge category={entry.category} />
          {entry.rating !== null && (
            <span className="inline-flex items-center gap-1 text-sm">
              <Star size={14} className="fill-amber-400 text-amber-400" aria-hidden />
              {entry.rating}/5
            </span>
          )}
          {entry.location && (
            <span className="inline-flex items-center gap-1 text-sm opacity-70">
              <MapPin size={14} aria-hidden />
              {entry.location}
            </span>
          )}
        </div>
        {entry.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <Link
                key={tag}
                to={`/search?tag=${encodeURIComponent(tag)}`}
                className="rounded-full bg-[var(--cream-100)] px-2.5 py-0.5 text-xs hover:underline"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </header>

      {photos.length > 0 && (
        <div className={`grid gap-2 ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setLightbox(i)}
              className={`overflow-hidden rounded-2xl ${photos.length === 1 ? 'aspect-[16/10]' : 'aspect-square'}`}
            >
              <img
                src={photoThumbSrc(p)}
                alt={p.alt_text ?? ''}
                loading="lazy"
                className="h-full w-full object-cover transition hover:scale-[1.02]"
              />
            </button>
          ))}
        </div>
      )}

      {entry.description && (
        <div className="prose-journal whitespace-pre-line text-[1.05rem] leading-relaxed">
          {entry.description}
        </div>
      )}

      {del.isError && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
          {t('error.generic')}
        </p>
      )}

      <p className="text-xs opacity-40">
        {t('entry.created')}{' '}
        {new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(entry.created_at))}
      </p>

      {lightbox !== null && (
        <Lightbox
          images={photos.map(photoSrc)}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t('entry.deleteTitle')}
        body={t('entry.deleteBody', { title: entry.title })}
        danger
        busy={del.isPending}
        confirmLabel={t('common.delete')}
        onConfirm={() => void doDelete()}
        onClose={() => setConfirmDelete(false)}
      />
    </article>
  );
}
