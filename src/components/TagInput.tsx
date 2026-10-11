import { useState } from 'react';
import { X } from 'lucide-react';
import { useLang } from '../i18n/strings';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: { name: string }[];
}

/** Free-text tag input: Enter/comma adds, chips removable. */
export function TagInput({ value, onChange, suggestions = [] }: Props) {
  const { t } = useLang();
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#+/, '').slice(0, 40);
    if (!tag) return;
    if (!value.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      onChange([...value, tag]);
    }
    setDraft('');
  };

  const shown = suggestions.filter(
    (s) => draft && s.name.toLowerCase().startsWith(draft.toLowerCase()) && !value.includes(s.name),
  ).slice(0, 5);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--cream-100)] px-2.5 py-1 text-xs"
          >
            #{tag}
            <button
              type="button"
              aria-label={`${t('common.delete')} ${tag}`}
              onClick={() => onChange(value.filter((v) => v !== tag))}
              className="opacity-60 hover:opacity-100"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={t('editor.tagsPlaceholder')}
        className="mt-2 w-full rounded-xl border border-[var(--cream-200)] bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-[var(--accent-500)]"
        aria-label={t('editor.tags')}
      />
      {shown.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {shown.map((s) => (
            <button
              key={s.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s.name)}
              className="rounded-full border border-[var(--cream-200)] px-2 py-0.5 text-xs opacity-70 hover:opacity-100"
            >
              #{s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
