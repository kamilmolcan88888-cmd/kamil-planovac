// TEST FIXTURE ONLY – round, made-up numbers so expected results are easy to compute by hand.
// These are NOT USDA values and are never bundled into the app.
import type { Food, Recipe } from '../types';

const f = (id: string, kcal: number, protein: number, carbs: number, fat: number, extra: Partial<Food> = {}): Food => ({
  id, fdcId: 900000 + id.length, usdaDescription: `FIXTURE ${id}`, usdaDataType: 'sr_legacy_food',
  name: { en: id }, aisle: 'dry_goods', allergens: [], flags: [], shelfDays: 7,
  per100: { kcal, protein, carbs, fat }, ...extra,
});

export const FOODS: Food[] = [
  f('chicken', 100, 20, 0, 2, { flags: ['meat'], aisle: 'meat' }),
  f('rice', 300, 10, 70, 1),
  f('oats', 400, 10, 60, 10, { allergens: ['gluten'] }),
  f('skyr', 50, 10, 4, 0, { flags: ['dairy'], allergens: ['milk'], aisle: 'dairy' }),
  f('pork', 200, 20, 0, 13, { flags: ['meat', 'pork', 'red_meat'], aisle: 'meat' }),
  f('tofu', 100, 10, 2, 6, { allergens: ['soy'], aisle: 'plant_protein' }),
  f('peanut', 600, 25, 15, 50, { allergens: ['peanuts'] }),
];

export const RECIPES: Recipe[] = [
  {
    id: 'oats-skyr', name: { en: 'Oats with skyr' }, meals: ['breakfast'], timeMin: 5, equipment: [], tags: [],
    cuisine: 'intl', batch: { ok: false, keepsDays: 1 },
    ingredients: [{ food: 'oats', g: 60, min: 40, max: 120 }, { food: 'skyr', g: 200, min: 100, max: 500 }],
    steps: { sk: ['x'], de: ['x'] },
  },
  {
    id: 'chicken-rice', name: { en: 'Chicken rice' }, meals: ['lunch', 'dinner'], timeMin: 25, equipment: ['stove'], tags: [],
    cuisine: 'intl', batch: { ok: true, keepsDays: 3 },
    ingredients: [{ food: 'chicken', g: 200, min: 100, max: 400 }, { food: 'rice', g: 80, min: 40, max: 200 }],
    steps: { sk: ['x'], de: ['x'] },
  },
  {
    id: 'pork-rice', name: { en: 'Pork rice' }, meals: ['lunch', 'dinner'], timeMin: 25, equipment: ['stove'], tags: [],
    cuisine: 'sk', batch: { ok: true, keepsDays: 3 },
    ingredients: [{ food: 'pork', g: 150, min: 100, max: 300 }, { food: 'rice', g: 80, min: 40, max: 200 }],
    steps: { sk: ['x'], de: ['x'] },
  },
];
