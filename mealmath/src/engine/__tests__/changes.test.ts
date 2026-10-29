// Week changes on real data: every change is a preview first and the validator judges the result.
import { FOOD_MAP, RECIPES } from '../../data/catalog';
import { PRICE_TABLES } from '../../data/stores';
import { eatOut, excludeFood, fixStoreConflicts, replanRest, sessionsFromPlan, swapMeal, swapOptions } from '../changes';
import { generatePlan, type PlanRequest } from '../planner';
import { PriceBook } from '../pricing';
import { storeConflicts } from '../shopping';
import { computeTargets } from '../targets';
import type { Plan } from '../types';

const req = (store = 'lidl-sk'): PlanRequest => ({
  foods: FOOD_MAP, recipes: RECIPES, startDate: '2026-11-02',
  targets: computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, workoutsPerWeek: 3, goal: 'lose' }),
  book: new PriceBook(PRICE_TABLES.get(store)!), slots: ['breakfast', 'lunch', 'dinner'], allergens: [], diets: [], excludedFoods: [],
  favoriteFoods: [], equipment: ['stove', 'oven', 'blender', 'microwave', 'toaster'], household: { adults: 1, kids: 0, sharedSlots: [] }, repetition: 2,
});
const base = generatePlan(req());
const plan = base.plan;
const frozen = JSON.stringify(plan);
const meal = (p: Plan, date: string, slot: string) => p.days.find(d => d.date === date)!.meals.find(m => m.slot === slot)!;
afterEach(() => expect(JSON.stringify(plan)).toBe(frozen)); // previews never mutate the stored plan

describe('sessionsFromPlan', () => {
  it('rebuilds the cooking sessions from batch ids', () => {
    const s = sessionsFromPlan(plan);
    expect(s.reduce((n, x) => n + x.portions.length, 0)).toBe(21);
    expect(s.filter(x => x.portions.length > 1).length).toBe(base.sessions.filter(x => x.portions.length > 1).length);
  });
});

describe('swap one meal', () => {
  const day = '2026-11-04';
  it('offers alternatives, each with a validated preview', () => {
    const opts = swapOptions(req(), plan, day, 'lunch');
    expect(opts.length).toBeGreaterThan(2);
    expect(opts.filter(o => o.preview.ok).length).toBeGreaterThan(0);
    for (const o of opts) expect(meal(o.preview.plan, day, 'lunch').recipeId).toBe(o.recipeId);
  });

  it('changes only that day and keeps it in band; other meals keep their recipes', () => {
    const target = swapOptions(req(), plan, day, 'lunch').find(o => o.preview.ok)!;
    const p = target.preview;
    expect(p.days.map(d => d.date)).toEqual([day]);
    expect(p.days[0]!.after.verified).toBe(true);
    for (const slot of ['breakfast', 'dinner']) expect(meal(p.plan, day, slot).recipeId).toBe(meal(plan, day, slot).recipeId);
    for (const d of plan.days.filter(x => x.date !== day)) expect(p.plan.days.find(x => x.date === d.date)).toEqual(d);
    expect(p.meals).toEqual([expect.objectContaining({ date: day, slot: 'lunch' })]);
  });

  it('a swapped pot portion leaves the pot; the pot keeps feeding its other meals', () => {
    const pot = sessionsFromPlan(plan).find(s => s.portions.length >= 2)!;
    const pt = pot.portions[pot.portions.length - 1]!;
    const other = RECIPES.find(r => r.meals.includes(pt.slot) && r.id !== pot.recipeId && !plan.days.find(d => d.date === pt.date)!.meals.some(m => m.recipeId === r.id))!;
    const p = swapMeal(req(), plan, pt.date, pt.slot, other.id).plan;
    expect(meal(p, pt.date, pt.slot).batchId).toBeUndefined();
    const rest = pot.portions.slice(0, -1).map(x => meal(p, x.date, x.slot));
    for (const m of rest) {
      expect(m.recipeId).toBe(pot.recipeId);
      expect(m.batchId).toBe(rest.length > 1 ? pot.id : undefined); // a pot of one is no pot
    }
  });
});

describe('eat out', () => {
  it('keeps the estimate and re-scales the rest of the day to still land', () => {
    const day = '2026-11-05';
    const p = eatOut(req(), plan, day, 'dinner', { kcal: 900, protein: 50 });
    expect(meal(p.plan, day, 'dinner').eatOut).toEqual({ kcal: 900, protein: 50 });
    expect(p.days.map(d => d.date)).toContain(day);
    expect(p.ok).toBe(true);
    expect(meal(p.plan, day, 'lunch').recipeId).toBe(meal(plan, day, 'lunch').recipeId);
    expect(p.report.days.find(d => d.date === day)!.includesUserEstimate).toBe(true);
  });
});

describe('re-plan the rest of the week', () => {
  const today = '2026-11-05';
  it('keeps past days and ticked meals', () => {
    const ticked: Plan = { ...plan, days: plan.days.map(d => d.date === today ? { ...d, meals: d.meals.map(m => m.slot === 'breakfast' ? { ...m, done: true } : m) } : d) };
    const p = replanRest(req(), ticked, today, undefined, 2);
    for (const d of plan.days.filter(x => x.date < today)) expect(p.plan.days.find(x => x.date === d.date)).toEqual(d);
    expect(meal(p.plan, today, 'breakfast')).toEqual(meal(ticked, today, 'breakfast'));
    expect(p.ok).toBe(true);
  });

  it('excluding a food removes it from the rest of the week only', () => {
    const food = 'chicken_breast';
    const p = excludeFood(req(), plan, today, food);
    for (const d of p.plan.days.filter(x => x.date >= today)) for (const m of d.meals) expect(Object.keys(m.myGrams)).not.toContain(food);
    for (const d of plan.days.filter(x => x.date < today)) expect(p.plan.days.find(x => x.date === d.date)).toEqual(d);
    expect(p.report.days.filter(d => d.date >= today).every(d => d.status === 'verified')).toBe(true);
  });

  it('switching store: only meals the new store cannot supply are replaced', () => {
    const de = generatePlan({ ...req('lidl-de'), excludedFoods: [] });
    const r = req('lidl-sk');
    const conflicts = storeConflicts(de.plan, r.book);
    if (!conflicts.length) return; // nothing to fix for this seed
    const p = fixStoreConflicts(r, de.plan, '2026-11-02');
    expect(storeConflicts(p.plan, r.book)).toEqual([]);
    const bad = new Set(conflicts.map(c => `${c.date}|${c.slot}`));
    for (const d of de.plan.days) for (const m of d.meals) if (!bad.has(`${d.date}|${m.slot}`)) expect(meal(p.plan, d.date, m.slot)).toEqual(m);
  });
});
