// Onboarding / settings steps. Each step edits a draft of AppSettings and is reused by Settings.
import { Activity, Armchair, Bike, Blend, CookingPot, Dumbbell, Flame, Microwave, Minus, Scale, Sparkles, Store, TrendingDown, TrendingUp, UtensilsCrossed, Wind, Zap, CookingPot as Pot, Sandwich } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOODS } from '../../data/catalog';
import { PRICE_TABLES, STORES } from '../../data/stores';
import { activityFactor, cmToFtIn, computeTargets, ftInToCm, kgToLb, lbToKg, bands } from '../../engine/targets';
import { ALLERGENS, type Allergen, type Diet, type Equipment, type MealSlot } from '../../engine/types';
import type { RepetitionLevel } from '../../engine/planner/types';
import type { AppSettings } from '../../state/db';
import { SegmentedControl, Switch } from '../components/controls';
import { ChipToggle, NumberField, OptionCard, SearchPicker, Stepper, StepHeader } from '../components/forms';
import { Banner, Card } from '../components/primitives';
import { useFormat } from '../lib/format';
import { TargetsBreakdown } from '../screens/TargetsScreen';

export interface StepProps { draft: AppSettings; set: (patch: Partial<AppSettings>) => void }

export function GoalStep({ draft, set, welcome }: StepProps & { welcome?: boolean }) {
  const { t } = useTranslation();
  const opts = [
    { v: 'lose' as const, icon: TrendingDown }, { v: 'maintain' as const, icon: Scale }, { v: 'gain' as const, icon: TrendingUp },
  ];
  return (
    <>
      {welcome && (
        <div className="mb-6">
          <div className="mb-4 flex size-14 items-center justify-center rounded-3xl bg-accent text-on-accent"><Sparkles aria-hidden className="size-7" /></div>
          <h1 className="text-title font-bold tracking-tight">{t('onboarding.welcomeTitle')}</h1>
          <p className="mt-2 text-body text-text-2">{t('onboarding.welcomeText')}</p>
        </div>
      )}
      <h2 className="mb-3 text-section font-[650]">{t('onboarding.goalTitle')}</h2>
      <div role="radiogroup" aria-label={t('onboarding.goalTitle')} className="flex flex-col gap-2.5">
        {opts.map(o => (
          <OptionCard key={o.v} icon={o.icon} selected={draft.profile.goal === o.v} onClick={() => set({ profile: { ...draft.profile, goal: o.v } })}
            title={t(`onboarding.goal.${o.v}`)} hint={t(`onboarding.goalHint.${o.v}`)} />
        ))}
      </div>
    </>
  );
}

export function BodyStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const p = draft.profile;
  const up = (patch: Partial<AppSettings['profile']>) => set({ profile: { ...p, ...patch } });
  const { ft, inch } = cmToFtIn(p.heightCm);
  return (
    <>
      <StepHeader title={t('onboarding.bodyTitle')} hint={t('onboarding.bodyHint')} />
      <div className="flex flex-col gap-4">
        <SegmentedControl label={t('onboarding.sex')} value={p.sex} onChange={v => up({ sex: v })}
          options={[{ value: 'male', label: t('onboarding.male') }, { value: 'female', label: t('onboarding.female') }]} />
        <Stepper label={t('onboarding.age')} value={p.age} onChange={v => up({ age: v })} min={16} max={90} unit={t('onboarding.years')} />
        <SegmentedControl label={t('onboarding.units')} value={units} onChange={setUnits}
          options={[{ value: 'metric', label: t('onboarding.metric') }, { value: 'imperial', label: t('onboarding.imperial') }]} />
        {units === 'metric' ? (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t('onboarding.height')} unit={t('onboarding.cm')} value={p.heightCm} min={120} max={230} onChange={v => v && up({ heightCm: Math.round(v) })} />
            <NumberField label={t('onboarding.weight')} unit={t('onboarding.kg')} value={p.weightKg} min={35} max={250} onChange={v => v && up({ weightKg: Math.round(v * 10) / 10 })} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <NumberField label={t('onboarding.height')} unit={t('onboarding.ft')} value={ft} min={4} max={7} onChange={v => v && up({ heightCm: Math.round(ftInToCm(v, inch)) })} />
            <NumberField label={"\u00a0"} unit={t('onboarding.in')} value={inch} min={0} max={11} onChange={v => v !== undefined && up({ heightCm: Math.round(ftInToCm(ft, v)) })} />
            <NumberField label={t('onboarding.weight')} unit={t('onboarding.lb')} value={Math.round(kgToLb(p.weightKg))} min={80} max={550} onChange={v => v && up({ weightKg: Math.round(lbToKg(v) * 10) / 10 })} />
          </div>
        )}
      </div>
    </>
  );
}

export function ActivityStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const opts: { w: number; key: string; icon: typeof Armchair }[] = [
    { w: 0, key: '0', icon: Armchair }, { w: 2, key: '2', icon: Bike }, { w: 4, key: '4', icon: Activity }, { w: 6, key: '6', icon: Dumbbell }, { w: 7, key: '7', icon: Zap },
  ];
  const cur = draft.profile.workoutsPerWeek;
  const pick = (w: number) => (w === 0 ? cur === 0 : w === 2 ? cur >= 1 && cur <= 2 : w === 4 ? cur >= 3 && cur <= 4 : w === 6 ? cur >= 5 && cur <= 6 : cur >= 7);
  return (
    <>
      <StepHeader title={t('onboarding.activityTitle')} hint={t('onboarding.activityHint')} />
      <div role="radiogroup" aria-label={t('onboarding.activityTitle')} className="flex flex-col gap-2.5">
        {opts.map(o => (
          <OptionCard key={o.key} icon={o.icon} selected={pick(o.w)} onClick={() => set({ profile: { ...draft.profile, workoutsPerWeek: o.w } })}
            title={t(`onboarding.workouts.${o.key}`)} hint={t('onboarding.factor', { f: new Intl.NumberFormat(f.locale, { minimumFractionDigits: 1, maximumFractionDigits: 3 }).format(activityFactor(o.w)) })} />
        ))}
      </div>
    </>
  );
}

export function StoreStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  return (
    <>
      <StepHeader title={t('onboarding.storeTitle')} hint={t('onboarding.storeHint')} />
      <div role="radiogroup" aria-label={t('onboarding.storeTitle')} className="flex flex-col gap-2.5">
        {STORES.map(s => {
          const tbl = PRICE_TABLES.get(s.id)!;
          const n = FOODS.filter(x => { const it = tbl.items[x.id]; return it && !('unavailable' in it); }).length;
          return (
            <OptionCard key={s.id} icon={Store} selected={draft.storeId === s.id} onClick={() => set({ storeId: s.id })}
              title={s.name} hint={t('store.items', { available: n, total: FOODS.length })} />
          );
        })}
      </div>
      <div className="mt-4"><Banner tone="info">{t('store.pricesAre')} <strong>{t('store.estimate')}</strong></Banner></div>
    </>
  );
}

export function BudgetStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const on = draft.budget !== undefined;
  const suggested = Math.round((40 + 30 * Math.max(0, draft.household.adults - 1) + 18 * draft.household.kids) / 5) * 5;
  return (
    <>
      <StepHeader title={t('onboarding.budgetTitle')} hint={t('onboarding.budgetHint')} />
      <div className="flex flex-col gap-4">
        <Card className="py-2"><Switch checked={!on} onChange={v => set({ budget: v ? undefined : suggested })} label={t('onboarding.noBudget')} /></Card>
        {on && (
          <>
            <Stepper label={t('onboarding.perWeek')} value={draft.budget!} onChange={v => set({ budget: v })} min={15} max={500} step={5} format={v => f.eur(v)} />
            <p className="num text-center text-support text-text-2">{t('onboarding.budgetPerDay', { amount: f.eur(draft.budget! / 7) })}</p>
          </>
        )}
      </div>
    </>
  );
}

const DIETS: Diet[] = ['vegetarian', 'vegan', 'pescatarian', 'no_pork', 'no_red_meat', 'low_carb'];

export function DietStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  return (
    <>
      <StepHeader title={t('onboarding.dietTitle')} hint={t('onboarding.dietHint')} />
      <div className="flex flex-col gap-2.5">
        <OptionCard multi selected={draft.diets.length === 0} onClick={() => set({ diets: [] })} title={t('onboarding.dietNone')} icon={UtensilsCrossed} />
        {DIETS.map(d => (
          <OptionCard key={d} multi selected={draft.diets.includes(d)} title={d === 'low_carb' ? t('onboarding.lowCarb') : t(`recipe.diet.${d}`)}
            onClick={() => set({ diets: draft.diets.includes(d) ? draft.diets.filter(x => x !== d) : [...draft.diets, d] })} />
        ))}
      </div>
    </>
  );
}

export function AllergyStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  return (
    <>
      <StepHeader title={t('onboarding.allergyTitle')} hint={t('onboarding.allergyHint')} />
      <ChipToggle<Allergen> label={t('onboarding.allergyTitle')} value={draft.allergens} onChange={v => set({ allergens: v })}
        options={ALLERGENS.map(a => ({ value: a, label: t(`allergen.${a}`) }))} />
      {draft.allergens.length === 0 && <p className="mt-4 text-support text-text-2">{t('onboarding.allergyNone')}</p>}
    </>
  );
}

export function FoodsStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const [tab, setTab] = useState<'fav' | 'ex'>('fav');
  const items = useMemo(() => FOODS.filter(x => x.aisle !== 'spices').map(x => ({ id: x.id, label: f.name(x.name) })).sort((a, b) => a.label.localeCompare(b.label, f.locale)), [f]);
  return (
    <>
      <StepHeader title={t('onboarding.foodsTitle')} hint={t('onboarding.foodsHint')} />
      <div className="mb-4">
        <SegmentedControl label={t('onboarding.foodsTitle')} value={tab} onChange={setTab}
          options={[{ value: 'fav', label: `${t('onboarding.favorites')} (${draft.favoriteFoods.length})` }, { value: 'ex', label: `${t('onboarding.excluded')} (${draft.excludedFoods.length})` }]} />
      </div>
      {tab === 'fav'
        ? <SearchPicker label={t('onboarding.favorites')} items={items} value={draft.favoriteFoods} onChange={v => set({ favoriteFoods: v })} placeholder={t('onboarding.foodSearch')} disabledIds={new Set(draft.excludedFoods)} />
        : <SearchPicker label={t('onboarding.excluded')} items={items} value={draft.excludedFoods} onChange={v => set({ excludedFoods: v })} placeholder={t('onboarding.foodSearch')} disabledIds={new Set(draft.favoriteFoods)} />}
    </>
  );
}

const EQUIPMENT: { id: Equipment; icon: typeof Flame }[] = [
  { id: 'stove', icon: Flame }, { id: 'oven', icon: CookingPot }, { id: 'microwave', icon: Microwave }, { id: 'blender', icon: Blend }, { id: 'airfryer', icon: Wind }, { id: 'toaster', icon: Sandwich },
];

export function EquipmentStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  return (
    <>
      <StepHeader title={t('onboarding.equipmentTitle')} hint={t('onboarding.equipmentHint')} />
      <div className="grid grid-cols-2 gap-2.5">
        {EQUIPMENT.map(e => {
          const on = draft.equipment.includes(e.id);
          return (
            <OptionCard key={e.id} multi icon={e.icon} selected={on} title={t(`equipment.${e.id}`)}
              onClick={() => set({ equipment: on ? draft.equipment.filter(x => x !== e.id) : [...draft.equipment, e.id] })} />
          );
        })}
      </div>
    </>
  );
}

export function HouseholdStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  const h = draft.household;
  const others = h.adults > 1 || h.kids > 0;
  return (
    <>
      <StepHeader title={t('onboarding.householdTitle')} />
      <div className="flex flex-col gap-3">
        <Stepper label={t('onboarding.adults')} value={h.adults} min={1} max={8} onChange={v => set({ household: { ...h, adults: v } })} />
        <Stepper label={t('onboarding.kids')} value={h.kids} min={0} max={8} onChange={v => set({ household: { ...h, kids: v } })} />
      </div>
      {others && (
        <div className="mt-6">
          <h2 className="mb-1 text-card font-semibold">{t('onboarding.sharedTitle')}</h2>
          <p className="mb-3 text-caption text-text-2">{t('onboarding.sharedHint')}</p>
          <ChipToggle<MealSlot> label={t('onboarding.sharedTitle')} value={h.sharedSlots} onChange={v => set({ household: { ...h, sharedSlots: v } })}
            options={(['breakfast', 'lunch', 'dinner'] as const).map(s => ({ value: s, label: t(`slot.${s}`) }))} />
        </div>
      )}
    </>
  );
}

export function MealsStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  const ext = draft.externalMeals ?? {};
  const toggle = (slot: MealSlot, cook: boolean) => {
    const slots = cook ? [...new Set([...draft.slots, slot])] : draft.slots.filter(s => s !== slot);
    const externalMeals = { ...ext };
    if (cook) delete externalMeals[slot]; else externalMeals[slot] = ext[slot] ?? { kcal: slot === 'breakfast' ? 450 : 700, protein: slot === 'breakfast' ? 20 : 35 };
    set({ slots: order(slots), externalMeals });
  };
  return (
    <>
      <StepHeader title={t('onboarding.mealsTitle')} hint={t('onboarding.mealsHint')} />
      <div className="flex flex-col gap-3">
        {(['breakfast', 'lunch', 'dinner'] as const).map(slot => {
          const cook = draft.slots.includes(slot);
          const e = ext[slot];
          return (
            <Card key={slot} className="flex flex-col gap-3">
              <span className="flex items-center gap-2 text-body font-semibold"><Pot aria-hidden className="size-5 text-primary" />{t(`slot.${slot}`)}</span>
              <SegmentedControl label={t(`slot.${slot}`)} value={cook ? 'y' : 'n'} onChange={v => toggle(slot, v === 'y')}
                options={[{ value: 'y', label: t('onboarding.cook') }, { value: 'n', label: t('onboarding.notCook') }]} />
              {!cook && e && (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label={t('onboarding.estimateKcal')} value={e.kcal} min={50} max={2500} onChange={v => v && set({ externalMeals: { ...ext, [slot]: { ...e, kcal: Math.round(v) } } })} />
                  <NumberField label={t('onboarding.estimateProtein')} value={e.protein} min={0} max={200} onChange={v => v !== undefined && set({ externalMeals: { ...ext, [slot]: { ...e, protein: Math.round(v) } } })} />
                </div>
              )}
            </Card>
          );
        })}
        <Card className="py-2"><Switch checked={draft.slots.includes('snack')} label={t('onboarding.snack')}
          onChange={v => set({ slots: order(v ? [...draft.slots, 'snack'] : draft.slots.filter(s => s !== 'snack')) })} /></Card>
      </div>
    </>
  );
}
const order = (s: MealSlot[]) => (['breakfast', 'lunch', 'dinner', 'snack'] as const).filter(x => s.includes(x));

export function BatchStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  return (
    <>
      <StepHeader title={t('onboarding.batchTitle')} />
      <div role="radiogroup" aria-label={t('onboarding.batchTitle')} className="flex flex-col gap-2.5">
        {([0, 1, 2, 3] as RepetitionLevel[]).map(l => (
          <OptionCard key={l} selected={draft.repetition === l} onClick={() => set({ repetition: l })} icon={l === 0 ? Sparkles : l === 3 ? CookingPot : Minus}
            title={t(`onboarding.batch.${l}`)} hint={t(`onboarding.batchHint.${l}`)} />
        ))}
      </div>
    </>
  );
}

export function TargetsStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  const calc = computeTargets(draft.profile);
  const manual = !!draft.targetsOverride;
  const cur = draft.targetsOverride ?? { kcal: calc.kcal, protein: calc.protein };
  const b = bands(cur.kcal, cur.protein);
  return (
    <>
      <StepHeader title={t('onboarding.targetsTitle')} hint={t('onboarding.targetsHint')} />
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center"><p className="text-caption text-text-2">{t('home.calories')}</p><p className="num mt-1 text-hero font-bold text-kcal">{cur.kcal}</p><p className="text-caption text-text-2">{t('unit.kcal')}</p></Card>
        <Card className="text-center"><p className="text-caption text-text-2">{t('home.protein')}</p><p className="num mt-1 text-hero font-bold text-protein">{cur.protein}</p><p className="text-caption text-text-2">{t('unit.g')}</p></Card>
      </div>
      <p className="num mt-3 text-center text-caption text-text-2">{t('onboarding.bandKcal', { lo: b.kcalBand[0], hi: b.kcalBand[1] })} · {t('onboarding.bandProtein', { lo: b.proteinBand[0], hi: b.proteinBand[1] })}</p>
      <Card className="mt-4 py-2"><Switch checked={manual} label={t('onboarding.override')}
        onChange={v => set({ targetsOverride: v ? { kcal: calc.kcal, protein: calc.protein } : undefined })} /></Card>
      {manual && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label={t('onboarding.kcalTarget')} value={cur.kcal} min={1000} max={6000} onChange={v => v && set({ targetsOverride: { ...cur, kcal: Math.round(v) } })} />
          <NumberField label={t('onboarding.proteinTarget')} value={cur.protein} min={30} max={400} onChange={v => v && set({ targetsOverride: { ...cur, protein: Math.round(v) } })} />
        </div>
      )}
      <div className="mt-6"><TargetsBreakdown settings={draft} /></div>
    </>
  );
}
