import { Inbox } from 'lucide-react';
import { useLang } from '../i18n/strings';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-[var(--cream-100)] ${className}`}
      aria-hidden
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--cream-200)] bg-[var(--paper)] p-4 shadow-sm">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="mt-3 h-4 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/3" />
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--cream-200)] px-6 py-14 text-center">
      <Inbox size={40} className="opacity-30" aria-hidden />
      <h3 className="font-display mt-4 text-xl">{title || t('common.none')}</h3>
      {body && <p className="mt-2 max-w-sm text-sm opacity-70">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
