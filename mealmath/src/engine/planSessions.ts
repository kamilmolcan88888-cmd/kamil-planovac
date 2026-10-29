import type { CookSession } from './planner/types';
import type { Plan } from './types';

/** Cooking sessions as they are in a plan: one per pot (batchId) or per single meal. */
export function sessionsFromPlan(plan: Plan): CookSession[] {
  const map = new Map<string, CookSession>();
  for (const d of plan.days) for (const m of d.meals) {
    if (m.eatOut) continue;
    const id = m.batchId ?? `m|${d.date}|${m.slot}`;
    const s = map.get(id) ?? { id, recipeId: m.recipeId, portions: [] };
    s.portions.push({ date: d.date, slot: m.slot });
    map.set(id, s);
  }
  return [...map.values()];
}

