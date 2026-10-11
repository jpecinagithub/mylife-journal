import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLang } from '../i18n/strings';

interface Props {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Accessible modal confirm dialog (esc closes, focus trapped to dialog). */
export function ConfirmDialog({
  open, title, body, confirmLabel, cancelLabel, danger, busy, onConfirm, onClose,
}: Props) {
  const { t } = useLang();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector('button')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[var(--paper)] p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          {danger && (
            <span className="mt-0.5 rounded-full bg-red-100 p-2 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              <AlertTriangle size={18} aria-hidden />
            </span>
          )}
          <div>
            <h2 id="confirm-title" className="font-display text-lg">{title}</h2>
            {body && <div className="mt-2 text-sm opacity-80">{body}</div>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[var(--cream-200)] px-4 py-2 text-sm hover:bg-[var(--cream-100)] disabled:opacity-50"
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--accent-600)] hover:opacity-90'
            }`}
          >
            {busy ? t('common.deleting') : (confirmLabel ?? t('common.confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
