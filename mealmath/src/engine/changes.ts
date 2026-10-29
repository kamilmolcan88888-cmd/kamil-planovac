/**
 * Week changes. Every operation returns a PREVIEW (new plan + per-day before/after); the stored
 * plan is only replaced when the user confirms. All grams come from the same LP as the planner,
 * and the independent validator judges the result.
 *
 *   swapMeal      – one meal → another recipe; other open meals of that day are re-scaled
 *   eatOut        – one meal → user's estimate; the rest of the day is re-scaled to still land
 *   replanRest    – keep the past and ticked meals, plan the remaining positions again
 *                   (restart rest of week, exclude a food, fix meals the new store can't supply)
 */
import { portionMaxScale } from './config';
import { filterRecipes, type Candidate } from './planner/filter';
import { generatePlan, roundAll } from './planner/index';
import { solveWeek } from './planner/lp';
import { posKey } from './planner/sessions';
import type { CookSession, PlanRequest } from './planner/types';
import { dayCost, storeConflicts } from './shopping';
import type { MealSlot, Plan, PlannedMeal, Recipe } from './types';
import { validatePlan, type PlanReport, type ValidationContext } from './validator';

export { sessionsFromPlan } from './planSessions';
import { sessionsFromPlan } from './planSessions';

export interface DayDiff { date: string; before: DaySnap; after: DaySnap }
interface DaySnap { kcal: number; protein: number; cost: number; verified: boolean }
export interface MealChange { date: string; slot: MealSlot; before?: PlannedMeal; after?: PlannedMeal }

export interface ChangePreview {
  plan: Plan;
  report: PlanReport;
  days: DayDiff[];
  meals: MealChange[];
  costBefore: number;
  costAfter: number;
  /** True when every touched day still passes the validator. */
  ok: boolean;
}

export const validationContext = (req: PlanRequest): ValidationContext => ({
  foods: req.foods, recipes: new Map(req.recipes.map(r => [r.id, r])), targets: req.targets, allergens: req.allergens,
  diets: req.diets, excludedFoods: req.excludedFoods, availableFoods: req.book.availableFoods(req.foods.keys()), requiredSlots: req.slots,
});

/** Before/after comparison for the days that changed. */
export function comparePlans(before: Plan, after: Plan, req: PlanRequest): ChangePreview {
  // Macro bands only for the "before" side: the old plan may legitimately violate new settings (that's why we change it).
  const ctx = validationContext(req);
  const loose: ValidationContext = { ...ctx, allergens: [], diets: [], excludedFoods: [], availableFoods: undefined };
  const rb = validatePlan(before, loose), ra = validatePlan(after, ctx);
  const recipes = ctx.recipes;
  const meals: MealChange[] = [];
  const days: DayDiff[] = [];
  for (const da of after.days) {
    const db = before.days.find(d => d.date === da.date);
    const keys = new Set([...(db?.meals ?? []), ...da.meals].map(m => m.slot));
    let changed = false;
    for (const slot of keys) {
      const mb = db?.meals.find(m => m.slot === slot), ma = da.meals.find(m => m.slot === slot);
      if (JSON.stringify(mb ?? null) !== JSON.stringify(ma ?? null)) {
        changed = true;
        if (mb?.recipeId !== ma?.recipeId || !!mb?.eatOut !== !!ma?.eatOut) meals.push({ date: da.date, slot, before: mb, after: ma });
      }
    }
    if (!changed) continue;
    const snap = (rep: PlanReport, day = da): DaySnap => {
      const r = rep.days.find(x => x.date === day.date)!;
      return { kcal: r.totals.kcal, protein: r.totals.protein, cost: dayCost(day, recipes, req.household, req.book).cost, verified: r.status === 'verified' };
    };
    days.push({ date: da.date, before: db ? snap(rb, db) : { kcal: 0, protein: 0, cost: 0, verified: false }, after: snap(ra) });
  }
  const cost = (p: Plan) => Math.round(p.days.reduce((s, d) => s + dayCost(d, recipes, req.household, req.book).cost, 0) * 100) / 100;
  return { plan: after, report: ra, days, meals, costBefore: cost(before), costAfter: cost(after), ok: days.every(d => d.after.verified) };
}

function candidateFor(recipe: Recipe, allowed: Map<string, Candidate>): Candidate {
  return allowed.get(recipe.id) ?? {
    recipe, forcedZero: new Set(), maxDensity: 0, defaultDensity: 0, costPer100kcal: 0, favorite: 0, mainProtein: '', extraKcalMax: 0, defaultKcal: 0,
  };
}

/**
 * Re-scales the open single-pot meals of the given days (keeping their recipes) so the days land
 * in their bands again. Pots shared with other days and ticked meals stay as they are.
 */
function rescaleDays(req: PlanRequest, plan: Plan, day: string): Plan {
  // First only the day's own single meals; only if that can't land, let shared pots change too.
  const narrow = rescale(req, plan, new Set([day]), false);
  if (narrow.ok) return narrow.plan;
  const wide = rescale(req, plan, new Set([day]), true);
  return wide.bad < narrow.bad ? wide.plan : narrow.plan;
}

function rescale(req: PlanRequest, plan: Plan, dates: Set<string>, expandPots: boolean): { plan: Plan; ok: boolean; bad: number } {
  const recipes = new Map(req.recipes.map(r => [r.id, r]));
  const allowed = new Map(filterRecipes(req).map(c => [c.recipe.id, c]));
  const sessions = sessionsFromPlan(plan);
  const mealAt = (date: string, slot: string) => plan.days.find(d => d.date === date)?.meals.find(m => m.slot === slot);
  const open = (s: CookSession) => s.portions.every(p => !mealAt(p.date, p.slot)?.done);
  // A pot that feeds the changed day may change its portion size too – then every day it feeds is re-checked.
  if (expandPots) for (const s of sessions) if (open(s) && s.portions.some(p => dates.has(p.date))) s.portions.forEach(p => dates.add(p.date));
  const free = sessions.filter(s => open(s) && s.portions.every(p => dates.has(p.date)));
  const freeKeys = new Set(free.flatMap(s => s.portions.map(p => posKey(p.date, p.slot))));
  const locked = new Map<string, PlannedMeal>();
  for (const d of plan.days) if (dates.has(d.date)) for (const m of d.meals) if (!freeKeys.has(posKey(d.date, m.slot))) locked.set(posKey(d.date, m.slot), m);

  const candById = new Map(free.map(s => [s.recipeId, candidateFor(recipes.get(s.recipeId)!, allowed)]));
  const dateList = [...dates];
  const lpReq: PlanRequest = { ...req, locked, budget: undefined };
  const lp = solveWeek(lpReq, free, candById, dateList);
  const scale = portionMaxScale(req.targets.kcal);
  const pick = (step: number) => roundAll(free, lp, candById, step, undefined, scale);
  const apply = (grams: Map<string, Record<string, number>>): Plan => ({
    ...plan,
    days: plan.days.map(d => ({
      ...d,
      meals: d.meals.map(m => {
        const s = free.find(x => x.portions.some(p => p.date === d.date && p.slot === m.slot));
        return s ? { ...m, myGrams: { ...grams.get(s.id) } } : m;
      }),
    })),
  });
  const ctx = validationContext(req);
  const bad = (p: Plan) => validatePlan(p, ctx).days.filter(x => dates.has(x.date) && x.status !== 'verified').length;
  const coarse = apply(pick(5));
  const bc = bad(coarse);
  if (bc === 0) return { plan: coarse, ok: true, bad: 0 };
  const fine = apply(pick(1));
  const bf = bad(fine);
  return bf < bc ? { plan: fine, ok: bf === 0, bad: bf } : { plan: coarse, ok: false, bad: bc };
}

const withMeal = (plan: Plan, date: string, slot: MealSlot, meal: PlannedMeal): Plan => ({
  ...plan,
  days: plan.days.map(d => (d.date !== date ? d : { ...d, meals: d.meals.map(m => (m.slot === slot ? meal : m)) })),
});

/** Replace one meal with another recipe. A pot shared with other days keeps feeding those days. */
export function swapMeal(req: PlanRequest, plan: Plan, date: string, slot: MealSlot, recipeId: string): ChangePreview {
  const recipe = req.recipes.find(r => r.id === recipeId)!;
  const fresh: PlannedMeal = { slot, recipeId, myGrams: Object.fromEntries(recipe.ingredients.map(i => [i.food, i.g])) };
  const next = withMeal(plan, date, slot, fresh);
  // A pot that now has a single portion left is no longer a batch.
  const sessions = sessionsFromPlan(next);
  const tidy: Plan = { ...next, days: next.days.map(d => ({ ...d, meals: d.meals.map(m => {
    if (!m.batchId) return m;
    const s = sessions.find(x => x.id === m.batchId);
    if (s && s.portions.length > 1) return m;
    const { batchId: _drop, ...rest } = m;
    return rest;
  }) })) };
  return comparePlans(plan, rescaleDays(req, tidy, date), req);
}

/** "I eat out": keep the user's estimate for this meal and re-balance the rest of the day. */
export function eatOut(req: PlanRequest, plan: Plan, date: string, slot: MealSlot, estimate: { kcal: number; protein: number; note?: string }): ChangePreview {
  const meal: PlannedMeal = { slot, recipeId: '', myGrams: {}, eatOut: estimate };
  const next = withMeal(plan, date, slot, meal);
  return comparePlans(plan, rescaleDays(req, next, date), req);
}

/** Ranked swap candidates for one meal, each with its own preview. */
export function swapOptions(req: PlanRequest, plan: Plan, date: string, slot: MealSlot, limit = 6): { recipeId: string; preview: ChangePreview }[] {
  const current = plan.days.find(d => d.date === date)?.meals.find(m => m.slot === slot);
  const usedToday = new Set(plan.days.find(d => d.date === date)?.meals.map(m => m.recipeId));
  const need = (req.targets.protein / req.targets.kcal) * 100;
  // Prefer recipes that can match the needed protein density, then cheaper ones.
  const score = (c: Candidate) => -Math.abs(Math.min(c.maxDensity / need, 1.3) - 1.15) - 2 * c.costPer100kcal;
  const cands = filterRecipes(req)
    .filter(c => c.recipe.meals.includes(slot) && c.recipe.id !== current?.recipeId && !usedToday.has(c.recipe.id))
    .sort((a, b) => score(b) - score(a) || a.recipe.id.localeCompare(b.recipe.id))
    .slice(0, limit * 2);
  const out = cands.map(c => ({ recipeId: c.recipe.id, preview: swapMeal(req, plan, date, slot, c.recipe.id) }));
  return out.sort((a, b) => Number(b.preview.ok) - Number(a.preview.ok) || a.preview.costAfter - b.preview.costAfter).slice(0, limit);
}

/**
 * Plan the remaining open positions again. Past days and ticked meals stay. `keep` decides which
 * other future meals are kept (default: none – the whole rest of the week is re-planned).
 */
export function replanRest(req: PlanRequest, plan: Plan, today: string, keep: (date: string, m: PlannedMeal) => boolean = () => false, seed = 1): ChangePreview {
  const locked = new Map<string, PlannedMeal>();
  for (const d of plan.days) for (const m of d.meals)
    if (d.date < today || m.done || m.eatOut || keep(d.date, m)) locked.set(posKey(d.date, m.slot), m);
  const res = generatePlan({ ...req, startDate: plan.days[0]!.date, days: plan.days.length, locked, seed });
  // New pots get ids that cannot collide with the kept ones.
  const rev = `r${seed}-${today}`;
  const renamed: Plan = { ...res.plan, id: plan.id, createdAt: plan.createdAt, days: res.plan.days.map(d => ({ ...d, meals: d.meals.map(m =>
    locked.has(posKey(d.date, m.slot)) || !m.batchId ? m : { ...m, batchId: `${m.batchId}-${rev}` }) })) };
  return comparePlans(plan, renamed, req);
}

/** Meals the selected store cannot supply, re-planned with what it sells; everything else stays. */
export function fixStoreConflicts(req: PlanRequest, plan: Plan, today: string): ChangePreview {
  const bad = new Set(storeConflicts(plan, req.book).map(c => posKey(c.date, c.slot)));
  return replanRest(req, plan, today, (date, m) => !bad.has(posKey(date, m.slot)));
}

/** Exclude a food from now on: future meals that use it are re-planned. */
export function excludeFood(req: PlanRequest, plan: Plan, today: string, foodId: string): ChangePreview {
  const r2: PlanRequest = { ...req, excludedFoods: [...new Set([...req.excludedFoods, foodId])] };
  return replanRest(r2, plan, today, (_date, m) => !Object.keys(m.myGrams).includes(foodId));
}
