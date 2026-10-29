/**
 * Independent plan validator.
 *
 * It recomputes every day straight from foods.json (grams × per-100 g) with its own
 * arithmetic – it deliberately does NOT reuse nutrition.ts or the planner – and rejects
 * any plan that breaks a target band or a hard constraint. The UI may only show a day
 * as "verified" when this module says so.
 */
import type { Allergen, Diet, Food, Macros, Plan, PlanDay, Recipe, Targets } from './types';
import { foodFitsDiet, LOW_CARB_MAX_PER_MEAL } from './diet';
import { portionMaxScale } from './config';

export interface ValidationContext {
  foods: ReadonlyMap<string, Food>;
  recipes: ReadonlyMap<string, Recipe>;
  targets: Targets;
  allergens: readonly Allergen[];
  diets: readonly Diet[];
  excludedFoods: readonly string[];
  /** Foods sold by the selected store. Omit to skip the availability check. */
  availableFoods?: ReadonlySet<string>;
  /** Slots that must be present each day (default breakfast, lunch, dinner). */
  requiredSlots?: readonly string[];
  /** Factor applied to recipe maxima for big appetites; defaults to portionMaxScale(targets.kcal). */
  maxScale?: number;
}

export type IssueCode =
  | 'unknown_recipe' | 'unknown_food' | 'grams_out_of_range' | 'ingredient_not_in_recipe'
  | 'allergen' | 'diet' | 'excluded_food' | 'unavailable' | 'missing_slot' | 'low_carb'
  | 'kcal_low' | 'kcal_high' | 'protein_low' | 'protein_high';

export interface Issue {
  code: IssueCode;
  date: string;
  slot?: string;
  recipeId?: string;
  foodId?: string;
  /** For band issues: how far outside the band (kcal or g, always positive). */
  by?: number;
}

export type DayStatus = 'verified' | 'outside_targets' | 'invalid';

export interface DayReport {
  date: string;
  totals: Macros;
  status: DayStatus;
  /** True when part of the day is a user-entered "eat out" estimate. */
  includesUserEstimate: boolean;
  issues: Issue[];
}

export interface PlanReport {
  ok: boolean;
  days: DayReport[];
  /** Days outside bands, with the protein shortfall in grams (for "X days missed by Y g"). */
  failedDays: number;
  maxProteinShortfall: number;
  maxKcalDeviation: number;
}

const BAND_ISSUES: ReadonlySet<IssueCode> = new Set(['kcal_low', 'kcal_high', 'protein_low', 'protein_high']);
const EPS = 0.5; // rounding tolerance: values are shown rounded to whole kcal / g

export function validateDay(day: PlanDay, ctx: ValidationContext): DayReport {
  const issues: Issue[] = [];
  let kcal = 0, protein = 0, carbs = 0, fat = 0;
  let includesUserEstimate = false;
  const push = (i: Omit<Issue, 'date'>) => issues.push({ date: day.date, ...i });
  const maxScale = ctx.maxScale ?? portionMaxScale(ctx.targets.kcal);

  for (const slot of ctx.requiredSlots ?? ['breakfast', 'lunch', 'dinner']) {
    if (!day.meals.some(m => m.slot === slot)) push({ code: 'missing_slot', slot });
  }

  for (const meal of day.meals) {
    if (meal.eatOut) {
      includesUserEstimate = true;
      kcal += meal.eatOut.kcal;
      protein += meal.eatOut.protein;
      continue;
    }
    const recipe = ctx.recipes.get(meal.recipeId);
    if (!recipe) { push({ code: 'unknown_recipe', slot: meal.slot, recipeId: meal.recipeId }); continue; }

    let mealCarbs = 0;
    for (const [foodId, grams] of Object.entries(meal.myGrams)) {
      const food = ctx.foods.get(foodId);
      const at = { slot: meal.slot, recipeId: recipe.id, foodId };
      if (!food) { push({ code: 'unknown_food', ...at }); continue; }

      const ing = recipe.ingredients.find(i => i.food === foodId);
      if (!ing) push({ code: 'ingredient_not_in_recipe', ...at });
      else if (grams < ing.min - 1e-6 || grams > ing.max * maxScale + 1e-6) push({ code: 'grams_out_of_range', ...at });

      if (grams > 0) {
        for (const a of food.allergens) if (ctx.allergens.includes(a)) push({ code: 'allergen', ...at });
        if (!foodFitsDiet(food, ctx.diets)) push({ code: 'diet', ...at });
        if (ctx.excludedFoods.includes(foodId)) push({ code: 'excluded_food', ...at });
        if (ctx.availableFoods && !ctx.availableFoods.has(foodId)) push({ code: 'unavailable', ...at });
      }

      const k = grams / 100;
      kcal += food.per100.kcal * k;
      protein += food.per100.protein * k;
      carbs += food.per100.carbs * k;
      fat += food.per100.fat * k;
      mealCarbs += food.per100.carbs * k;
    }
    if (ctx.diets.includes('low_carb') && mealCarbs > LOW_CARB_MAX_PER_MEAL + EPS) {
      push({ code: 'low_carb', slot: meal.slot, recipeId: recipe.id, by: mealCarbs - LOW_CARB_MAX_PER_MEAL });
    }
  }

  const { kcalBand: [kLo, kHi], proteinBand: [pLo, pHi] } = ctx.targets;
  if (kcal < kLo - EPS) push({ code: 'kcal_low', by: kLo - kcal });
  if (kcal > kHi + EPS) push({ code: 'kcal_high', by: kcal - kHi });
  if (protein < pLo - EPS) push({ code: 'protein_low', by: pLo - protein });
  if (protein > pHi + EPS) push({ code: 'protein_high', by: protein - pHi });

  const hard = issues.some(i => !BAND_ISSUES.has(i.code));
  const status: DayStatus = hard ? 'invalid' : issues.length ? 'outside_targets' : 'verified';
  return { date: day.date, totals: { kcal, protein, carbs, fat }, status, includesUserEstimate, issues };
}

export function validatePlan(plan: Pick<Plan, 'days'>, ctx: ValidationContext): PlanReport {
  const days = plan.days.map(d => validateDay(d, ctx));
  const failed = days.filter(d => d.status !== 'verified');
  const by = (code: IssueCode) => Math.max(0, ...days.flatMap(d => d.issues.filter(i => i.code === code).map(i => i.by ?? 0)));
  return {
    ok: failed.length === 0,
    days,
    failedDays: failed.length,
    maxProteinShortfall: by('protein_low'),
    maxKcalDeviation: Math.max(by('kcal_low'), by('kcal_high')),
  };
}
