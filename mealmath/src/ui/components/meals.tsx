import { Check, Clock, Flame, Layers, Utensils } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { FoodMap } from '../../engine/nutrition';
import type { MealView } from '../viewmodel/home';
import { cn } from '../lib/cn';
import { useFormat } from '../lib/format';
import { Chip, PrimaryButton } from './primitives';
import { RecipeVisual } from './RecipeVisual';

function MacroChips({ view }: { view: MealView }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip><Flame aria-hidden className="size-3.5 text-kcal" />{f.int(view.macros.kcal)} {t('unit.kcal')}</Chip>
      <Chip><span aria-hidden className="size-2 rounded-full bg-protein" />{f.int(view.macros.protein)} {t('unit.g')} {t('home.proteinInline')}</Chip>
      {view.recipe && <Chip><Clock aria-hidden className="size-3.5" />{t('unit.minutes', { count: view.recipe.timeMin })}</Chip>}
      {view.userEstimate && <Chip className="bg-warning-bg text-text">{t('home.userEstimate')}</Chip>}
    </div>
  );
}

/** Large "next meal" card. */
export function MealCard({ view, foods, onOpen }: { view: MealView; foods: FoodMap; onOpen: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const title = view.recipe ? f.name(view.recipe.name) : t('home.eatOut');
  return (
    <article className="overflow-hidden rounded-card bg-surface shadow-card" aria-labelledby="next-meal-title">
      <RecipeVisual recipe={view.recipe} slot={view.meal.slot} foods={foods} className="h-40" iconClass="size-16" />
      <div className="p-4 sm:p-5">
        <p className="text-caption font-semibold uppercase tracking-wide text-primary">{t(`slot.${view.meal.slot}`)}</p>
        <h3 id="next-meal-title" className="mt-1 text-card font-semibold leading-snug">{title}</h3>
        <div className="mt-3"><MacroChips view={view} /></div>
        {view.recipe && <PrimaryButton className="mt-4" icon={Utensils} onClick={onOpen}>{t('home.viewRecipe')}</PrimaryButton>}
      </div>
    </article>
  );
}

/** Compact meal row with a completion check (44×44 target). */
export function MealRow({ view, foods, onToggle, onOpen }: { view: MealView; foods: FoodMap; onToggle: () => void; onOpen: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const reduce = useReducedMotion();
  const done = !!view.meal.done;
  const title = view.recipe ? f.name(view.recipe.name) : t('home.eatOut');
  const slot = t(`slot.${view.meal.slot}`);
  return (
    <li className={cn('flex items-center gap-3 rounded-card bg-surface p-3 shadow-card transition-opacity', done && 'opacity-75')}>
      <button type="button" onClick={onOpen} className="pressable flex min-w-0 flex-1 items-center gap-3 text-left" disabled={!view.recipe}>
        <RecipeVisual recipe={view.recipe} slot={view.meal.slot} foods={foods} className="size-14 shrink-0 rounded-2xl" iconClass="size-6" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-text-2">
            {slot}
            {view.meal.batchId && <span className="inline-flex items-center gap-0.5 normal-case tracking-normal text-primary"><Layers aria-hidden className="size-3" />{t('home.batch')}</span>}
          </span>
          <span className={cn('mt-0.5 block truncate text-body font-semibold', done && 'line-through decoration-text-2/60')}>{title}</span>
          <span className="num mt-0.5 block text-caption text-text-2">
            {f.int(view.macros.kcal)} {t('unit.kcal')} · {f.int(view.macros.protein)} {t('unit.g')} {t('home.proteinInline')}
            {view.userEstimate && ` · ${t('home.userEstimate')}`}
          </span>
        </span>
      </button>
      <button
        type="button" onClick={onToggle} aria-pressed={done}
        aria-label={t(done ? 'home.markUndone' : 'home.markDone', { meal: `${slot}: ${title}` })}
        className={cn('pressable relative flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          done ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-transparent')}
      >
        <AnimatePresence initial={false}>
          {done && (
            <motion.span key="c" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.18 }}>
              <Check aria-hidden className="size-5" strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </li>
  );
}
