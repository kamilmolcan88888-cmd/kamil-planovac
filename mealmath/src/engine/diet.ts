import type { Allergen, Diet, Food, FoodFlag, Recipe } from './types';
import type { FoodMap } from './nutrition';

/** Flags that make a food incompatible with a diet. low_carb is checked on macros, not flags. */
const FORBIDDEN: Record<Diet, FoodFlag[]> = {
  omnivore: [],
  vegetarian: ['meat', 'fish'],
  vegan: ['meat', 'fish', 'dairy', 'egg', 'honey'],
  pescatarian: ['meat'],
  no_pork: ['pork'],
  no_red_meat: ['red_meat'],
  low_carb: [],
};

/** Max carbs (g) per meal portion for a low-carb diet. */
export const LOW_CARB_MAX_PER_MEAL = 25;

export function foodFitsDiet(food: Food, diets: readonly Diet[]): boolean {
  return diets.every(d => !FORBIDDEN[d].some(flag => food.flags.includes(flag)));
}

export function recipeFoods(r: Recipe, foods: FoodMap): Food[] {
  return r.ingredients.map(i => {
    const f = foods.get(i.food);
    if (!f) throw new Error(`Recipe "${r.id}" uses unknown food "${i.food}"`);
    return f;
  });
}

/** Allergens of a recipe are always derived from its foods. */
export function recipeAllergens(r: Recipe, foods: FoodMap): Set<Allergen> {
  return new Set(recipeFoods(r, foods).flatMap(f => f.allergens));
}

export function recipeFlags(r: Recipe, foods: FoodMap): Set<FoodFlag> {
  return new Set(recipeFoods(r, foods).flatMap(f => f.flags));
}

/** Diet labels a recipe qualifies for (for tags in the UI). */
export function recipeDiets(r: Recipe, foods: FoodMap): Diet[] {
  const fs = recipeFoods(r, foods);
  return (Object.keys(FORBIDDEN) as Diet[]).filter(d => d !== 'omnivore' && d !== 'low_carb' && fs.every(f => foodFitsDiet(f, [d])));
}
