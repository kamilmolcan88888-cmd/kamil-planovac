import { ArrowLeft, ArrowRight, Check, ChefHat, Wallet } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RECIPE_MAP } from '../../data/catalog';
import type { PlanResult } from '../../engine/planner';
import { LANGS } from '../../i18n';
import { db, type AppSettings } from '../../state/db';
import { localISO } from '../../state/dates';
import { planInWorker } from '../../state/planService';
import { savePlanResult, updateSettings } from '../../state/store';
import { Banner, Button, Card, ErrorState, LoadingState, PrimaryButton } from '../components/primitives';
import { StepHeader } from '../components/forms';
import { cn } from '../lib/cn';
import { useFormat } from '../lib/format';
import {
  ActivityStep, AllergyStep, BatchStep, BodyStep, BudgetStep, DietStep, EquipmentStep, FoodsStep, GoalStep, HouseholdStep, MealsStep, StoreStep, TargetsStep,
  type StepProps,
} from './steps';

function WelcomeStep(p: StepProps) { return <GoalStep {...p} welcome />; }

// Rendered as components (<Step />), so each step owns its hooks.
const STEPS: React.ComponentType<StepProps>[] = [
  WelcomeStep, BodyStep, ActivityStep, StoreStep, BudgetStep, DietStep, AllergyStep, FoodsStep, EquipmentStep, HouseholdStep, MealsStep, BatchStep, TargetsStep,
];
const TOTAL = STEPS.length + 1; // + preview week

/** 14-step onboarding. Nothing is saved until the last step. */
export function Onboarding({ initial, onDone }: { initial: AppSettings; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState<AppSettings>({ ...initial });
  const [step, setStep] = useState(0);
  const set = (patch: Partial<AppSettings>) => setDraft(d => ({ ...d, ...patch }));
  const isPreview = step === STEPS.length;
  const CurrentStep = STEPS[Math.min(step, STEPS.length - 1)]!;
  const canContinue = step !== 10 || draft.slots.some(s => s !== 'snack');

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const skip = async () => { await updateSettings({ onboardingSkipped: true }); onDone(); };

  return (
    <div className="min-h-full bg-bg">
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="mx-auto max-w-lg px-[var(--gutter)] pt-3 pb-2">
          <div className="flex items-center justify-between gap-3">
            <p className="num text-caption font-semibold text-text-2">{t('onboarding.step', { n: step + 1, total: TOTAL })}</p>
            {step === 0 && (
              <div className="flex gap-1" role="radiogroup" aria-label={t('settings.language')}>
                {LANGS.map(l => (
                  <button key={l.id} type="button" role="radio" aria-checked={draft.lang === l.id} aria-label={l.label}
                    onClick={() => { set({ lang: l.id }); void i18n.changeLanguage(l.id); }}
                    className={cn('pressable h-9 min-w-11 rounded-full px-2 text-caption font-bold uppercase', draft.lang === l.id ? 'bg-primary text-on-primary' : 'bg-surface text-text-2 shadow-card')}>
                    {l.id}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-ring-track" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step + 1}>
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${((step + 1) / TOTAL) * 100}%` }} transition={{ duration: reduce ? 0 : 0.25 }} />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-lg px-[var(--gutter)] pt-4" style={{ paddingBottom: 'calc(120px + var(--safe-bottom))' }}>
        <motion.div key={step} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
          {isPreview ? <PreviewStep draft={draft} onDone={onDone} onBack={() => setStep(s => s - 1)} /> : <CurrentStep draft={draft} set={set} />}
          {step === 0 && <button type="button" onClick={() => void skip()} className="pressable mt-6 min-h-11 w-full text-center text-support font-semibold text-text-2 underline underline-offset-2">{t('onboarding.skip')}</button>}
        </motion.div>
      </main>

      {!isPreview && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
          <div className="mx-auto grid max-w-lg grid-cols-[auto_1fr] gap-3 px-[var(--gutter)] pt-3">
            <Button variant="secondary" className="w-[54px] px-0" aria-label={t('onboarding.back')} disabled={step === 0} onClick={() => setStep(s => s - 1)}>
              <ArrowLeft aria-hidden className="size-5" />
            </Button>
            <PrimaryButton disabled={!canContinue} onClick={() => setStep(s => s + 1)}>{t('onboarding.continue')}<ArrowRight aria-hidden className="size-5" /></PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewStep({ draft, onDone, onBack }: { draft: AppSettings; onDone: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [res, setRes] = useState<PlanResult>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const start = localISO();

  useEffect(() => {
    let alive = true;
    (async () => {
      const overrides = await db.priceOverrides.where('storeId').equals(draft.storeId).toArray();
      const r = await planInWorker({ settings: draft, overrides, startDate: start, seed: 1 });
      if (alive) setRes(r);
    })().catch(e => alive && setError(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [draft, start]);

  const finish = async () => {
    if (!res) return;
    setSaving(true);
    const finalSettings: AppSettings = { ...draft, profileIsDemo: false, onboardingSkipped: false };
    await db.settings.put(finalSettings);
    await savePlanResult(res, finalSettings, start, 1);
    onDone();
  };

  if (error) return <ErrorState title={t('plan.error')} detail={error} />;
  if (!res) return <LoadingState title={t('plan.generating')} text={t('plan.generatingHint')} />;

  const ok = res.report.days.filter(d => d.status === 'verified').length;
  const missed = res.warnings.find(w => w.code === 'days_missed');
  return (
    <>
      <StepHeader title={t('onboarding.previewTitle')} hint={t('onboarding.previewHint')} />
      <div className="grid grid-cols-3 gap-2.5">
        <Card className="p-3 text-center"><Check aria-hidden className="mx-auto size-5 text-primary" /><p className="num mt-1 text-caption font-semibold">{t('onboarding.previewDays', { ok, total: res.report.days.length })}</p></Card>
        <Card className="p-3 text-center"><Wallet aria-hidden className="mx-auto size-5 text-primary" /><p className="num mt-1 text-caption font-semibold">{t('onboarding.previewCost', { amount: f.eur(res.foodCost) })}</p></Card>
        <Card className="p-3 text-center"><ChefHat aria-hidden className="mx-auto size-5 text-primary" /><p className="num mt-1 text-caption font-semibold">{t('onboarding.previewCook', { count: res.sessions.length })}</p></Card>
      </div>
      {missed && missed.code === 'days_missed' && <div className="mt-3"><Banner tone="warning">{t('plan.daysMissed', { count: missed.days, protein: missed.maxProteinShortfall })}</Banner></div>}
      <ol className="mt-5 flex flex-col gap-3">
        {res.plan.days.slice(0, 3).map(d => {
          const r = res.report.days.find(x => x.date === d.date)!;
          return (
            <li key={d.date}>
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-support font-semibold">{f.longDate(d.date)}</span>
                  <span className="num text-caption text-text-2">{f.int(r.totals.kcal)} {t('unit.kcal')} · {f.int(r.totals.protein)} {t('unit.g')}</span>
                </div>
                <ul className="flex flex-col gap-1 text-support">
                  {d.meals.map(m => (
                    <li key={m.slot} className="flex gap-2"><span className="w-20 shrink-0 text-caption font-semibold uppercase text-text-2">{t(`slot.${m.slot}`)}</span>
                      <span className="min-w-0 truncate">{m.eatOut ? t(m.eatOut.note === 'external' ? 'home.external' : 'changes.eatOutLabel') : f.name(RECIPE_MAP.get(m.recipeId)!.name)}</span></li>
                  ))}
                </ul>
              </Card>
            </li>
          );
        })}
      </ol>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
        <div className="mx-auto grid max-w-lg grid-cols-[auto_1fr] gap-3 px-[var(--gutter)] pt-3">
          <Button variant="secondary" className="w-[54px] px-0" aria-label={t('onboarding.back')} onClick={onBack}><ArrowLeft aria-hidden className="size-5" /></Button>
          <PrimaryButton disabled={saving} onClick={() => void finish()}>{t('onboarding.finish')}</PrimaryButton>
        </div>
      </div>
    </>
  );
}
