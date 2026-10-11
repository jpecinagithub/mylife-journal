import { Star } from 'lucide-react';
import { useLang } from '../i18n/strings';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  size?: number;
  label?: string;
}

/** 1–5 star rating; clicking the active star clears it. */
export function StarRating({ value, onChange, size = 22, label }: Props) {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label ?? 'rating'}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t('a11y.rate', { n })}
            title={t('a11y.rate', { n })}
            onClick={() => onChange(value === n ? null : n)}
            className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Star
              size={size}
              className={active ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-[var(--ink-500)]'}
              aria-hidden
            />
          </button>
        );
      })}
      {value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={t('a11y.clearRating')}
          className="ml-1 text-xs underline opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
