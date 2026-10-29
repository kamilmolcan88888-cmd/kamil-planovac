// Turns a recipe proposed by a language model into a normal Recipe – or rejects it.
// The model only chooses food ids and gram ranges. It never supplies nutrition numbers:
// any it tries to send are ignored, and macros are always computed from foods.json.
import type { FoodMap } from './nutrition';
import type { Equipment, MealSlot, Recipe } from './types';

export const AI_PREFIX = 'ai-';
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const EQUIPMENT: Equipment[] = ['stove', 'oven', 'microwave', 'blender', 'airfryer', 'toaster'];

/** JSON schema for structured outputs. Deliberately has no field for kcal/protein/etc. */
export const AI_RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name_sk', 'name_de', 'name_en', 'meals', 'timeMin', 'equipment', 'batchOk', 'keepsDays', 'ingredients', 'steps_sk', 'steps_de'],
  properties: {
    name_sk: { type: 'string' }, name_de: { type: 'string' }, name_en: { type: 'string' },
    meals: { type: 'array', items: { type: 'string', enum: SLOTS } },
    timeMin: { type: 'integer' },
    equipment: { type: 'array', items: { type: 'string', enum: EQUIPMENT } },
    batchOk: { type: 'boolean' },
    keepsDays: { type: 'integer' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['food', 'g', 'min', 'max'],
        properties: { food: { type: 'string' }, g: { type: 'integer' }, min: { type: 'integer' }, max: { type: 'integer' } },
      },
    },
    steps_sk: { type: 'array', items: { type: 'string' } },
    steps_de: { type: 'array', items: { type: 'string' } },
  },
} as const;

export type AiRecipeError =
  | 'invalid' | 'no_name' | 'no_meals' | 'no_steps' | 'too_few_ingredients' | 'too_many_ingredients'
  | `unknown_food:${string}` | `bad_grams:${string}` | `duplicate_food:${string}`;

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo);
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/**
 * Validates the model's JSON against foods.json. Unknown foods, nonsense grams or missing
 * translations reject the recipe – nothing is silently "fixed" except clamping time and shelf life.
 */
export function parseAiRecipe(raw: unknown, foods: FoodMap, takenIds: ReadonlySet<string>): { recipe: Recipe } | { errors: AiRecipeError[] } {
  if (!raw || typeof raw !== 'object') return { errors: ['invalid'] };
  const o = raw as Record<string, unknown>;
  const errors: AiRecipeError[] = [];
  const name = { sk: str(o.name_sk), de: str(o.name_de), en: str(o.name_en) };
  if (!name.sk || !name.de || !name.en) errors.push('no_name');

  const meals = [...new Set((Array.isArray(o.meals) ? o.meals : []).filter((m): m is MealSlot => SLOTS.includes(m as MealSlot)))];
  if (!meals.length) errors.push('no_meals');
  const equipment = [...new Set((Array.isArray(o.equipment) ? o.equipment : []).filter((e): e is Equipment => EQUIPMENT.includes(e as Equipment)))];

  const list = Array.isArray(o.ingredients) ? o.ingredients : [];
  if (list.length < 2) errors.push('too_few_ingredients');
  if (list.length > 12) errors.push('too_many_ingredients');
  const seen = new Set<string>();
  const ingredients: Recipe['ingredients'] = [];
  for (const it of list.slice(0, 12)) {
    const i = (it ?? {}) as Record<string, unknown>;
    const id = str(i.food, 60);
    if (!foods.has(id)) { errors.push(`unknown_food:${id || '?'}`); continue; }
    if (seen.has(id)) { errors.push(`duplicate_food:${id}`); continue; }
    seen.add(id);
    const g = i.g, min = i.min, max = i.max;
    const ok = [g, min, max].every(v => typeof v === 'number' && Number.isFinite(v)) &&
      (min as number) >= 0 && (min as number) <= (g as number) && (g as number) <= (max as number) && (max as number) <= 1000 && (g as number) > 0;
    if (!ok) { errors.push(`bad_grams:${id}`); continue; }
    ingredients.push({ food: id, g: Math.round(g as number), min: Math.round(min as number), max: Math.round(max as number) });
  }

  const steps = {
    sk: (Array.isArray(o.steps_sk) ? o.steps_sk : []).map(s => str(s, 400)).filter(Boolean).slice(0, 10),
    de: (Array.isArray(o.steps_de) ? o.steps_de : []).map(s => str(s, 400)).filter(Boolean).slice(0, 10),
  };
  if (!steps.sk.length || !steps.de.length) errors.push('no_steps');
  if (errors.length) return { errors };

  let id = AI_PREFIX + (slug(name.en) || 'recipe');
  for (let n = 2; takenIds.has(id); n++) id = `${AI_PREFIX}${slug(name.en) || 'recipe'}-${n}`;
  const batchOk = o.batchOk === true;
  return {
    recipe: {
      id, name, meals, equipment, steps, ingredients,
      timeMin: int(o.timeMin, 1, 240),
      tags: ['ai'],
      cuisine: 'intl',
      batch: { ok: batchOk, keepsDays: batchOk ? int(o.keepsDays, 1, 4) : 1 },
    },
  };
}
