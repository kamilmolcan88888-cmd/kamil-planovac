// Full local backup: settings, plans and price overrides in one JSON file.
import { db, DEFAULT_SETTINGS, type AppSettings, type StoredPlan } from './db';
import type { WeightEntry } from '../engine/progress';
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
  /** Optional so backups made before the weight log existed still import. */
  weights?: WeightEntry[];
}

export async function exportAll(): Promise<Backup> {
  const [settings, plans, priceOverrides, weights] = await Promise.all([db.settings.get('app'), db.plans.toArray(), db.priceOverrides.toArray(), db.weights.toArray()]);
  // The API key never leaves the device in a backup file.
  const { aiKey: _key, pinHash: _h, pinSalt: _s, pinLength: _l, ...safe } = settings ?? DEFAULT_SETTINGS;
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: safe as AppSettings, plans, priceOverrides, weights };
}

/** Throws on anything that is not a MealMath backup. Replaces all local data in one transaction. */
export async function importAll(raw: unknown): Promise<void> {
  const b = raw as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.version !== 'number' || b.version > BACKUP_VERSION || !b.settings || !Array.isArray(b.plans) || !Array.isArray(b.priceOverrides)) {
    throw new Error('invalid_backup');
  }
  if (b.plans.some(p => !p?.id || !p.plan?.days) || b.priceOverrides.some(o => !o?.storeId || !o.foodId || !(o.price > 0) || !(o.packG > 0))) throw new Error('invalid_backup');
  const weights = Array.isArray(b.weights) ? b.weights.filter(x => typeof x?.date === 'string' && x.kg > 0) : [];
  await db.transaction('rw', db.settings, db.plans, db.priceOverrides, db.weights, async () => {
    const cur = await db.settings.get('app'); // backups carry no key or PIN – keep this device's
    const keep = cur?.aiKey;
    await Promise.all([db.settings.clear(), db.plans.clear(), db.priceOverrides.clear(), db.weights.clear()]);
    await db.settings.put({ ...DEFAULT_SETTINGS, ...b.settings, ...(keep ? { aiKey: keep } : {}),
      ...(cur?.pinHash ? { pinHash: cur.pinHash, pinSalt: cur.pinSalt, pinLength: cur.pinLength } : {}), key: 'app' });
    await db.plans.bulkPut(b.plans!);
    await db.priceOverrides.bulkPut(b.priceOverrides!);
    await db.weights.bulkPut(weights);
  });
}

const WEEK_MS = 7 * 86_400_000;

/**
 * Reminds about a backup when the data is at least a week old: the last backup counts,
 * otherwise the oldest plan (the user has had data that long without ever backing up).
 */
export function backupDue(now: number, o: { lastBackupAt?: string; oldestPlanAt?: string; snoozeUntil?: string }): boolean {
  if (o.snoozeUntil && Date.parse(o.snoozeUntil) > now) return false;
  const ref = o.lastBackupAt ?? o.oldestPlanAt;
  if (!ref) return false;
  return now - Date.parse(ref) >= WEEK_MS;
}

/** Shares the backup file (iOS share sheet → Files/iCloud) or downloads it. Returns false when cancelled. */
export async function saveBackupFile(): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const name = `mealmath-backup-${day}.json`;
  const file = new File([JSON.stringify(await exportAll(), null, 1)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
    else {
      const url = URL.createObjectURL(file);
      Object.assign(document.createElement('a'), { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch { return false; }
  await db.settings.update('app', { lastBackupAt: new Date().toISOString(), backupSnoozeUntil: undefined });
  return true;
}
