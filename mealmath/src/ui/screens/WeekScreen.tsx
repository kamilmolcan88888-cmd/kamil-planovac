import { CalendarPlus, Check, ChefHat, Layers, Minus, Repeat, Repeat2, SlidersHorizontal, TriangleAlert, Wallet, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOOD_MAP, RECIPE_MAP } from '../../data/catalog';
import { validatePlan } from '../../engine/validator';
import type { AppSettings, StoredPlan } from '../../state/db';
import { localISO } from '../../state/dates';
import { usePriceOverrides } from '../../state/store';
import { bookFor } from '../../workers/requestBase';
import { AppHeader } from '../components/AppShell';
import { bandState, MacroProgress, SegmentedControl } from '../components/controls';
import { Banner, Card, Chip, EmptyState, IconButton, LoadingState, SecondaryButton } from '../components/primitives';
import { RecipeVisual } from '../components/RecipeVisual';
import { cn } from '../lib/cn';
import { MealActionsSheet, WeekChangesSheet } from '../components/changes';
import { storeConflicts } from '../../engine/shopping';
import type { MealSlot } from '../../engine/types';
import { useFormat } from '../lib/format';
import type { DayStatus } from '../viewmodel/home';
import { weekView, type WeekDayView } from '../viewmodel/week';

type Metric = 'kcal' | 'protein' | 'cost';

const STATUS: Record<DayStatus, { Icon: typeof Check; cls: string }> = {
  verified: { Icon: Check, cls: 'bg-success-bg text-primary' },
  outside: { Icon: TriangleAlert, cls: 'bg-warning-bg text-warning' },
  incomplete: { Icon: X, cls: 'bg-error-bg text-error' },
  none: { Icon: Minus, cls: 'bg-surface-2 text-text-2' },
};

/** Distinct, token-based colours for up to 6 pots so repeated meals are recognisable. */
const POT = ['var(--c-primary)', 'var(--c-protein)', 'var(--c-warning)', 'var(--c-error)', 'var(--c-text-2)', 'var(--c-kcal)'];

export function WeekScreen({ settings, stored, onOpenMeal, onNewWeek, onNewPlan, busy }: {
  settings: AppSettings; stored: StoredPlan | null | undefined; busy: boolean;
  onOpenMeal: (recipeId: string, date: string, slot: string) => void; onNewWeek: () => void;
  onNewPlan: (startDate: string, days: number) => void;
}) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [mealTarget, setMealTarget] = useState<{ date: string; slot: MealSlot }>();
  const { t } = useTranslation();
  const f = useFormat();
  const [metric, setMetric] = useState<Metric>('protein');
  const overrides = usePriceOverrides(settings.storeId) ?? [];
  const today = localISO();

  const view = useMemo(() => {
    if (!stored) return undefined;
    const book = bookFor(settings.storeId, overrides);
    const report = validatePlan(stored.plan, {
      foods: FOOD_MAP, recipes: RECIPE_MAP, targets: stored.plan.targets, allergens: settings.allergens, diets: settings.diets,
      excludedFoods: settings.excludedFoods, requiredSlots: settings.slots,
    });
    return weekView({ plan: stored.plan, sessions: stored.sessions, warnings: stored.warnings, report, recipes: RECIPE_MAP, foods: FOOD_MAP, household: settings.household, book });
  }, [stored, settings, overrides]);

  if (busy || stored === undefined) return <><AppHeader title={t('week.title')} /><LoadingState title={t('plan.generating')} text={t('plan.generatingHint')} /></>;
  if (!stored || !view) {
    return (
      <>
        <AppHeader title={t('week.title')} />
        <EmptyState icon={CalendarPlus} title={t('week.empty')} action={<SecondaryButton icon={CalendarPlus} onClick={onNewWeek}>{t('week.newWeek')}</SecondaryButton>} />
      </>
    );
  }

  const targets = stored.plan.targets;
  const conflicts = storeConflicts(stored.plan, bookFor(settings.storeId, overrides)).filter(c => c.date >= today).length;
  const first = stored.plan.days[0]!.date, last = stored.plan.days[stored.plan.days.length - 1]!.date;
  const budget = settings.budget;
  const perDayBudget = budget ? budget / 7 : undefined;

  return (
    <div className="flex flex-col gap-5">
      <AppHeader title={t('week.title')} subtitle={`${f.longDate(first)} – ${f.longDate(last)}`}
        actions={<IconButton icon={SlidersHorizontal} label={t('changes.open')} onClick={() => setChangesOpen(true)} />} />
      {conflicts > 0 && (
        <Banner tone="warning">
          {t('store.conflicts', { count: conflicts })}{' '}
          <button type="button" onClick={() => setChangesOpen(true)} className="font-semibold text-primary underline underline-offset-2">{t('changes.open')}</button>
        </Banner>
      )}

      <Card className="grid grid-cols-2 gap-4">
        <div className="col-span-2 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-text-2"><Wallet aria-hidden className="size-3.5" />{t('week.foodCost')}</p>
            <p className="num mt-1 text-hero font-bold tracking-tight">{f.eur(view.foodCost)}</p>
            {budget !== undefined && (
              <p className={cn('num text-caption font-medium', view.foodCost > budget ? 'text-warning' : 'text-text-2')}>
                {t('week.budget', { amount: f.eur(budget) })} · {view.foodCost > budget ? t('week.overBudget', { amount: f.eur(view.foodCost - budget) }) : t('week.underBudget', { amount: f.eur(budget - view.foodCost) })}
              </p>
            )}
          </div>
          <Chip className="bg-warning-bg text-text">{t('store.estimate')}</Chip>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-caption text-text-2"><Check aria-hidden className="size-3.5 text-primary" />{t('dayStatus.verified')}</p>
          <p className="num mt-0.5 text-support font-semibold">{t('week.verifiedDays', { count: view.verified })}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-caption text-text-2"><ChefHat aria-hidden className="size-3.5" />{t('week.cooking')}</p>
          <p className="num mt-0.5 text-support font-semibold">{t('week.cookSessions', { count: view.cookSessions })} · {t('week.portions', { portions: view.portions })}</p>
          <p className="num text-caption text-text-2">{t('week.cookTime', { time: f.duration(view.cookMinutes) })}</p>
        </div>
        {view.repeated.length > 0 && (
          <div className="col-span-2">
            <p className="mb-1.5 flex items-center gap-1.5 text-caption text-text-2"><Repeat aria-hidden className="size-3.5" />{t('week.repeats')}</p>
            <div className="flex flex-wrap gap-1.5">
              {view.repeated.map(r => <Chip key={r.recipeId}>{r.count}× {f.name(RECIPE_MAP.get(r.recipeId)!.name)}</Chip>)}
            </div>
          </div>
        )}
      </Card>

      {view.warnings.filter(w => w.code === 'days_missed').map((w, i) => w.code === 'days_missed' && (
        <Banner key={i} tone="warning">{t('plan.daysMissed', { count: w.days, protein: w.maxProteinShortfall })}</Banner>
      ))}

      <SegmentedControl<Metric> label={t('week.metric')} value={metric} onChange={setMetric} options={[
        { value: 'kcal', label: t('week.metricKcal') }, { value: 'protein', label: t('week.metricProtein') }, { value: 'cost', label: t('week.metricCost') },
      ]} />

      <ol className="flex flex-col gap-3">
        {view.days.map(d => (
          <DayCard key={d.date} day={d} metric={metric} today={today} targets={targets} perDayBudget={perDayBudget} onOpenMeal={onOpenMeal}
            onMealActions={(date, slot) => setMealTarget({ date, slot })} />
        ))}
      </ol>

      <p className="text-caption text-text-2">{t('week.perDayCostHint')}</p>
      <SecondaryButton icon={CalendarPlus} onClick={onNewWeek}>{t('week.newWeek')}</SecondaryButton>
      <WeekChangesSheet open={changesOpen} onOpenChange={setChangesOpen} settings={settings} stored={stored} onNewPlan={onNewPlan} />
      <MealActionsSheet target={mealTarget} settings={settings} stored={stored} onClose={() => setMealTarget(undefined)} />
    </div>
  );
}

function DayCard({ day, metric, today, targets, perDayBudget, onOpenMeal, onMealActions }: {
  day: WeekDayView; metric: Metric; today: string; targets: StoredPlan['plan']['targets']; perDayBudget?: number;
  onOpenMeal: (recipeId: string, date: string, slot: string) => void; onMealActions: (date: string, slot: MealSlot) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const { Icon, cls } = STATUS[day.status];
  const isToday = day.date === today;

  const bar = metric === 'kcal'
    ? { value: day.totals.kcal, low: targets.kcalBand[0], high: targets.kcalBand[1], valueText: `${f.int(day.totals.kcal)} ${t('unit.kcal')}`, band: t('week.band', { low: f.int(targets.kcalBand[0]), high: `${f.int(targets.kcalBand[1])} ${t('unit.kcal')}` }) }
    : metric === 'protein'
      ? { value: day.totals.protein, low: targets.proteinBand[0], high: targets.proteinBand[1], valueText: `${f.int(day.totals.protein)} ${t('unit.g')}`, band: t('week.band', { low: f.int(targets.proteinBand[0]), high: `${f.int(targets.proteinBand[1])} ${t('unit.g')}` }) }
      : { value: day.cost, low: 0, high: perDayBudget ?? day.cost, valueText: f.eur(day.cost), band: perDayBudget ? t('week.budget', { amount: f.eur(perDayBudget) }) : undefined };
  const st = bandState(bar.value, bar.low, bar.high);
  const stateText = metric === 'cost' ? (st === 'high' ? t('week.overBudget', { amount: f.eur(bar.value - bar.high) }) : t('store.estimate'))
    : st === 'in' ? t('home.statusDone') : st === 'low' ? t('home.statusLeft', { value: f.int(bar.low - bar.value) }) : t('home.statusOver', { value: f.int(bar.value - bar.high) });

  return (
    <li>
      <Card className={cn('p-4', isToday && 'ring-2 ring-primary')}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-card font-semibold">{f.longDate(day.date)}</h2>
          <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold', cls)}>
            <Icon aria-hidden className="size-3.5" strokeWidth={3} />{t(`dayStatus.${day.status}`)}
          </span>
        </div>
        <MacroProgress tone={metric} value={bar.value} low={bar.low} high={bar.high} valueText={bar.valueText} stateText={stateText} bandText={bar.band} />
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {day.meals.map(m => (
            <li key={m.meal.slot} className="flex items-center gap-1">
              <button type="button" disabled={!m.recipe} onClick={() => m.recipe && onOpenMeal(m.recipe.id, day.date, m.meal.slot)}
                className="pressable flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left">
                <RecipeVisual recipe={m.recipe} slot={m.meal.slot} foods={FOOD_MAP} className="size-11 shrink-0 rounded-xl" iconClass="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-text-2">
                    {t(`slot.${m.meal.slot}`)}
                    {m.batch && (
                      <span className="inline-flex items-center gap-1 normal-case tracking-normal"
                        title={t('week.batchOf', { n: m.batch.n, i: m.batch.i, total: m.batch.total })}>
                        <Layers aria-hidden className="size-3" style={{ color: POT[(m.batch.n - 1) % POT.length] }} />{m.batch.n} · {m.batch.i}/{m.batch.total}
                        <span className="sr-only">{t('week.batchOf', { n: m.batch.n, i: m.batch.i, total: m.batch.total })}</span>
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-support font-semibold">{m.recipe ? f.name(m.recipe.name) : t(m.meal.eatOut?.note === 'external' ? 'home.external' : 'home.eatOut')}</span>
                </span>
                <span className="num shrink-0 text-right text-caption text-text-2">
                  {f.int(m.macros.kcal)} {t('unit.kcal')}<br />{f.int(m.macros.protein)} {t('unit.g')}
                </span>
              </button>
              {!m.meal.done && day.date >= today && (
                <button type="button" onClick={() => onMealActions(day.date, m.meal.slot)}
                  aria-label={`${t('changes.mealActions')}: ${t(`slot.${m.meal.slot}`)}, ${f.longDate(day.date)}`}
                  className="pressable -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-primary">
                  <Repeat2 aria-hidden className="size-5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {metric !== 'cost' && <p className="num mt-2 text-caption text-text-2">{t('week.dayCost', { amount: f.eur(day.cost) })} · {t('store.estimate')}</p>}
      </Card>
    </li>
  );
}
