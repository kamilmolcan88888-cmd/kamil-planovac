// Fuzzy matching of a wanted USDA description against the real records.

const FDP_SUFFIX = /\(includes foods for usda'?s food distribution program\)/gi;

export const normalize = (s: string) =>
  s.replace(FDP_SUFFIX, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, ' ');

const tokens = (s: string) => new Set(normalize(s).split(' ').filter(Boolean));

/**
 * 0…1. Mostly recall of the wanted tokens (every word we asked for should be there),
 * plus some precision. Each missing wanted word costs extra, so "breast" or "unsweetened"
 * can't silently disappear. A different leading food word ("Turkey" vs "Chicken") is penalised.
 */
export function scoreMatch(wanted: string, candidate: string): number {
  const a = tokens(wanted), b = tokens(candidate);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const recall = inter / (a.size || 1);
  const precision = inter / (b.size || 1);
  const missing = a.size - inter;
  let s = 0.75 * recall + 0.25 * precision - 0.08 * missing;
  const head = (x: string) => normalize(x.split(',')[0] ?? '');
  if (head(wanted) !== head(candidate)) s -= 0.15;
  const STATES = ['raw', 'cooked', 'boiled', 'roasted', 'fried', 'baked', 'braised', 'grilled', 'canned', 'dry', 'frozen', 'dried', 'prepared'];
  const state = (set: Set<string>) => STATES.filter(w => set.has(w)).join();
  if (state(a) !== state(b)) s -= 0.1;
  return Math.max(0, Math.min(1, s));
}
