import { foodFitsDiet, LOW_CARB_MAX_PER_MEAL } from '../diet';
import type { Food, Recipe } from '../types';
import type { PlanRequest } from './types';

export interface Candidate {
  recipe: Recipe;
  /** Ingredients forced to 0 g (optional ones the user excluded or the store lacks). */
  forcedZero: Set<string>;
  /** Protein per 100 kcal at the most protein-heavy scaling (rough capability measure). */
  maxDensity: number;
  /** Protein per 100 kcal at the default portion. */
  defaultDensity: number;
  /** EUR per 100 kcal at the default portion. */
  costPer100kcal: number;
  favorite: number;
  /** Main protein food (for variety). */
  mainProtein: string;
  /** kcal the recipe can add without adding protein (fat, plus carbs unless low-carb), at max grams. */
  extraKcalMax: number;
  /** kcal at the default portion. */
  defaultKcal: number;
}

/**
 * Hard constraints. A recipe stays only if every ingredient it really needs (min > 0) is allowed
 * (allergens, diet, exclusions, store availability) and the user has the equipment.
 * Optional ingredients (min = 0) that are not allowed are forced to 0 g instead.
 */
export function filterRecipes(req: PlanRequest): Candidate[] {
  const out: Candidate[] = [];
  const allowed = (f: Food) =>
    !f.allergens.some(a => req.allergens.includes(a)) &&
    foodFitsDiet(f, req.diets) &&
    !req.excludedFoods.includes(f.id) &&
    req.book.isAvailable(f.id);

  next: for (const r of req.recipes) {
    if (!r.equipment.every(e => req.equipment.includes(e))) continue;
    const forcedZero = new Set<string>();
    for (const i of r.ingredients) {
      const f = req.foods.get(i.food);
      if (!f) continue next;
      if (!allowed(f)) {
        if (i.min > 0) continue next;
        forcedZero.add(i.food);
      }
    }

    const per = (id: string) => req.foods.get(id)!.per100;
    const at = (pick: (i: Recipe['ingredients'][number]) => number) => {
      let kcal = 0, protein = 0, carbs = 0, cost = 0;
      for (const i of r.ingredients) {
        const g = forcedZero.has(i.food) ? 0 : pick(i);
        const p = per(i.food);
        kcal += (p.kcal * g) / 100; protein += (p.protein * g) / 100; carbs += (p.carbs * g) / 100;
        const pr = req.book.get(i.food);
        if (pr.available) cost += (g / pr.packG) * pr.price;
      }
      return { kcal, protein, carbs, cost };
    };

    if (req.diets.includes('low_carb') && at(i => i.min).carbs > LOW_CARB_MAX_PER_MEAL) continue;

    // Most protein-heavy scaling: protein-dense foods at max, the rest at min.
    const dense = at(i => (per(i.food).protein * 4 >= per(i.food).kcal * 0.3 ? i.max : i.min));
    const def = at(i => i.g);
    if (def.kcal <= 0) continue;

    const main = [...r.ingredients].filter(i => !forcedZero.has(i.food))
      .sort((a, b) => (per(b.food).protein * b.g) - (per(a.food).protein * a.g))[0]!.food;

    const lowCarb = req.diets.includes('low_carb');
    let extraKcalMax = 0;
    for (const i of r.ingredients) {
      if (forcedZero.has(i.food)) continue;
      const p = per(i.food);
      extraKcalMax += ((9 * p.fat + (lowCarb ? 0 : 4 * p.carbs)) * i.max) / 100;
    }

    out.push({
      recipe: r,
      extraKcalMax,
      defaultKcal: def.kcal,
      forcedZero,
      maxDensity: (dense.protein / Math.max(dense.kcal, 1)) * 100,
      defaultDensity: (def.protein / def.kcal) * 100,
      costPer100kcal: (def.cost / def.kcal) * 100,
      favorite: r.ingredients.filter(i => req.favoriteFoods.includes(i.food)).length,
      mainProtein: main,
    });
  }
  return out;
}
