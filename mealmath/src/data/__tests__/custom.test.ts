import { BUILT_IN_COUNT, RECIPES, RECIPE_MAP, registerCustomRecipes } from '../catalog';
import type { Recipe } from '../../engine/types';

const r = (id: string): Recipe => ({ ...RECIPES[0]!, id, tags: ['ai'] });

describe('registerCustomRecipes', () => {
  afterEach(() => registerCustomRecipes([]));
  it('adds, replaces and removes custom recipes', () => {
    registerCustomRecipes([r('ai-a'), r('ai-b')]);
    expect(RECIPES.length).toBe(BUILT_IN_COUNT + 2);
    expect(RECIPE_MAP.get('ai-a')).toBeDefined();
    registerCustomRecipes([r('ai-b')]);
    expect(RECIPE_MAP.has('ai-a')).toBe(false);
    expect(RECIPES.length).toBe(BUILT_IN_COUNT + 1);
  });
  it('never shadows a built-in recipe', () => {
    registerCustomRecipes([{ ...r(RECIPES[1]!.id), timeMin: 999 }]);
    expect(RECIPES.length).toBe(BUILT_IN_COUNT);
    expect(RECIPE_MAP.get(RECIPES[1]!.id)!.timeMin).not.toBe(999);
  });
});
