import { Link } from 'react-router-dom';
import { MapPin, Star, Images } from 'lucide-react';
import type { EntryDTO } from '../lib/api';
import { photoThumbSrc } from '../lib/api';
import { useLang } from '../i18n/strings';
import { formatShort, relativeDay } from '../lib/dates';
import { CategoryBadge } from './CategoryBadge';

function excerpt(text: string, max = 140): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

/** Card for an entry in lists (timeline, search, day, dashboard). */
export function EntryCard({ entry }: { entry: EntryDTO }) {
  const { t, lang } = useLang();
  const first = entry.photos[0];
  const rel = relativeDay(entry.event_date, lang);

  return (
    <Link
      to={`/entry/${entry.id}`}
      className="group flex gap-3 rounded-2xl border border-[var(--cream-200)] bg-[var(--paper)] p-3 shadow-sm transition hover:shadow-md sm:gap-4 sm:p-4"
    >
      {first ? (
        <img
          src={photoThumbSrc(first)}
          alt={first.alt_text ?? ''}
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-24 sm:w-24"
        />
      ) : (
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl sm:h-24 sm:w-24"
          style={{ backgroundColor: `${entry.category.color}22` }}
          aria-hidden
        >
          <span className="font-display text-2xl" style={{ color: entry.category.color }}>
            {entry.title.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs opacity-60">
          <time dateTime={entry.event_date}>{formatShort(entry.event_date, lang)}</time>
          {rel && <span className="font-medium text-[var(--accent-600)]">· {rel}</span>}
        </div>
        <h3 className="font-display mt-0.5 truncate text-lg leading-snug group-hover:underline">
          {entry.title}
        </h3>
        {entry.description && (
          <p className="mt-1 line-clamp-2 text-sm opacity-70">{excerpt(entry.description)}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CategoryBadge category={entry.category} size="sm" />
          {entry.rating !== null && (
            <span className="inline-flex items-center gap-1 text-xs opacity-70">
              <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden />
              {entry.rating}/5
            </span>
          )}
          {entry.location && (
            <span className="inline-flex items-center gap-1 text-xs opacity-70">
              <MapPin size={12} aria-hidden />
              <span className="max-w-28 truncate">{entry.location}</span>
            </span>
          )}
          {entry.photos.length > 1 && (
            <span className="inline-flex items-center gap-1 text-xs opacity-70">
              <Images size={12} aria-hidden />
              {entry.photos.length} {t('common.photos')}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
