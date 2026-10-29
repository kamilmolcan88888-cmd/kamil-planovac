// Full local backup: settings, plans and price overrides in one JSON file.
import { db, DEFAULT_SETTINGS, type AppSettings, type StoredPlan } from './db';
import type { PriceOverride } from '../engine/types';

export const BACKUP_FORMAT = 'mealmath-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  settings: AppSettings;
  plans: StoredPlan[];
  priceOverrides: PriceOverride[];
}

export async function exportAll(): Promise<Backup> {
  const [settings, plans, priceOverrides] = await Promise.all([db.settings.get('app'), db.plans.toArray(), db.priceOverrides.toArray()]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: settings ?? DEFAULT_SETTINGS, plans, priceOverrides };
}

/** Throws on anything that is not a MealMath backup. Replaces all local data in one transaction. */
export async function importAll(raw: unknown): Promise<void> {
  const b = raw as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.version !== 'number' || b.version > BACKUP_VERSION || !b.settings || !Array.isArray(b.plans) || !Array.isArray(b.priceOverrides)) {
    throw new Error('invalid_backup');
  }
  if (b.plans.some(p => !p?.id || !p.plan?.days) || b.priceOverrides.some(o => !o?.storeId || !o.foodId || !(o.price > 0) || !(o.packG > 0))) throw new Error('invalid_backup');
  await db.transaction('rw', db.settings, db.plans, db.priceOverrides, async () => {
    await Promise.all([db.settings.clear(), db.plans.clear(), db.priceOverrides.clear()]);
    await db.settings.put({ ...DEFAULT_SETTINGS, ...b.settings, key: 'app' });
    await db.plans.bulkPut(b.plans!);
    await db.priceOverrides.bulkPut(b.priceOverrides!);
  });
}
