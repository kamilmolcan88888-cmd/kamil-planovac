// Fuzzy matching of a wanted USDA description against the real records.

export const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, ' ');

const tokens = (s: string) => new Set(normalize(s).split(' ').filter(Boolean));

/**
 * 0…1. Token overlap (Dice) with a bonus when the leading comma group – the food itself,
 * e.g. "Chicken" or "Cheese" – is identical. Raw vs. cooked mismatches are penalised.
 */
export function scoreMatch(wanted: string, candidate: string): number {
  const a = tokens(wanted), b = tokens(candidate);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  let s = (2 * inter) / (a.size + b.size || 1);
  const head = (x: string) => normalize(x.split(',')[0] ?? '');
  if (head(wanted) === head(candidate)) s += 0.15; else s -= 0.15;
  const state = (set: Set<string>) => ['raw', 'cooked', 'boiled', 'roasted', 'fried', 'baked', 'canned', 'dry', 'frozen'].filter(w => set.has(w)).join();
  if (state(a) !== state(b)) s -= 0.1;
  return Math.max(0, Math.min(1, s));
}
