// Weight trend and pace – plain arithmetic on the user's own logged weights.
import type { Goal } from './types';

export interface WeightEntry { date: string; kg: number }

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);

export interface Trend {
  first: WeightEntry;
  last: WeightEntry;
  /** last − first, kg */
  changeKg: number;
  /** Least-squares slope over the entries, in kg per week. undefined when span < 7 days or < 3 entries. */
  perWeekKg?: number;
}

export function weightTrend(entries: readonly WeightEntry[]): Trend | undefined {
  if (!entries.length) return undefined;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]!, last = sorted[sorted.length - 1]!;
  const t: Trend = { first, last, changeKg: Math.round((last.kg - first.kg) * 10) / 10 };
  const span = dayNumber(last.date) - dayNumber(first.date);
  if (sorted.length >= 3 && span >= 7) {
    const xs = sorted.map(e => dayNumber(e.date) - dayNumber(first.date)), ys = sorted.map(e => e.kg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0), den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    if (den > 0) t.perWeekKg = Math.round((num / den) * 7 * 100) / 100;
  }
  return t;
}

export type Pace = 'few_data' | 'on_track' | 'too_fast' | 'too_slow' | 'wrong_direction';

/**
 * Compares the weekly change with the goal (as % of body weight per week):
 * losing 0.25–1 %, gaining 0.1–0.5 %, maintaining within ±0.25 %.
 */
export function paceFor(goal: Goal, trend: Trend | undefined): Pace {
  if (!trend || trend.perWeekKg === undefined) return 'few_data';
  const pct = (trend.perWeekKg / trend.last.kg) * 100;
  if (goal === 'lose') return pct > -0.05 ? (pct > 0.1 ? 'wrong_direction' : 'too_slow') : pct < -1 ? 'too_fast' : pct > -0.25 ? 'too_slow' : 'on_track';
  if (goal === 'gain') return pct < 0.05 ? (pct < -0.1 ? 'wrong_direction' : 'too_slow') : pct > 0.5 ? 'too_fast' : pct < 0.1 ? 'too_slow' : 'on_track';
  return Math.abs(pct) <= 0.25 ? 'on_track' : pct > 0 ? 'too_fast' : 'wrong_direction';
}
