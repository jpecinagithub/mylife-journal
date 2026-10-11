import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload, FileUp, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ArrowRight, CalendarDays, Ban,
} from 'lucide-react';
import { useLang } from '../i18n/strings';
import { useCategories, useCreateCategory, previewImport, ApiError } from '../lib/api';
import { formatShort } from '../lib/dates';
import {
  detectFormat, parseFile, analyzeLocal, runImport,
  type NormalizedEntry, type SourceFolder, type ImportReport, type ImportFormat,
} from '@/lib/import';

type Phase = 'idle' | 'parsing' | 'preview' | 'running' | 'done';

const PALETTE = ['#a5854f', '#7d9b76', '#6b8cae', '#b0766a', '#8a6d9b', '#5f9e8f', '#c2a24d', '#96705a'];

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

interface PreviewState {
  fileName: string;
  format: ImportFormat;
  entries: NormalizedEntry[];
  folders: SourceFolder[];
  warnings: string[];
  total: number;
  withPhotos: number;
  photoCount: number;
  dateRange: { min: string; max: string } | null;
  folderCounts: Record<string, number>;
  duplicates: number | null;
  newCount: number | null;
  checkingDuplicates: boolean;
}

/** File import: detect → parse → preview + category mapping + duplicate check → run → report. */
export function ImportPage() {
  const { t, lang } = useLang();
  const { data: categories, refetch: refetchCats } = useCategories();
  const createCategory = useCreateCategory();

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ImportReport | null>(null);
  const [runProgress, setRunProgress] = useState({ done: 0, total: 0 });
  const [creating, setCreating] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase('idle');
    setProgress(0);
    setError(null);
    setPreview(null);
    setMapping({});
    setReport(null);
  };

  const handleFile = async (file: File) => {
    reset();
    setPhase('parsing');
    setError(null);
    try {
      const format = await detectFormat(file);
      if (format === 'unknown') {
        setError(t('import.unknown'));
        setPhase('idle');
        return;
      }
      const parsed = await parseFile(file, (pct) => setProgress(pct));
      const stats = analyzeLocal(parsed.entries);
      const pv: PreviewState = {
        fileName: file.name,
        format,
        entries: parsed.entries,
        folders: parsed.folders,
        warnings: parsed.warnings,
        total: stats.total,
        withPhotos: stats.withPhotos,
        photoCount: stats.photoCount,
        dateRange: stats.dateRange,
        folderCounts: stats.folderCounts,
        duplicates: null,
        newCount: null,
        checkingDuplicates: parsed.entries.length > 0,
      };
      setPreview(pv);
      setPhase('preview');

      // server-side duplicate check
      if (parsed.entries.length > 0) {
        try {
          const res = await previewImport(format, parsed.entries.map((e) => ({
            source_entry_id: e.sourceEntryId,
            event_date: e.eventDate,
            title: e.title,
          })));
          setPreview((p) =>
            p ? { ...p, duplicates: res.duplicates?.length ?? 0, newCount: res.newCount ?? p.total, checkingDuplicates: false } : p,
          );
        } catch {
          setPreview((p) => (p ? { ...p, checkingDuplicates: false } : p));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
      setPhase('idle');
    }
  };

  const defaultSlugFor = (hint: string | null): string | undefined => {
    const c = categories ?? [];
    if (!hint) return c[0]?.slug;
    const exact = c.find((x) => x.name.toLowerCase() === hint.toLowerCase() || x.slug === slugify(hint));
    return exact?.slug;
  };

  const ensureMapping = (): Record<string, string> => {
    const out: Record<string, string> = {};
    const keys = new Set<string>(['__none__', ...(preview?.folders.map((f) => f.title) ?? [])]);
    for (const k of keys) {
      const chosen = mapping[k];
      if (chosen && chosen !== '__create__') out[k === '__none__' ? '__none__' : k] = chosen;
      else {
        const d = defaultSlugFor(k === '__none__' ? null : k);
        if (d) out[k] = d;
      }
    }
    return out;
  };

  const createForFolder = async (title: string) => {
    setCreating(title);
    try {
      const slug = slugify(title) || `imported-${Date.now()}`;
      const color = PALETTE[(categories?.length ?? 0) % PALETTE.length];
      const created = await createCategory.mutateAsync({ name: title, slug, color, icon: 'tag' });
      await refetchCats();
      setMapping((m) => ({ ...m, [title]: created.slug }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error.generic'));
    } finally {
      setCreating(null);
    }
  };

  const startImport = async () => {
    if (!preview) return;
    const categoryMapping = ensureMapping();
    const missing = preview.entries.some((e) => {
      const k = e.categoryHint ?? '__none__';
      return !categoryMapping[k];
    });
    if (missing) {
      setError(t('editor.validation.category'));
      return;
    }
    setPhase('running');
    setRunProgress({ done: 0, total: preview.total });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const rep = await runImport({
        entries: preview.entries,
        categoryMapping,
        source: preview.format,
        fileName: preview.fileName,
        onProgress: (done, total) => setRunProgress({ done, total }),
        signal: ctrl.signal,
      });
      setReport(rep);
      setPhase('done');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        setError(t('import.cancel'));
      } else {
        setError(e instanceof Error ? e.message : t('error.generic'));
      }
      setPhase('preview');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl">{t('import.title')}</h1>
        <p className="mt-1 text-sm opacity-60">{t('import.subtitle')}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </p>
      )}

      {phase === 'idle' && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
          className="flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-[var(--cream-200)] p-12 text-center transition hover:border-[var(--accent-500)] hover:bg-[var(--cream-100)]/50"
        >
          <FileUp size={40} aria-hidden className="opacity-40" />
          <span className="font-medium">{t('import.chooseFile')}</span>
          <span className="text-sm opacity-50">{t('import.dropHint')}</span>
        </button>
      )}

      {phase === 'parsing' && (
        <div className="rounded-2xl border border-[var(--cream-200)] p-6 text-center">
          <Loader2 size={28} className="mx-auto animate-spin opacity-60" aria-hidden />
          <p className="mt-2 text-sm">{progress < 50 ? t('import.detecting') : t('import.parsing')}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--cream-100)]">
            <div className="h-full rounded-full bg-[var(--accent-600)] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {phase === 'preview' && preview && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-[var(--cream-200)] p-5 shadow-sm">
            <h2 className="font-display text-lg">{t('import.preview.title')}</h2>
            <p className="truncate text-sm opacity-60">{preview.fileName} · {preview.format}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl bg-[var(--cream-100)] p-3">
                <dt className="opacity-60">{t('import.preview.entries')}</dt>
                <dd className="font-display text-2xl">{preview.total}</dd>
              </div>
              <div className="rounded-xl bg-[var(--cream-100)] p-3">
                <dt className="opacity-60">{t('import.preview.photos')}</dt>
                <dd className="font-display text-2xl">{preview.photoCount}</dd>
              </div>
              <div className="rounded-xl bg-[var(--cream-100)] p-3">
                <dt className="opacity-60">{t('import.preview.withPhotos')}</dt>
                <dd className="font-display text-2xl">{preview.withPhotos}</dd>
              </div>
              <div className="rounded-xl bg-[var(--cream-100)] p-3">
                <dt className="opacity-60">{t('import.preview.dateRange')}</dt>
                <dd className="text-xs font-medium">
                  {preview.dateRange ? `${formatShort(preview.dateRange.min, lang)} → ${formatShort(preview.dateRange.max, lang)}` : '—'}
                </dd>
              </div>
            </dl>
            <div className="mt-3 text-sm">
              {preview.checkingDuplicates ? (
                <span className="inline-flex items-center gap-2 opacity-70">
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  {t('import.preview.checking')}
                </span>
              ) : (
                preview.duplicates !== null && (
                  <span className="opacity-70">
                    <strong className="text-emerald-700 dark:text-emerald-300">{preview.newCount} {t('import.preview.new')}</strong>
                    {' · '}
                    <span>{preview.duplicates} {t('import.preview.duplicates')}</span>
                  </span>
                )
              )}
            </div>
            {preview.warnings.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer opacity-70">{t('import.preview.warnings')} ({preview.warnings.length})</summary>
                <ul className="mt-1 list-disc pl-5 opacity-70">
                  {preview.warnings.slice(0, 20).map((w, i) => (
                    <li key={i} className="text-xs">{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {preview.total > 0 && (
            <div className="rounded-2xl border border-[var(--cream-200)] p-5 shadow-sm">
              <h3 className="mb-3 font-medium">{t('import.preview.folders')}</h3>
              <div className="space-y-3">
                {['__none__', ...preview.folders.map((f) => f.title)].map((key) => {
                  const title = key === '__none__' ? `(${t('common.none')})` : key;
                  const count = preview.folderCounts[key] ?? 0;
                  if (key !== '__none__' && count === 0) return null;
                  const current = mapping[key] ?? defaultSlugFor(key === '__none__' ? null : key) ?? '';
                  return (
                    <div key={key} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {title} <span className="opacity-50">· {count}</span>
                      </span>
                      <select
                        value={current}
                        onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                        aria-label={`${t('import.preview.mapping')}: ${title}`}
                        className="rounded-xl border border-[var(--cream-200)] bg-transparent px-2 py-1.5 text-sm"
                      >
                        <option value="">{t('common.none')}</option>
                        {(categories ?? []).map((c) => (
                          <option key={c.id} value={c.slug}>{c.name}</option>
                        ))}
                        <option value="__create__">{t('import.preview.createNew')}</option>
                      </select>
                      {current === '__create__' && key !== '__none__' && (
                        <button
                          type="button"
                          disabled={creating !== null}
                          onClick={() => void createForFolder(key)}
                          className="rounded-xl bg-[var(--accent-600)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {creating === key ? '…' : t('common.create')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-xs opacity-60">{t('import.preview.mapping')}</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-[var(--cream-200)] px-4 py-2.5 text-sm hover:bg-[var(--cream-100)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void startImport()}
              disabled={preview.total === 0}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent-600)] px-6 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Upload size={18} aria-hidden />
              {t('import.preview.start')}
            </button>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <div className="rounded-2xl border border-[var(--cream-200)] p-6 text-center">
          <Loader2 size={28} className="mx-auto animate-spin opacity-60" aria-hidden />
          <h2 className="font-display mt-2 text-lg">{t('import.running.title')}</h2>
          <p className="mt-1 text-sm opacity-60">{t('import.running.hint')}</p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--cream-100)]">
            <div
              className="h-full rounded-full bg-[var(--accent-600)] transition-all"
              style={{ width: runProgress.total ? `${(runProgress.done / runProgress.total) * 100}%` : '0%' }}
            />
          </div>
          <p className="mt-2 text-sm opacity-70">{runProgress.done} / {runProgress.total}</p>
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
          >
            <Ban size={15} aria-hidden />
            {t('import.cancel')}
          </button>
        </div>
      )}

      {phase === 'done' && report && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--cream-200)] p-6 text-center shadow-sm">
            <CheckCircle2 size={40} className="mx-auto text-emerald-600" aria-hidden />
            <h2 className="font-display mt-2 text-xl">{t('import.report.title')}</h2>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
                <div className="font-display text-2xl text-emerald-700 dark:text-emerald-300">{report.imported}</div>
                <div className="opacity-70">{t('import.report.imported')}</div>
              </div>
              <div className="rounded-xl bg-[var(--cream-100)] p-3">
                <div className="font-display text-2xl">{report.duplicates}</div>
                <div className="opacity-70">{t('import.report.duplicates')}</div>
              </div>
              <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
                <div className="font-display text-2xl text-red-700 dark:text-red-300">{report.failed}</div>
                <div className="opacity-70">{t('import.report.failed')}</div>
              </div>
            </div>
            {report.errors.length > 0 && (
              <details className="mt-4 text-left text-sm">
                <summary className="cursor-pointer">
                  <XCircle size={14} className="mr-1 inline text-red-600" aria-hidden />
                  {t('import.report.errors')} ({report.errors.length})
                </summary>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs opacity-80">
                  {report.errors.slice(0, 100).map((e, i) => (
                    <li key={i}><code>{e.sourceEntryId}</code>: {e.message}</li>
                  ))}
                </ul>
              </details>
            )}
            {report.imported === 0 && report.duplicates === 0 && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle size={15} aria-hidden />
                {t('import.unknown')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/calendar"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent-600)] px-6 py-2.5 font-semibold text-white"
            >
              <CalendarDays size={18} aria-hidden />
              {t('import.report.viewCalendar')}
            </Link>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cream-200)] px-4 py-2.5 text-sm"
            >
              {t('import.report.importMore')}
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".zip,.csv,.json,.txt,.md"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
