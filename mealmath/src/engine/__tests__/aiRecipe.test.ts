import { foodMap } from '../nutrition';
import { parseAiRecipe } from '../aiRecipe';
import { FOODS } from '../__fixtures__/foods';

const foods = foodMap(FOODS);
const good = {
  name_sk: 'Kuracie s ryžou', name_de: 'Hähnchen mit Reis', name_en: 'Chicken with rice',
  meals: ['lunch', 'dinner', 'nonsense'], timeMin: 25, equipment: ['stove'], batchOk: true, keepsDays: 9,
  ingredients: [{ food: 'chicken', g: 150, min: 100, max: 250 }, { food: 'rice', g: 70, min: 0, max: 120 }],
  steps_sk: ['Uvar ryžu.', 'Opeč kura.'], steps_de: ['Reis kochen.', 'Hähnchen braten.'],
  kcal: 9999, protein: 500,
};

describe('parseAiRecipe', () => {
  it('accepts a valid recipe, drops model numbers and clamps shelf life', () => {
    const r = parseAiRecipe(good, foods, new Set());
    if (!('recipe' in r)) throw new Error(JSON.stringify(r));
    expect(r.recipe.id).toBe('ai-chicken-with-rice');
    expect(r.recipe.meals).toEqual(['lunch', 'dinner']);
    expect(r.recipe.batch).toEqual({ ok: true, keepsDays: 4 });
    expect(JSON.stringify(r.recipe)).not.toContain('9999');
    expect(r.recipe.tags).toContain('ai');
  });

  it('makes ids unique', () => {
    const r = parseAiRecipe(good, foods, new Set(['ai-chicken-with-rice']));
    expect('recipe' in r && r.recipe.id).toBe('ai-chicken-with-rice-2');
  });

  it('rejects unknown foods and bad grams', () => {
    const r = parseAiRecipe({ ...good, ingredients: [{ food: 'unicorn', g: 1, min: 0, max: 2 }, { food: 'rice', g: 50, min: 80, max: 120 }] }, foods, new Set());
    expect('errors' in r && r.errors).toEqual(expect.arrayContaining(['unknown_food:unicorn', 'bad_grams:rice']));
  });

  it('rejects missing translations and garbage', () => {
    expect('errors' in parseAiRecipe({ ...good, name_de: '' }, foods, new Set())).toBe(true);
    expect(parseAiRecipe('nope', foods, new Set())).toEqual({ errors: ['invalid'] });
  });
});
