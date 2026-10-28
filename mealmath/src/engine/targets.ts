import { CONFIG, CM_PER_INCH, LB_PER_KG } from './config';
import type { BodyProfile, Targets } from './types';

/** One visible step of the "How we calculated it" page. */
export interface CalcStep {
  key: string;            // i18n key, e.g. 'targets.step.bmr'
  formula: string;        // human-readable formula with numbers filled in
  value: number;
  unit: 'kcal' | 'g' | 'kg' | 'lb' | 'x' | '%';
}

export interface TargetsResult extends Targets {
  steps: CalcStep[];
}

export const round = (v: number, step = 1) => Math.round(v / step) * step;
const r1 = (v: number) => Math.round(v * 10) / 10;

// ---- unit helpers ----
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * CM_PER_INCH;
export const cmToFtIn = (cm: number) => {
  const total = cm / CM_PER_INCH;
  let ft = Math.floor(total / 12);
  let inch = Math.round(total - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, inch };
};

/** Mifflin–St Jeor basal metabolic rate. */
export function bmr(p: Pick<BodyProfile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function activityFactor(workoutsPerWeek: number): number {
  const w = Math.max(0, Math.floor(workoutsPerWeek));
  return CONFIG.activity.find(a => w <= a.maxWorkouts)!.factor;
}

/** Weight (kg) a person of this height would have at the reference BMI. */
export function referenceWeightKg(heightCm: number, bmi: number = CONFIG.proteinReferenceBmi): number {
  const m = heightCm / 100;
  return bmi * m * m;
}

export function computeTargets(p: BodyProfile): TargetsResult {
  const steps: CalcStep[] = [];

  const b = bmr(p);
  const sexTerm = p.sex === 'male' ? '+ 5' : '− 161';
  steps.push({ key: 'targets.step.bmr', unit: 'kcal', value: r1(b),
    formula: `10 × ${p.weightKg} + 6.25 × ${p.heightCm} − 5 × ${p.age} ${sexTerm} = ${r1(b)}` });

  const f = activityFactor(p.workoutsPerWeek);
  const tdee = b * f;
  steps.push({ key: 'targets.step.tdee', unit: 'kcal', value: r1(tdee),
    formula: `${r1(b)} × ${f} = ${r1(tdee)}` });

  const adj = CONFIG.goalAdjust[p.goal];
  const adjusted = tdee * (1 + adj);
  steps.push({ key: `targets.step.goal.${p.goal}`, unit: 'kcal', value: r1(adjusted),
    formula: `${r1(tdee)} × (1 ${adj < 0 ? '−' : '+'} ${Math.abs(adj * 100)} %) = ${r1(adjusted)}` });

  let kcal = round(adjusted, CONFIG.kcalRounding);
  steps.push({ key: 'targets.step.round', unit: 'kcal', value: kcal,
    formula: `${r1(adjusted)} → ${kcal}` });

  const minK = CONFIG.minKcal[p.sex];
  if (kcal < minK) {
    steps.push({ key: 'targets.step.minKcal', unit: 'kcal', value: minK, formula: `${kcal} < ${minK} → ${minK}` });
    kcal = minK;
  }

  const refKg = referenceWeightKg(p.heightCm);
  const refLb = kgToLb(refKg);
  steps.push({ key: 'targets.step.refWeight', unit: 'lb', value: r1(refLb),
    formula: `${CONFIG.proteinReferenceBmi} × (${p.heightCm / 100})² = ${r1(refKg)} kg = ${r1(refLb)} lb` });

  const proteinRaw = refLb * CONFIG.proteinGramsPerLb;
  const proteinCap = (kcal * CONFIG.proteinMaxKcalShare) / 4;
  const protein = Math.round(Math.min(proteinRaw, proteinCap));
  steps.push({ key: 'targets.step.protein', unit: 'g', value: protein,
    formula: `min(${r1(proteinRaw)}, ${kcal} × ${CONFIG.proteinMaxKcalShare * 100} % / 4 = ${r1(proteinCap)}) = ${protein}` });

  return { ...bands(kcal, protein), steps };
}

/** Builds day bands for a (possibly user-overridden) target pair. */
export function bands(kcal: number, protein: number): Targets {
  return {
    kcal,
    protein,
    kcalBand: [Math.round(kcal * (1 + CONFIG.kcalBand.low)), Math.round(kcal * (1 + CONFIG.kcalBand.high))],
    proteinBand: [Math.round(protein * (1 + CONFIG.proteinBand.low)), Math.round(protein * (1 + CONFIG.proteinBand.high))],
  };
}
