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
