import { Check, PackageOpen, Pencil, Receipt, Wallet } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { ShoppingLine } from '../../engine/shopping';
import type { Aisle, Food } from '../../engine/types';
import { cn } from '../lib/cn';
import { useFormat } from '../lib/format';
import { Card, Chip } from './primitives';

/** The two totals: what the week's food costs vs. what you pay at the till. Both are estimates. */
export function BudgetSummary({ foodCost, checkout, budget, storeName }: { foodCost: number; checkout: number; budget?: number; storeName: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const over = budget !== undefined && foodCost > budget;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="flex flex-col">
        <p className="flex items-center gap-1.5 text-caption font-semibold text-text-2"><Wallet aria-hidden className="size-3.5" />{t('shopping.foodCost')}</p>
        <p className="num mt-1.5 text-[26px] font-bold leading-tight tracking-tight">{f.eur(foodCost)}</p>
        {budget !== undefined && (
          <p className={cn('num mt-0.5 text-caption font-medium', over ? 'text-warning' : 'text-text-2')}>
            {over ? t('shopping.overBudget', { amount: f.eur(foodCost - budget) }) : t('shopping.vsBudget', { amount: f.eur(budget) })}
          </p>
        )}
        <p className="mt-auto pt-2 text-caption text-text-2">{t('shopping.foodHint')}</p>
      </Card>
      <Card className="flex flex-col">
        <p className="flex items-center gap-1.5 text-caption font-semibold text-text-2"><Receipt aria-hidden className="size-3.5" />{t('shopping.checkout')}</p>
        <p className="num mt-1.5 text-[26px] font-bold leading-tight tracking-tight">{f.eur(checkout)}</p>
        <Chip className="mt-1 w-fit bg-warning-bg text-text">{t('store.estimate')}</Chip>
        <p className="mt-auto pt-2 text-caption text-text-2">{t('shopping.checkoutHint', { store: storeName })}</p>
      </Card>
    </div>
  );
}

export function ShoppingItem({ line, food, name, checked, onToggle }: { line: ShoppingLine; food: Food; name: string; checked: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const reduce = useReducedMotion();
  return (
    <li>
      <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle}
        aria-label={t(checked ? 'shopping.uncheck' : 'shopping.check', { name })}
        className={cn('pressable flex w-full items-start gap-3 px-4 py-3 text-left transition-opacity', checked && 'opacity-55')}>
        <span aria-hidden className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
          checked ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface')}>
          <AnimatePresence initial={false}>
            {checked && <motion.span initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0.4, opacity: 0 }}><Check className="size-4" strokeWidth={3} /></motion.span>}
          </AnimatePresence>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn('min-w-0 text-body font-semibold', checked && 'line-through decoration-text-2/60')}>{name}</span>
            <span className="num shrink-0 text-body font-semibold">{f.eur(line.checkout)}</span>
          </span>
          <span className="num mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-text-2">
            <span>{t('shopping.packs', { count: line.packs, size: f.amount(line.packG, food) })}</span>
            <span aria-hidden>·</span>
            <span>{t('shopping.packPrice', { price: f.eur(line.packPrice) })}</span>
            <span aria-hidden>·</span>
            <span>{t('shopping.need', { grams: f.amount(line.grams, food) })}</span>
            {line.customPrice && <span className="inline-flex items-center gap-0.5 font-semibold text-primary"><Pencil aria-hidden className="size-3" />{t('shopping.custom')}</span>}
          </span>
          <span className="num mt-0.5 flex items-center gap-1 text-caption text-text-2">
            <PackageOpen aria-hidden className="size-3.5" />
            {line.leftoverG >= 1 ? t('shopping.leftover', { grams: f.amount(line.leftoverG, food), days: line.leftoverDays }) : t('shopping.noLeftover')}
          </span>
        </span>
      </button>
    </li>
  );
}

export function ShoppingAisle({ aisle, count, children }: { aisle: Aisle; count: number; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t(`aisle.${aisle}`)}>
      <h2 className="mb-2 flex items-center justify-between px-1 text-caption font-semibold uppercase tracking-wide text-text-2">
        <span>{t(`aisle.${aisle}`)}</span><span className="num">{count}</span>
      </h2>
      <Card className="p-0"><ul className="divide-y divide-border">{children}</ul></Card>
    </section>
  );
}
