// View-model for the week screen.
import type { FoodMap } from '../../engine/nutrition';
import type { CookSession, PlanWarning } from '../../engine/planner/types';
import type { PriceBook } from '../../engine/pricing';
import { dayCost } from '../../engine/shopping';
import type { Household, Macros, Plan, Recipe } from '../../engine/types';
import type { PlanReport } from '../../engine/validator';
import { mealView, weekStatuses, type DayStatus, type MealView } from './home';

export interface BatchInfo { n: number; i: number; total: number }

export interface WeekDayView {
  date: string;
  status: DayStatus;
  totals: Macros;
  includesUserEstimate: boolean;
  meals: (MealView & { batch?: BatchInfo })[];
  cost: number;
}

export interface WeekView {
  days: WeekDayView[];
  foodCost: number;
  verified: number;
  cookSessions: number;
  cookMinutes: number;
  portions: number;
  repeated: { recipeId: string; count: number }[];
  warnings: PlanWarning[];
}

export function weekView(args: {
  plan: Plan; sessions: CookSession[]; warnings: PlanWarning[]; report: PlanReport;
  recipes: ReadonlyMap<string, Recipe>; foods: FoodMap; household: Household; book: PriceBook;
}): WeekView {
  const { plan, sessions, report, recipes, foods, household, book } = args;
  // Number the pots that feed more than one meal, in cooking order.
  const batches = new Map<string, CookSession & { n: number }>();
  let n = 0;
  for (const s of [...sessions].sort((a, b) => a.portions[0]!.date.localeCompare(b.portions[0]!.date)))
    if (s.portions.length > 1) batches.set(s.id, { ...s, n: ++n });

  const statuses = weekStatuses(plan, report, plan.days[0]?.date ?? '', plan.days.length);
  const days: WeekDayView[] = plan.days.map((d, idx) => {
    const r = report.days.find(x => x.date === d.date);
    return {
      date: d.date,
      status: statuses[idx]!.status,
      totals: r?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      includesUserEstimate: r?.includesUserEstimate ?? false,
      cost: dayCost(d, recipes, household, book).cost,
      meals: d.meals.map(m => {
        const b = m.batchId ? batches.get(m.batchId) : undefined;
        const i = b ? b.portions.findIndex(p => p.date === d.date && p.slot === m.slot) + 1 : 0;
        return { ...mealView(m, recipes, foods), ...(b ? { batch: { n: b.n, i, total: b.portions.length } } : {}) };
      }),
    };
  });

  const counts = new Map<string, number>();
  for (const d of plan.days) for (const m of d.meals) if (!m.eatOut) counts.set(m.recipeId, (counts.get(m.recipeId) ?? 0) + 1);
  const cooked = sessions.filter(s => recipes.has(s.recipeId));

  return {
    days,
    foodCost: Math.round(days.reduce((s, d) => s + d.cost, 0) * 100) / 100,
    verified: days.filter(d => d.status === 'verified').length,
    cookSessions: cooked.length,
    cookMinutes: cooked.reduce((m, s) => m + recipes.get(s.recipeId)!.timeMin, 0),
    portions: [...counts.values()].reduce((a, b) => a + b, 0),
    repeated: [...counts].filter(([, c]) => c > 1).map(([recipeId, count]) => ({ recipeId, count })).sort((a, b) => b.count - a.count),
    warnings: args.warnings,
  };
}
