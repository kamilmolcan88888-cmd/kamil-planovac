// Worker-side runners (pull in the LP solver – never import this on the main thread).
import { eatOut, excludeFood, fixStoreConflicts, replanRest, swapMeal, swapOptions, type ChangePreview } from '../engine/changes';
import { generatePlan, type PlanResult } from '../engine/planner';
import { requestFor, type ChangeRequest, type PlanJob } from './requestBase';

export * from './requestBase';

export function runPlanJob(job: PlanJob): PlanResult {
  return generatePlan(requestFor(job.settings, job.overrides, job.startDate, job.seed));
}

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
