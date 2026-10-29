// Optional Claude recipe suggestions. Off by default; uses the user's own API key from this device.
// The model picks foods (by foods.json id) and gram ranges only. Every number shown in the app is
// recomputed by code from USDA data; the validator then decides like for any built-in recipe.
import { FOODS, FOOD_MAP, RECIPES } from '../data/catalog';
import { AI_RECIPE_SCHEMA, parseAiRecipe, type AiRecipeError } from '../engine/aiRecipe';
import { foodFitsDiet } from '../engine/diet';
import type { MealSlot, Recipe } from '../engine/types';
import { bookFor } from '../workers/requestBase';
import type { AppSettings } from './db';

export const AI_MODEL = 'claude-opus-5-5';

export type SuggestResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; reason: 'no_key' | 'auth' | 'network' | 'rate_limit' | 'refused' | 'api'; detail?: string }
  | { ok: false; reason: 'invalid'; errors: AiRecipeError[] }
  | { ok: false; reason: 'constraints'; foods: string[] };

/** Foods the user may eat and can buy in the selected store – the only ids the model may use. */
export function allowedFoods(s: AppSettings) {
  const book = bookFor(s.storeId, []);
  return FOODS.filter(f => !f.allergens.some(a => s.allergens.includes(a)) && foodFitsDiet(f, s.diets) && !s.excludedFoods.includes(f.id) && book.isAvailable(f.id));
}

/** Independent re-check: a suggestion that breaks a diet/allergy/equipment rule is rejected, never adjusted. */
export function constraintViolations(r: Recipe, s: AppSettings): string[] {
  const bad = r.ingredients.map(i => FOOD_MAP.get(i.food)!).filter(f => f.allergens.some(a => s.allergens.includes(a)) || !foodFitsDiet(f, s.diets) || s.excludedFoods.includes(f.id)).map(f => f.id);
  return [...bad, ...r.equipment.filter(e => !s.equipment.includes(e))];
}

export async function suggestRecipe(s: AppSettings, slot: MealSlot, wish: string): Promise<SuggestResult> {
  if (!s.aiKey) return { ok: false, reason: 'no_key' };
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: s.aiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const foods = allowedFoods(s).map(f => `${f.id}: ${f.name.en}`).join('\n');

  const system = [
    'You design one home-cooked recipe for a macro meal planner used in Slovakia and Germany.',
    'Use ONLY food ids from the list the user gives; any other id makes the recipe unusable.',
    'For each ingredient give default grams for one portion (g) and a range the planner may scale within (min ≤ g ≤ max; min 0 means optional).',
    'Main protein sources should have a wide range so the planner can hit protein targets. Fixed items like spices can have min = max.',
    'Do not state calories or macros anywhere – the app computes them from USDA data.',
    'Write names and short, practical steps in Slovak (name_sk, steps_sk) and German (name_de, steps_de), plus an English name.',
    'Only use this equipment: ' + (s.equipment.join(', ') || 'none (no-cook)') + '.',
  ].join('\n');
  const user = `Meal: ${slot}.\nWish: ${wish.trim() || 'high protein, simple, cheap'}\n\nAllowed foods (id: name):\n${foods}`;

  try {
    const res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_RECIPE_SCHEMA as unknown as Record<string, unknown> } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'refused' };
    const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'invalid', errors: ['invalid'] }; }
    const parsed = parseAiRecipe(raw, FOOD_MAP, new Set(RECIPES.map(r => r.id)));
    if ('errors' in parsed) return { ok: false, reason: 'invalid', errors: parsed.errors };
    const bad = constraintViolations(parsed.recipe, s);
    if (bad.length) return { ok: false, reason: 'constraints', foods: bad };
    return { ok: true, recipe: parsed.recipe };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: 'auth' };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: 'rate_limit' };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'network' };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: 'api', detail: `${e.status ?? ''} ${e.message}`.trim() };
    return { ok: false, reason: 'api', detail: String(e) };
  }
}
