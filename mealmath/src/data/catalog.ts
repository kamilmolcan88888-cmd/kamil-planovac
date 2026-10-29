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
export const RECIPES = [...breakfast, ...mainsSkDe, ...mainsIntl, ...specialDiets, ...snacks] as Recipe[];

export const FOOD_MAP = foodMap(FOODS);
export const RECIPE_MAP: ReadonlyMap<string, Recipe> = new Map(RECIPES.map(r => [r.id, r]));
