// All tunable constants in one place. Changing them never requires touching formulas.

export const CONFIG = {
  /** Activity multiplier by workouts per week (first matching upper bound wins). */
  activity: [
    { maxWorkouts: 0, factor: 1.2 },   // sedentary
    { maxWorkouts: 2, factor: 1.375 },
    { maxWorkouts: 4, factor: 1.55 },
    { maxWorkouts: 6, factor: 1.725 },
    { maxWorkouts: Infinity, factor: 1.9 },
  ],
  /** Calorie adjustment by goal, as a fraction of TDEE. */
  goalAdjust: { lose: -0.2, maintain: 0, gain: 0.1 },
  /** Protein: 1 g per lb of body weight at this BMI for the user's height. */
  proteinReferenceBmi: 25,
  proteinGramsPerLb: 1,
  /** Protein may supply at most this share of calories. */
  proteinMaxKcalShare: 0.35,
  kcalRounding: 50,
  /** Day bands relative to target. */
  kcalBand: { low: -0.05, high: 0 },
  proteinBand: { low: 0, high: 0.07 },
  /** Lower safety bound so a "lose" target never goes absurdly low. */
  minKcal: { male: 1500, female: 1200 },
} as const;

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;
export const LB_PER_KG = 2.2046226218;
export const CM_PER_INCH = 2.54;

export const CONFIG_SHOPPING = {
  /** A child's portion relative to an adult's default portion. */
  kidPortion: 0.6,
  /** Staples most kitchens already have – listed separately, left out of checkout by default. */
  pantryAisles: ['spices'] as string[],
  pantryFoods: ['salt', 'olive_oil', 'rapeseed_oil', 'sunflower_oil', 'vinegar', 'vinegar_spirit', 'flour', 'sugar', 'baking_powder', 'cornstarch', 'soy_sauce'],
};

export const CONFIG_PLANNER = {
  /** Index = repetition level (0 = every meal different … 3 = cook once, eat 4×). */
  repetition: [
    { batchPortions: 1, maxUses: 1, breakfastUses: 2, snackUses: 2 },
    { batchPortions: 2, maxUses: 2, breakfastUses: 3, snackUses: 3 }, // default ≈ 11 meals for 21 portions
    { batchPortions: 3, maxUses: 3, breakfastUses: 4, snackUses: 4 },
    { batchPortions: 4, maxUses: 4, breakfastUses: 7, snackUses: 7 },
  ],
  /** Below this EUR per adult per day the planner favours cheap recipes harder. */
  tightBudgetPerPersonDay: 5,
  /** Greedy layout weights. */
  weights: { density: 3, defaultDensity: 1, favorite: 0.5, cost: 3, costTight: 8, reuse: 0.8, sameProtein: 1, sameCuisine: 0.3, jitter: 0.6 },
  /** LP: the solver aims inside the band by this margin, so rounding grams cannot push a day out. */
  lpMargin: { kcalLow: 20, kcalHigh: 10, proteinLow: 2, proteinHigh: 2, budget: 0.5, carbs: 1.5 },
  /** LP objective weights (per kcal, per g, per EUR). */
  lp: { kcalSlack: 3, proteinShort: 60, proteinOver: 25, budgetOver: 6, cost: 1.5, deviation: 1, deviationMinG: 25 },
  /** Gram rounding of the final plan. */
  roundStepG: 5,
  /** Recipe max grams fit ~2600 kcal/day; above that, my portion's maxima grow proportionally (capped). */
  rangeRefKcal: 2600,
  rangeMaxScale: 1.8,
  timeBudgetMs: 1500,
  maxIterations: 80,
  /** Seeded initial layouts tried before the local search (only while the plan still misses). */
  starts: 3,
  /** Alternatives tried per session in the local search. */
  altsPerMove: 5,
};

/** How much the recipe maxima may be stretched for a given target (shared by planner and validator). */
export const portionMaxScale = (kcal: number) =>
  Math.min(CONFIG_PLANNER.rangeMaxScale, Math.max(1, kcal / CONFIG_PLANNER.rangeRefKcal));
