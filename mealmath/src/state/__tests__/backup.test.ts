import 'fake-indexeddb/auto';
import { exportAll, importAll } from '../backup';
import { db, DEFAULT_SETTINGS } from '../db';

describe('backup', () => {
  beforeEach(async () => { await Promise.all([db.settings.clear(), db.plans.clear(), db.priceOverrides.clear(), db.weights.clear()]); });

  it('round-trips weights and never exports the API key', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, aiKey: 'sk-ant-secret' });
    await db.weights.bulkPut([{ date: '2026-01-01', kg: 80 }, { date: '2026-01-08', kg: 79.4 }]);
    const b = await exportAll();
    expect(JSON.stringify(b)).not.toContain('sk-ant-secret');
    expect(b.weights).toHaveLength(2);

    await db.weights.clear();
    await importAll(b);
    expect((await db.weights.toArray()).map(w => w.kg)).toEqual([80, 79.4]);
    expect((await db.settings.get('app'))?.aiKey).toBe('sk-ant-secret'); // this device keeps its own key
  });

  it('keeps this device\'s API key on import and accepts old backups without weights', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, aiKey: 'mine' });
    const old = { format: 'mealmath-backup', version: 1, exportedAt: '', settings: DEFAULT_SETTINGS, plans: [], priceOverrides: [] };
    await importAll(old);
    expect((await db.settings.get('app'))?.aiKey).toBe('mine');
    expect(await db.weights.count()).toBe(0);
  });

  it('rejects files that are not backups', async () => {
    await expect(importAll({ nope: true })).rejects.toThrow('invalid_backup');
  });
});

import { backupDue } from '../backup';

describe('backupDue', () => {
  const now = Date.parse('2026-03-20T12:00:00Z');
  const days = (n: number) => new Date(now - n * 86_400_000).toISOString();
  it('is quiet without any data', () => expect(backupDue(now, {})).toBe(false));
  it('waits a week after the last backup', () => {
    expect(backupDue(now, { lastBackupAt: days(6) })).toBe(false);
    expect(backupDue(now, { lastBackupAt: days(8) })).toBe(true);
  });
  it('counts from the oldest plan when never backed up', () => {
    expect(backupDue(now, { oldestPlanAt: days(3) })).toBe(false);
    expect(backupDue(now, { oldestPlanAt: days(10) })).toBe(true);
  });
  it('stays hidden while snoozed', () => {
    expect(backupDue(now, { lastBackupAt: days(30), snoozeUntil: new Date(now + 1000).toISOString() })).toBe(false);
    expect(backupDue(now, { lastBackupAt: days(30), snoozeUntil: new Date(now - 1000).toISOString() })).toBe(true);
  });
});
