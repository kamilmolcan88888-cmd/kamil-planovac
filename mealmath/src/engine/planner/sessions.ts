/**
 * Greedy weekly layout: which recipe is cooked when, and which later meals each pot feeds.
 * Deterministic – ties are broken by a seeded PRNG, so the same seed gives the same week.
 */
import { CONFIG_PLANNER } from '../config';
import type { MealSlot } from '../types';
import type { Candidate } from './filter';
import type { CookSession, PlanRequest } from './types';

export interface Position { date: string; slot: MealSlot; day: number }

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const posKey = (date: string, slot: string) => `${date}|${slot}`;

export function positions(req: PlanRequest): Position[] {
  const out: Position[] = [];
  const n = req.days ?? 7;
  const order: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  for (let d = 0; d < n; d++) {
    const date = addDays(req.startDate, d);
    for (const slot of order) if (req.slots.includes(slot) && !req.locked?.has(posKey(date, slot))) out.push({ date, slot, day: d });
  }
  return out;
}

export const usesLimit = (slot: MealSlot, level: number) => {
  const r = CONFIG_PLANNER.repetition[level]!;
  return slot === 'breakfast' ? r.breakfastUses : slot === 'snack' ? r.snackUses : r.maxUses;
};

export interface Layout {
  sessions: CookSession[];
  /** Score function reused by the local search to rank alternatives. */
  score: (c: Candidate, slot: MealSlot, ctx: { usedRecipeUses: number; prevMains: string[]; prevCuisine?: string }) => number;
}

export function buildSessions(req: PlanRequest, cands: Candidate[]): Layout {
  const rand = mulberry32(req.seed ?? 1);
  const jitter = new Map(cands.map(c => [c.recipe.id, rand()]));
  const need = (req.targets.protein / req.targets.kcal) * 100;
  const level = req.repetition;
  const rep = CONFIG_PLANNER.repetition[level]!;
  const tightBudget = req.budget !== undefined && req.budget < CONFIG_PLANNER.tightBudgetPerPersonDay * 7 * Math.max(1, req.household.adults);

  const score: Layout['score'] = (c, slot, ctx) => {
    const W = CONFIG_PLANNER.weights;
    let s = W.density * Math.min(c.maxDensity / need, 1.25) + W.defaultDensity * Math.min(c.defaultDensity / need, 1.1);
    s += W.favorite * Math.min(c.favorite, 3);
    s -= (tightBudget ? W.costTight : W.cost) * c.costPer100kcal;
    s -= W.reuse * ctx.usedRecipeUses * (level === 0 ? 3 : 1);
    if (slot !== 'breakfast' && slot !== 'snack') {
      if (ctx.prevMains.includes(c.mainProtein)) s -= W.sameProtein;
      if (ctx.prevCuisine && ctx.prevCuisine === c.recipe.cuisine) s -= W.sameCuisine;
    }
    return s + W.jitter * (jitter.get(c.recipe.id) ?? 0);
  };

  const pos = positions(req);
  const taken = new Map<string, string>(); // posKey -> sessionId
  const uses = new Map<string, number>();  // recipeId -> portions
  const dayRecipes = new Map<string, Set<string>>(); // date -> recipe ids
  const sessions: CookSession[] = [];
  const prevMains: string[] = [];
  let prevCuisine: string | undefined;

  for (const p of pos) {
    const k = posKey(p.date, p.slot);
    if (taken.has(k)) continue;
    const today = dayRecipes.get(p.date) ?? new Set<string>();
    const opts = cands.filter(c =>
      c.recipe.meals.includes(p.slot) && !today.has(c.recipe.id) && (uses.get(c.recipe.id) ?? 0) < usesLimit(p.slot, level));
    if (!opts.length) continue;
    const best = opts.map(c => ({ c, s: score(c, p.slot, { usedRecipeUses: uses.get(c.recipe.id) ?? 0, prevMains, prevCuisine }) }))
      .sort((a, b) => b.s - a.s || a.c.recipe.id.localeCompare(b.c.recipe.id))[0]!.c;

    const s: CookSession = { id: `s${sessions.length + 1}`, recipeId: best.recipe.id, portions: [{ date: p.date, slot: p.slot }] };
    const mark = (date: string, slot: MealSlot) => {
      taken.set(posKey(date, slot), s.id);
      uses.set(best.recipe.id, (uses.get(best.recipe.id) ?? 0) + 1);
      const set = dayRecipes.get(date) ?? new Set<string>();
      set.add(best.recipe.id);
      dayRecipes.set(date, set);
    };
    mark(p.date, p.slot);

    // A pot feeds the next free compatible meals within its shelf life.
    const maxPortions = p.slot === 'snack' ? 1 : rep.batchPortions;
    if (best.recipe.batch.ok && maxPortions > 1) {
      for (const q of pos) {
        if (s.portions.length >= maxPortions) break;
        if (q.day <= p.day || q.day - p.day >= best.recipe.batch.keepsDays) continue;
        const qk = posKey(q.date, q.slot);
        if (taken.has(qk) || !best.recipe.meals.includes(q.slot)) continue;
        if ((q.slot === 'breakfast') !== (p.slot === 'breakfast')) continue;
        if (s.portions.some(x => x.date === q.date)) continue;
        if ((uses.get(best.recipe.id) ?? 0) >= usesLimit(q.slot, level)) break;
        s.portions.push({ date: q.date, slot: q.slot });
        mark(q.date, q.slot);
      }
    }
    sessions.push(s);

    if (p.slot === 'lunch' || p.slot === 'dinner') {
      prevMains.push(best.mainProtein);
      if (prevMains.length > 2) prevMains.shift();
      prevCuisine = best.recipe.cuisine;
    }
  }
  return { sessions, score };
}
