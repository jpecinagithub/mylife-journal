import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileWarning, Trash2 } from 'lucide-react';
import { openDB } from 'idb';
import { useLang } from '../i18n/strings';
import { useEntry, useCreateEntry, useUpdateEntry, isNetworkError, type CreateEntryInput } from '../lib/api';
import { EntryForm, type DraftData, type EntryFormSubmit } from '../components/EntryForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Skeleton, EmptyState } from '../components/Feedback';

async function draftsDb() {
  return openDB('mylife-drafts', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts');
    },
  });
}

async function readDraft(key: string): Promise<DraftData | null> {
  try {
    const db = await draftsDb();
    return (await db.get('drafts', key)) ?? null;
  } catch {
    return null;
  }
}

async function writeDraft(key: string, draft: DraftData) {
  try {
    const db = await draftsDb();
    await db.put('drafts', draft, key);
  } catch {
    /* storage may be unavailable */
  }
}

async function deleteDraft(key: string) {
  try {
    const db = await draftsDb();
    await db.delete('drafts', key);
  } catch {
    /* ignore */
  }
}

/**
 * Entry editor (/new and /entry/:id/edit).
 * IndexedDB drafts: autosave every 2s, "borrador local" badge, restore
 * prompt on entry, discard on successful save. Offline save failure keeps
 * the draft and shows a pending state.
 */
export function EditorPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = id === undefined;
  const draftKey = isNew ? 'draft:new' : `draft:edit:${id}`;

  const entryQuery = useEntry(isNew ? undefined : id);
  const createMut = useCreateEntry();
  const updateMut = useUpdateEntry(id ?? '');

  const [draftChecked, setDraftChecked] = useState(false);
  const [storedDraft, setStoredDraft] = useState<DraftData | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [activeDraft, setActiveDraft] = useState<DraftData | null>(null);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const latestDraft = useRef<Omit<DraftData, 'savedAt'> | null>(null);

  const datePreset = isNew ? searchParams.get('date') ?? undefined : undefined;

  // Load any stored draft once (after the entry loads in edit mode)
  useEffect(() => {
    if (!isNew && entryQuery.isLoading) return;
    let cancelled = false;
    void readDraft(draftKey).then((d) => {
      if (cancelled) return;
      if (d) {
        setStoredDraft(d);
        setHasLocalDraft(true);
        setShowRestore(true);
      }
      setDraftChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey, isNew, entryQuery.isLoading]);

  // Autosave every 2s
  useEffect(() => {
    const id_ = window.setInterval(() => {
      const d = latestDraft.current;
      if (!d) return;
      const full: DraftData = { ...d, savedAt: Date.now() };
      void writeDraft(draftKey, full).then(() => setHasLocalDraft(true));
    }, 2000);
    return () => window.clearInterval(id_);
  }, [draftKey]);

  const submitting = createMut.isPending || updateMut.isPending;

  const handleSubmit = async ({ values, photos }: EntryFormSubmit) => {
    setPendingOffline(false);
    const body: CreateEntryInput = {
      event_date: values.event_date,
      title: values.title,
      description: values.description,
      category_id: values.category_id,
      rating: values.rating,
      location: values.location || null,
      tags: values.tags,
      photos: photos.map((p) => ({
        pathname: p.pathname,
        thumbnailPathname: p.thumbnailPathname,
        url: p.url ?? null,
        thumbnailUrl: p.thumbnailUrl ?? null,
        altText: p.altText,
        sortOrder: p.sortOrder,
      })),
    };
    try {
      if (isNew) {
        const created = await createMut.mutateAsync(body);
        await deleteDraft(draftKey);
        navigate(`/entry/${created.id}`, { replace: true });
      } else {
        await updateMut.mutateAsync(body);
        await deleteDraft(draftKey);
        navigate(`/entry/${id}`, { replace: true });
      }
    } catch (e) {
      if (isNetworkError(e)) setPendingOffline(true);
      throw e;
    }
  };

  const discardDraft = async () => {
    await deleteDraft(draftKey);
    latestDraft.current = null;
    setActiveDraft(null);
    setStoredDraft(null);
    setHasLocalDraft(false);
    setFormKey((k) => k + 1);
  };

  if (!isNew && (entryQuery.isLoading || !draftChecked)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isNew && !draftChecked) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!isNew && (entryQuery.isError || !entryQuery.data)) {
    return <EmptyState title={t('error.notFound')} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft size={16} aria-hidden />
          {t('common.back')}
        </button>
        {hasLocalDraft && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            <FileWarning size={13} aria-hidden />
            {t('editor.draft')}
          </span>
        )}
      </div>

      <h1 className="font-display text-2xl">{isNew ? t('editor.new') : t('editor.edit')}</h1>

      <EntryForm
        key={formKey}
        entry={entryQuery.data}
        draft={activeDraft}
        initialDate={datePreset}
        submitting={submitting}
        pendingOffline={pendingOffline}
        onSubmit={handleSubmit}
        onDraftChange={(d) => {
          latestDraft.current = d;
        }}
      />

      {hasLocalDraft && (
        <button
          type="button"
          onClick={() => void discardDraft()}
          className="inline-flex items-center gap-1.5 text-sm text-red-700 opacity-80 hover:opacity-100 dark:text-red-300"
        >
          <Trash2 size={15} aria-hidden />
          {t('editor.discard')}
        </button>
      )}

      <ConfirmDialog
        open={showRestore}
        title={t('editor.restoreTitle')}
        body={t('editor.restoreBody')}
        confirmLabel={t('editor.restore')}
        cancelLabel={t('editor.startFresh')}
        onConfirm={() => {
          setActiveDraft(storedDraft);
          setShowRestore(false);
          setFormKey((k) => k + 1);
        }}
        onClose={() => {
          setShowRestore(false);
          void discardDraft();
        }}
      />
    </div>
  );
}
