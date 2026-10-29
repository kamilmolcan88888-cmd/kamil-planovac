import { FOOD_MAP, RECIPE_MAP, RECIPES } from '../../data/catalog';
import { PRICE_TABLES } from '../../data/stores';
import { macrosForGrams, defaultGrams } from '../../engine/nutrition';
import { generatePlan } from '../../engine/planner';
import { PriceBook } from '../../engine/pricing';
import { computeTargets } from '../../engine/targets';
import type { Household } from '../../engine/types';
import { validatePlan } from '../../engine/validator';
import { recipeView } from './recipe';
import { weekView } from './week';

const fam: Household = { adults: 2, kids: 1, sharedSlots: ['lunch', 'dinner'] };
const book = new PriceBook(PRICE_TABLES.get('lidl-sk')!);
const res = generatePlan({
  foods: FOOD_MAP, recipes: RECIPES, startDate: '2026-11-02',
  targets: computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, workoutsPerWeek: 3, goal: 'lose' }),
  book, slots: ['breakfast', 'lunch', 'dinner'], allergens: [], diets: [], excludedFoods: [], favoriteFoods: [],
  equipment: ['stove', 'oven', 'blender', 'microwave', 'toaster'], household: fam, repetition: 2,
});
const report = validatePlan(res.plan, { foods: FOOD_MAP, recipes: RECIPE_MAP, targets: res.plan.targets, allergens: [], diets: [], excludedFoods: [] });

describe('week view', () => {
  const w = weekView({ plan: res.plan, sessions: res.sessions, warnings: res.warnings, report, recipes: RECIPE_MAP, foods: FOOD_MAP, household: fam, book });
  it('mirrors the validator and the shopping maths', () => {
    expect(w.days).toHaveLength(7);
    expect(w.verified).toBe(report.days.filter(d => d.status === 'verified').length);
    w.days.forEach((d, i) => expect(d.totals.kcal).toBeCloseTo(report.days[i]!.totals.kcal));
    expect(w.foodCost).toBeCloseTo(res.foodCost, 1);
  });
  it('numbers the pots and their portions', () => {
    const batched = w.days.flatMap(d => d.meals).filter(m => m.batch);
    expect(batched.length).toBeGreaterThan(0);
    for (const m of batched) expect(m.batch!.i).toBeGreaterThanOrEqual(1);
    expect(w.cookSessions).toBe(res.sessions.length);
    expect(w.portions).toBe(21);
  });
});

describe('recipe view', () => {
  it('my portion = the planned grams; the pot adds my other portions and the household', () => {
    const s = res.sessions.find(x => x.portions.length > 1 && x.portions.some(p => fam.sharedSlots.includes(p.slot)))!;
    const p = s.portions[0]!;
    const recipe = RECIPE_MAP.get(s.recipeId)!;
    const v = recipeView({ recipe, foods: FOOD_MAP, household: fam, plan: res.plan, sessions: res.sessions, date: p.date, slot: p.slot });
    const meal = res.plan.days.find(d => d.date === p.date)!.meals.find(m => m.slot === p.slot)!;
    expect(v.my.grams).toEqual(meal.myGrams);
    expect(v.my.total.kcal).toBeCloseTo(macrosForGrams(meal.myGrams, FOOD_MAP).total.kcal);
    const shared = s.portions.filter(x => fam.sharedSlots.includes(x.slot)).length;
    const [food, g] = Object.entries(meal.myGrams)[0]!;
    const def = recipe.ingredients.find(i => i.food === food)!.g;
    expect(v.pot.grams[food]).toBeCloseTo(g * s.portions.length + def * 1.6 * shared);
    expect(v.timesInPlan).toBeGreaterThanOrEqual(s.portions.length);
  });
  it('outside the plan it shows the default portion', () => {
    const recipe = RECIPES[0]!;
    const v = recipeView({ recipe, foods: FOOD_MAP, household: { adults: 1, kids: 0, sharedSlots: [] } });
    expect(v.meal).toBeUndefined();
    expect(v.my.grams).toEqual(defaultGrams(recipe));
    expect(v.pot.portions).toBe(1);
  });
  it('every line is grams × per-100 g of its USDA record', () => {
    const v = recipeView({ recipe: RECIPES[5]!, foods: FOOD_MAP, household: { adults: 1, kids: 0, sharedSlots: [] } });
    for (const l of v.my.lines) {
      const f = FOOD_MAP.get(l.foodId)!;
      expect(l.fdcId).toBe(f.fdcId);
      expect(l.result.protein).toBeCloseTo((f.per100.protein * l.grams) / 100);
    }
  });
});
