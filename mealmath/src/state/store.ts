// App state hooks backed by IndexedDB (Dexie). Everything stays on the device.
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type AppSettings, type StoredPlan } from './db';
import { sessionsFromPlan, type ChangePreview } from '../engine/changes';
import type { PlanWarning } from '../engine/planner/types';
import type { PlanResult } from '../engine/planner';
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

/** Stores a planner result as the current plan. */
export async function savePlanResult(r: PlanResult, settings: AppSettings, startDate: string, seed: number, settingsPatch?: Partial<AppSettings>): Promise<StoredPlan> {
  const stored: StoredPlan = {
    id: r.plan.id + '-' + Date.now(), startDate, createdAt: new Date().toISOString(), seed,
    storeId: settings.storeId, plan: r.plan, sessions: sessionsFromPlan(r.plan), warnings: r.warnings, foodCost: r.foodCost,
  };
  await db.transaction('rw', db.plans, db.settings, async () => {
    await db.plans.put(stored);
    await db.settings.update('app', { ...settingsPatch, currentPlanId: stored.id, planStale: false });
  });
  return stored;
}

/** Generates a new week starting `startDate` with the current settings and makes it current. */
export async function createPlan(startDate = localISO(), seed = 1): Promise<StoredPlan> {
  const settings = await loadSettings();
  const overrides = await db.priceOverrides.where('storeId').equals(settings.storeId).toArray();
  const r = await planInWorker({ settings, overrides, startDate, seed });
  return savePlanResult(r, settings, startDate, seed);
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

// ---- week changes ----

/** Saves a confirmed change preview as the current plan. */
export async function applyPlanChange(planId: string, preview: ChangePreview, settingsPatch?: Partial<AppSettings>) {
  const failed = preview.report.days.filter(d => d.status !== 'verified');
  const warnings: PlanWarning[] = failed.length ? [{
    code: 'days_missed', days: failed.length, dates: failed.map(d => d.date),
    maxProteinShortfall: Math.ceil(preview.report.maxProteinShortfall), maxKcalDeviation: Math.ceil(preview.report.maxKcalDeviation),
  }] : [];
  await db.transaction('rw', db.plans, db.settings, async () => {
    const p = await db.plans.get(planId);
    if (!p) return;
    const settings = await db.settings.get('app');
    await db.plans.put({ ...p, plan: preview.plan, sessions: sessionsFromPlan(preview.plan), storeId: settings?.storeId ?? p.storeId,
      warnings: [...p.warnings.filter(w => w.code !== 'days_missed'), ...warnings], foodCost: preview.costAfter });
    if (settingsPatch) await db.settings.update('app', settingsPatch);
  });
}
