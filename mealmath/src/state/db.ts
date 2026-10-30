import Dexie, { type Table } from 'dexie';
import type { Allergen, BodyProfile, Diet, Equipment, Household, Lang, MealSlot, Plan, PriceOverride, Recipe } from '../engine/types';
import type { WeightEntry } from '../engine/progress';
import type { CookSession, PlanWarning, RepetitionLevel } from '../engine/planner/types';

export type Theme = 'auto' | 'light' | 'dark';

export interface AppSettings {
  key: 'app';
  lang: Lang;
  theme: Theme;
  storeId: string;
  /** Show ingredient names in the store's language (DE for Lidl DE) instead of the UI language. */
  preferStoreLang: boolean;
  profile: BodyProfile;
  /** True until the user finishes onboarding – the UI labels the profile as a sample. */
  profileIsDemo: boolean;
  /** The user skipped onboarding and keeps the sample profile. */
  onboardingSkipped?: boolean;
  targetsOverride?: { kcal: number; protein: number };
  diets: Diet[];
  allergens: Allergen[];
  excludedFoods: string[];
  favoriteFoods: string[];
  equipment: Equipment[];
  household: Household;
  budget?: number;
  repetition: RepetitionLevel;
  slots: MealSlot[];
  currentPlanId?: string;
  /** Meals I don't cook (canteen, work lunch…): my usual estimate is counted every day. */
  externalMeals?: Partial<Record<MealSlot, { kcal: number; protein: number }>>;
  /** Set when settings that shape the plan changed after it was generated. */
  planStale?: boolean;
  /** Length of a generated plan in days (3–7). */
  planDays?: number;
  /** Count pantry staples (salt, oil, spices…) in the checkout total. */
  includePantry?: boolean;
  /** When the user last exported a backup (ISO timestamp). */
  lastBackupAt?: string;
  /** Backup reminder is hidden until this ISO timestamp. */
  backupSnoozeUntil?: string;
  /** Optional Claude recipe suggestions (off by default). */
  aiEnabled?: boolean;
  /** The user's own Anthropic API key. Stays on this device and is left out of backups. */
  aiKey?: string;
  /** Saved custom recipes (validated; macros always computed from foods.json). */
  customRecipes?: Recipe[];
}

export interface StoredPlan {
  id: string;
  startDate: string;
  createdAt: string;
  seed: number;
  /** Store the plan was generated for (prices may since be viewed in another store). */
  storeId: string;
  plan: Plan;
  sessions: CookSession[];
  warnings: PlanWarning[];
  foodCost: number;
  /** Shopping list: food ids already in the basket. */
  checked?: string[];
}

class MealMathDB extends Dexie {
  settings!: Table<AppSettings, string>;
  plans!: Table<StoredPlan, string>;
  priceOverrides!: Table<PriceOverride, [string, string]>;
  weights!: Table<WeightEntry, string>;

  constructor() {
    super('mealmath');
    this.version(1).stores({
      settings: 'key',
      plans: 'id, startDate',
      priceOverrides: '[storeId+foodId], storeId',
    });
    // v2: body-weight log (one entry per day).
    this.version(2).stores({
      settings: 'key',
      plans: 'id, startDate',
      priceOverrides: '[storeId+foodId], storeId',
      weights: 'date',
    });
  }
}

export const db = new MealMathDB();

export const DEFAULT_SETTINGS: AppSettings = {
  key: 'app',
  lang: 'sk',
  theme: 'auto',
  storeId: 'lidl-sk',
  preferStoreLang: false,
  profile: { sex: 'male', age: 30, heightCm: 180, weightKg: 80, workoutsPerWeek: 3, goal: 'lose' },
  profileIsDemo: true,
  diets: [],
  allergens: [],
  excludedFoods: [],
  favoriteFoods: [],
  equipment: ['stove', 'oven', 'microwave', 'blender', 'toaster'],
  household: { adults: 1, kids: 0, sharedSlots: [] },
  budget: 70,
  repetition: 2,
  slots: ['breakfast', 'lunch', 'dinner'],
};
