import type { CategoryView } from '../lib/api';
import { CategoryIcon } from './CategoryIcon';

function readableText(hex: string): string {
  // pick dark or light text depending on background luminance
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#2b2620';
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#2b2620' : '#ffffff';
}

/** Small pill with the category color + icon + name. */
export function CategoryBadge({ category, size = 'md' }: { category: Pick<CategoryView, 'name' | 'color' | 'icon'>; size?: 'sm' | 'md' }) {
  const fg = readableText(category.color);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{ backgroundColor: category.color, color: fg }}
    >
      <CategoryIcon icon={category.icon} size={size === 'sm' ? 12 : 14} />
      <span className="max-w-32 truncate">{category.name}</span>
    </span>
  );
}

/** Soft-tinted dot + name (used in lists where a full pill is too heavy). */
export function CategoryDot({ category, label }: { category: Pick<CategoryView, 'name' | 'color'>; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs opacity-80">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
      {label ?? category.name}
    </span>
  );
}
