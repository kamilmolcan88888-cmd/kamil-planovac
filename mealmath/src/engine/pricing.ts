/**
 * Store prices. Every price is an ESTIMATE from prices/<store>.json, optionally replaced by the
 * user's own local edit (override). Overrides always win, and can also make an item that the
 * table marks "unavailable" available again (the user found it on the shelf).
 */
import type { Food, PriceItem, PriceOverride, PriceTable } from './types';

export type ResolvedPrice =
  | { foodId: string; available: true; name: string; packG: number; price: number; source: 'table' | 'override'; updated: string }
  | { foodId: string; available: false; substitute?: string };

export class PriceBook {
  readonly storeId: string;
  private readonly overrides: Map<string, PriceOverride>;

  constructor(readonly table: PriceTable, overrides: readonly PriceOverride[] = []) {
    this.storeId = table.store.id;
    this.overrides = new Map(overrides.filter(o => o.storeId === this.storeId).map(o => [o.foodId, o]));
  }

  get(foodId: string): ResolvedPrice {
    const o = this.overrides.get(foodId);
    const t = this.table.items[foodId];
    if (o) {
      const name = o.name ?? (t && !('unavailable' in t) ? t.name : foodId);
      return { foodId, available: true, name, packG: o.packG, price: o.price, source: 'override', updated: o.updated };
    }
    if (!t) return { foodId, available: false };
    if ('unavailable' in t) return { foodId, available: false, ...(t.substitute ? { substitute: t.substitute } : {}) };
    return { foodId, available: true, name: t.name, packG: t.packG, price: t.price, source: 'table', updated: t.updated };
  }

  isAvailable(foodId: string) { return this.get(foodId).available; }

  availableFoods(foodIds: Iterable<string>): Set<string> {
    const s = new Set<string>();
    for (const id of foodIds) if (this.isAvailable(id)) s.add(id);
    return s;
  }

  hasOverride(foodId: string) { return this.overrides.has(foodId); }
}

/** Packs needed to cover `grams` (0 grams → 0 packs). */
export const packsFor = (grams: number, packG: number) => (grams <= 0 ? 0 : Math.ceil(grams / packG - 1e-9));

/** Cost of the grams actually eaten (pro-rata share of the pack price). */
export const usedCost = (grams: number, p: { packG: number; price: number }) => (grams / p.packG) * p.price;

export const pricePerKg = (p: { packG: number; price: number }) => (p.price / p.packG) * 1000;

export const round2 = (v: number) => Math.round(v * 100) / 100;

// ---- export / import ----

/** Bundled table with the user's overrides applied – suitable for sharing or bulk editing. */
export function exportPriceTable(book: PriceBook, today: string): PriceTable {
  const items: PriceTable['items'] = {};
  for (const id of Object.keys(book.table.items)) {
    const p = book.get(id);
    items[id] = p.available
      ? { name: p.name, packG: p.packG, price: p.price, updated: p.updated }
      : { unavailable: true, ...(p.substitute ? { substitute: p.substitute } : {}), updated: book.table.updated };
  }
  return { store: book.table.store, estimate: true, updated: today, items };
}

export interface PriceImportResult {
  storeId: string;
  overrides: PriceOverride[];
  errors: string[];
}

/**
 * Turns an imported price table (same shape as prices/<store>.json) into overrides for every
 * item that differs from the bundled table. Invalid items are reported and skipped.
 */
export function importPriceTable(json: unknown, bundled: ReadonlyMap<string, PriceTable>, foods: ReadonlyMap<string, Food>, today: string): PriceImportResult {
  const errors: string[] = [];
  const t = json as Partial<PriceTable> | null;
  const storeId = t?.store?.id;
  if (!t || typeof t !== 'object' || !storeId || !t.items || typeof t.items !== 'object') {
    return { storeId: storeId ?? '', overrides: [], errors: ['invalid_file'] };
  }
  const base = bundled.get(storeId);
  if (!base) return { storeId, overrides: [], errors: [`unknown_store:${storeId}`] };

  const overrides: PriceOverride[] = [];
  for (const [foodId, raw] of Object.entries(t.items)) {
    if (!foods.has(foodId)) { errors.push(`unknown_food:${foodId}`); continue; }
    if (!raw || 'unavailable' in raw) continue;
    const it = raw as Partial<PriceItem>;
    if (!(typeof it.packG === 'number' && it.packG > 0 && typeof it.price === 'number' && it.price >= 0 && it.price < 1000)) {
      errors.push(`invalid_item:${foodId}`);
      continue;
    }
    const b = base.items[foodId];
    const same = b && !('unavailable' in b) && b.packG === it.packG && b.price === it.price && (it.name === undefined || it.name === b.name);
    if (same) continue;
    overrides.push({
      storeId, foodId, packG: it.packG, price: it.price,
      ...(typeof it.name === 'string' && it.name.trim() ? { name: it.name.trim() } : {}),
      updated: typeof it.updated === 'string' ? it.updated : today,
    });
  }
  return { storeId, overrides, errors };
}

/** Structural check for a bundled or imported table. Returns a list of problems. */
export function checkPriceTable(t: PriceTable, foods: ReadonlyMap<string, Food>): string[] {
  const out: string[] = [];
  if (t.estimate !== true) out.push('estimate flag must be true');
  if (!t.store?.id || !t.store.name || !t.store.lang) out.push('store info incomplete');
  for (const [id, it] of Object.entries(t.items)) {
    if (!foods.has(id)) out.push(`unknown food ${id}`);
    if ('unavailable' in it) {
      if (it.substitute && !foods.has(it.substitute)) out.push(`unknown substitute ${it.substitute} for ${id}`);
      if (it.substitute && 'unavailable' in (t.items[it.substitute] ?? { unavailable: true })) out.push(`substitute ${it.substitute} for ${id} is itself unavailable`);
    } else {
      if (!(it.packG > 0)) out.push(`bad packG for ${id}`);
      if (!(it.price > 0 && it.price < 100)) out.push(`bad price for ${id}`);
      if (!it.name) out.push(`missing name for ${id}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(it.updated)) out.push(`bad date for ${id}`);
    }
  }
  return out;
}
