/**
 * Builds data/foods.json from USDA FoodData Central (public domain) CSV downloads.
 *
 *   npm run build:foods                 # download SR Legacy (+ Foundation if reachable) and build
 *   npm run build:foods -- --dir <path> # use already extracted CSV folders (searched recursively)
 *   npm run build:foods -- --allow-missing   # write foods.json even if some entries did not match
 *
 * Every nutrient value in foods.json comes from these files. The food list only says WHICH
 * USDA record to use (scripts/food-list.txt). A match report is written to data/foods-report.md.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { ALLERGENS, AISLES, type Allergen, type Aisle, type Food, type FoodFlag } from '../src/engine/types';
import { normalize, scoreMatch } from './match';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'scripts/.cache');
const SR_URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip';
const FOUNDATION_URLS = [
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12-18.zip',
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-04-24.zip',
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2024-10-31.zip',
];
const FLAGS: FoodFlag[] = ['meat', 'pork', 'red_meat', 'fish', 'dairy', 'egg', 'honey'];
const FUZZY_MIN = 0.8;

// USDA nutrient ids
const N = { kcal: 1008, kcalAtwaterGeneral: 2047, kcalAtwaterSpecific: 2048, protein: 1003, fat: 1004, fatNlea: 1085, carbs: 1005 };

const args = process.argv.slice(2);
const argDir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : undefined;
const allowMissing = args.includes('--allow-missing');

// ---------- food list ----------
interface ListEntry {
  line: number; id: string; usda: string; en: string; sk: string; de: string;
  aisle: Aisle; allergens: Allergen[]; flags: FoodFlag[]; shelfDays: number; pieceG?: number; fdcId?: number;
}

export function parseFoodList(text: string): ListEntry[] {
  const out: ListEntry[] = [];
  const ids = new Set<string>();
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const c = line.split(' | ').map(s => s.trim());
    const err = (m: string) => { throw new Error(`food-list.txt:${i + 1}: ${m}\n  ${line}`); };
    if (c.length < 9 || c.length > 11) err(`expected 9–11 fields, got ${c.length}`);
    const [id, usda, en, sk, de, aisle, allergens, flags, shelf, piece, fdc] = c as string[];
    if (!/^[a-z0-9_]+$/.test(id!)) err(`bad id "${id}"`);
    if (ids.has(id!)) err(`duplicate id "${id}"`);
    ids.add(id!);
    if (!(AISLES as readonly string[]).includes(aisle!)) err(`unknown aisle "${aisle}"`);
    const list = (s: string) => (s === '-' ? [] : s.split(',').map(x => x.trim()));
    const al = list(allergens!);
    al.forEach(a => (ALLERGENS as readonly string[]).includes(a) || err(`unknown allergen "${a}"`));
    const fl = list(flags!);
    fl.forEach(f => (FLAGS as string[]).includes(f) || err(`unknown flag "${f}"`));
    const shelfDays = Number(shelf);
    if (!Number.isFinite(shelfDays) || shelfDays <= 0) err('bad shelfDays');
    out.push({
      line: i + 1, id: id!, usda: usda!, en: en!, sk: sk!, de: de!, aisle: aisle as Aisle,
      allergens: al as Allergen[], flags: fl as FoodFlag[], shelfDays,
      pieceG: piece && piece !== '-' ? Number(piece) : undefined,
      fdcId: fdc && fdc !== '-' ? Number(fdc) : undefined,
    });
  });
  return out;
}

// ---------- CSV ----------
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function* csvRows(text: string): Generator<Record<string, string>> {
  const lines = text.split(/\r?\n/);
  const head = parseCsvLine(lines[0]!);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = parseCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    head.forEach((h, j) => { row[h] = c[j] ?? ''; });
    yield row;
  }
}

// ---------- sources ----------
interface Source { name: string; files: Map<string, string> } // file basename -> text

async function download(url: string): Promise<Uint8Array | null> {
  const file = join(CACHE, url.split('/').pop()!);
  if (existsSync(file)) return readFileSync(file);
  try {
    console.log(`↓ ${url}`);
    const res = await fetch(url);
    if (!res.ok) { console.warn(`  HTTP ${res.status}`); return null; }
    const buf = new Uint8Array(await res.arrayBuffer());
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, buf);
    return buf;
  } catch (e) {
    console.warn(`  failed: ${(e as Error).message}`);
    return null;
  }
}

const WANTED = ['food.csv', 'food_nutrient.csv'];

function fromZip(name: string, zip: Uint8Array): Source {
  const files = new Map<string, string>();
  const dec = new TextDecoder();
  const entries = unzipSync(zip, { filter: f => WANTED.includes(f.name.split('/').pop()!) });
  for (const [path, data] of Object.entries(entries)) files.set(path.split('/').pop()!, dec.decode(data));
  return { name, files };
}

function fromDir(dir: string): Source[] {
  const found = new Map<string, Map<string, string>>();
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (WANTED.includes(e)) {
        if (!found.has(d)) found.set(d, new Map());
        found.get(d)!.set(e, readFileSync(p, 'utf8'));
      }
    }
  };
  walk(dir);
  return [...found].map(([d, files]) => ({ name: d, files }));
}

interface UsdaFood { fdcId: number; dataType: Food['usdaDataType']; description: string; norm: string }

function loadFoods(src: Source): UsdaFood[] {
  const text = src.files.get('food.csv');
  if (!text) throw new Error(`${src.name}: food.csv missing`);
  const out: UsdaFood[] = [];
  for (const r of csvRows(text)) {
    if (r.data_type !== 'sr_legacy_food' && r.data_type !== 'foundation_food') continue;
    out.push({ fdcId: Number(r.fdc_id), dataType: r.data_type, description: r.description!, norm: normalize(r.description!) });
  }
  return out;
}

function loadNutrients(srcs: Source[], ids: Set<number>): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  for (const s of srcs) {
    const text = s.files.get('food_nutrient.csv');
    if (!text) throw new Error(`${s.name}: food_nutrient.csv missing`);
    for (const r of csvRows(text)) {
      const id = Number(r.fdc_id);
      if (!ids.has(id)) continue;
      if (!out.has(id)) out.set(id, new Map());
      out.get(id)!.set(Number(r.nutrient_id), Number(r.amount));
    }
  }
  return out;
}

// ---------- main ----------
async function main() {
  const list = parseFoodList(readFileSync(join(ROOT, 'scripts/food-list.txt'), 'utf8'));
  let sources: Source[];
  if (argDir) sources = fromDir(resolve(argDir));
  else {
    const sr = await download(SR_URL);
    if (!sr) throw new Error('SR Legacy download failed – required.');
    sources = [fromZip('sr_legacy', sr)];
    for (const u of FOUNDATION_URLS) {
      const z = await download(u);
      if (z) { sources.push(fromZip('foundation', z)); break; }
    }
    if (sources.length === 1) console.warn('! Foundation Foods not available – using SR Legacy only.');
  }

  const usda = sources.flatMap(loadFoods);
  const byId = new Map(usda.map(u => [u.fdcId, u]));
  console.log(`USDA records: ${usda.length} (${sources.map(s => s.name).join(', ')})`);

  type Match = { entry: ListEntry; food?: UsdaFood; how: 'pinned' | 'exact' | 'fuzzy' | 'none'; score: number; alts: UsdaFood[] };
  const matches: Match[] = list.map(entry => {
    if (entry.fdcId) {
      const food = byId.get(entry.fdcId);
      return { entry, food, how: food ? 'pinned' : 'none', score: food ? 1 : 0, alts: [] };
    }
    const want = normalize(entry.usda);
    const exact = usda.filter(u => u.norm === want).sort((a, b) => (a.dataType === 'sr_legacy_food' ? -1 : 1) - (b.dataType === 'sr_legacy_food' ? -1 : 1));
    if (exact.length) return { entry, food: exact[0], how: 'exact', score: 1, alts: [] };
    const ranked = usda.map(u => ({ u, s: scoreMatch(entry.usda, u.description) })).sort((a, b) => b.s - a.s).slice(0, 6);
    const best = ranked[0]!;
    return best.s >= FUZZY_MIN
      ? { entry, food: best.u, how: 'fuzzy', score: best.s, alts: ranked.slice(1).map(r => r.u) }
      : { entry, how: 'none', score: best.s, alts: ranked.map(r => r.u) };
  });

  const ok = matches.filter(m => m.food);
  const nutrients = loadNutrients(sources, new Set(ok.map(m => m.food!.fdcId)));

  const foods: Food[] = [];
  const problems: string[] = [];
  for (const m of ok) {
    const n = nutrients.get(m.food!.fdcId) ?? new Map<number, number>();
    const protein = n.get(N.protein), carbs = n.get(N.carbs);
    const fat = n.get(N.fat) ?? n.get(N.fatNlea);
    const kcal = n.get(N.kcal) ?? n.get(N.kcalAtwaterSpecific) ?? n.get(N.kcalAtwaterGeneral);
    if ([kcal, protein, carbs, fat].some(v => v === undefined || !Number.isFinite(v))) {
      problems.push(`${m.entry.id}: fdcId ${m.food!.fdcId} lacks kcal/protein/carbs/fat`);
      continue;
    }
    const e = m.entry;
    foods.push({
      id: e.id, fdcId: m.food!.fdcId, usdaDescription: m.food!.description, usdaDataType: m.food!.dataType,
      name: { en: e.en, sk: e.sk, de: e.de }, aisle: e.aisle, allergens: e.allergens, flags: e.flags,
      shelfDays: e.shelfDays, ...(e.pieceG ? { pieceG: e.pieceG } : {}),
      per100: { kcal: kcal!, protein: protein!, carbs: carbs!, fat: fat! },
    });
  }

  // ---------- report ----------
  const md = [
    '# foods.json match report', '',
    `Generated ${new Date().toISOString()} from: ${sources.map(s => s.name).join(', ')}.`, '',
    `Matched: ${foods.length} / ${list.length}. Exact: ${matches.filter(m => m.how === 'exact').length}, pinned: ${matches.filter(m => m.how === 'pinned').length}, fuzzy: ${matches.filter(m => m.how === 'fuzzy').length}, unmatched: ${matches.filter(m => m.how === 'none').length}.`, '',
    '## Needs review (fuzzy or unmatched)', '',
    '| id | wanted | got (fdcId) | score | alternatives |', '|---|---|---|---|---|',
    ...matches.filter(m => m.how === 'fuzzy' || m.how === 'none').map(m =>
      `| ${m.entry.id} | ${m.entry.usda} | ${m.food ? `${m.food.description} (${m.food.fdcId})` : '**NONE**'} | ${m.score.toFixed(2)} | ${m.alts.map(a => `${a.description} (${a.fdcId})`).join('<br>')} |`),
    '', '## Missing nutrients', '', ...(problems.length ? problems.map(p => `- ${p}`) : ['none']),
    '', '## All foods', '', '| id | fdcId | USDA description | kcal | P | C | F |', '|---|---|---|---|---|---|---|',
    ...foods.map(f => `| ${f.id} | ${f.fdcId} | ${f.usdaDescription} | ${f.per100.kcal} | ${f.per100.protein} | ${f.per100.carbs} | ${f.per100.fat} |`),
  ];
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(join(ROOT, 'data/foods-report.md'), md.join('\n') + '\n');

  const unmatched = matches.filter(m => m.how === 'none');
  if ((unmatched.length || problems.length) && !allowMissing) {
    console.error(`✗ ${unmatched.length} unmatched, ${problems.length} without nutrients – see data/foods-report.md`);
    unmatched.forEach(m => console.error(`  ${m.entry.id}: "${m.entry.usda}" → best: ${m.alts[0]?.description} (${m.score.toFixed(2)})`));
    process.exit(1);
  }

  const out = {
    source: 'USDA FoodData Central (public domain), ' + sources.map(s => s.name).join(' + '),
    generatedAt: new Date().toISOString(),
    foods,
  };
  writeFileSync(join(ROOT, 'data/foods.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`✓ data/foods.json: ${foods.length} foods (fuzzy: ${matches.filter(m => m.how === 'fuzzy').length})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
