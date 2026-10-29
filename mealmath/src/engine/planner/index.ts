/**
 * Deterministic weekly planner (no LLM anywhere):
 *   1. filter recipes by hard constraints,
 *   2. greedy layout of cooking sessions (batch cooking, repetition level),
 *   3. one LP over the whole week sets my grams so every day hits its bands,
 *   4. local search swaps recipes on days the LP could not satisfy,
 *   5. grams are rounded and the independent validator has the final word.
 * If the request cannot be met, the best plan found is returned with a warning.
 */
import { CONFIG_PLANNER, portionMaxScale } from '../config';
import { round2 } from '../pricing';
import { buildShoppingList, planGrams } from '../shopping';
import type { MealSlot, Plan, PlanDay, PlannedMeal } from '../types';
import { validatePlan, type ValidationContext } from '../validator';
import { filterRecipes, type Candidate } from './filter';
import { solveWeek, type LpResult, type Miss } from './lp';
import { addDays, buildSessions, posKey, usesLimit } from './sessions';
import type { CookSession, PlanRequest, PlanResult, PlanWarning } from './types';

export type { PlanRequest, PlanResult, PlanWarning, CookSession, RepetitionLevel } from './types';
export { filterRecipes } from './filter';

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function generatePlan(req: PlanRequest): PlanResult {
  const t0 = now();
  const budgetMs = req.timeBudgetMs ?? CONFIG_PLANNER.timeBudgetMs;
  const dates = Array.from({ length: req.days ?? 7 }, (_, i) => addDays(req.startDate, i));
  const cands = filterRecipes(req);
  const candById = new Map(cands.map(c => [c.recipe.id, c]));
  const warnings: PlanWarning[] = [];
  if (cands.length < 15) warnings.push({ code: 'few_recipes', available: cands.length });
  for (const s of req.slots) if (!cands.some(c => c.recipe.meals.includes(s))) warnings.push({ code: 'no_recipes_for_slot', slot: s });

  // Multi-start: a few seeded layouts, keep the best one for the local search.
  const base = req.seed ?? 1;
  let layout = buildSessions(req, cands);
  let sessions = layout.sessions;
  let best = solveWeek(req, sessions, candById, dates);
  let iterations = 1;
  for (let k = 1; k < CONFIG_PLANNER.starts && best.missPenalty > 1e-6; k++) {
    const alt = buildSessions({ ...req, seed: base + k * 7919 }, cands);
    const r = solveWeek(req, alt.sessions, candById, dates);
    iterations++;
    if (r.missPenalty < best.missPenalty - 1e-6) { best = r; sessions = alt.sessions; layout = alt; }
  }
  const score = layout.score;

  // ---- local search on days the LP could not satisfy ----
  const missOf = (r: LpResult, d: string) => r.miss.get(d)!;
  const isBad = (r: LpResult, d: string) => missOf(r, d).kcal > 1 || missOf(r, d).protein > 0.5;
  const stuck = new Set<string>();

  search: while (iterations < CONFIG_PLANNER.maxIterations && now() - t0 < budgetMs) {
    const bad = dates.filter(d => isBad(best, d) && !stuck.has(d))
      .sort((a, b) => (missOf(best, b).protein * 20 + missOf(best, b).kcal) - (missOf(best, a).protein * 20 + missOf(best, a).kcal));
    if (!bad.length) break;
    const day = bad[0]!;

    for (const s of sessions.filter(x => x.portions.some(p => p.date === day))) {
      for (const trial of moves(req, sessions, s, cands, candById, score, missOf(best, day))) {
        if (iterations >= CONFIG_PLANNER.maxIterations || now() - t0 > budgetMs) break search;
        const r = solveWeek(req, trial, candById, dates);
        iterations++;
        if (r.missPenalty < best.missPenalty - 1e-6 || (Math.abs(r.missPenalty - best.missPenalty) < 1e-6 && r.objective < best.objective - 1e-6)) {
          best = r; sessions = trial;
          continue search;
        }
      }
    }
    stuck.add(day);
  }

  // ---- build, round, validate ----
  const ctx: ValidationContext = {
    foods: req.foods,
    recipes: new Map(req.recipes.map(r => [r.id, r])),
    targets: req.targets,
    allergens: req.allergens,
    diets: req.diets,
    excludedFoods: req.excludedFoods,
    availableFoods: req.book.availableFoods(req.foods.keys()),
    requiredSlots: req.slots,
  };
  const maxScale = portionMaxScale(req.targets.kcal);
  let plan = toPlan(req, dates, sessions, roundAll(sessions, best, candById, 5, undefined, maxScale));
  let report = validatePlan(plan, ctx);
  if (!report.ok) {
    // Rounding to 5 g can push a day just outside its band – retry those pots with 1 g steps.
    const failing = new Set(report.days.filter(d => d.status !== 'verified').map(d => d.date));
    const fine = roundAll(sessions, best, candById, 1, s => s.portions.some(p => failing.has(p.date)), maxScale);
    const plan2 = toPlan(req, dates, sessions, fine);
    const report2 = validatePlan(plan2, ctx);
    if (report2.failedDays < report.failedDays) { plan = plan2; report = report2; }
  }

  if (report.failedDays > 0) {
    warnings.push({
      code: 'days_missed', days: report.failedDays,
      maxProteinShortfall: Math.ceil(report.maxProteinShortfall), maxKcalDeviation: Math.ceil(report.maxKcalDeviation),
      dates: report.days.filter(d => d.status !== 'verified').map(d => d.date),
    });
  }
  const foodCost = buildShoppingList(planGrams(plan, ctx.recipes, req.household), req.book, req.foods).foodCost;
  if (req.budget !== undefined && foodCost > req.budget + 0.005) warnings.push({ code: 'over_budget', by: round2(foodCost - req.budget) });

  return {
    plan, report, sessions, warnings, foodCost,
    cookMinutes: sessions.reduce((m, s) => m + (candById.get(s.recipeId)?.recipe.timeMin ?? 0), 0),
    stats: { iterations, ms: Math.round(now() - t0), candidates: cands.length },
  };
}

/** Alternative weeks to try for one session on a bad day. */
function* moves(req: PlanRequest, sessions: CookSession[], s: CookSession, cands: Candidate[], candById: ReadonlyMap<string, Candidate>,
  score: ReturnType<typeof buildSessions>['score'], miss: Miss): Generator<CookSession[]> {
  const others = sessions.filter(x => x !== s);
  const dates = new Set(s.portions.map(p => p.date));
  const usedOnDates = new Set(others.flatMap(x => x.portions.filter(p => dates.has(p.date)).map(() => x.recipeId)));
  const uses = (id: string) => others.filter(x => x.recipeId === id).reduce((n, x) => n + x.portions.length, 0);
  const days = s.portions.map(p => p.date).sort();
  const span = (Date.parse(days[days.length - 1]!) - Date.parse(days[0]!)) / 86_400_000;

  const compatible = cands.filter(c => c.recipe.id !== s.recipeId &&
    s.portions.every(p => c.recipe.meals.includes(p.slot) && uses(c.recipe.id) + s.portions.length <= usesLimit(p.slot, req.repetition)) &&
    !usedOnDates.has(c.recipe.id) &&
    (s.portions.length === 1 || (c.recipe.batch.ok && c.recipe.batch.keepsDays > span)));

  const slot = s.portions[0]!.slot;
  // Steer by what the day is missing.
  const steer = (c: Candidate) =>
    miss.proteinLow > 0.5 ? c.maxDensity / 2
      : miss.kcalLow > 1 ? c.extraKcalMax / 100
        : miss.proteinHigh > 0.5 ? -c.defaultDensity / 2
          : miss.kcalHigh > 1 ? -c.defaultKcal / 100 : 0;
  const ranked = compatible
    .map(c => ({ c, s: score(c, slot, { usedRecipeUses: uses(c.recipe.id), prevMains: [] }) + steer(c) }))
    .sort((a, b) => b.s - a.s || a.c.recipe.id.localeCompare(b.c.recipe.id))
    .slice(0, CONFIG_PLANNER.altsPerMove);
  for (const { c } of ranked) yield [...others, { ...s, recipeId: c.recipe.id }];

  // A shared pot ties days together; cooking separately gives the LP more freedom.
  if (s.portions.length > 1) {
    yield [...others, ...s.portions.map((p, i) => ({ id: `${s.id}${String.fromCharCode(97 + i)}`, recipeId: s.recipeId, portions: [p] }))];
  }
  void candById;
}

function roundAll(sessions: CookSession[], lp: LpResult, candById: ReadonlyMap<string, Candidate>, step: number, only: ((s: CookSession) => boolean) | undefined, maxScale: number) {
  const out = new Map<string, Record<string, number>>();
  for (const s of sessions) {
    const raw = lp.grams.get(s.id) ?? {};
    const r = candById.get(s.recipeId)!.recipe;
    const g: Record<string, number> = {};
    for (const i of r.ingredients) {
      const v = raw[i.food];
      if (v === undefined) continue;
      const st = only && !only(s) ? CONFIG_PLANNER.roundStepG : step;
      const useStep = i.max >= 50 ? st : 1;
      let x = Math.round(v / useStep) * useStep;
      x = Math.min(i.max * maxScale, Math.max(i.min, x));
      if (x > 0) g[i.food] = x;
    }
    out.set(s.id, g);
  }
  return out;
}

function toPlan(req: PlanRequest, dates: string[], sessions: CookSession[], grams: Map<string, Record<string, number>>): Plan {
  const bySlot = new Map<string, PlannedMeal>();
  for (const s of sessions) for (const p of s.portions) {
    bySlot.set(posKey(p.date, p.slot), {
      slot: p.slot, recipeId: s.recipeId, myGrams: { ...grams.get(s.id) },
      ...(s.portions.length > 1 ? { batchId: s.id } : {}),
    });
  }
  for (const [k, m] of req.locked ?? []) bySlot.set(k, m);
  const days: PlanDay[] = dates.map(date => ({
    date,
    meals: SLOT_ORDER.map(slot => bySlot.get(posKey(date, slot))).filter((m): m is PlannedMeal => !!m),
  }));
  return { id: `plan-${req.startDate}-${req.seed ?? 1}`, createdAt: req.startDate, storeId: req.book.storeId, targets: req.targets, days };
}
