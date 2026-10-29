/** Local calendar date as YYYY-MM-DD (not UTC – "today" must match the user's clock). */
export const localISO = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y!, m! - 1, d!); };

export function addDaysISO(s: string, n: number) { const d = fromISO(s); d.setDate(d.getDate() + n); return localISO(d); }

export type DayPart = 'morning' | 'day' | 'evening' | 'night';
export const dayPart = (h: number): DayPart => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 18 ? 'day' : h >= 18 && h < 23 ? 'evening' : 'night');
