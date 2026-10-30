import cs from '../cs.json';
import de from '../de.json';
import en from '../en.json';
import sk from '../sk.json';

type Tree = { [k: string]: string | Tree };
const flat = (t: Tree, p = ''): Record<string, string> =>
  Object.entries(t).reduce((o, [k, v]) => (typeof v === 'string' ? { ...o, [p + k]: v } : { ...o, ...flat(v, p + k + '.') }), {});
const vars = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]!).sort().join(',');

// Plural forms differ per language (sk/cs have _few and _many), so compare the base keys.
const baseKey = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');
const keys = (o: Record<string, string>) => new Set(Object.keys(o).map(baseKey));

const base = flat(sk as Tree);

describe.each([['de', de], ['en', en], ['cs', cs]] as const)('%s translation', (_name, tree) => {
  const t = flat(tree as Tree);
  it('has every key of the Slovak source', () => {
    expect([...keys(base)].filter(k => !keys(t).has(k))).toEqual([]);
  });
  it('has no keys the source lacks', () => {
    expect([...keys(t)].filter(k => !keys(base).has(k))).toEqual([]);
  });
  it('uses the same {{variables}} in every string', () => {
    const bad = Object.keys(base).filter(k => k in t && vars(base[k]!) !== vars(t[k]!));
    expect(bad).toEqual([]);
  });
  it('has no empty strings', () => {
    expect(Object.entries(t).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });
});
