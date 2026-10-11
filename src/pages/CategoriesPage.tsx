import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { categorySchema } from '../../server/lib/validate';
import { z } from 'zod';
import { useLang } from '../i18n/strings';
import {
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  categoryCount, ApiError, type CategoryView,
} from '../lib/api';
import { CategoryIcon } from '../components/CategoryIcon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Skeleton, EmptyState } from '../components/Feedback';

const formSchema = categorySchema.extend({
  sort_order: z.number().int().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const ICON_CHOICES = [
  'tag', 'book', 'film', 'plane', 'music', 'camera', 'heart', 'star', 'briefcase',
  'coffee', 'home', 'car', 'map-pin', 'users', 'gift', 'dumbbell', 'palette',
  'food', 'moon', 'sun', 'sparkles', 'game', 'baby', 'study', 'nature', 'sea',
  'mountain', 'church', 'pet', 'shopping', 'event',
];

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Category management: grid with counts, create/rename/reorder/delete (with reassign). */
export function CategoriesPage() {
  const { t } = useLang();
  const { data: categories, isLoading, isError, refetch } = useCategories();
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const deleteMut = useDeleteCategory();

  const [editing, setEditing] = useState<CategoryView | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<CategoryView | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', slug: '', color: '#a5854f', icon: 'tag' },
  });
  const iconWatch = watch('icon');

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', slug: '', color: '#a5854f', icon: 'tag' });
    setFormError(null);
    setShowForm(true);
  };
  const openEdit = (c: CategoryView) => {
    setEditing(c);
    reset({ name: c.name, slug: c.slug, color: c.color, icon: c.icon, sort_order: c.sort_order });
    setFormError(null);
    setShowForm(true);
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...v });
      } else {
        const maxOrder = Math.max(0, ...(categories ?? []).map((c) => c.sort_order));
        await createMut.mutateAsync({ ...v, sort_order: maxOrder + 1 });
      }
      setShowForm(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('error.generic'));
    }
  });

  const move = async (c: CategoryView, delta: -1 | 1) => {
    const sorted = [...(categories ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const i = sorted.findIndex((x) => x.id === c.id);
    const j = i + delta;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    await updateMut.mutateAsync({ id: c.id, sort_order: other.sort_order });
    await updateMut.mutateAsync({ id: other.id, sort_order: c.sort_order });
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync({ id: deleting.id, reassignTo: reassignTo || undefined });
      setDeleting(null);
      setReassignTo('');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'category_in_use' && !reassignTo) {
        // keep dialog open so the user picks a reassignment target
      } else {
        setDeleting(null);
      }
    }
  };

  const sorted = [...(categories ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">{t('categories.title')}</h1>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-600)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus size={16} aria-hidden />
          {t('categories.new')}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title={t('error.generic')}
          action={
            <button type="button" onClick={() => void refetch()} className="rounded-xl bg-[var(--accent-600)] px-4 py-2 text-sm font-medium text-white">
              {t('common.retry')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sorted.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-[var(--cream-200)] p-3 shadow-sm">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: c.color }}
              >
                <CategoryIcon icon={c.icon} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.name}</div>
                <div className="text-xs opacity-60">
                  {categoryCount(c)} {t('categories.entries')}
                </div>
              </div>
              <div className="flex flex-col">
                <button type="button" onClick={() => void move(c, -1)} disabled={i === 0} aria-label="move up" className="p-1 opacity-60 hover:opacity-100 disabled:opacity-20">
                  <ChevronUp size={14} aria-hidden />
                </button>
                <button type="button" onClick={() => void move(c, 1)} disabled={i === sorted.length - 1} aria-label="move down" className="p-1 opacity-60 hover:opacity-100 disabled:opacity-20">
                  <ChevronDown size={14} aria-hidden />
                </button>
              </div>
              <Link
                to={`/timeline?category=${encodeURIComponent(c.slug)}`}
                aria-label={t('categories.viewEntries')}
                className="rounded-lg p-1.5 opacity-60 hover:bg-[var(--cream-100)] hover:opacity-100"
              >
                <ArrowRight size={16} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => openEdit(c)}
                aria-label={`${t('common.edit')} ${c.name}`}
                className="rounded-lg p-1.5 opacity-60 hover:bg-[var(--cream-100)] hover:opacity-100"
              >
                <Pencil size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => { setDeleting(c); setReassignTo(''); }}
                aria-label={`${t('common.delete')} ${c.name}`}
                className="rounded-lg p-1.5 text-red-700 opacity-60 hover:bg-red-50 hover:opacity-100 dark:text-red-300"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* create / edit form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setShowForm(false)}>
          <form
            onSubmit={onSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl bg-[var(--paper)] p-6 shadow-xl"
          >
            <h2 className="font-display text-xl">{editing ? t('categories.edit') : t('categories.new')}</h2>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('categories.name')}</label>
              <input
                {...register('name')}
                placeholder={t('categories.namePlaceholder')}
                onChange={(e) => {
                  setValue('name', e.target.value);
                  if (!editing) setValue('slug', slugify(e.target.value));
                }}
                className="w-full rounded-xl border border-[var(--cream-200)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent-500)]"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{String(errors.name.message)}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('categories.slug')}</label>
                <input
                  {...register('slug')}
                  className="w-full rounded-xl border border-[var(--cream-200)] bg-transparent px-3 py-2 outline-none focus:border-[var(--accent-500)]"
                />
                {errors.slug && <p className="mt-1 text-xs text-red-600">{String(errors.slug.message)}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('categories.color')}</label>
                <input
                  type="color"
                  {...register('color')}
                  className="h-10 w-full cursor-pointer rounded-xl border border-[var(--cream-200)] bg-transparent"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('categories.icon')}</label>
              <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-xl border border-[var(--cream-200)] p-2">
                {ICON_CHOICES.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setValue('icon', ic)}
                    aria-label={ic}
                    aria-pressed={iconWatch === ic}
                    className={`flex aspect-square items-center justify-center rounded-lg ${iconWatch === ic ? 'bg-[var(--accent-600)] text-white' : 'hover:bg-[var(--cream-100)]'}`}
                  >
                    <CategoryIcon icon={ic} size={16} />
                  </button>
                ))}
              </div>
            </div>
            {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-[var(--cream-200)] px-4 py-2 text-sm">
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="rounded-xl bg-[var(--accent-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {editing ? t('common.save') : t('common.create')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* delete with reassign */}
      <ConfirmDialog
        open={deleting !== null}
        title={t('categories.deleteTitle', { name: deleting?.name ?? '' })}
        body={
          deleting && categoryCount(deleting) > 0 ? (
            <div className="space-y-2">
              <p>{t('categories.deleteBody', { count: categoryCount(deleting) })}</p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium">{t('categories.reassignTo')}</span>
                <select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  className="w-full rounded-xl border border-[var(--cream-200)] bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">{t('common.none')}</option>
                  {sorted.filter((c) => c.id !== deleting.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <p>{t('categories.deleteEmpty', { name: deleting?.name ?? '' })}</p>
          )
        }
        danger
        busy={deleteMut.isPending}
        confirmLabel={t('common.delete')}
        onConfirm={() => void doDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
