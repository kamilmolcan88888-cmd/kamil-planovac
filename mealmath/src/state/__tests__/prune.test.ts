import 'fake-indexeddb/auto';
import { db, type StoredPlan } from '../db';
import { prunePlans } from '../store';

const plan = (id: string, createdAt: string) => ({ id, createdAt, startDate: '2026-01-01', seed: 1, storeId: 'lidl-sk', plan: {} as StoredPlan['plan'], sessions: [], warnings: [], foodCost: 0 }) as StoredPlan;

describe('prunePlans', () => {
  beforeEach(async () => { await db.plans.clear(); });

  it('keeps the current plan and the newest others', async () => {
    await db.plans.bulkPut([1, 2, 3, 4, 5, 6, 7].map(i => plan(`p${i}`, `2026-01-0${i}T00:00:00Z`)));
    const deleted = await prunePlans('p1', 3);
    expect(deleted).toBe(3);
    expect((await db.plans.toCollection().primaryKeys()).sort()).toEqual(['p1', 'p5', 'p6', 'p7']);
  });

  it('does nothing when there are few plans', async () => {
    await db.plans.bulkPut([plan('a', '2026-01-01'), plan('b', '2026-01-02')]);
    expect(await prunePlans('a')).toBe(0);
    expect(await db.plans.count()).toBe(2);
  });
});
