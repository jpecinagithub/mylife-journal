import { useState } from 'react';
import JSZip from 'jszip';
import { Download, FileSpreadsheet, Loader2, ShieldCheck, AlertTriangle, Globe } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { apiFetch } from '../lib/api';
import { ThemeToggle } from '../components/ThemeToggle';

interface ExportPage {
  version?: string;
  exportedAt?: string;
  exported_at?: string;
  categories?: unknown[];
  tags?: unknown[];
  entries?: ExportEntry[];
  pagination?: { page: number; total_pages: number; totalPages?: number };
}

interface ExportEntry {
  id: string;
  event_date?: string;
  title?: string;
  photos?: { url?: string; thumbnail_url?: string; blob_pathname?: string }[];
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function SettingsPage() {
  const { t, lang, setLang } = useLang();
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);

  const exportZip = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const zip = new JSZip();
      const allEntries: ExportEntry[] = [];
      let page = 1;
      let totalPages = 1;
      let categories: unknown[] = [];
      let tags: unknown[] = [];
      // loop GET /api/export/json pages
      do {
        setExportProgress(`${t('settings.exporting')} (json ${page}/${totalPages})`);
        const data = await apiFetch<ExportPage>(`/api/export/json?page=${page}&limit=500`);
        if (page === 1) {
          categories = data.categories ?? [];
          tags = data.tags ?? [];
          zip.file('meta.json', JSON.stringify({ version: data.version ?? 1, exportedAt: data.exportedAt ?? data.exported_at ?? new Date().toISOString() }, null, 2));
        }
        allEntries.push(...(data.entries ?? []));
        const p = data.pagination;
        totalPages = p ? (p.total_pages ?? p.totalPages ?? 1) : 1;
        page++;
      } while (page <= totalPages);

      zip.file('entries.json', JSON.stringify(allEntries, null, 2));
      zip.file('categories.json', JSON.stringify(categories, null, 2));
      zip.file('tags.json', JSON.stringify(tags, null, 2));

      // fetch each photo
      const photos = zip.folder('photos');
      let done = 0;
      const total = allEntries.reduce((s, e) => s + (e.photos?.length ?? 0), 0);
      for (const entry of allEntries) {
        for (let i = 0; i < (entry.photos?.length ?? 0); i++) {
          const ph = entry.photos![i];
          const url = ph.url ?? ph.thumbnail_url;
          done++;
          if (!url) continue;
          setExportProgress(`${t('settings.exporting')} (${done}/${total})`);
          try {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) continue;
            const blob = await res.blob();
            const ext = (blob.type.split('/')[1] || 'jpg').split(';')[0];
            photos?.file(`${entry.id}-${i}.${ext}`, blob);
          } catch {
            /* skip failed photo, keep going */
          }
        }
      }

      setExportProgress(t('settings.exporting'));
      const blob = await zip.generateAsync({ type: 'blob' }, (meta) =>
        setExportProgress(`${t('settings.exporting')} ${Math.round(meta.percent)}%`),
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `mylife-backup-${stamp}.zip`);
      setExportProgress(t('settings.exportDone'));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : t('settings.exportFailed'));
    } finally {
      setExporting(false);
      window.setTimeout(() => setExportProgress(''), 4000);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl">{t('settings.title')}</h1>

      {/* appearance */}
      <section className="rounded-2xl border border-[var(--cream-200)] p-5 shadow-sm">
        <h2 className="font-display mb-4 text-lg">{t('settings.appearance')}</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="mb-1 text-sm opacity-60">{t('common.theme')}</div>
            <ThemeToggle showLabel />
          </div>
          <div>
            <label className="mb-1 block text-sm opacity-60" htmlFor="set-lang">
              {t('common.language')}
            </label>
            <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--cream-200)] px-3 py-2">
              <Globe size={16} aria-hidden className="opacity-60" />
              <select
                id="set-lang"
                value={lang}
                onChange={(e) => setLang(e.target.value as 'es' | 'en')}
                className="bg-transparent text-sm outline-none"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* data */}
      <section className="rounded-2xl border border-[var(--cream-200)] p-5 shadow-sm">
        <h2 className="font-display mb-1 text-lg">{t('settings.data')}</h2>
        <div className="space-y-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-md">
              <div className="font-medium">{t('settings.exportJson')}</div>
              <p className="text-sm opacity-60">{t('settings.exportJsonBody')}</p>
            </div>
            <button
              type="button"
              onClick={() => void exportZip()}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-600)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {exporting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
              {exporting ? t('settings.exporting') : t('settings.exportJson')}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cream-200)] pt-4">
            <div className="max-w-md">
              <div className="font-medium">{t('settings.exportCsv')}</div>
              <p className="text-sm opacity-60">{t('settings.exportCsvBody')}</p>
            </div>
            <a
              href="/api/export/csv"
              download
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cream-200)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--cream-100)]"
            >
              <FileSpreadsheet size={16} aria-hidden />
              {t('settings.exportCsv')}
            </a>
          </div>
          {exportProgress && <p className="text-sm opacity-70" role="status">{exportProgress}</p>}
          {exportError && (
            <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
              {t('settings.exportFailed')}: {exportError}
            </p>
          )}
        </div>
      </section>

      {/* security */}
      <section className="rounded-2xl border border-[var(--cream-200)] p-5 shadow-sm">
        <h2 className="font-display mb-2 flex items-center gap-2 text-lg">
          <ShieldCheck size={18} aria-hidden />
          {t('settings.security')}
        </h2>
        <p className="text-sm opacity-70">{t('settings.securityBody')}</p>
      </section>

      {/* danger zone */}
      <section className="rounded-2xl border border-red-200 p-5 dark:border-red-900">
        <h2 className="font-display mb-2 flex items-center gap-2 text-lg text-red-700 dark:text-red-300">
          <AlertTriangle size={18} aria-hidden />
          {t('settings.danger')}
        </h2>
        <p className="text-sm opacity-70">{t('settings.dangerBody')}</p>
      </section>
    </div>
  );
}
