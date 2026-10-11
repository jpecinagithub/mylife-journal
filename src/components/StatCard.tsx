/** Compact numeric stat card. */
export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--cream-200)] bg-[var(--paper)] p-4 shadow-sm">
      <div className="font-display text-3xl">{value}</div>
      <div className="mt-1 text-sm font-medium opacity-80">{label}</div>
      {sub && <div className="mt-0.5 text-xs opacity-60">{sub}</div>}
    </div>
  );
}
