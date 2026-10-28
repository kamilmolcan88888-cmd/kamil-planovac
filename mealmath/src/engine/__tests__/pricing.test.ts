import { FOODS, RECIPES } from '../__fixtures__/foods';
import { foodMap } from '../nutrition';
import { exportPriceTable, importPriceTable, packsFor, PriceBook, pricePerKg, usedCost } from '../pricing';
import { buildShoppingList, dayCost, displayName, planGrams, shareText, storeConflicts, type ShareLabels } from '../shopping';
import type { Household, Plan, PriceTable, StoreInfo } from '../types';
import { AISLES } from '../types';

const store = (id: string, lang: 'de' | 'sk'): StoreInfo => ({ id, name: id, chain: 'x', country: lang.toUpperCase(), lang, currency: 'EUR' });
const U = '2026-10-01';

// FIXTURE price tables with round numbers.
const DE: PriceTable = { store: store('test-de', 'de'), estimate: true, updated: U, items: {
  chicken: { name: 'Hähnchen', packG: 1000, price: 10, updated: U },
  rice: { name: 'Reis', packG: 1000, price: 2, updated: U },
  oats: { name: 'Haferflocken', packG: 500, price: 1, updated: U },
  skyr: { name: 'Skyr', packG: 500, price: 1.5, updated: U },
  pork: { name: 'Schwein', packG: 500, price: 4, updated: U },
  tofu: { unavailable: true, updated: U },
} };
const SK: PriceTable = { store: store('test-sk', 'sk'), estimate: true, updated: U, items: {
  chicken: { name: 'Kuracie', packG: 500, price: 6, updated: U },
  rice: { name: 'Ryža', packG: 1000, price: 2.5, updated: U },
  oats: { name: 'Vločky', packG: 500, price: 1.2, updated: U },
  skyr: { unavailable: true, substitute: 'tofu', updated: U },
  pork: { name: 'Bravčové', packG: 500, price: 3.5, updated: U },
} };

const foods = foodMap(FOODS);
const recipes = new Map(RECIPES.map(r => [r.id, r]));
const solo: Household = { adults: 1, kids: 0, sharedSlots: [] };

const plan: Plan = {
  id: 'p', createdAt: U, storeId: 'test-de', targets: { kcal: 1500, protein: 120, kcalBand: [1425, 1500], proteinBand: [120, 128] },
  days: [
    { date: '2026-11-02', meals: [
      { slot: 'breakfast', recipeId: 'oats-skyr', myGrams: { oats: 60, skyr: 220 } },
      { slot: 'lunch', recipeId: 'chicken-rice', myGrams: { chicken: 200, rice: 100 } },
      { slot: 'dinner', recipeId: 'chicken-rice', myGrams: { chicken: 150, rice: 150 } },
    ] },
    { date: '2026-11-03', meals: [
      { slot: 'breakfast', recipeId: 'oats-skyr', myGrams: { oats: 60, skyr: 220 } },
      { slot: 'lunch', recipeId: 'chicken-rice', myGrams: { chicken: 200, rice: 100 } },
      { slot: 'dinner', recipeId: '', myGrams: {}, eatOut: { kcal: 600, protein: 40 } },
    ] },
  ],
};
// totals: oats 120, skyr 440, chicken 550, rice 350

describe('pack maths', () => {
  it('rounds packs up', () => {
    expect(packsFor(0, 500)).toBe(0);
    expect(packsFor(1, 500)).toBe(1);
    expect(packsFor(500, 500)).toBe(1);
    expect(packsFor(500.0000001, 500)).toBe(1);
    expect(packsFor(501, 500)).toBe(2);
  });
  it('pro-rata and per kg', () => {
    expect(usedCost(250, { packG: 500, price: 2 })).toBe(1);
    expect(pricePerKg({ packG: 250, price: 1.5 })).toBe(6);
  });
});

describe('PriceBook', () => {
  it('reads the table and marks unavailable items', () => {
    const b = new PriceBook(SK);
    expect(b.get('chicken')).toMatchObject({ available: true, name: 'Kuracie', price: 6, source: 'table' });
    expect(b.get('skyr')).toEqual({ foodId: 'skyr', available: false, substitute: 'tofu' });
    expect(b.get('peanut')).toEqual({ foodId: 'peanut', available: false }); // not listed at all
  });

  it('local overrides win, only for their store, and can re-enable an item', () => {
    const b = new PriceBook(SK, [
      { storeId: 'test-sk', foodId: 'chicken', packG: 1000, price: 9.9, updated: '2026-10-20' },
      { storeId: 'test-sk', foodId: 'skyr', packG: 450, price: 1.79, name: 'Skyr natur', updated: '2026-10-20' },
      { storeId: 'test-de', foodId: 'rice', packG: 1, price: 99, updated: '2026-10-20' },
    ]);
    expect(b.get('chicken')).toMatchObject({ price: 9.9, packG: 1000, source: 'override', name: 'Kuracie' });
    expect(b.get('skyr')).toMatchObject({ available: true, name: 'Skyr natur' });
    expect(b.get('rice')).toMatchObject({ price: 2.5, source: 'table' });
    expect(b.hasOverride('chicken')).toBe(true);
  });
});

describe('shopping list', () => {
  it('aggregates the plan, skips eat-out, rounds to packs and computes both totals', () => {
    const grams = planGrams(plan, recipes, solo);
    expect(Object.fromEntries(grams)).toEqual({ oats: 120, skyr: 440, chicken: 550, rice: 350 });
    const list = buildShoppingList(grams, new PriceBook(DE), foods);
    const chicken = list.lines.find(l => l.foodId === 'chicken')!;
    expect(chicken).toMatchObject({ packs: 1, checkout: 10, leftoverG: 450, usedCost: 5.5, storeName: 'Hähnchen' });
    // food: oats 0.24 + skyr 1.32 + chicken 5.5 + rice 0.7 = 7.76; checkout: 1 + 1.5 + 10 + 2 = 14.5
    expect(list.foodCost).toBe(7.76);
    expect(list.checkout).toBe(14.5);
    expect(list.byAisle.map(a => a.aisle)).toEqual(['meat', 'dairy', 'dry_goods']);
  });

  it('scales shared meals for the household', () => {
    const fam: Household = { adults: 2, kids: 1, sharedSlots: ['lunch', 'dinner'] };
    // others = 1 + 0.6 = 1.6 × default (chicken 200, rice 80) on 3 shared meals with a recipe
    const g = planGrams(plan, recipes, fam);
    expect(g.get('chicken')).toBeCloseTo(550 + 3 * 200 * 1.6);
    expect(g.get('rice')).toBeCloseTo(350 + 3 * 80 * 1.6);
    expect(g.get('oats')).toBe(120); // breakfast is only for me
  });

  it('day cost uses pro-rata prices', () => {
    expect(dayCost(plan.days[0]!, recipes, solo, new PriceBook(DE))).toEqual({ cost: round(0.12 + 0.66 + 3.5 + 0.5), unpriced: [] });
  });
});

describe('switching store', () => {
  it('recomputes prices and names instantly and leaves the plan untouched', () => {
    const before = JSON.stringify(plan);
    const grams = planGrams(plan, recipes, solo);
    const de = buildShoppingList(grams, new PriceBook(DE), foods);
    const sk = buildShoppingList(grams, new PriceBook(SK), foods);
    expect(JSON.stringify(plan)).toBe(before);

    // chicken 550 g: DE 1 × 1000 g × 10 € ; SK 2 × 500 g × 6 €
    expect(de.lines.find(l => l.foodId === 'chicken')).toMatchObject({ packs: 1, checkout: 10 });
    expect(sk.lines.find(l => l.foodId === 'chicken')).toMatchObject({ packs: 2, checkout: 12, storeName: 'Kuracie', leftoverG: 450 });
    expect(sk.unavailable.map(l => l.foodId)).toEqual(['skyr']);
    // SK: oats 1.2 + chicken 12 + rice 2.5 = 15.7 (skyr not purchasable)
    expect(sk.checkout).toBe(15.7);
    expect(sk.storeId).toBe('test-sk');
  });

  it('lists meals that need a swap in the new store, with substitutes', () => {
    const c = storeConflicts(plan, new PriceBook(SK));
    expect(c).toEqual([
      { date: '2026-11-02', slot: 'breakfast', recipeId: 'oats-skyr', foods: [{ foodId: 'skyr', substitute: 'tofu' }] },
      { date: '2026-11-03', slot: 'breakfast', recipeId: 'oats-skyr', foods: [{ foodId: 'skyr', substitute: 'tofu' }] },
    ]);
    expect(storeConflicts(plan, new PriceBook(DE))).toEqual([]);
  });

  it('overrides apply after a switch back and forth', () => {
    const ov = [{ storeId: 'test-sk', foodId: 'chicken', packG: 1000, price: 9, updated: U }];
    const grams = planGrams(plan, recipes, solo);
    expect(buildShoppingList(grams, new PriceBook(SK, ov), foods).lines.find(l => l.foodId === 'chicken')!.checkout).toBe(9);
    expect(buildShoppingList(grams, new PriceBook(DE, ov), foods).lines.find(l => l.foodId === 'chicken')!.checkout).toBe(10);
  });
});

describe('display names and share text', () => {
  const f = foods.get('chicken')!;
  it('uses store product names when preferred', () => {
    expect(displayName(f, new PriceBook(DE), 'sk', true)).toBe('Hähnchen');
    expect(displayName(f, new PriceBook(DE), 'sk', false)).toBe('chicken'); // fixture only has en
  });

  it('share text is in the store language and says ESTIMATE', () => {
    const list = buildShoppingList(planGrams(plan, recipes, solo), new PriceBook(DE), foods);
    const labels: ShareLabels = {
      title: 'Einkaufsliste – test-de', aisles: Object.fromEntries(AISLES.map(a => [a, a])) as ShareLabels['aisles'],
      estimate: 'SCHÄTZUNG', checkout: 'Summe an der Kasse',
      pack: (n, g) => `${n} × ${g} g`, formatPrice: v => `${v.toFixed(2).replace('.', ',')} €`,
    };
    const txt = shareText(list, labels, { checked: new Set(['rice']) });
    expect(txt).toContain('☐ Hähnchen – 1 × 1000 g (~10,00 €)');
    expect(txt).not.toContain('Reis');
    expect(txt).toMatch(/Summe an der Kasse: ~14,50 € \(SCHÄTZUNG\)$/);
  });
});

describe('export / import', () => {
  const bundled = new Map([[DE.store.id, DE], [SK.store.id, SK]]);
  it('round-trips overrides through a JSON file', () => {
    const ov = [{ storeId: 'test-sk', foodId: 'chicken', packG: 1000, price: 9.5, updated: '2026-10-20' }];
    const file = JSON.parse(JSON.stringify(exportPriceTable(new PriceBook(SK, ov), '2026-10-28')));
    expect(file.estimate).toBe(true);
    expect(file.items.chicken).toEqual({ name: 'Kuracie', packG: 1000, price: 9.5, updated: '2026-10-20' });
    const r = importPriceTable(file, bundled, foods, '2026-10-28');
    expect(r.errors).toEqual([]);
    expect(r.overrides).toEqual(ov.map(o => ({ ...o, name: 'Kuracie' })));
  });

  it('rejects garbage and reports bad items', () => {
    expect(importPriceTable(null, bundled, foods, U).errors).toEqual(['invalid_file']);
    expect(importPriceTable({ store: { id: 'nope' }, items: {} }, bundled, foods, U).errors).toEqual(['unknown_store:nope']);
    const r = importPriceTable({ store: { id: 'test-de' }, items: { chicken: { packG: -1, price: 2 }, ghost: { packG: 1, price: 1 }, rice: { packG: 1000, price: 1.9 } } }, bundled, foods, U);
    expect(r.errors).toEqual(['invalid_item:chicken', 'unknown_food:ghost']);
    expect(r.overrides).toEqual([{ storeId: 'test-de', foodId: 'rice', packG: 1000, price: 1.9, updated: U }]);
  });
});

function round(v: number) { return Math.round(v * 100) / 100; }
