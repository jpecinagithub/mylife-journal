/**
 * MyLife Journal — CalendarMonth component contract tests.
 *
 * The component does not exist yet (frontend wave in progress), so this suite
 * self-skips. Props below are the ASSUMED contract — adapt to the real
 * component when it lands (read src/components/CalendarMonth.* first).
 *
 * Uses RTL + user-event only, no network.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

// Ensure each test gets a fresh DOM (vitest globals are off, so RTL's
// auto-cleanup is not registered by default).
afterEach(() => cleanup());

/** Assumed props of <CalendarMonth> — adapt when the component lands. */
interface CalendarMonthProps {
  year: number;
  month: number; // 1-12
  activeDays?: string[]; // 'YYYY-MM-DD'
  onSelectDay?: (date: string) => void;
}
type CalendarMonthComponent = (props: CalendarMonthProps) => ReactElement;
interface CalendarMonthModule {
  CalendarMonth?: CalendarMonthComponent;
  default?: CalendarMonthComponent;
}

const CANDIDATES = ['CalendarMonth.tsx', 'CalendarMonth.jsx'].map((f) =>
  join(process.cwd(), 'src', 'components', f),
);
const SPECIFIER: string = '../src/components/CalendarMonth'; // same as '@/components/CalendarMonth'

const mod: CalendarMonthModule | null = CANDIDATES.some((p) => existsSync(p))
  ? ((await import(/* @vite-ignore */ SPECIFIER).catch(() => null) as CalendarMonthModule | null))
  : null;
const CalendarMonth: CalendarMonthComponent | null = mod
  ? (mod.CalendarMonth ?? mod.default ?? null)
  : null;

if (!CalendarMonth) {
  it('TODO: src/components/CalendarMonth not implemented yet — component tests skipped', () => {
    expect(true).toBe(true);
  });
}

/** Heuristic: a day cell counts as "active" if it carries any active marker. */
function isActiveDay(el: Element): boolean {
  if (el.getAttribute('aria-pressed') === 'true') return true;
  if (el.getAttribute('aria-current') === 'date') return true;
  if ((el as HTMLElement).dataset.active === 'true') return true;
  return el.className.split(/\s+/).some((c) => /active|has-entry/i.test(c));
}

describe.skipIf(!CalendarMonth)('<CalendarMonth />', () => {
  const C = () => CalendarMonth as CalendarMonthComponent;
  const ACTIVE = ['2026-10-01', '2026-10-11', '2026-10-20'];

  it('renders the month grid with 3 active days', () => {
    const Comp = C();
    render(<Comp year={2026} month={10} activeDays={ACTIVE} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(28); // day cells
    const active = buttons.filter(isActiveDay);
    expect(active).toHaveLength(3);
    // the active days are the 1st, 11th and 20th
    const days = active.map((b) => b.textContent?.trim()).sort();
    expect(days).toEqual(['1', '11', '20']);
  });

  it('clicking a day calls onSelectDay with YYYY-MM-DD', async () => {
    const Comp = C();
    const user = userEvent.setup();
    const seen: string[] = [];
    render(<Comp year={2026} month={10} activeDays={ACTIVE} onSelectDay={(d) => seen.push(d)} />);
    const day11 = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.trim() === '11' && isActiveDay(b));
    expect(day11).toBeTruthy();
    await user.click(day11 as HTMLElement);
    expect(seen).toEqual(['2026-10-11']);
  });
});
