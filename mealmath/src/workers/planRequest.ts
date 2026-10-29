// Builds a planner request from stored settings. Shared by the worker and tests.
import { FOOD_MAP, RECIPES } from '../data/catalog';
import { PRICE_TABLES } from '../data/stores';
import { generatePlan, type PlanResult } from '../engine/planner';
import { PriceBook } from '../engine/pricing';
import { bands, computeTargets } from '../engine/targets';
import type { PriceOverride, Targets } from '../engine/types';
import type { AppSettings } from '../state/db';

export function targetsFor(s: Pick<AppSettings, 'profile' | 'targetsOverride'>): Targets {
  return s.targetsOverride ? bands(s.targetsOverride.kcal, s.targetsOverride.protein) : computeTargets(s.profile);
}

export function bookFor(storeId: string, overrides: PriceOverride[]): PriceBook {
  const table = PRICE_TABLES.get(storeId) ?? [...PRICE_TABLES.values()][0]!;
  return new PriceBook(table, overrides);
}

export interface PlanJob { settings: AppSettings; overrides: PriceOverride[]; startDate: string; seed: number }

export function runPlanJob(job: PlanJob): PlanResult {
  const s = job.settings;
  return generatePlan({
    foods: FOOD_MAP, recipes: RECIPES, targets: targetsFor(s), book: bookFor(s.storeId, job.overrides),
    startDate: job.startDate, slots: s.slots, allergens: s.allergens, diets: s.diets, excludedFoods: s.excludedFoods,
    favoriteFoods: s.favoriteFoods, equipment: s.equipment, household: s.household, budget: s.budget,
    repetition: s.repetition, seed: job.seed,
  });
}
