// Pure view-model helpers for the Home screen. All numbers come from the engine.
import { addMacros, macrosForGrams, ZERO, type FoodMap } from '../../engine/nutrition';
import type { Macros, MealSlot, Plan, PlannedMeal, Recipe } from '../../engine/types';
import type { PlanReport } from '../../engine/validator';
import { addDaysISO } from '../../state/dates';

export interface MealView {
  meal: PlannedMeal;
  recipe?: Recipe;
  macros: Macros;
  /** True when macros are the user's own estimate (eating out), not computed from USDA data. */
  userEstimate: boolean;
}

export function mealView(meal: PlannedMeal, recipes: ReadonlyMap<string, Recipe>, foods: FoodMap): MealView {
  if (meal.eatOut) return { meal, macros: { kcal: meal.eatOut.kcal, protein: meal.eatOut.protein, carbs: 0, fat: 0 }, userEstimate: true };
  return { meal, recipe: recipes.get(meal.recipeId), macros: macrosForGrams(meal.myGrams, foods).total, userEstimate: false };
}

export function dayMeals(plan: Plan | undefined, date: string, recipes: ReadonlyMap<string, Recipe>, foods: FoodMap): MealView[] {
  const day = plan?.days.find(d => d.date === date);
  return day ? day.meals.map(m => mealView(m, recipes, foods)) : [];
}

export const consumed = (meals: MealView[]): Macros => meals.filter(m => m.meal.done).reduce((a, m) => addMacros(a, m.macros), ZERO);

const SLOT_HOUR: Record<MealSlot, number> = { breakfast: 10, lunch: 14, snack: 16, dinner: 21 };

/** The first meal not yet ticked off; meals whose time has clearly passed are still offered in order. */
export function nextMeal(meals: MealView[]): MealView | undefined {
  return meals.find(m => !m.meal.done);
}

export const slotEndHour = (s: MealSlot) => SLOT_HOUR[s];

export type DayStatus = 'verified' | 'outside' | 'incomplete' | 'none';

/**
 * Status per day for the week strip. "verified" is shown ONLY when the independent validator
 * confirmed the day; days outside the plan are "none".
 */
export function weekStatuses(plan: Plan | undefined, report: PlanReport | undefined, start: string, days = 7): { date: string; status: DayStatus }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDaysISO(start, i);
    const r = report?.days.find(d => d.date === date);
    const inPlan = plan?.days.some(d => d.date === date && d.meals.length > 0);
    if (!plan || !inPlan || !r) return { date, status: 'none' as const };
    if (r.status === 'verified') return { date, status: 'verified' as const };
    if (r.issues.some(i => i.code === 'missing_slot' || i.code === 'unknown_recipe')) return { date, status: 'incomplete' as const };
    return { date, status: 'outside' as const };
  });
}

/** Consecutive days (ending today, or yesterday if today is not finished) with every meal ticked off. */
export function streak(plan: Plan | undefined, today: string): number {
  if (!plan) return 0;
  const done = (date: string) => { const d = plan.days.find(x => x.date === date); return !!d && d.meals.length > 0 && d.meals.every(m => m.done); };
  let date = done(today) ? today : addDaysISO(today, -1);
  let n = 0;
  while (done(date)) { n++; date = addDaysISO(date, -1); }
  return n;
}
