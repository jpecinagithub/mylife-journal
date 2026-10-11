/**
 * Hand-rolled SVG charts — no chart library.
 */

export interface BarDatum {
  label: string;
  value: number;
}

/** Vertical bar chart (used for entries-per-year). */
export function BarChart({ data, color = '#a5854f' }: { data: BarDatum[]; color?: string }) {
  const W = 600;
  const H = 220;
  const PAD = 28;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const slot = (W - PAD * 2) / Math.max(1, n);
  const barW = Math.min(48, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="bar chart">
      {data.map((d, i) => {
        const h = ((H - PAD * 2 - 20) * d.value) / max;
        const x = PAD + slot * i + (slot - barW) / 2;
        const y = H - PAD - h;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${d.value}`}</title>
            <rect x={x} y={y} width={barW} height={h} rx={4} fill={color} opacity={0.85} />
            <text
              x={x + barW / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize={11}
              fill="currentColor"
              opacity={0.7}
            >
              {d.label}
            </text>
            {d.value > 0 && (
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={11} fill="currentColor" fontWeight={600}>
                {d.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

/** Donut chart (used for entries-by-category) with an HTML legend. */
export function DonutChart({ data }: { data: DonutDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;

  // Precompute each segment's stroke offset without mutating during render.
  const segments = data.reduce<{ label: string; value: number; color: string; frac: number; offset: number }[]>(
    (acc, d) => {
      const frac = total > 0 ? d.value / total : 0;
      const prev = acc.length > 0 ? acc[acc.length - 1] : null;
      const start = prev ? prev.offset / -C + prev.frac : 0;
      return [...acc, { ...d, frac, offset: -start * C }];
    },
    [],
  );

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img" aria-label="donut chart">
        <circle cx={90} cy={90} r={R} fill="none" stroke="var(--cream-100)" strokeWidth={26} />
        {segments.map((d) => (
          <circle
            key={d.label}
            cx={90}
            cy={90}
            r={R}
            fill="none"
            stroke={d.color}
            strokeWidth={26}
            strokeDasharray={`${d.frac * C} ${C}`}
            strokeDashoffset={d.offset}
            transform="rotate(-90 90 90)"
          >
            <title>{`${d.label}: ${d.value}`}</title>
          </circle>
        ))}
        <text x={90} y={86} textAnchor="middle" fontSize={26} fontWeight={700} fill="currentColor">
          {total}
        </text>
        <text x={90} y={106} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.6}>
          total
        </text>
      </svg>
      <ul className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="truncate opacity-80">{d.label}</span>
            <span className="ml-auto font-semibold">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
