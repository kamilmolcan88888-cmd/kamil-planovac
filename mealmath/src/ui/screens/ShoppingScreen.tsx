import { Ban, CalendarPlus, Share2, ShoppingBasket } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOOD_MAP, RECIPE_MAP } from '../../data/catalog';
import { STORES } from '../../data/stores';
import { buildShoppingList, displayName, planGrams, shareText, type ShareLabels, type ShoppingLine } from '../../engine/shopping';
import { AISLES } from '../../engine/types';
import type { AppSettings, StoredPlan } from '../../state/db';
import { toggleChecked, updateSettings, usePriceOverrides } from '../../state/store';
import { bookFor } from '../../workers/planRequest';
import { AppHeader } from '../components/AppShell';
import { Switch } from '../components/controls';
import { Banner, Card, EmptyState, LoadingState, SecondaryButton } from '../components/primitives';
import { BudgetSummary, ShoppingAisle, ShoppingItem } from '../components/shopping';
import { StoreSelector } from '../components/StoreSelector';
import { LOCALE } from '../../i18n';
import { useFormat } from '../lib/format';

export function ShoppingScreen({ settings, stored, busy, onNewWeek }: { settings: AppSettings; stored: StoredPlan | null | undefined; busy: boolean; onNewWeek: () => void }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const overrides = usePriceOverrides(settings.storeId) ?? [];
  const [note, setNote] = useState<string>();
  const includePantry = !!settings.includePantry;
  const store = STORES.find(s => s.id === settings.storeId) ?? STORES[0]!;

  const list = useMemo(() => {
    if (!stored) return undefined;
    const book = bookFor(settings.storeId, overrides);
    return { book, ...buildShoppingList(planGrams(stored.plan, RECIPE_MAP, settings.household), book, FOOD_MAP, { includePantry }) };
  }, [stored, settings.storeId, settings.household, overrides, includePantry]);

  if (busy || stored === undefined) return <><AppHeader title={t('shopping.title')} /><LoadingState title={t('plan.generating')} /></>;
  if (!stored || !list) return <><AppHeader title={t('shopping.title')} /><EmptyState icon={ShoppingBasket} title={t('shopping.empty')} action={<SecondaryButton icon={CalendarPlus} onClick={onNewWeek}>{t('week.newWeek')}</SecondaryButton>} /></>;

  const checked = new Set(stored.checked ?? []);
  const nameOf = (l: ShoppingLine) => (settings.preferStoreLang ? l.storeName : displayName(FOOD_MAP.get(l.foodId)!, list.book, f.lang, false));
  const buy = list.lines.filter(l => l.available && !l.pantry);
  const pantry = list.lines.filter(l => l.available && l.pantry);
  const done = buy.filter(l => checked.has(l.foodId)).length;

  const share = async () => {
    // The shared list is always in the store's language (DE for Lidl DE), independent of the UI.
    const st = i18n.getFixedT(store.lang);
    const eur = new Intl.NumberFormat(LOCALE[store.lang], { style: 'currency', currency: 'EUR' });
    const labels: ShareLabels = {
      title: st('shopping.shareTitle', { store: store.name }),
      aisles: Object.fromEntries(AISLES.map(a => [a, st(`aisle.${a}`)])) as ShareLabels['aisles'],
      estimate: st('store.estimate'), checkout: st('shopping.checkoutLabel'),
      pack: (n, g) => `${n} × ${g >= 1000 ? `${new Intl.NumberFormat(LOCALE[store.lang]).format(g / 1000)} kg` : `${g} g`}`,
      formatPrice: v => eur.format(v),
    };
    const text = shareText(list, labels, { includePantry, checked });
    try {
      if (navigator.share) await navigator.share({ title: labels.title, text });
      else { await navigator.clipboard.writeText(text); setNote(t('shopping.copied')); }
    } catch { /* user cancelled the share sheet */ }
  };

  return (
    <div className="flex flex-col gap-5">
      <AppHeader title={t('shopping.title')} subtitle={t('shopping.household', { adults: settings.household.adults, kids: settings.household.kids })} />
      <div className="-mt-2 flex items-center justify-between gap-3">
        <StoreSelector storeId={settings.storeId} onChange={id => void updateSettings({ storeId: id })} />
        <button type="button" onClick={() => void share()} className="pressable inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-support font-semibold text-on-primary">
          <Share2 aria-hidden className="size-4" />{t('shopping.share')}
        </button>
      </div>
      {note && <p role="status" className="-mt-2 text-caption text-primary">{note}</p>}

      <BudgetSummary foodCost={list.foodCost} checkout={list.checkout} budget={settings.budget} storeName={store.name} />

      <div>
        <div className="mb-1.5 flex items-center justify-between text-caption font-medium text-text-2">
          <span className="num">{t('shopping.progress', { done, total: buy.length })}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ring-track" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${buy.length ? (done / buy.length) * 100 : 0}%` }} />
        </div>
      </div>

      {list.unavailable.length > 0 && (
        <Banner tone="warning" icon={Ban}>
          <strong className="font-semibold">{t('shopping.unavailable')}:</strong>{' '}
          {list.unavailable.map(l => {
            const food = FOOD_MAP.get(l.foodId)!;
            const sub = l.substitute && FOOD_MAP.get(l.substitute);
            return `${f.name(food.name)}${sub ? ` (${t('shopping.substitute', { name: f.name(sub.name) })})` : ''}`;
          }).join(', ')}
        </Banner>
      )}

      {list.byAisle.map(g => {
        const lines = g.lines.filter(l => l.available && !l.pantry);
        if (!lines.length) return null;
        return (
          <ShoppingAisle key={g.aisle} aisle={g.aisle} count={lines.length}>
            {lines.map(l => (
              <ShoppingItem key={l.foodId} line={l} food={FOOD_MAP.get(l.foodId)!} name={nameOf(l)} checked={checked.has(l.foodId)} onToggle={() => void toggleChecked(stored.id, l.foodId)} />
            ))}
          </ShoppingAisle>
        );
      })}

      {pantry.length > 0 && (
        <section aria-labelledby="pantry-title" className="flex flex-col gap-2">
          <h3 id="pantry-title" className="px-1 text-caption font-semibold uppercase tracking-wide text-text-2">{t('shopping.pantry')}</h3>
          <Card className="p-0">
            <div className="border-b border-border px-4 py-2">
              <p className="py-1 text-caption text-text-2">{t('shopping.pantryHint')}</p>
              <Switch checked={includePantry} onChange={v => void updateSettings({ includePantry: v })} label={t('shopping.includePantry')} />
            </div>
            <ul className="divide-y divide-border">
              {pantry.map(l => (
                <ShoppingItem key={l.foodId} line={l} food={FOOD_MAP.get(l.foodId)!} name={nameOf(l)} checked={checked.has(l.foodId)} onToggle={() => void toggleChecked(stored.id, l.foodId)} />
              ))}
            </ul>
          </Card>
        </section>
      )}

      <p className="text-caption text-text-2">{t('prices.disclaimer')}</p>
    </div>
  );
}
