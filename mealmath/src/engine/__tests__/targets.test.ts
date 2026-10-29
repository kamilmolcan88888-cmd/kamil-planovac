import { activityFactor, bands, bmr, cmToFtIn, computeTargets, ftInToCm, kgToLb, lbToKg, referenceWeightKg } from '../targets';

describe('Mifflin–St Jeor', () => {
  it('male', () => expect(bmr({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 })).toBe(1780));
  it('female', () => expect(bmr({ sex: 'female', age: 25, heightCm: 165, weightKg: 60 })).toBeCloseTo(1345.25));
});

describe('activity factor', () => {
  it.each([[0, 1.2], [1, 1.375], [2, 1.375], [3, 1.55], [4, 1.55], [5, 1.725], [6, 1.725], [7, 1.9], [14, 1.9]])(
    '%i workouts → %f', (w, f) => expect(activityFactor(w)).toBe(f));
});

describe('computeTargets', () => {
  it('male, 3 workouts, lose', () => {
    // BMR 1780 × 1.55 = 2759 × 0.8 = 2207.2 → 2200 kcal
    // ref weight 25 × 1.8² = 81 kg = 178.6 lb; cap 2200 × 0.35 / 4 = 192.5 → protein 179
    const t = computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, workoutsPerWeek: 3, goal: 'lose' });
    expect(t.kcal).toBe(2200);
    expect(t.protein).toBe(179);
    expect(t.kcalBand).toEqual([2090, 2200]);
    expect(t.proteinBand).toEqual([179, 192]);
    expect(t.steps.map(s => s.key)).toEqual([
      'targets.step.bmr', 'targets.step.tdee', 'targets.step.goal.lose', 'targets.step.round',
      'targets.step.refWeight', 'targets.step.protein',
    ]);
  });

  it('protein is capped at 35 % of calories', () => {
    // BMR 1345.25 × 1.2 = 1614.3 → 1600 kcal; 150 lb > cap 1600 × 0.35 / 4 = 140
    const t = computeTargets({ sex: 'female', age: 25, heightCm: 165, weightKg: 60, workoutsPerWeek: 0, goal: 'maintain' });
    expect(t.kcal).toBe(1600);
    expect(t.protein).toBe(140);
  });

  it('gain adds a positive adjustment', () => {
    const t = computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, workoutsPerWeek: 3, goal: 'gain' });
    expect(t.kcal).toBe(3050); // 2759 × 1.1 = 3034.9 → 3050
  });

  it('applies the minimum calorie floor', () => {
    const t = computeTargets({ sex: 'female', age: 60, heightCm: 160, weightKg: 50, workoutsPerWeek: 0, goal: 'lose' });
    expect(t.kcal).toBe(1200);
    expect(t.steps.some(s => s.key === 'targets.step.minKcal')).toBe(true);
  });

  it('kcal is always a multiple of 50', () => {
    for (let w = 50; w <= 140; w += 7) {
      const t = computeTargets({ sex: 'male', age: 40, heightCm: 175, weightKg: w, workoutsPerWeek: 2, goal: 'maintain' });
      expect(t.kcal % 50).toBe(0);
    }
  });
});

describe('bands for manual overrides', () => {
  it('kcal −5 %…0 %, protein floor…+7 %', () => expect(bands(2000, 150)).toEqual({
    kcal: 2000, protein: 150, kcalBand: [1900, 2000], proteinBand: [150, 161],
  }));
});

describe('units', () => {
  it('kg ↔ lb', () => { expect(kgToLb(100)).toBeCloseTo(220.46, 2); expect(lbToKg(220.46)).toBeCloseTo(100, 2); });
  it('ft/in ↔ cm', () => { expect(ftInToCm(6, 0)).toBeCloseTo(182.88); expect(cmToFtIn(182.88)).toEqual({ ft: 6, inch: 0 }); });
  it('reference weight', () => expect(referenceWeightKg(180)).toBeCloseTo(81));
});
