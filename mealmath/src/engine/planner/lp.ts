/**
 * One linear program for the whole week.
 *
 * Variables: grams of every scalable ingredient of MY portion of every cooking session (the same
 * portion for all meals fed by that pot), a scale factor per session, and slacks.
 * Each day must land in the kcal band and the protein band; anything a day cannot reach is
 * absorbed by heavily penalised slack variables, so the LP always returns the best possible
 * week and tells us exactly by how much each day misses.
 * The objective also keeps ingredients near the recipe's proportions and prefers cheaper food.
 */
import solver, { type Model } from 'javascript-lp-solver';
import { CONFIG_PLANNER, portionMaxScale } from '../config';
import { LOW_CARB_MAX_PER_MEAL } from '../diet';
import { othersFactor } from '../shopping';
import type { Recipe } from '../types';
import type { Candidate } from './filter';
import type { CookSession, PlanRequest } from './types';

export interface LpResult {
  /** sessionId -> foodId -> grams (my portion, unrounded). */
  grams: Map<string, Record<string, number>>;
  /** Per date: how far outside the band (kcal, g), before rounding. */
  miss: Map<string, Miss>;
  overBudget: number;
  objective: number;
  /** Penalty from target misses only (what the local search tries to drive to 0). */
  missPenalty: number;
}

export interface Miss { kcal: number; protein: number; kcalLow: number; kcalHigh: number; proteinLow: number; proteinHigh: number }

const varName = (s: string, f: string) => `x|${s}|${f}`;

export function solveWeek(req: PlanRequest, sessions: CookSession[], candById: ReadonlyMap<string, Candidate>, dates: string[]): LpResult {
  const L = CONFIG_PLANNER.lp;
  const M = CONFIG_PLANNER.lpMargin;
  const variables: Model['variables'] = {};
  const constraints: Model['constraints'] = {};
  const v = (name: string) => (variables[name] ??= { obj: 0 });
  const add = (name: string, key: string, coef: number) => { const x = v(name); x[key] = (x[key] ?? 0) + coef; };

  // Constant contributions per day (fixed ingredients and locked meals).
  const constK = new Map(dates.map(d => [d, 0]));
  const constP = new Map(dates.map(d => [d, 0]));
  let constCost = 0;
  const others = othersFactor(req.household);
  const priceG = (id: string) => { const p = req.book.get(id); return p.available ? p.price / p.packG : 0; };
  const per = (id: string) => req.foods.get(id)!.per100;
  const maxScale = portionMaxScale(req.targets.kcal);

  for (const [key, m] of req.locked ?? []) {
    const date = key.split('|')[0]!;
    if (!constK.has(date)) continue;
    if (m.eatOut) { constK.set(date, constK.get(date)! + m.eatOut.kcal); constP.set(date, constP.get(date)! + m.eatOut.protein); continue; }
    for (const [id, g] of Object.entries(m.myGrams)) {
      const p = per(id);
      constK.set(date, constK.get(date)! + (p.kcal * g) / 100);
      constP.set(date, constP.get(date)! + (p.protein * g) / 100);
      constCost += priceG(id) * g;
    }
  }

  for (const s of sessions) {
    const c = candById.get(s.recipeId)!;
    const r: Recipe = c.recipe;
    const n = s.portions.length;
    const sharedPortions = s.portions.filter(p => req.household.sharedSlots.includes(p.slot)).length;
    const sc = `sc|${s.id}`;
    v(sc);
    let lowCarbConst = 0;
    const lowCarbVars: [string, number][] = [];

    for (const i of r.ingredients) {
      const p = per(i.food);
      // Household portions are fixed at the default recipe amounts.
      if (!c.forcedZero.has(i.food)) constCost += priceG(i.food) * i.g * others * sharedPortions;
      const fixed = c.forcedZero.has(i.food) || i.min === i.max;
      const g = c.forcedZero.has(i.food) ? 0 : i.min;
      if (fixed) {
        for (const pt of s.portions) {
          constK.set(pt.date, constK.get(pt.date)! + (p.kcal * g) / 100);
          constP.set(pt.date, constP.get(pt.date)! + (p.protein * g) / 100);
        }
        constCost += priceG(i.food) * g * n;
        lowCarbConst += (p.carbs * g) / 100;
        continue;
      }
      const x = varName(s.id, i.food);
      const bound = `b|${s.id}|${i.food}`;
      constraints[bound] = { min: i.min, max: i.max * maxScale };
      add(x, bound, 1);
      for (const pt of s.portions) {
        add(x, `k|${pt.date}`, p.kcal / 100);
        add(x, `p|${pt.date}`, p.protein / 100);
      }
      add(x, 'budget', priceG(i.food) * n);
      add(x, 'obj', L.cost * priceG(i.food) * n);
      lowCarbVars.push([x, p.carbs / 100]);

      // Stay close to the recipe's proportions: x − g·scale = dp − dn
      const dev = `d|${s.id}|${i.food}`;
      constraints[dev] = { equal: 0 };
      add(x, dev, 1);
      add(sc, dev, -i.g);
      const w = (L.deviation * n) / Math.max(i.g, L.deviationMinG);
      add(`dp|${s.id}|${i.food}`, dev, -1); add(`dp|${s.id}|${i.food}`, 'obj', w);
      add(`dn|${s.id}|${i.food}`, dev, 1); add(`dn|${s.id}|${i.food}`, 'obj', w);
    }

    if (req.diets.includes('low_carb') && lowCarbVars.length) {
      const name = `lc|${s.id}`;
      constraints[name] = { max: LOW_CARB_MAX_PER_MEAL - CONFIG_PLANNER.lpMargin.carbs - lowCarbConst };
      for (const [x, coef] of lowCarbVars) add(x, name, coef);
    }
  }

  const { kcalBand: [kLo, kHi], proteinBand: [pLo, pHi] } = req.targets;
  const kl = Math.min(kLo + M.kcalLow, (kLo + kHi) / 2), kh = Math.max(kHi - M.kcalHigh, (kLo + kHi) / 2);
  const pl = Math.min(pLo + M.proteinLow, (pLo + pHi) / 2), ph = Math.max(pHi - M.proteinHigh, (pLo + pHi) / 2);
  for (const d of dates) {
    constraints[`k|${d}`] = { min: kl - constK.get(d)!, max: kh - constK.get(d)! };
    constraints[`p|${d}`] = { min: pl - constP.get(d)!, max: ph - constP.get(d)! };
    add(`kl|${d}`, `k|${d}`, 1); add(`kl|${d}`, 'obj', L.kcalSlack);
    add(`kh|${d}`, `k|${d}`, -1); add(`kh|${d}`, 'obj', L.kcalSlack);
    add(`pl|${d}`, `p|${d}`, 1); add(`pl|${d}`, 'obj', L.proteinShort);
    add(`ph|${d}`, `p|${d}`, -1); add(`ph|${d}`, 'obj', L.proteinOver);
  }
  if (req.budget !== undefined) {
    constraints.budget = { max: req.budget - M.budget - constCost };
    add('bo', 'budget', -1); add('bo', 'obj', L.budgetOver);
  }

  const sol = solver.Solve({ optimize: 'obj', opType: 'min', constraints, variables });
  const val = (n: string) => (typeof sol[n] === 'number' ? (sol[n] as number) : 0);

  const grams = new Map<string, Record<string, number>>();
  for (const s of sessions) {
    const c = candById.get(s.recipeId)!;
    const g: Record<string, number> = {};
    for (const i of c.recipe.ingredients) {
      if (c.forcedZero.has(i.food)) continue;
      g[i.food] = i.min === i.max ? i.min : Math.min(i.max * maxScale, Math.max(i.min, val(varName(s.id, i.food))));
    }
    grams.set(s.id, g);
  }

  const miss = new Map<string, Miss>();
  let missPenalty = 0;
  for (const d of dates) {
    const k = val(`kl|${d}`) + val(`kh|${d}`);
    const p = val(`pl|${d}`) + val(`ph|${d}`);
    miss.set(d, { kcal: k, protein: p, kcalLow: val(`kl|${d}`), kcalHigh: val(`kh|${d}`), proteinLow: val(`pl|${d}`), proteinHigh: val(`ph|${d}`) });
    missPenalty += L.kcalSlack * k + L.proteinShort * val(`pl|${d}`) + L.proteinOver * val(`ph|${d}`);
  }
  if (!sol.feasible) missPenalty = Number.POSITIVE_INFINITY;
  return { grams, miss, overBudget: val('bo'), objective: sol.result, missPenalty };
}
