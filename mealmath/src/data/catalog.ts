// Loads the bundled data files. No network at runtime – everything ships with the app.
import foodsFile from '../../data/foods.json';
import breakfast from '../../data/recipes/breakfast.json';
import mainsSkDe from '../../data/recipes/mains-sk-de.json';
import mainsIntl from '../../data/recipes/mains-intl.json';
import snacks from '../../data/recipes/snacks.json';
import specialDiets from '../../data/recipes/special-diets.json';
import type { Food, Recipe } from '../engine/types';
import { foodMap } from '../engine/nutrition';

export const FOODS_SOURCE: string = foodsFile.source;
export const FOODS_GENERATED_AT: string = foodsFile.generatedAt;
export const FOODS = foodsFile.foods as Food[];
const BUILT_IN = [...breakfast, ...mainsSkDe, ...mainsIntl, ...specialDiets, ...snacks] as Recipe[];
/** Built-in recipes plus the user's saved custom (AI-suggested) ones – see registerCustomRecipes. */
export const RECIPES: Recipe[] = [...BUILT_IN];
export const BUILT_IN_COUNT = BUILT_IN.length;

export const FOOD_MAP = foodMap(FOODS);
const recipeMap = new Map(RECIPES.map(r => [r.id, r]));
export const RECIPE_MAP: ReadonlyMap<string, Recipe> = recipeMap;

let customKey = '';
/**
 * Makes saved custom recipes part of the catalog (main thread and worker each call it with the
 * recipes from settings). Custom ids never shadow built-in ones.
 */
export function registerCustomRecipes(list: readonly Recipe[] | undefined): void {
  const valid = (list ?? []).filter(r => !BUILT_IN.some(b => b.id === r.id));
  const key = JSON.stringify(valid);
  if (key === customKey) return;
  customKey = key;
  RECIPES.length = BUILT_IN.length;
  RECIPES.push(...valid);
  recipeMap.clear();
  for (const r of RECIPES) recipeMap.set(r.id, r);
}
