import type { Food, Macros, Recipe, RecipeIngredient } from './types';

export type FoodMap = ReadonlyMap<string, Food>;

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const addMacros = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat,
});

export function foodMap(foods: readonly Food[]): FoodMap {
  return new Map(foods.map(f => [f.id, f]));
}

/** One line of the transparent breakdown: grams × value per 100 g = result. */
export interface ContributionLine {
  foodId: string;
  fdcId: number;
  grams: number;
  per100: Macros;
  result: Macros;
}

export function contribution(food: Food, grams: number): ContributionLine {
  const k = grams / 100;
  return {
    foodId: food.id,
    fdcId: food.fdcId,
    grams,
    per100: food.per100,
    result: {
      kcal: food.per100.kcal * k,
      protein: food.per100.protein * k,
      carbs: food.per100.carbs * k,
      fat: food.per100.fat * k,
    },
  };
}

/** Macros for a set of grams. Throws on an unknown food so missing data is never silently zero. */
export function macrosForGrams(grams: Record<string, number>, foods: FoodMap): { total: Macros; lines: ContributionLine[] } {
  const lines: ContributionLine[] = [];
  let total = ZERO;
  for (const [id, g] of Object.entries(grams)) {
    const food = foods.get(id);
    if (!food) throw new Error(`Unknown food "${id}"`);
    const line = contribution(food, g);
    lines.push(line);
    total = addMacros(total, line.result);
  }
  return { total, lines };
}

export const defaultGrams = (r: Recipe): Record<string, number> =>
  Object.fromEntries(r.ingredients.map((i: RecipeIngredient) => [i.food, i.g]));

export const recipeMacros = (r: Recipe, foods: FoodMap) => macrosForGrams(defaultGrams(r), foods);
