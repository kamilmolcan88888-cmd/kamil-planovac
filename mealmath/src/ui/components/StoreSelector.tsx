import { Check, ChevronDown, Store } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STORES, PRICE_TABLES } from '../../data/stores';
import { FOODS } from '../../data/catalog';
import { cn } from '../lib/cn';
import { BottomSheet } from './BottomSheet';
import { Banner } from './primitives';

/** Compact store chip that opens a sheet with neutral text cards (no third-party logos). */
export function StoreSelector({ storeId, onChange }: { storeId: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = STORES.find(s => s.id === storeId) ?? STORES[0]!;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${t('store.current', { name: current.name })}. ${t('store.switch')}`}
        className="pressable inline-flex h-11 max-w-full items-center gap-2 rounded-full bg-surface px-4 text-support font-semibold shadow-card">
        <Store aria-hidden className="size-4 shrink-0 text-primary" />
        <span className="truncate">{current.name}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-text-2" />
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title={t('store.switch')}>
        <ul className="flex flex-col gap-2.5" role="radiogroup" aria-label={t('store.title')}>
          {STORES.map(s => {
            const table = PRICE_TABLES.get(s.id)!;
            const available = FOODS.filter(f => { const it = table.items[f.id]; return it && !('unavailable' in it); }).length;
            const selected = s.id === storeId;
            return (
              <li key={s.id}>
                <button type="button" role="radio" aria-checked={selected} onClick={() => { onChange(s.id); setOpen(false); }}
                  className={cn('pressable flex w-full items-center gap-3 rounded-card border-2 p-4 text-left',
                    selected ? 'border-primary bg-success-bg' : 'border-border bg-surface')}>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-caption font-bold">{s.country}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold">{s.name}</span>
                    <span className="num block text-caption text-text-2">{t('store.items', { available, total: FOODS.length })}</span>
                  </span>
                  {selected && <Check aria-hidden className="size-5 text-primary" strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4"><Banner tone="info">{t('store.pricesAre')} <strong>{t('store.estimate')}</strong></Banner></div>
      </BottomSheet>
    </>
  );
}
