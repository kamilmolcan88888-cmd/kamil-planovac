// Shared domain types. The engine is plain TypeScript with no UI dependencies.

export type Lang = 'sk' | 'de' | 'en' | 'cs';
export type Localized = Partial<Record<Lang, string>> & { en: string };

export const ALLERGENS = [
  'gluten', 'milk', 'eggs', 'fish', 'crustaceans', 'molluscs',
  'peanuts', 'nuts', 'soy', 'celery', 'mustard', 'sesame',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

/** Content flags on a food. Diet compatibility is derived from these, never hand-tagged on recipes. */
export type FoodFlag =
  | 'meat'      // any land-animal flesh (incl. poultry)
  | 'pork'
  | 'red_meat'  // beef, pork, lamb, game
  | 'fish'      // fish and seafood
  | 'dairy'
  | 'egg'
  | 'honey';    // animal product that is vegetarian but not vegan

export type Diet = 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian' | 'no_pork' | 'no_red_meat' | 'low_carb';

export const AISLES = [
  'produce', 'bakery', 'meat', 'fish', 'dairy', 'eggs', 'frozen',
  'dry_goods', 'canned', 'spices', 'oils_sauces', 'nuts_seeds', 'drinks', 'plant_protein',
] as const;
export type Aisle = (typeof AISLES)[number];

/** Nutrients per 100 g, always taken from a USDA FoodData Central record. */
export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Food {
  id: string;
  fdcId: number;
  usdaDescription: string;
  usdaDataType: 'sr_legacy_food' | 'foundation_food';
  name: Localized;
  aisle: Aisle;
  allergens: Allergen[];
  flags: FoodFlag[];
  /** Days an opened package / leftover stays usable. */
  shelfDays: number;
  /** Optional weight of one piece (egg, roll, banana) for friendlier display. */
  pieceG?: number;
  per100: Per100;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Equipment = 'stove' | 'oven' | 'microwave' | 'blender' | 'airfryer' | 'toaster';

export interface RecipeIngredient {
  food: string;
  /** Default grams for one standard portion (used for other household members). */
  g: number;
  /** Range the planner may scale *my* portion within. min === max means fixed. */
  min: number;
  max: number;
}

export interface Recipe {
  id: string;
  name: Localized;
  meals: MealSlot[];
  timeMin: number;
  equipment: Equipment[];
  tags: string[];
  cuisine: 'sk' | 'de' | 'intl';
  batch: { ok: boolean; keepsDays: number };
  ingredients: RecipeIngredient[];
  steps: Partial<Record<Lang, string[]>> & { sk: string[]; de: string[] };
}

/** Macro totals computed from grams × per-100 g values. */
export interface Macros extends Per100 {}

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';

export interface BodyProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  workoutsPerWeek: number;
  goal: Goal;
}

export interface Targets {
  kcal: number;
  protein: number;
  /** Inclusive bands a day must land in. */
  kcalBand: [number, number];
  proteinBand: [number, number];
}

// ---- Plan ----

export interface PlannedMeal {
  slot: MealSlot;
  recipeId: string;
  /** Grams of each ingredient in MY portion. */
  myGrams: Record<string, number>;
  /** Groups the same cooked pot across several days. */
  batchId?: string;
  done?: boolean;
  /**
   * "I eat out" – macros are a user-entered estimate, not from USDA.
   * When set, recipeId/myGrams are ignored for nutrition.
   */
  eatOut?: { kcal: number; protein: number; note?: string };
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  meals: PlannedMeal[];
}

export interface Plan {
  id: string;
  createdAt: string;
  storeId: string;
  targets: Targets;
  days: PlanDay[];
}

// ---- Stores & prices ----

export interface StoreInfo {
  id: string;            // file name without .json, e.g. "lidl-de"
  name: string;          // "Lidl Deutschland"
  chain: string;         // "lidl"
  country: string;       // ISO code, e.g. "DE"
  /** Language of product names and the shareable shopping list. */
  lang: Lang;
  currency: 'EUR';
  /** Aisle order when walking through this store. */
  aisleOrder?: Aisle[];
}

export interface PriceItem {
  /** Product name as shown in this store (store language). */
  name: string;
  packG: number;
  /** Price per pack in EUR – always an ESTIMATE, never a live price. */
  price: number;
  updated: string; // YYYY-MM-DD
}

export interface UnavailableItem {
  unavailable: true;
  /** Suggested replacement food id, if any. */
  substitute?: string;
  updated: string;
}

export interface PriceTable {
  store: StoreInfo;
  /** Always true – the app must never imply live prices. */
  estimate: true;
  updated: string;
  items: Record<string, PriceItem | UnavailableItem>;
}

/** A user's local edit. Takes precedence over the bundled table. */
export interface PriceOverride {
  storeId: string;
  foodId: string;
  packG: number;
  price: number;
  name?: string;
  updated: string;
}

export interface Household {
  adults: number;   // including me
  kids: number;
  /** Slots I cook for the whole household; other slots are only for me. */
  sharedSlots: MealSlot[];
}
