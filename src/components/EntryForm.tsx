import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, CloudOff } from 'lucide-react';
import { dateStringSchema } from '../../server/lib/validate';
import type { EntryDTO } from '../lib/api';
import { useCategories } from '../lib/api';
import { photoThumbSrc } from '../lib/api';
import { useLang } from '../i18n/strings';
import { todayYMD } from '../lib/dates';
import { StarRating } from './StarRating';
import { TagInput } from './TagInput';
import { ImagePicker, type PickedPhoto } from './ImagePicker';

const formSchema = z.object({
  event_date: dateStringSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000),
  category_id: z.string().min(1),
  rating: z.number().int().min(1).max(5).nullable(),
  location: z.string().max(200),
  tags: z.array(z.string().min(1).max(40)).max(20),
});

export type EntryFormValues = z.infer<typeof formSchema>;

export interface PhotoPayload {
  pathname: string;
  thumbnailPathname: string | null;
  url?: string;
  thumbnailUrl?: string | null;
  altText: string | null;
  sortOrder: number;
}

export interface EntryFormSubmit {
  values: EntryFormValues;
  photos: PhotoPayload[];
}

export interface DraftData {
  values: EntryFormValues;
  photos: {
    pathname: string;
    thumbnailPathname: string | null;
    url?: string;
    thumbnailUrl?: string | null;
    altText: string | null;
  }[];
  savedAt: number;
}

interface Props {
  entry?: EntryDTO;
  draft?: DraftData | null;
  /** date preset for a brand-new entry (e.g. from /new?date=…); ignored when entry/draft exist */
  initialDate?: string;
  submitting: boolean;
  pendingOffline: boolean;
  onSubmit: (data: EntryFormSubmit) => Promise<void> | void;
  /** called with serializable draft state on every change (parent persists) */
  onDraftChange?: (draft: Omit<DraftData, 'savedAt'>) => void;
}

const inputCls =
  'w-full rounded-xl border border-[var(--cream-200)] bg-transparent px-3 py-2.5 text-base outline-none placeholder:opacity-50 focus:border-[var(--accent-500)] focus:ring-2 focus:ring-[var(--accent-500)]/20';

export function EntryForm({ entry, draft, initialDate, submitting, pendingOffline, onSubmit, onDraftChange }: Props) {
  const { t } = useLang();
  const { data: categories } = useCategories();

  const defaultValues: EntryFormValues = useMemo(
    () =>
      draft?.values ?? {
        event_date: entry?.event_date ?? initialDate ?? todayYMD(),
        title: entry?.title ?? '',
        description: entry?.description ?? '',
        category_id: entry?.category.id ?? '',
        rating: entry?.rating ?? null,
        location: entry?.location ?? '',
        tags: entry?.tags ?? [],
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry?.id, draft],
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<EntryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const initialPhotos: PickedPhoto[] = useMemo(() => {
    if (draft?.photos) {
      return draft.photos.map((p, i) => ({
        key: `draft-${i}-${p.pathname}`,
        pathname: p.pathname,
        thumbnailPathname: p.thumbnailPathname,
        url: p.url,
        thumbnailUrl: p.thumbnailUrl ?? null,
        altText: p.altText,
        uploading: false,
      }));
    }
    return (entry?.photos ?? []).map((p) => ({
      key: `saved-${p.id}`,
      id: p.id,
      pathname: p.blob_pathname,
      thumbnailPathname: p.thumbnail_pathname,
      url: (p as { url?: string }).url ?? undefined,
      thumbnailUrl: (p as { thumbnail_url?: string }).thumbnail_url ?? undefined,
      altText: p.alt_text,
      uploading: false,
    }));
  }, [entry?.id, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const [photos, setPhotos] = useState<PickedPhoto[]>(initialPhotos);

  const values = watch();

  // notify parent of draftable state
  useEffect(() => {
    if (!onDraftChange) return;
    const ready = photos.filter((p) => !p.uploading && p.pathname && !p.error);
    onDraftChange({
      values,
      photos: ready.map((p) => ({
        pathname: p.pathname!,
        thumbnailPathname: p.thumbnailPathname ?? null,
        url: p.url,
        thumbnailUrl: p.thumbnailUrl ?? null,
        altText: p.altText ?? null,
      })),
    });
  }, [values, photos, onDraftChange]);

  const anyUploading = photos.some((p) => p.uploading);

  const submit = handleSubmit(async (vals) => {
    const payload: PhotoPayload[] = photos
      .filter((p) => !p.uploading && p.pathname && !p.error)
      .map((p, i) => ({
        pathname: p.pathname!,
        thumbnailPathname: p.thumbnailPathname ?? null,
        url: p.url,
        thumbnailUrl: p.thumbnailUrl ?? null,
        altText: p.altText ?? null,
        sortOrder: i,
      }));
    await onSubmit({ values: vals, photos: payload });
  });

  void isDirty;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="ef-date" className="mb-1 block text-sm font-medium">
            {t('editor.date')}
          </label>
          <input id="ef-date" type="date" {...register('event_date')} className={inputCls} />
          {errors.event_date && <FieldError msg={String(errors.event_date.message)} />}
        </div>
        <div>
          <label htmlFor="ef-category" className="mb-1 block text-sm font-medium">
            {t('editor.category')}
          </label>
          <select id="ef-category" {...register('category_id')} className={inputCls}>
            <option value="">{t('editor.categoryPlaceholder')}</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.category_id && <FieldError msg={t('editor.validation.category')} />}
        </div>
      </div>

      <div>
        <label htmlFor="ef-title" className="mb-1 block text-sm font-medium">
          {t('editor.title')}
        </label>
        <input
          id="ef-title"
          {...register('title')}
          placeholder={t('editor.titlePlaceholder')}
          className={`${inputCls} font-display text-lg`}
          maxLength={200}
        />
        {errors.title && <FieldError msg={t('editor.validation.title')} />}
      </div>

      <div>
        <label htmlFor="ef-desc" className="mb-1 block text-sm font-medium">
          {t('editor.description')}
        </label>
        <textarea
          id="ef-desc"
          {...register('description')}
          placeholder={t('editor.descriptionPlaceholder')}
          rows={6}
          maxLength={20000}
          className={`${inputCls} resize-y`}
        />
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium">{t('editor.photos')}</span>
        <ImagePicker value={photos} onChange={setPhotos} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-sm font-medium">{t('editor.rating')}</span>
          <Controller
            name="rating"
            control={control}
            render={({ field }) => <StarRating value={field.value} onChange={field.onChange} />}
          />
        </div>
        <div>
          <label htmlFor="ef-loc" className="mb-1 block text-sm font-medium">
            {t('editor.location')} <span className="opacity-50">({t('common.optional')})</span>
          </label>
          <input
            id="ef-loc"
            {...register('location')}
            placeholder={t('editor.locationPlaceholder')}
            className={inputCls}
            maxLength={200}
          />
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium">{t('editor.tags')}</span>
        <Controller
          name="tags"
          control={control}
          render={({ field }) => <TagInput value={field.value} onChange={field.onChange} />}
        />
      </div>

      {pendingOffline && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          <CloudOff size={16} aria-hidden />
          {t('editor.offlinePending')}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || anyUploading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-600)] px-6 py-3 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        <Save size={18} aria-hidden />
        {submitting ? t('common.saving') : anyUploading ? t('photos.uploading') : t('editor.saveEntry')}
      </button>
    </form>
  );
}

function FieldError({ msg }: { msg: string }) {
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{msg}</p>;
}

// Re-exported for EntryPage gallery thumbnails
export { photoThumbSrc };
