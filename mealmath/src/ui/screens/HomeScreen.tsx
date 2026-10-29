import { CalendarPlus, Flame, Settings, Sparkles, UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FOOD_MAP, RECIPE_MAP } from '../../data/catalog';
import { storeConflicts } from '../../engine/shopping';
import { validatePlan } from '../../engine/validator';
import type { AppSettings, StoredPlan } from '../../state/db';
import { dayPart, localISO } from '../../state/dates';
import { toggleDone, updateSettings, usePriceOverrides } from '../../state/store';
import { bookFor } from '../../workers/planRequest';
import { AppHeader } from '../components/AppShell';
import { MacroRing } from '../components/MacroRing';
import { MealCard, MealRow } from '../components/meals';
import { Banner, Card, ErrorState, IconButton, LoadingState, PrimaryButton, SectionTitle } from '../components/primitives';
import { StoreSelector } from '../components/StoreSelector';
import { DayStatusLegend, WeeklyDayStrip } from '../components/WeeklyDayStrip';
import { useFormat } from '../lib/format';
import { consumed, dayMeals, nextMeal, streak, weekStatuses } from '../viewmodel/home';

function RingStatus({ value, target, unit }: { value: number; target: number; unit: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const diff = target - value;
  const text = Math.abs(diff) < 0.5 ? t('home.statusDone') : diff > 0 ? t('home.statusLeft', { value: `${f.int(diff)} ${unit}` }) : t('home.statusOver', { value: `${f.int(-diff)} ${unit}` });
  return <p className="num mt-2 text-center text-caption font-medium text-text-2">{text}</p>;
}

export function HomeScreen({ settings, stored, busy, error, onGenerate, onOpenRecipe, onOpenSettings }: {
  settings: AppSettings; stored: StoredPlan | undefined | null; busy: boolean; error?: string; onGenerate: () => void;
  onOpenRecipe: (recipeId: string, date: string, slot: string) => void; onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const today = localISO();
  const overrides = usePriceOverrides(settings.storeId) ?? [];
  const generate = onGenerate;

  const plan = stored?.plan;
  const meals = useMemo(() => dayMeals(plan, today, RECIPE_MAP, FOOD_MAP), [plan, today]);
  const eaten = consumed(meals);
  const next = nextMeal(meals);
  const report = useMemo(() => plan && validatePlan(plan, {
    foods: FOOD_MAP, recipes: RECIPE_MAP, targets: plan.targets, allergens: settings.allergens, diets: settings.diets,
    excludedFoods: settings.excludedFoods, requiredSlots: settings.slots,
  }), [plan, settings.allergens, settings.diets, settings.excludedFoods, settings.slots]);
  const strip = weekStatuses(plan, report, stored?.startDate ?? today);
  const days = streak(plan, today);

  const conflicts = useMemo(() => (plan && stored && stored.storeId !== settings.storeId
    ? storeConflicts(plan, bookFor(settings.storeId, overrides)).length : 0), [plan, stored, settings.storeId, overrides]);

  const greeting = t(`greeting.${dayPart(new Date().getHours())}`);
  const header = (
    <>
      <AppHeader title={greeting} subtitle={f.longDate(today)}
        actions={<IconButton icon={Settings} label={t('home.settings')} onClick={onOpenSettings} />} />
      <div className="mb-5"><StoreSelector storeId={settings.storeId} onChange={id => void updateSettings({ storeId: id })} /></div>
    </>
  );

  if (error) return <>{header}<ErrorState title={t('plan.error')} detail={error} onRetry={generate} /></>;
  if (!stored || busy) return <>{header}<LoadingState title={t('plan.generating')} text={t('plan.generatingHint')} /></>;

  const target = stored.plan.targets;
  const w = stored.warnings;

  return (
    <div className="flex flex-col gap-6">
      <div>{header}</div>

      {(settings.profileIsDemo || w.length > 0 || conflicts > 0) && (
        <div className="-mt-3 flex flex-col gap-2.5">
          {settings.profileIsDemo && (
            <Banner tone="info" icon={UserRound}><strong className="font-semibold">{t('demo.title')}.</strong> {t('demo.text')}</Banner>
          )}
          {w.map((x, i) => (
            <Banner key={i} tone="warning">
              {x.code === 'days_missed' && <>{t('plan.daysMissed', { count: x.days, protein: x.maxProteinShortfall })} {x.maxKcalDeviation > 0 && t('plan.daysMissedKcal', { kcal: x.maxKcalDeviation })}</>}
              {x.code === 'over_budget' && t('plan.overBudget', { amount: f.eur(x.by) })}
              {x.code === 'few_recipes' && t('plan.fewRecipes', { count: x.available })}
              {x.code === 'no_recipes_for_slot' && t('plan.noRecipesForSlot', { slot: t(`slot.${x.slot}`) })}
            </Banner>
          ))}
          {conflicts > 0 && <Banner tone="warning">{t('store.conflicts', { count: conflicts })} {t('store.conflictsHint')}</Banner>}
        </div>
      )}

      {meals.length === 0 ? (
        <Card className="text-center">
          <p className="text-body text-text-2">{t('home.noPlanToday')}</p>
          <PrimaryButton className="mt-4" icon={CalendarPlus} onClick={generate}>{t('home.generate')}</PrimaryButton>
        </Card>
      ) : (
        <>
          <section aria-labelledby="today-title">
            <h2 id="today-title" className="sr-only">{t('home.today')}</h2>
            <Card className="grid grid-cols-2 gap-2 py-5">
              <div className="flex flex-col items-center">
                <MacroRing tone="kcal" value={eaten.kcal} target={target.kcal} unit={t('unit.kcal')} label={t('home.calories')}
                  ariaLabel={t('home.ringKcalAria', { value: f.int(eaten.kcal), target: f.int(target.kcal) })} />
                <RingStatus value={eaten.kcal} target={target.kcal} unit={t('unit.kcal')} />
              </div>
              <div className="flex flex-col items-center">
                <MacroRing tone="protein" value={eaten.protein} target={target.protein} unit={t('unit.g')} label={t('home.protein')}
                  ariaLabel={t('home.ringProteinAria', { value: f.int(eaten.protein), target: f.int(target.protein) })} />
                <RingStatus value={eaten.protein} target={target.protein} unit={t('unit.g')} />
              </div>
              <p className="col-span-2 mt-2 flex items-center justify-center gap-1.5 text-support font-medium">
                {days > 0 ? <><Flame aria-hidden className="size-4 text-warning" />{t('home.streak', { count: days })}</> : <span className="text-text-2">{t('home.streakZero')}</span>}
              </p>
            </Card>
          </section>

          <section aria-labelledby="next-title">
            <SectionTitle><span id="next-title">{t('home.nextMeal')}</span></SectionTitle>
            {next ? <MealCard view={next} foods={FOOD_MAP} onOpen={() => next.recipe && onOpenRecipe(next.recipe.id, today, next.meal.slot)} />
              : <Card className="flex items-center gap-3"><Sparkles aria-hidden className="size-6 text-primary" /><p className="text-body">{t('home.allDone')}</p></Card>}
          </section>

          <section aria-labelledby="week-title">
            <SectionTitle><span id="week-title">{t('home.week')}</span></SectionTitle>
            <Card className="px-2 py-3 sm:px-3">
              <WeeklyDayStrip days={strip} today={today} />
              <div className="px-2"><DayStatusLegend /></div>
            </Card>
          </section>

          <section aria-labelledby="meals-title">
            <SectionTitle><span id="meals-title">{t('home.todaysMeals')}</span></SectionTitle>
            <ul className="flex flex-col gap-2.5">
              {meals.map(m => (
                <MealRow key={m.meal.slot} view={m} foods={FOOD_MAP}
                  onToggle={() => void toggleDone(stored.id, today, m.meal.slot)}
                  onOpen={() => m.recipe && onOpenRecipe(m.recipe.id, today, m.meal.slot)} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
