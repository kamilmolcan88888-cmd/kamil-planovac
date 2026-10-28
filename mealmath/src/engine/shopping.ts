/**
 * Shopping list: aggregates a plan into grams per food (whole household), rounds up to real
 * packs of the selected store, and reports two totals:
 *   foodCost – what the food eaten this week costs (pro-rata), compared with the budget
 *   checkout – what you pay at the till (whole packs)
 * plus how much of each pack is left and how long it keeps.
 */
import { CONFIG_SHOPPING } from './config';
import { packsFor, round2, usedCost, type PriceBook } from './pricing';
import type { Aisle, Food, Household, Lang, Plan, PlanDay, Recipe } from './types';
import { AISLES } from './types';

export interface ShoppingLine {
  foodId: string;
  aisle: Aisle;
  /** Display name in the store's language (from the price table). */
  storeName: string;
  grams: number;
  available: boolean;
  substitute?: string;
  pantry: boolean;
  packG: number;
  packs: number;
  packPrice: number;
  checkout: number;
  usedCost: number;
  leftoverG: number;
  leftoverDays: number;
  customPrice: boolean;
}

export interface ShoppingList {
  storeId: string;
  lines: ShoppingLine[];
  byAisle: { aisle: Aisle; lines: ShoppingLine[] }[];
  /** Cost of what is eaten this week (incl. pantry share). */
  foodCost: number;
  /** Paid at checkout (whole packs, pantry staples excluded unless includePantry). */
  checkout: number;
  /** Items that cannot be bought in this store. */
  unavailable: ShoppingLine[];
}

export const othersFactor = (h: Household) => Math.max(0, h.adults - 1) + h.kids * CONFIG_SHOPPING.kidPortion;

/** Grams per food for one day, for the whole household. */
export function dayGrams(day: PlanDay, recipes: ReadonlyMap<string, Recipe>, h: Household, into = new Map<string, number>()): Map<string, number> {
  const add = (id: string, g: number) => { if (g > 0) into.set(id, (into.get(id) ?? 0) + g); };
  const others = othersFactor(h);
  for (const m of day.meals) {
    if (m.eatOut) continue;
    for (const [id, g] of Object.entries(m.myGrams)) add(id, g);
    const r = recipes.get(m.recipeId);
    if (r && others > 0 && h.sharedSlots.includes(m.slot)) for (const i of r.ingredients) add(i.food, i.g * others);
  }
  return into;
}

export function planGrams(plan: Pick<Plan, 'days'>, recipes: ReadonlyMap<string, Recipe>, h: Household): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of plan.days) dayGrams(d, recipes, h, out);
  return out;
}

export const isPantry = (f: Food) => CONFIG_SHOPPING.pantryAisles.includes(f.aisle) || CONFIG_SHOPPING.pantryFoods.includes(f.id);

export function buildShoppingList(
  grams: ReadonlyMap<string, number>, book: PriceBook, foods: ReadonlyMap<string, Food>,
  opts: { includePantry?: boolean } = {},
): ShoppingList {
  const lines: ShoppingLine[] = [];
  for (const [foodId, g] of grams) {
    const food = foods.get(foodId);
    if (!food || g <= 0) continue;
    const p = book.get(foodId);
    const pantry = isPantry(food);
    const base = { foodId, aisle: food.aisle, grams: g, pantry, leftoverDays: food.shelfDays, customPrice: book.hasOverride(foodId) };
    if (!p.available) {
      lines.push({ ...base, storeName: food.name[book.table.store.lang] ?? food.name.en, available: false, ...(p.substitute ? { substitute: p.substitute } : {}),
        packG: 0, packs: 0, packPrice: 0, checkout: 0, usedCost: 0, leftoverG: 0 });
      continue;
    }
    const packs = packsFor(g, p.packG);
    lines.push({
      ...base, storeName: p.name, available: true, packG: p.packG, packs, packPrice: p.price,
      checkout: packs * p.price, usedCost: usedCost(g, p), leftoverG: packs * p.packG - g,
    });
  }

  const order = book.table.store.aisleOrder ?? [...AISLES];
  const rank = (a: Aisle) => { const i = order.indexOf(a); return i < 0 ? 99 : i; };
  lines.sort((a, b) => rank(a.aisle) - rank(b.aisle) || a.storeName.localeCompare(b.storeName, book.table.store.lang));

  const byAisle: ShoppingList['byAisle'] = [];
  for (const l of lines) {
    const last = byAisle[byAisle.length - 1];
    if (last?.aisle === l.aisle) last.lines.push(l); else byAisle.push({ aisle: l.aisle, lines: [l] });
  }

  const avail = lines.filter(l => l.available);
  return {
    storeId: book.storeId,
    lines,
    byAisle,
    foodCost: round2(avail.reduce((s, l) => s + l.usedCost, 0)),
    checkout: round2(avail.filter(l => opts.includePantry || !l.pantry).reduce((s, l) => s + l.checkout, 0)),
    unavailable: lines.filter(l => !l.available),
  };
}

/** Pro-rata food cost of a single day (for the week view). */
export function dayCost(day: PlanDay, recipes: ReadonlyMap<string, Recipe>, h: Household, book: PriceBook): { cost: number; unpriced: string[] } {
  let cost = 0;
  const unpriced: string[] = [];
  for (const [id, g] of dayGrams(day, recipes, h)) {
    const p = book.get(id);
    if (p.available) cost += usedCost(g, p); else unpriced.push(id);
  }
  return { cost: round2(cost), unpriced };
}

/** Meals in a plan that use foods the given store does not sell (shown after switching store). */
export function storeConflicts(plan: Pick<Plan, 'days'>, book: PriceBook): { date: string; slot: string; recipeId: string; foods: { foodId: string; substitute?: string }[] }[] {
  const out: ReturnType<typeof storeConflicts> = [];
  for (const d of plan.days) for (const m of d.meals) {
    if (m.eatOut) continue;
    const foods = Object.entries(m.myGrams).filter(([, g]) => g > 0).map(([id]) => book.get(id))
      .filter(p => !p.available).map(p => ({ foodId: p.foodId, ...(!p.available && p.substitute ? { substitute: p.substitute } : {}) }));
    if (foods.length) out.push({ date: d.date, slot: m.slot, recipeId: m.recipeId, foods });
  }
  return out;
}

// ---- share text ----

export interface ShareLabels {
  title: string;           // e.g. "Nákupný zoznam – Lidl Slovensko"
  aisles: Record<Aisle, string>;
  estimate: string;        // "ODHAD"
  checkout: string;        // "Spolu na pokladni"
  pack: (packs: number, packG: number) => string;
  formatPrice: (eur: number) => string;
}

/** Plain-text list for the Web Share API, in the store's language. */
export function shareText(list: ShoppingList, labels: ShareLabels, opts: { includePantry?: boolean; checked?: ReadonlySet<string> } = {}): string {
  const rows: string[] = [labels.title, ''];
  for (const g of list.byAisle) {
    const ls = g.lines.filter(l => l.available && (opts.includePantry || !l.pantry) && !opts.checked?.has(l.foodId));
    if (!ls.length) continue;
    rows.push(labels.aisles[g.aisle].toUpperCase());
    for (const l of ls) rows.push(`☐ ${l.storeName} – ${labels.pack(l.packs, l.packG)} (~${labels.formatPrice(l.checkout)})`);
    rows.push('');
  }
  rows.push(`${labels.checkout}: ~${labels.formatPrice(list.checkout)} (${labels.estimate})`);
  return rows.join('\n');
}

/** Food name for display: the store's product name when the user prefers store language. */
export function displayName(food: Food, book: PriceBook | undefined, uiLang: Lang, preferStoreLang: boolean): string {
  if (preferStoreLang && book) {
    const p = book.get(food.id);
    if (p.available) return p.name;
    return food.name[book.table.store.lang] ?? food.name.en;
  }
  return food.name[uiLang] ?? (uiLang === 'cs' ? food.name.sk : undefined) ?? food.name.en;
}
