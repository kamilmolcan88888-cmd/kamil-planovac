// Integrity checks for the real data files (foods.json from USDA, hand-written recipes).
import { FOOD_MAP, FOODS, RECIPES } from '../catalog';
import { ALLERGENS, AISLES, type Equipment, type MealSlot } from '../../engine/types';
import { recipeAllergens, recipeDiets } from '../../engine/diet';
import { recipeMacros } from '../../engine/nutrition';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const EQUIPMENT: Equipment[] = ['stove', 'oven', 'microwave', 'blender', 'airfryer', 'toaster'];

describe('foods.json', () => {
  it('has ~400 foods with unique ids', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(350);
    expect(new Set(FOODS.map(f => f.id)).size).toBe(FOODS.length);
  });

  it.each(FOODS.map(f => [f.id, f] as const))('%s has sane USDA values', (_, f) => {
    expect(f.fdcId).toBeGreaterThan(0);
    for (const v of Object.values(f.per100)) expect(Number.isFinite(v) && v >= 0).toBe(true);
    expect(f.per100.protein + f.per100.carbs + f.per100.fat).toBeLessThanOrEqual(101);
    expect(AISLES).toContain(f.aisle);
    f.allergens.forEach(a => expect(ALLERGENS).toContain(a));
  });

  it('energy roughly agrees with 4/4/9 Atwater factors (catches a wrong USDA record)', () => {
    const off = FOODS.filter(f => {
      const { kcal, protein, carbs, fat } = f.per100;
      const atwater = 4 * protein + 4 * carbs + 9 * fat;
      return kcal > 40 && Math.abs(kcal - atwater) / kcal > 0.3;
    }).map(f => f.id);
    // Fibre-rich or polyol foods legitimately deviate; anything else needs a look.
    const allowed = new Set(['chia', 'flaxseed', 'wheat_bran', 'oat_bran', 'cocoa', 'vinegar', 'balsamic', 'soy_chunks', 'coconut_desiccated', 'hemp_seeds', 'popcorn', 'dried_fig', 'prunes', 'gelatin', 'chili_powder', 'paprika', 'cinnamon', 'oregano', 'thyme', 'basil_dried', 'bay_leaf', 'marjoram', 'rosemary', 'sage', 'tarragon', 'parsley_dried', 'dill_dried', 'turmeric', 'curry', 'cayenne', 'chili_flakes', 'cloves', 'allspice', 'coriander_seed', 'fennel_seed', 'caraway', 'cumin', 'pepper_black', 'nutmeg', 'ginger_ground', 'onion_powder', 'garlic_powder', 'mustard_seed', 'poppy', 'vanilla', 'baking_powder']);
    expect(off.filter(id => !allowed.has(id))).toEqual([]);
  });
});

describe('recipes', () => {
  it('has 80+ recipes with unique ids', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(80);
    expect(new Set(RECIPES.map(r => r.id)).size).toBe(RECIPES.length);
  });

  it('covers every meal slot', () => {
    for (const s of ['breakfast', 'lunch', 'dinner'] as const) expect(RECIPES.filter(r => r.meals.includes(s)).length).toBeGreaterThanOrEqual(20);
    expect(RECIPES.filter(r => r.meals.includes('snack')).length).toBeGreaterThanOrEqual(8);
  });

  it.each(RECIPES.map(r => [r.id, r] as const))('%s is well-formed', (_, r) => {
    expect(r.name.sk && r.name.de && r.name.en).toBeTruthy();
    expect(r.meals.length).toBeGreaterThan(0);
    r.meals.forEach(m => expect(SLOTS).toContain(m));
    r.equipment.forEach(e => expect(EQUIPMENT).toContain(e));
    expect(r.steps.sk.length).toBeGreaterThan(0);
    expect(r.steps.de.length).toBe(r.steps.sk.length);
    const seen = new Set<string>();
    for (const i of r.ingredients) {
      expect(FOOD_MAP.has(i.food), `unknown food ${i.food}`).toBe(true);
      expect(seen.has(i.food), `duplicate ${i.food}`).toBe(false);
      seen.add(i.food);
      expect(i.min).toBeGreaterThanOrEqual(0);
      expect(i.min).toBeLessThanOrEqual(i.g);
      expect(i.g).toBeLessThanOrEqual(i.max);
    }
    // No pre-computed nutrition may sneak into recipes.
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['kcal']));
    expect(JSON.stringify(r)).not.toMatch(/"(kcal|protein|carbs|fat)"/);
  });

  it('derives allergens and diets from foods', () => {
    const halusky = RECIPES.find(r => r.id === 'bryndza-halusky')!;
    expect([...recipeAllergens(halusky, FOOD_MAP)]).toEqual(expect.arrayContaining(['gluten', 'milk', 'eggs']));
    expect(recipeDiets(halusky, FOOD_MAP)).not.toContain('vegetarian');
    const curry = RECIPES.find(r => r.id === 'tofu-veg-coconut-curry')!;
    expect(recipeDiets(curry, FOOD_MAP)).toContain('vegan');
  });

  it('every recipe has a sensible default portion (computed, not stored)', () => {
    for (const r of RECIPES) {
      const { total } = recipeMacros(r, FOOD_MAP);
      const lo = r.meals.includes('snack') && r.meals.length === 1 ? 80 : 200;
      expect(total.kcal, r.id).toBeGreaterThan(lo);
      expect(total.kcal, r.id).toBeLessThan(1200);
    }
  });
});
