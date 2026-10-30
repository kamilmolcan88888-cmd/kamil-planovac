/**
 * One-off seeding of prices/*.json from scripts/price-seed.txt (rough ESTIMATES).
 * After seeding, edit prices/*.json directly. Existing files are NOT overwritten, so adding a store
 * here only creates the new file. Pass --force to regenerate everything.
 *
 *   npm run seed:prices [-- --force]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFoodList } from './build-foods';
import type { Aisle, PriceTable, StoreInfo } from '../src/engine/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UPDATED = '2026-10-28';

const AISLE_ORDER: Aisle[] = ['produce', 'bakery', 'meat', 'fish', 'dairy', 'eggs', 'plant_protein', 'dry_goods', 'canned', 'nuts_seeds', 'oils_sauces', 'spices', 'drinks', 'frozen'];

const STORES: StoreInfo[] = [
  { id: 'lidl-de', name: 'Lidl Deutschland', chain: 'lidl', country: 'DE', lang: 'de', currency: 'EUR', aisleOrder: AISLE_ORDER },
  { id: 'lidl-sk', name: 'Lidl Slovensko', chain: 'lidl', country: 'SK', lang: 'sk', currency: 'EUR', aisleOrder: AISLE_ORDER },
  { id: 'kaufland-sk', name: 'Kaufland Slovensko', chain: 'kaufland', country: 'SK', lang: 'sk', currency: 'EUR',
    aisleOrder: ['produce', 'bakery', 'meat', 'fish', 'dairy', 'eggs', 'plant_protein', 'frozen', 'dry_goods', 'canned', 'nuts_seeds', 'oils_sauces', 'spices', 'drinks'] },
  { id: 'billa-sk', name: 'Billa Slovensko', chain: 'billa', country: 'SK', lang: 'sk', currency: 'EUR', aisleOrder: AISLE_ORDER },
  { id: 'tesco-sk', name: 'Tesco Slovensko', chain: 'tesco', country: 'SK', lang: 'sk', currency: 'EUR', aisleOrder: AISLE_ORDER },
  { id: 'aldi-de', name: 'Aldi Süd Deutschland', chain: 'aldi', country: 'DE', lang: 'de', currency: 'EUR', aisleOrder: AISLE_ORDER },
];

/**
 * Rough price level and range of the newer stores relative to the base store they are seeded from
 * (Billa and Tesco follow Kaufland SK's range and prices, Aldi follows Lidl DE).
 */
const NEW_STORES = [
  { id: 'billa-sk', like: 'kaufland-sk', factor: 1.1 },
  { id: 'tesco-sk', like: 'kaufland-sk', factor: 1.02 },
  { id: 'aldi-de', like: 'lidl-de', factor: 0.98 },
] as const;

/** Lidl SK vs Lidl DE, by aisle (rough). */
const SK_FACTOR: Record<Aisle, number> = {
  produce: 1.05, bakery: 1.0, meat: 1.0, fish: 1.05, dairy: 1.15, eggs: 1.0, frozen: 1.1, dry_goods: 1.1,
  canned: 1.1, spices: 1.1, oils_sauces: 1.1, nuts_seeds: 1.1, drinks: 1.1, plant_protein: 1.15,
};
const KAUFLAND_FACTOR = 1.06;

/** Round to a typical shelf price ending in 9 (0.49, 1.29, 12.99). */
export const shelfPrice = (v: number) => {
  if (v < 0.1) return 0.09;
  return Math.max(0.09, Math.round((Math.ceil(v * 10) / 10 - 0.01) * 100) / 100);
};

function main() {
  const foods = parseFoodList(readFileSync(join(ROOT, 'scripts/food-list.txt'), 'utf8'));
  const byId = new Map(foods.map(f => [f.id, f]));
  const tables = Object.fromEntries(STORES.map(s => [s.id, { store: s, estimate: true, updated: UPDATED, items: {} } as PriceTable]));
  const seen = new Set<string>();

  readFileSync(join(ROOT, 'scripts/price-seed.txt'), 'utf8').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const [id, packS, priceS, opts = ''] = line.split(' | ').map(s => s.trim()) as [string, string, string, string?];
    const err = (m: string) => { throw new Error(`price-seed.txt:${i + 1}: ${m}`); };
    const food = byId.get(id) ?? err(`unknown food "${id}"`);
    if (seen.has(id)) err(`duplicate "${id}"`);
    seen.add(id);
    const packG = Number(packS), priceDE = Number(priceS);
    if (!(packG > 0 && priceDE > 0)) err('bad pack/price');

    let skPack = packG, skPrice = shelfPrice(priceDE * SK_FACTOR[food.aisle]), kPrice: number | undefined;
    const missing = new Map<string, string | undefined>();
    for (const o of opts.split(/\s+/).filter(Boolean)) {
      if (o.startsWith('sk=')) { const [p, c] = o.slice(3).split('/'); skPack = Number(p); skPrice = Number(c); }
      else if (o.startsWith('k=')) kPrice = Number(o.slice(2));
      else if (o.startsWith('x:')) { const [store, sub] = o.slice(2).split('>'); if (!tables[store!]) err(`unknown store ${store}`); if (sub && !byId.has(sub)) err(`unknown substitute ${sub}`); missing.set(store!, sub); }
      else err(`unknown option ${o}`);
    }

    const put = (storeId: string, name: string, pack: number, price: number) => {
      if (missing.has(storeId)) {
        const sub = missing.get(storeId);
        tables[storeId]!.items[id] = { unavailable: true, ...(sub ? { substitute: sub } : {}), updated: UPDATED };
      } else tables[storeId]!.items[id] = { name, packG: pack, price, updated: UPDATED };
    };
    put('lidl-de', food.de, packG, priceDE);
    put('lidl-sk', food.sk, skPack, skPrice);
    const kauflandPrice = kPrice ?? shelfPrice(skPrice * KAUFLAND_FACTOR);
    put('kaufland-sk', food.sk, skPack, kauflandPrice);
    for (const n of NEW_STORES) {
      const base = n.like === 'lidl-de' ? priceDE : kauflandPrice;
      const pack = n.like === 'lidl-de' ? packG : skPack;
      const name = n.like === 'lidl-de' ? food.de : food.sk;
      if (missing.has(n.like)) tables[n.id]!.items[id] = { unavailable: true, ...(missing.get(n.like) ? { substitute: missing.get(n.like)! } : {}), updated: UPDATED };
      else tables[n.id]!.items[id] = { name, packG: pack, price: shelfPrice(base * n.factor), updated: UPDATED };
    }
  });

  const uncovered = foods.filter(f => !seen.has(f.id)).map(f => f.id);
  if (uncovered.length) throw new Error(`No price seed for: ${uncovered.join(', ')}`);

  mkdirSync(join(ROOT, 'prices'), { recursive: true });
  const force = process.argv.includes('--force');
  for (const t of Object.values(tables)) {
    if (!force && existsSync(join(ROOT, `prices/${t.store.id}.json`))) { console.log(`· prices/${t.store.id}.json exists – kept`); continue; }
    writeFileSync(join(ROOT, `prices/${t.store.id}.json`), JSON.stringify(t, null, 1) + '\n');
    const n = Object.values(t.items).filter(x => !('unavailable' in x)).length;
    console.log(`✓ prices/${t.store.id}.json – ${n} available, ${Object.keys(t.items).length - n} unavailable`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
