// Planner tests on the REAL data (foods.json from USDA, recipes, bundled store prices).
import { FOOD_MAP, RECIPE_MAP, RECIPES } from '../../data/catalog';
import { PRICE_TABLES } from '../../data/stores';
import { portionMaxScale } from '../config';
import { foodFitsDiet } from '../diet';
import { generatePlan, type PlanRequest } from '../planner';
import { PriceBook } from '../pricing';
import { buildShoppingList, planGrams } from '../shopping';
import { computeTargets } from '../targets';
import type { BodyProfile, PlannedMeal } from '../types';
import { validatePlan } from '../validator';

const MALE: BodyProfile = { sex: 'male', age: 30, heightCm: 180, weightKg: 80, workoutsPerWeek: 3, goal: 'lose' };
const req = (over: Partial<PlanRequest> & { profile?: BodyProfile; store?: string } = {}): PlanRequest => {
  const { profile, store, ...rest } = over;
  return {
    foods: FOOD_MAP, recipes: RECIPES, startDate: '2026-11-02', targets: computeTargets(profile ?? MALE),
    book: new PriceBook(PRICE_TABLES.get(store ?? 'lidl-sk')!), slots: ['breakfast', 'lunch', 'dinner'],
    allergens: [], diets: [], excludedFoods: [], favoriteFoods: [], equipment: ['stove', 'oven', 'blender', 'microwave', 'toaster'],
    household: { adults: 1, kids: 0, sharedSlots: [] }, repetition: 1, ...rest,
  };
};
const meals = (r: ReturnType<typeof generatePlan>) => r.plan.days.flatMap(d => d.meals);
const usedFoods = (r: ReturnType<typeof generatePlan>) => new Set(meals(r).flatMap(m => Object.entries(m.myGrams).filter(([, g]) => g > 0).map(([f]) => f)));
const ctxFor = (q: PlanRequest) => ({
  foods: FOOD_MAP, recipes: RECIPE_MAP, targets: q.targets, allergens: q.allergens, diets: q.diets,
  excludedFoods: q.excludedFoods, availableFoods: q.book.availableFoods(FOOD_MAP.keys()), requiredSlots: q.slots,
});

describe('standard week', () => {
  const q = req();
  const r = generatePlan(q);

  it('every day verified, under 3 s', () => {
    expect(r.report.ok).toBe(true);
    expect(r.report.days.map(d => d.status)).toEqual(Array(7).fill('verified'));
    expect(r.warnings).toEqual([]);
    expect(r.stats.ms).toBeLessThan(3000);
  });

  it('an independent re-validation agrees', () => {
    const again = validatePlan(r.plan, ctxFor(q));
    expect(again.ok).toBe(true);
    for (const d of again.days) {
      expect(d.totals.kcal).toBeGreaterThanOrEqual(q.targets.kcalBand[0]);
      expect(d.totals.kcal).toBeLessThanOrEqual(q.targets.kcalBand[1]);
      expect(d.totals.protein).toBeGreaterThanOrEqual(q.targets.proteinBand[0]);
      expect(d.totals.protein).toBeLessThanOrEqual(q.targets.proteinBand[1]);
    }
  });

  it('7 days × 3 meals, existing recipes, grams within ranges', () => {
    expect(r.plan.days).toHaveLength(7);
    for (const d of r.plan.days) expect(d.meals.map(m => m.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
    for (const m of meals(r)) {
      const rec = RECIPE_MAP.get(m.recipeId)!;
      expect(rec.meals).toContain(m.slot);
      for (const [f, g] of Object.entries(m.myGrams)) {
        const i = rec.ingredients.find(x => x.food === f)!;
        expect(g).toBeGreaterThanOrEqual(i.min);
        expect(g).toBeLessThanOrEqual(i.max * portionMaxScale(q.targets.kcal));
      }
    }
  });

  it('a batch pot gives identical portions and respects shelf life', () => {
    const batches = r.sessions.filter(s => s.portions.length > 1);
    expect(batches.length).toBeGreaterThan(0);
    for (const s of batches) {
      const ms = meals(r).filter(m => m.batchId === s.id);
      expect(ms).toHaveLength(s.portions.length);
      expect(new Set(ms.map(m => JSON.stringify(m.myGrams))).size).toBe(1);
      const days = s.portions.map(p => Date.parse(p.date));
      expect((Math.max(...days) - Math.min(...days)) / 86_400_000).toBeLessThan(RECIPE_MAP.get(s.recipeId)!.batch.keepsDays);
    }
  });

  it('food cost matches the shopping list', () => {
    expect(r.foodCost).toBe(buildShoppingList(planGrams(r.plan, RECIPE_MAP, q.household), q.book, FOOD_MAP).foodCost);
  });

  it('only uses foods the store sells', () => {
    for (const f of usedFoods(r)) expect(q.book.isAvailable(f)).toBe(true);
  });
});

describe('determinism', () => {
  it('same input → same plan; other seed → other plan', () => {
    const a = generatePlan(req()), b = generatePlan(req());
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
    const c = generatePlan(req({ seed: 7 }));
    expect(JSON.stringify(c.plan)).not.toBe(JSON.stringify(a.plan));
    expect(c.report.ok).toBe(true);
  });
});

describe('hard constraints', () => {
  it('allergies (gluten + milk): none of their foods appear', () => {
    const q = req({ allergens: ['gluten', 'milk'] });
    const r = generatePlan(q);
    for (const f of usedFoods(r)) expect(FOOD_MAP.get(f)!.allergens.filter(a => a === 'gluten' || a === 'milk')).toEqual([]);
    expect(r.report.ok).toBe(true);
  });

  it.each([['vegetarian'], ['pescatarian'], ['no_pork']] as const)('%s diet', diet => {
    const r = generatePlan(req({ diets: [diet] }));
    for (const f of usedFoods(r)) expect(foodFitsDiet(FOOD_MAP.get(f)!, [diet])).toBe(true);
    expect(r.report.ok).toBe(true);
  });

  it('low carb: ≤ 25 g carbs per meal', () => {
    const r = generatePlan(req({ diets: ['low_carb'] }));
    expect(r.report.ok).toBe(true);
    for (const m of meals(r)) {
      const carbs = Object.entries(m.myGrams).reduce((s, [f, g]) => s + FOOD_MAP.get(f)!.per100.carbs * g / 100, 0);
      expect(carbs).toBeLessThanOrEqual(25.5);
    }
  });

  it('excluded foods never appear', () => {
    const r = generatePlan(req({ excludedFoods: ['chicken_breast', 'skyr'] }));
    expect(usedFoods(r).has('chicken_breast')).toBe(false);
    expect(usedFoods(r).has('skyr')).toBe(false);
    expect(r.report.ok).toBe(true);
  });

  it('equipment: stove only → no oven or blender recipes', () => {
    const r = generatePlan(req({ equipment: ['stove'] }));
    for (const m of meals(r)) expect(RECIPE_MAP.get(m.recipeId)!.equipment.every(e => e === 'stove')).toBe(true);
  });
});

describe('repetition and batch cooking', () => {
  it('level 0: no lunch/dinner recipe twice; level 3 cooks less often', () => {
    const r0 = generatePlan(req({ repetition: 0 }));
    const mains = meals(r0).filter(m => m.slot !== 'breakfast').map(m => m.recipeId);
    expect(new Set(mains).size).toBe(mains.length);
    const r3 = generatePlan(req({ repetition: 3 }));
    expect(r3.sessions.length).toBeLessThan(r0.sessions.length);
    expect(r3.report.ok).toBe(true);
  });

  it('level 2 is close to ~11 cooking sessions for 21 portions', () => {
    const r = generatePlan(req({ repetition: 2 }));
    expect(r.sessions.length).toBeLessThanOrEqual(14);
    expect(r.report.ok).toBe(true);
  });
});

describe('household, budget, big appetite', () => {
  it('cooks shared meals for the family', () => {
    const solo = generatePlan(req());
    const fam = generatePlan(req({ household: { adults: 2, kids: 1, sharedSlots: ['lunch', 'dinner'] } }));
    expect(fam.foodCost).toBeGreaterThan(solo.foodCost * 1.5);
    expect(fam.report.ok).toBe(true);
  });

  it('warns when over budget and never trades targets for money', () => {
    const r = generatePlan(req({ budget: 25 }));
    expect(r.warnings).toContainEqual({ code: 'over_budget', by: expect.any(Number) });
    expect(r.report.ok).toBe(true);
    expect(generatePlan(req({ budget: 200 })).warnings).toEqual([]);
  });

  it('3850 kcal with snacks', () => {
    const q = req({ slots: ['breakfast', 'lunch', 'dinner', 'snack'], profile: { sex: 'male', age: 35, heightCm: 190, weightKg: 100, workoutsPerWeek: 6, goal: 'gain' } });
    const r = generatePlan(q);
    expect(q.targets.kcal).toBe(3850);
    expect(r.report.ok).toBe(true);
  });
});

describe('locked meals and eating out', () => {
  it('keeps an eat-out dinner and re-balances the rest of that day', () => {
    const locked = new Map<string, PlannedMeal>([['2026-11-04|dinner', { slot: 'dinner', recipeId: '', myGrams: {}, eatOut: { kcal: 900, protein: 45 } }]]);
    const r = generatePlan(req({ locked }));
    const day = r.plan.days.find(d => d.date === '2026-11-04')!;
    expect(day.meals.find(m => m.slot === 'dinner')!.eatOut).toEqual({ kcal: 900, protein: 45 });
    const rep = r.report.days.find(d => d.date === '2026-11-04')!;
    expect(rep.status).toBe('verified');
    expect(rep.includesUserEstimate).toBe(true);
  });
});

describe('infeasible requests', () => {
  it('returns the best plan with an honest warning (vegan, high protein)', () => {
    const r = generatePlan(req({ diets: ['vegan'], profile: { sex: 'female', age: 28, heightCm: 168, weightKg: 62, workoutsPerWeek: 2, goal: 'maintain' } }));
    expect(r.report.ok).toBe(false);
    const w = r.warnings.find(x => x.code === 'days_missed');
    expect(w).toMatchObject({ days: r.report.failedDays, maxProteinShortfall: Math.ceil(r.report.maxProteinShortfall) });
    expect(r.plan.days.every(d => d.meals.length === 3)).toBe(true);
    for (const f of usedFoods(r)) expect(foodFitsDiet(FOOD_MAP.get(f)!, ['vegan'])).toBe(true);
  });
});

describe('all stores', () => {
  it.each(['lidl-de', 'lidl-sk', 'kaufland-sk'])('%s: verified week', store => {
    const r = generatePlan(req({ store }));
    expect(r.report.ok).toBe(true);
    expect(r.plan.storeId).toBe(store);
  });
});
