// App state hooks backed by IndexedDB (Dexie). Everything stays on the device.
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type AppSettings, type StoredPlan } from './db';
import { planInWorker } from './planService';
import { localISO } from './dates';
import type { MealSlot, PriceOverride } from '../engine/types';

export async function loadSettings(): Promise<AppSettings> {
  const s = await db.settings.get('app');
  if (s) return { ...DEFAULT_SETTINGS, ...s };
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export const useSettings = () => useLiveQuery(() => db.settings.get('app').then(s => (s ? { ...DEFAULT_SETTINGS, ...s } : undefined)));

export const updateSettings = (patch: Partial<AppSettings>) => db.settings.update('app', patch);

/** undefined while loading, null when there is no plan yet. */
export const useCurrentPlan = (id: string | undefined): StoredPlan | null | undefined =>
  useLiveQuery(async () => (id ? (await db.plans.get(id)) ?? null : null), [id]);

export const usePriceOverrides = (storeId: string | undefined) =>
  useLiveQuery(() => (storeId ? db.priceOverrides.where('storeId').equals(storeId).toArray() : []), [storeId]);

/** Generates a new week starting `startDate` with the current settings and makes it current. */
export async function createPlan(startDate = localISO(), seed = 1): Promise<StoredPlan> {
  const settings = await loadSettings();
  const overrides = await db.priceOverrides.where('storeId').equals(settings.storeId).toArray();
  const r = await planInWorker({ settings, overrides, startDate, seed });
  const stored: StoredPlan = {
    id: r.plan.id + '-' + Date.now(), startDate, createdAt: new Date().toISOString(), seed,
    storeId: settings.storeId, plan: r.plan, sessions: r.sessions, warnings: r.warnings, foodCost: r.foodCost,
  };
  await db.transaction('rw', db.plans, db.settings, async () => {
    await db.plans.put(stored);
    await db.settings.update('app', { currentPlanId: stored.id });
  });
  return stored;
}

/** Ticks a meal as eaten (or back). Only the `done` flag changes – grams never do. */
export async function toggleDone(planId: string, date: string, slot: MealSlot) {
  await db.transaction('rw', db.plans, async () => {
    const p = await db.plans.get(planId);
    if (!p) return;
    const day = p.plan.days.find(d => d.date === date);
    const meal = day?.meals.find(m => m.slot === slot);
    if (!meal) return;
    meal.done = !meal.done;
    await db.plans.put(p);
  });
}

// ---- shopping list ----

export async function toggleChecked(planId: string, foodId: string) {
  await db.transaction('rw', db.plans, async () => {
    const p = await db.plans.get(planId);
    if (!p) return;
    const set = new Set(p.checked ?? []);
    if (set.has(foodId)) set.delete(foodId); else set.add(foodId);
    await db.plans.update(planId, { checked: [...set] });
  });
}

// ---- price overrides (local edits always win over the bundled table) ----

export const saveOverride = (o: PriceOverride) => db.priceOverrides.put(o);
export const resetOverride = (storeId: string, foodId: string) => db.priceOverrides.delete([storeId, foodId]);
export const saveOverrides = (list: PriceOverride[]) => db.priceOverrides.bulkPut(list);
