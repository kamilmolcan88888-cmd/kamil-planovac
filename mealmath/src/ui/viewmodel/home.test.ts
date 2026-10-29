import { FOOD_MAP, RECIPE_MAP } from '../../data/catalog';
import { bands } from '../../engine/targets';
import type { Plan } from '../../engine/types';
import { validatePlan } from '../../engine/validator';
import { consumed, dayMeals, mealView, nextMeal, streak, weekStatuses } from './home';

const meal = (slot: 'breakfast' | 'lunch' | 'dinner', done = false) =>
  ({ slot, recipeId: 'oats-skyr-banana', myGrams: { oats: 60, milk_semi: 150, skyr: 150, banana: 100, cinnamon: 1 }, done });
const plan: Plan = {
  id: 'p', createdAt: '2026-11-01', storeId: 'lidl-sk', targets: bands(2000, 150),
  days: [
    { date: '2026-11-01', meals: [meal('breakfast', true), meal('lunch', true), meal('dinner', true)] },
    { date: '2026-11-02', meals: [meal('breakfast', true), meal('lunch', true), meal('dinner', true)] },
    { date: '2026-11-03', meals: [meal('breakfast', true), meal('lunch'), { slot: 'dinner', recipeId: '', myGrams: {}, eatOut: { kcal: 700, protein: 40 } }] },
  ],
};

describe('home view-model', () => {
  it('computes meal macros from USDA data and marks eat-out as a user estimate', () => {
    const v = mealView(plan.days[0]!.meals[0]!, RECIPE_MAP, FOOD_MAP);
    const oats = FOOD_MAP.get('oats')!.per100.kcal * 0.6;
    expect(v.macros.kcal).toBeGreaterThan(oats);
    expect(v.userEstimate).toBe(false);
    const out = mealView(plan.days[2]!.meals[2]!, RECIPE_MAP, FOOD_MAP);
    expect(out).toMatchObject({ userEstimate: true, macros: { kcal: 700, protein: 40 } });
  });

  it('consumed counts only ticked meals; next meal is the first unticked', () => {
    const ms = dayMeals(plan, '2026-11-03', RECIPE_MAP, FOOD_MAP);
    expect(consumed(ms).kcal).toBeCloseTo(ms[0]!.macros.kcal);
    expect(nextMeal(ms)?.meal.slot).toBe('lunch');
    expect(dayMeals(plan, '2030-01-01', RECIPE_MAP, FOOD_MAP)).toEqual([]);
  });

  it('streak counts finished days back from today (or yesterday)', () => {
    expect(streak(plan, '2026-11-03')).toBe(2);
    expect(streak(plan, '2026-11-02')).toBe(2);
    expect(streak(undefined, '2026-11-02')).toBe(0);
  });

  it('never shows "verified" without the validator', () => {
    expect(weekStatuses(plan, undefined, '2026-11-01').map(d => d.status)).toEqual(Array(7).fill('none'));
    const report = validatePlan(plan, { foods: FOOD_MAP, recipes: RECIPE_MAP, targets: plan.targets, allergens: [], diets: [], excludedFoods: [] });
    const st = weekStatuses(plan, report, '2026-11-01');
    expect(st.slice(0, 3).map(d => d.status)).toEqual(report.days.map(d => (d.status === 'verified' ? 'verified' : 'outside')));
    expect(st.slice(3).every(d => d.status === 'none')).toBe(true);
    const missing = { ...plan, days: [{ date: '2026-11-01', meals: [meal('breakfast')] }] };
    const r2 = validatePlan(missing, { foods: FOOD_MAP, recipes: RECIPE_MAP, targets: plan.targets, allergens: [], diets: [], excludedFoods: [] });
    expect(weekStatuses(missing, r2, '2026-11-01')[0]!.status).toBe('incomplete');
  });
});
