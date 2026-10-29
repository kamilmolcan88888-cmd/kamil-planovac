import { FOODS, RECIPES } from '../__fixtures__/foods';
import { foodMap } from '../nutrition';
import { bands } from '../targets';
import type { PlanDay } from '../types';
import { validateDay, validatePlan, type ValidationContext } from '../validator';

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  foods: foodMap(FOODS),
  recipes: new Map(RECIPES.map(r => [r.id, r])),
  targets: bands(1500, 120), // kcal 1425–1500, protein 120–128
  allergens: [], diets: [], excludedFoods: [],
  ...over,
});

// breakfast: oats 60 g (240 kcal, 6 P) + skyr 300 g (150 kcal, 30 P) = 390 kcal, 36 P
// lunch:     chicken 200 g (200, 40) + rice 100 g (300, 10)          = 500 kcal, 50 P
// dinner:    chicken 150 g (150, 30) + rice 150 g (450, 15)          = 600 kcal, 45 P
const goodDay: PlanDay = {
  date: '2026-11-02',
  meals: [
    { slot: 'breakfast', recipeId: 'oats-skyr', myGrams: { oats: 60, skyr: 300 } },
    { slot: 'lunch', recipeId: 'chicken-rice', myGrams: { chicken: 200, rice: 100 } },
    { slot: 'dinner', recipeId: 'chicken-rice', myGrams: { chicken: 150, rice: 150 } },
  ],
};
// totals: kcal 390 + 500 + 600 = 1490, protein 36 + 50 + 45 = 131 → too much protein for 120–128

const withGrams = (day: PlanDay, slot: string, g: Record<string, number>): PlanDay => ({
  ...day, meals: day.meals.map(m => (m.slot === slot ? { ...m, myGrams: g } : m)),
});

describe('validateDay – arithmetic', () => {
  it('sums grams × per-100 g independently', () => {
    const r = validateDay(goodDay, ctx());
    expect(r.totals.kcal).toBeCloseTo(1490);
    expect(r.totals.protein).toBeCloseTo(131);
    expect(r.totals.carbs).toBeCloseTo(36 + 12 + 70 + 105);
    expect(r.totals.fat).toBeCloseTo(6 + 4 + 1 + 3 + 1.5);
  });

  it('accepts a day inside both bands', () => {
    // breakfast skyr 220 g → 390 − 40 = 350 kcal, 36 − 8 = 28 P; day: 1450 kcal, 123 P
    const day = withGrams(goodDay, 'breakfast', { oats: 60, skyr: 220 });
    const r = validateDay(day, ctx());
    expect(r.issues).toEqual([]);
    expect(r.status).toBe('verified');
  });

  it('rejects protein above the upper reserve', () => {
    const r = validateDay(goodDay, ctx());
    expect(r.status).toBe('outside_targets');
    expect(r.issues).toEqual([expect.objectContaining({ code: 'protein_high', by: expect.closeTo(3, 5) })]);
  });

  it('rejects protein under the floor and reports the shortfall', () => {
    const day = withGrams(goodDay, 'lunch', { chicken: 100, rice: 133 }); // 100 + 399 kcal, 20 + 13.3 P
    const r = validateDay(day, ctx());
    expect(r.issues.find(i => i.code === 'protein_low')?.by).toBeCloseTo(120 - (36 + 33.3 + 45), 1);
  });

  it('rejects kcal below and above the band', () => {
    expect(validateDay(withGrams(goodDay, 'dinner', { chicken: 150, rice: 100 }), ctx()).issues.map(i => i.code)).toContain('kcal_low');
    expect(validateDay(withGrams(goodDay, 'dinner', { chicken: 150, rice: 200 }), ctx()).issues.map(i => i.code)).toContain('kcal_high');
  });
});

describe('validateDay – hard constraints', () => {
  it('flags allergens', () => {
    const r = validateDay(goodDay, ctx({ allergens: ['gluten'] }));
    expect(r.status).toBe('invalid');
    expect(r.issues).toContainEqual(expect.objectContaining({ code: 'allergen', foodId: 'oats' }));
  });

  it('flags diet violations', () => {
    expect(validateDay(goodDay, ctx({ diets: ['vegetarian'] })).issues.filter(i => i.code === 'diet')).toHaveLength(2);
    expect(validateDay(goodDay, ctx({ diets: ['vegan'] })).issues.some(i => i.foodId === 'skyr')).toBe(true);
    const pork: PlanDay = { ...goodDay, meals: [...goodDay.meals.slice(0, 2), { slot: 'dinner', recipeId: 'pork-rice', myGrams: { pork: 150, rice: 100 } }] };
    expect(validateDay(pork, ctx({ diets: ['no_pork'] })).issues.some(i => i.code === 'diet')).toBe(true);
    expect(validateDay(pork, ctx({ diets: ['pescatarian'] })).issues.some(i => i.foodId === 'pork')).toBe(true);
  });

  it('flags excluded and unavailable foods', () => {
    expect(validateDay(goodDay, ctx({ excludedFoods: ['rice'] })).issues.filter(i => i.code === 'excluded_food')).toHaveLength(2);
    const r = validateDay(goodDay, ctx({ availableFoods: new Set(['oats', 'skyr', 'rice']) }));
    expect(r.issues.filter(i => i.code === 'unavailable').map(i => i.foodId)).toEqual(['chicken', 'chicken']);
  });

  it('flags grams outside the recipe range and foreign ingredients', () => {
    const day = withGrams(goodDay, 'lunch', { chicken: 500, rice: 100, peanut: 10 });
    const codes = validateDay(day, ctx()).issues.map(i => i.code);
    expect(codes).toContain('grams_out_of_range');
    expect(codes).toContain('ingredient_not_in_recipe');
  });

  it('flags unknown recipes/foods and missing slots', () => {
    const day: PlanDay = { date: 'x', meals: [{ slot: 'lunch', recipeId: 'nope', myGrams: {} }, { slot: 'dinner', recipeId: 'chicken-rice', myGrams: { ghost: 10 } }] };
    const codes = validateDay(day, ctx()).issues.map(i => i.code);
    expect(codes).toEqual(expect.arrayContaining(['missing_slot', 'unknown_recipe', 'unknown_food']));
  });

  it('enforces low-carb per meal', () => {
    const r = validateDay(goodDay, ctx({ diets: ['low_carb'] }));
    expect(r.issues.filter(i => i.code === 'low_carb').map(i => i.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
  });
});

describe('eat-out estimate', () => {
  it('counts the user estimate and marks the day', () => {
    const day: PlanDay = { ...goodDay, meals: [goodDay.meals[0]!, goodDay.meals[1]!, { slot: 'dinner', recipeId: '', myGrams: {}, eatOut: { kcal: 600, protein: 45 } }] };
    const r = validateDay(withGrams(day, 'breakfast', { oats: 60, skyr: 220 }), ctx());
    expect(r.totals.kcal).toBeCloseTo(350 + 500 + 600);
    expect(r.includesUserEstimate).toBe(true);
    expect(r.status).toBe('verified');
  });
});

describe('validatePlan', () => {
  it('summarises failed days and the largest shortfall', () => {
    const ok = withGrams(goodDay, 'breakfast', { oats: 60, skyr: 220 });
    const short = withGrams(ok, 'lunch', { chicken: 100, rice: 133 });
    const rep = validatePlan({ days: [ok, short, ok] }, ctx());
    expect(rep.ok).toBe(false);
    expect(rep.failedDays).toBe(1);
    expect(rep.maxProteinShortfall).toBeCloseTo(120 - (28 + 33.3 + 45), 1);
    expect(validatePlan({ days: [ok, ok] }, ctx()).ok).toBe(true);
  });
});
