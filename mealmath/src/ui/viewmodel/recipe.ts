// View-model for the recipe screen. Every number is grams × per-100 g from foods.json.
import { defaultGrams, macrosForGrams, type ContributionLine, type FoodMap } from '../../engine/nutrition';
import type { CookSession } from '../../engine/planner/types';
import { othersFactor } from '../../engine/shopping';
import type { Household, Macros, Plan, PlannedMeal, Recipe } from '../../engine/types';

export interface RecipeView {
  recipe: Recipe;
  /** The planned meal this view is for (absent when the recipe is opened outside the plan). */
  meal?: PlannedMeal;
  timesInPlan: number;
  my: { grams: Record<string, number>; total: Macros; lines: ContributionLine[] };
  pot: { grams: Record<string, number>; total: Macros; lines: ContributionLine[]; portions: number };
}

const scale = (g: Record<string, number>, k: number) => Object.fromEntries(Object.entries(g).map(([f, v]) => [f, v * k]));
const add = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [f, v] of Object.entries(b)) out[f] = (out[f] ?? 0) + v;
  return out;
};

export function recipeView(args: {
  recipe: Recipe; foods: FoodMap; household: Household;
  plan?: Plan; sessions?: CookSession[]; date?: string; slot?: string;
}): RecipeView {
  const { recipe, foods, household, plan, sessions } = args;
  const meal = plan?.days.find(d => d.date === args.date)?.meals.find(m => m.slot === args.slot && m.recipeId === recipe.id && !m.eatOut);
  const myGrams = meal ? meal.myGrams : defaultGrams(recipe);
  const my = macrosForGrams(myGrams, foods);

  // Whole pot: my portion for every meal this pot feeds + default portions for the household on shared meals.
  const session = meal?.batchId ? sessions?.find(s => s.id === meal.batchId) : undefined;
  const myPortions = session ? session.portions.length : 1;
  const sharedPortions = session
    ? session.portions.filter(p => household.sharedSlots.includes(p.slot)).length
    : meal && household.sharedSlots.includes(meal.slot) ? 1 : meal ? 0 : 1;
  const others = othersFactor(household);
  const potGrams = add(scale(myGrams, myPortions), scale(defaultGrams(recipe), others * sharedPortions));
  const pot = macrosForGrams(Object.fromEntries(Object.entries(potGrams).filter(([, g]) => g > 0)), foods);

  const timesInPlan = plan?.days.reduce((n, d) => n + d.meals.filter(m => m.recipeId === recipe.id && !m.eatOut).length, 0) ?? 0;
  return {
    recipe, meal, timesInPlan,
    my: { grams: myGrams, ...my },
    pot: { grams: potGrams, ...pot, portions: Math.round((myPortions + others * sharedPortions) * 10) / 10 },
  };
}
