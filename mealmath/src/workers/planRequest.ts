// Builds planner requests from stored settings. Shared by the worker and tests.
import { FOOD_MAP, RECIPES } from '../data/catalog';
import { PRICE_TABLES } from '../data/stores';
import { eatOut, excludeFood, fixStoreConflicts, replanRest, swapMeal, swapOptions, type ChangePreview } from '../engine/changes';
import { generatePlan, type PlanRequest, type PlanResult } from '../engine/planner';
import { PriceBook } from '../engine/pricing';
import { bands, computeTargets } from '../engine/targets';
import type { MealSlot, Plan, PlannedMeal, PriceOverride, Targets } from '../engine/types';
import { addDays } from '../engine/planner/sessions';
import type { AppSettings } from '../state/db';

export function targetsFor(s: Pick<AppSettings, 'profile' | 'targetsOverride'>): Targets {
  return s.targetsOverride ? bands(s.targetsOverride.kcal, s.targetsOverride.protein) : computeTargets(s.profile);
}

export function bookFor(storeId: string, overrides: PriceOverride[]): PriceBook {
  const table = PRICE_TABLES.get(storeId) ?? [...PRICE_TABLES.values()][0]!;
  return new PriceBook(table, overrides);
}

/** Meals the user doesn't cook become fixed "eat out" estimates on every day of the plan. */
export function externalLocked(s: AppSettings, startDate: string, days: number): Map<string, PlannedMeal> {
  const out = new Map<string, PlannedMeal>();
  for (const [slot, est] of Object.entries(s.externalMeals ?? {})) {
    if (!est || s.slots.includes(slot as MealSlot)) continue;
    for (let i = 0; i < days; i++) {
      const date = addDays(startDate, i);
      out.set(`${date}|${slot}`, { slot: slot as MealSlot, recipeId: '', myGrams: {}, eatOut: { kcal: est.kcal, protein: est.protein, note: 'external' } });
    }
  }
  return out;
}

export function requestFor(s: AppSettings, overrides: PriceOverride[], startDate: string, seed = 1, targets?: Targets): PlanRequest {
  const days = s.planDays ?? 7;
  const locked = externalLocked(s, startDate, days);
  return {
    ...(locked.size ? { locked } : {}),
    foods: FOOD_MAP, recipes: RECIPES, targets: targets ?? targetsFor(s), book: bookFor(s.storeId, overrides),
    startDate, days, slots: s.slots, allergens: s.allergens, diets: s.diets, excludedFoods: s.excludedFoods,
    favoriteFoods: s.favoriteFoods, equipment: s.equipment, household: s.household, budget: s.budget,
    repetition: s.repetition, seed,
  };
}

export interface PlanJob { settings: AppSettings; overrides: PriceOverride[]; startDate: string; seed: number }

export function runPlanJob(job: PlanJob): PlanResult {
  return generatePlan(requestFor(job.settings, job.overrides, job.startDate, job.seed));
}

export type ChangeJob =
  | { kind: 'swapOptions'; date: string; slot: MealSlot }
  | { kind: 'swap'; date: string; slot: MealSlot; recipeId: string }
  | { kind: 'eatOut'; date: string; slot: MealSlot; kcal: number; protein: number; note?: string }
  | { kind: 'restart'; today: string; seed: number }
  | { kind: 'exclude'; today: string; foodId: string }
  | { kind: 'fixStore'; today: string };

export interface ChangeRequest { settings: AppSettings; overrides: PriceOverride[]; plan: Plan; job: ChangeJob }

/** Week changes keep the plan's own targets (it was generated for them). */
export function runChange(r: ChangeRequest): ChangePreview | { recipeId: string; preview: ChangePreview }[] {
  const req = requestFor(r.settings, r.overrides, r.plan.days[0]!.date, 1, r.plan.targets);
  const j = r.job;
  switch (j.kind) {
    case 'swapOptions': return swapOptions(req, r.plan, j.date, j.slot);
    case 'swap': return swapMeal(req, r.plan, j.date, j.slot, j.recipeId);
    case 'eatOut': return eatOut(req, r.plan, j.date, j.slot, { kcal: j.kcal, protein: j.protein, ...(j.note ? { note: j.note } : {}) });
    case 'restart': return replanRest(req, r.plan, j.today, undefined, j.seed);
    case 'exclude': return excludeFood(req, r.plan, j.today, j.foodId);
    case 'fixStore': return fixStoreConflicts(req, r.plan, j.today);
  }
}
