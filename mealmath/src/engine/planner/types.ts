import type { PriceBook } from '../pricing';
import type { Allergen, Diet, Equipment, Food, Household, MealSlot, Plan, PlannedMeal, Recipe, Targets } from '../types';
import type { PlanReport } from '../validator';

/** 0 = every meal different … 3 = cook once, eat 4×. */
export type RepetitionLevel = 0 | 1 | 2 | 3;

export interface PlanRequest {
  foods: ReadonlyMap<string, Food>;
  recipes: readonly Recipe[];
  targets: Targets;
  book: PriceBook;
  startDate: string;        // YYYY-MM-DD
  days?: number;            // default 7
  slots: MealSlot[];        // e.g. ['breakfast','lunch','dinner'] (+ 'snack')
  allergens: Allergen[];
  diets: Diet[];
  excludedFoods: string[];
  favoriteFoods: string[];
  equipment: Equipment[];
  household: Household;
  /** Weekly food budget in EUR (compared with the pro-rata food cost). */
  budget?: number;
  repetition: RepetitionLevel;
  /** Meals that must stay as they are (eaten out, already eaten, user-locked). Key: `${date}|${slot}`. */
  locked?: ReadonlyMap<string, PlannedMeal>;
  /** Different seeds give different – but each fully reproducible – plans. */
  seed?: number;
  /** Hard stop for the local search, in ms (the whole plan must stay under 3 s). */
  timeBudgetMs?: number;
}

export interface CookSession {
  id: string;
  recipeId: string;
  /** Positions this pot feeds; my portion is identical in all of them. */
  portions: { date: string; slot: MealSlot }[];
}

export type PlanWarning =
  | { code: 'days_missed'; days: number; maxProteinShortfall: number; maxKcalDeviation: number; dates: string[] }
  | { code: 'over_budget'; by: number }
  | { code: 'few_recipes'; available: number }
  | { code: 'no_recipes_for_slot'; slot: MealSlot };

export interface PlanResult {
  plan: Plan;
  report: PlanReport;
  sessions: CookSession[];
  warnings: PlanWarning[];
  /** Pro-rata cost of the planned food (whole household), EUR. */
  foodCost: number;
  /** Rough total cooking time (one entry per cooking session). */
  cookMinutes: number;
  stats: { iterations: number; ms: number; candidates: number };
}
