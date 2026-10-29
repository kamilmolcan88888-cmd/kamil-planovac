import { ArrowLeft, Calculator, Clock, Layers, Repeat, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOOD_MAP, FOODS_GENERATED_AT, FOODS_SOURCE, RECIPE_MAP } from '../../data/catalog';
import { recipeAllergens, recipeDiets } from '../../engine/diet';
import type { ContributionLine } from '../../engine/nutrition';
import { displayName } from '../../engine/shopping';
import type { Macros } from '../../engine/types';
import type { AppSettings, StoredPlan } from '../../state/db';
import { updateSettings, usePriceOverrides } from '../../state/store';
import { bookFor } from '../../workers/planRequest';
import { BottomSheet } from '../components/BottomSheet';
import { SegmentedControl, Switch } from '../components/controls';
import { Card, Chip, EmptyState, IconButton, PrimaryButton, SectionTitle } from '../components/primitives';
import { RecipeVisual } from '../components/RecipeVisual';
import { useFormat } from '../lib/format';
import { recipeView } from '../viewmodel/recipe';

type Mode = 'my' | 'pot';
const g1 = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

export function RecipeScreen({ recipeId, date, slot, settings, stored, onBack }: {
  recipeId: string; date?: string; slot?: string; settings: AppSettings; stored: StoredPlan | null | undefined; onBack: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [mode, setMode] = useState<Mode>('my');
  const [howOpen, setHowOpen] = useState(false);
  const overrides = usePriceOverrides(settings.storeId) ?? [];
  const recipe = RECIPE_MAP.get(recipeId);

  const view = useMemo(() => recipe && recipeView({
    recipe, foods: FOOD_MAP, household: settings.household, plan: stored?.plan ?? undefined, sessions: stored?.sessions, date, slot,
  }), [recipe, settings.household, stored, date, slot]);
  const book = useMemo(() => bookFor(settings.storeId, overrides), [settings.storeId, overrides]);

  if (!recipe || !view) {
    return <><div className="pt-2"><IconButton icon={ArrowLeft} label={t('common.back')} onClick={onBack} /></div><EmptyState icon={Utensils} title={t('recipe.title')} /></>;
  }

  const cur = mode === 'my' ? view.my : view.pot;
  const diets = recipeDiets(recipe, FOOD_MAP);
  const allergens = [...recipeAllergens(recipe, FOOD_MAP)];
  const steps = recipe.steps[f.lang] ?? (f.lang === 'cs' ? recipe.steps.sk : undefined) ?? (f.lang === 'en' ? recipe.steps.en : undefined) ?? recipe.steps.sk;
  const nameOf = (id: string) => displayName(FOOD_MAP.get(id)!, book, f.lang, settings.preferStoreLang);
  const ingredients = recipe.ingredients.filter(i => (cur.grams[i.food] ?? 0) > 0);

  return (
    <article className="-mx-[var(--gutter)] -mt-3">
      <div className="relative">
        <RecipeVisual recipe={recipe} slot={view.meal?.slot ?? recipe.meals[0]!} foods={FOOD_MAP} className="h-56" iconClass="size-20" />
        <div className="absolute left-[var(--gutter)] top-3">
          <IconButton icon={ArrowLeft} label={t('common.back')} onClick={onBack} />
        </div>
      </div>

      <div className="relative -mt-6 rounded-t-[28px] bg-bg px-[var(--gutter)] pt-6">
        {view.meal && date && <p className="text-caption font-semibold uppercase tracking-wide text-primary">{t('recipe.forDay', { slot: t(`slot.${view.meal.slot}`), date: f.longDate(date) })}</p>}
        <h1 className="mt-1 text-title font-bold tracking-tight">{f.name(recipe.name)}</h1>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip><Clock aria-hidden className="size-3.5" />{f.duration(recipe.timeMin)}</Chip>
          <Chip><Repeat aria-hidden className="size-3.5" />{view.timesInPlan > 0 ? t('recipe.inPlan', { count: view.timesInPlan }) : t('recipe.notInPlan')}</Chip>
          {recipe.batch.ok && <Chip><Layers aria-hidden className="size-3.5" />{t('recipe.batchOk', { days: recipe.batch.keepsDays })}</Chip>}
          {diets.filter(d => d === 'vegan' || d === 'vegetarian' || d === 'pescatarian').slice(0, 1).map(d => <Chip key={d} className="bg-success-bg text-primary">{t(`recipe.diet.${d}`)}</Chip>)}
        </div>
        <p className="mt-2 text-caption text-text-2">
          {t('recipe.allergens')}: {allergens.length ? allergens.map(a => t(`allergen.${a}`)).join(', ') : t('recipe.noAllergens')}
        </p>
        {!view.meal && <p className="mt-2 text-caption text-text-2">{t('recipe.defaultPortion')}</p>}

        <div className="mt-5">
          <SegmentedControl<Mode> label={t('recipe.nutrition')} value={mode} onChange={setMode} options={[
            { value: 'my', label: t('recipe.myPortion') },
            { value: 'pot', label: t('recipe.wholePot') },
          ]} />
          {mode === 'pot' && <p className="num mt-2 text-center text-caption text-text-2">{t('recipe.potServes', { n: f.dec1(view.pot.portions) })}</p>}
        </div>

        <section aria-labelledby="nut-title" className="mt-4">
          <h2 id="nut-title" className="sr-only">{t('recipe.nutrition')}</h2>
          <NutritionTiles m={cur.total} />
          <PrimaryButton className="mt-3" icon={Calculator} onClick={() => setHowOpen(true)}>{t('recipe.howCalculated')}</PrimaryButton>
        </section>

        <section className="mt-7" aria-labelledby="ing-title">
          <SectionTitle><span id="ing-title">{t('recipe.ingredients')}</span></SectionTitle>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {ingredients.map(i => (
                <li key={i.food} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 text-support">{nameOf(i.food)}</span>
                  <span className="num shrink-0 text-support font-semibold">{g1(cur.grams[i.food]!)} {t('unit.g')}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-1.5">
              <Switch checked={settings.preferStoreLang} onChange={v => void updateSettings({ preferStoreLang: v })} label={t('recipe.storeNames')} />
            </div>
          </Card>
        </section>

        <section className="mt-7" aria-labelledby="eq-title">
          <SectionTitle><span id="eq-title">{t('recipe.equipment')}</span></SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {recipe.equipment.length ? recipe.equipment.map(e => <Chip key={e}>{t(`equipment.${e}`)}</Chip>) : <p className="text-support text-text-2">{t('recipe.noEquipment')}</p>}
          </div>
        </section>

        <section className="mt-7" aria-labelledby="steps-title">
          <SectionTitle><span id="steps-title">{t('recipe.steps')}</span></SectionTitle>
          <ol className="flex flex-col gap-4">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3.5">
                <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-support font-bold text-primary">{i + 1}</span>
                <p className="pt-1 text-body leading-relaxed">{s}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <HowCalculatedSheet open={howOpen} onOpenChange={setHowOpen} lines={cur.lines} total={cur.total} title={mode === 'my' ? t('recipe.myPortion') : t('recipe.wholePot')} nameOf={nameOf} />
    </article>
  );
}

function NutritionTiles({ m }: { m: Macros }) {
  const { t } = useTranslation();
  const f = useFormat();
  const tiles = [
    { label: t('recipe.kcal'), value: f.int(m.kcal), unit: t('unit.kcal'), cls: 'text-kcal' },
    { label: t('recipe.protein'), value: f.int(m.protein), unit: t('unit.g'), cls: 'text-protein' },
    { label: t('recipe.carbs'), value: f.int(m.carbs), unit: t('unit.g'), cls: 'text-text' },
    { label: t('recipe.fat'), value: f.int(m.fat), unit: t('unit.g'), cls: 'text-text' },
  ];
  return (
    <dl className="grid grid-cols-4 gap-2">
      {tiles.map(x => (
        <div key={x.label} className="rounded-2xl bg-surface px-2 py-3 text-center shadow-card">
          <dt className="hyphens-auto break-words text-caption leading-tight text-text-2">{x.label}</dt>
          <dd className={`num mt-1 text-card font-bold ${x.cls}`}>{x.value}<span className="ml-0.5 text-caption font-medium text-text-2">{x.unit}</span></dd>
        </div>
      ))}
    </dl>
  );
}

/** Transparent breakdown: ingredient, USDA FDC id, grams × per-100 g = contribution. */
export function HowCalculatedSheet({ open, onOpenChange, lines, total, title, nameOf }: {
  open: boolean; onOpenChange: (o: boolean) => void; lines: ContributionLine[]; total: Macros; title: string; nameOf: (id: string) => string;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const r1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString(f.locale);
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('recipe.howCalculated')} description={title}>
      <p className="mb-4 text-support text-text-2">{t('recipe.howIntro')}</p>
      <ul className="flex flex-col gap-2.5">
        {lines.filter(l => l.grams > 0).map(l => {
          const food = FOOD_MAP.get(l.foodId)!;
          return (
            <li key={l.foodId} className="rounded-2xl bg-surface-2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-support font-semibold">{nameOf(l.foodId)}</span>
                <span className="num shrink-0 text-support font-semibold">{g1(l.grams)} {t('unit.g')}</span>
              </div>
              <p className="mt-0.5 truncate text-caption text-text-2" title={food.usdaDescription}>
                {t('recipe.usdaRecord')}: {food.usdaDescription} · {t('recipe.fdc', { id: food.fdcId })}
              </p>
              <table className="num mt-2 w-full text-caption">
                <thead className="text-text-2">
                  <tr><th className="text-left font-medium" /><th className="text-right font-medium">{t('recipe.per100')}</th><th className="text-right font-medium">× {g1(l.grams)} {t('unit.g')} / 100</th></tr>
                </thead>
                <tbody>
                  {(['kcal', 'protein', 'carbs', 'fat'] as const).map(k => (
                    <tr key={k}>
                      <td className="py-0.5 text-text-2">{t(`recipe.${k}`)}</td>
                      <td className="text-right">{r1(l.per100[k])}</td>
                      <td className="text-right font-semibold">= {r1(l.result[k])} {k === 'kcal' ? t('unit.kcal') : t('unit.g')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          );
        })}
      </ul>
      <div className="num mt-3 rounded-2xl bg-success-bg p-3 text-support">
        <span className="font-semibold">{t('recipe.total')}:</span> {f.int(total.kcal)} {t('unit.kcal')} · {t('recipe.protein')} {r1(total.protein)} {t('unit.g')} · {t('recipe.carbs')} {r1(total.carbs)} {t('unit.g')} · {t('recipe.fat')} {r1(total.fat)} {t('unit.g')}
      </div>
      <p className="mt-3 text-caption text-text-2">{t('recipe.source', { source: FOODS_SOURCE, date: FOODS_GENERATED_AT.slice(0, 10) })}</p>
    </BottomSheet>
  );
}
