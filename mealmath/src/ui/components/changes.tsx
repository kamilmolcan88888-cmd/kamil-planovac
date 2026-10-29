import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ban, CalendarClock, Check, ChevronRight, RotateCcw, Search, Store, TriangleAlert, UtensilsCrossed, Repeat2, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOOD_MAP, RECIPE_MAP } from '../../data/catalog';
import { STORES } from '../../data/stores';
import type { ChangePreview } from '../../engine/changes';
import { storeConflicts } from '../../engine/shopping';
import type { MealSlot } from '../../engine/types';
import type { AppSettings, StoredPlan } from '../../state/db';
import { addDaysISO, localISO } from '../../state/dates';
import { previewInWorker } from '../../state/planService';
import { applyPlanChange, usePriceOverrides } from '../../state/store';
import { bookFor, type ChangeJob } from '../../workers/requestBase';
import { cn } from '../lib/cn';
import { useFormat } from '../lib/format';
import { BottomSheet } from './BottomSheet';
import { SegmentedControl } from './controls';
import { Banner, Button, Chip, LoadingState, PrimaryButton, SecondaryButton } from './primitives';
import { RecipeVisual } from './RecipeVisual';

/** "+12 kcal · 12 kcal more" – the direction is always spelled out, never colour alone. */
function Delta({ before, after, unit, money }: { before: number; after: number; unit?: string; money?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const d = after - before;
  const fmt = (v: number) => (money ? f.eur(v) : `${f.int(v)} ${unit}`);
  const flat = money ? Math.abs(d) < 0.005 : Math.abs(d) < 0.5;
  if (flat) return <span className="text-text-2">{t('changes.same')}</span>;
  const Icon = d > 0 ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold">
      <Icon aria-hidden className="size-3.5" strokeWidth={3} />
      {t(d > 0 ? 'changes.more' : 'changes.less', { v: fmt(Math.abs(d)) })}
    </span>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold', ok ? 'bg-success-bg text-primary' : 'bg-warning-bg text-warning')}>
      {ok ? <Check aria-hidden className="size-3" strokeWidth={3} /> : <TriangleAlert aria-hidden className="size-3" />}{ok ? t('changes.statusOk') : t('changes.statusMiss')}
    </span>
  );
}

const mealName = (m: { recipeId: string; eatOut?: unknown } | undefined, f: ReturnType<typeof useFormat>, t: (k: string) => string) =>
  !m ? '—' : m.eatOut ? t('changes.eatOutLabel') : RECIPE_MAP.get(m.recipeId) ? f.name(RECIPE_MAP.get(m.recipeId)!.name) : '—';

/** Before/after comparison of a change, applied only after confirmation. */
export function ChangePreviewView({ preview, onApply, onCancel, busy }: { preview: ChangePreview; onApply: () => void; onCancel: () => void; busy?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-support text-text-2">{t('changes.previewHint')}</p>
      {preview.meals.length > 0 && (
        <section>
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-2">{t('changes.mealsChanged')}</h3>
          <ul className="flex flex-col gap-2">
            {preview.meals.map(m => (
              <li key={`${m.date}${m.slot}`} className="rounded-2xl bg-surface-2 p-3 text-support">
                <p className="text-caption text-text-2">{f.longDate(m.date)} · {t(`slot.${m.slot}`)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-text-2 line-through decoration-text-2/50">{mealName(m.before, f, t)}</span>
                  <ArrowRight aria-hidden className="size-4 text-primary" />
                  <span className="font-semibold">{mealName(m.after, f, t)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {preview.meals.length === 0 && preview.days.length > 0 && <p className="text-support">{t('changes.gramsOnly', { count: preview.days.length })}</p>}
      <ul className="flex flex-col gap-2">
        {preview.days.map(d => (
          <li key={d.date} className="rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-support font-semibold">{f.longDate(d.date)}</span>
              <StatusPill ok={d.after.verified} />
            </div>
            <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
              <dt className="text-text-2">{t('changes.kcalDelta')}</dt>
              <dd>{f.int(d.before.kcal)} → <strong>{f.int(d.after.kcal)}</strong> {t('unit.kcal')} · <Delta before={d.before.kcal} after={d.after.kcal} unit={t('unit.kcal')} /></dd>
              <dt className="text-text-2">{t('changes.proteinDelta')}</dt>
              <dd>{f.int(d.before.protein)} → <strong>{f.int(d.after.protein)}</strong> {t('unit.g')} · <Delta before={d.before.protein} after={d.after.protein} unit={t('unit.g')} /></dd>
              <dt className="text-text-2">{t('changes.costDelta')}</dt>
              <dd>{f.eur(d.before.cost)} → <strong>{f.eur(d.after.cost)}</strong> · <Delta before={d.before.cost} after={d.after.cost} money /></dd>
            </dl>
          </li>
        ))}
      </ul>
      <div className="num flex items-center justify-between rounded-2xl bg-surface-2 p-3 text-support">
        <span>{t('changes.weekCost')} <Chip className="ml-1 bg-warning-bg px-1.5 py-0 text-text">{t('store.estimate')}</Chip></span>
        <span>{f.eur(preview.costBefore)} → <strong>{f.eur(preview.costAfter)}</strong></span>
      </div>
      {!preview.ok && <Banner tone="warning">{t('changes.dayMiss')}</Banner>}
      <div className="grid grid-cols-2 gap-2.5">
        <SecondaryButton onClick={onCancel}>{t('changes.cancel')}</SecondaryButton>
        <PrimaryButton onClick={onApply} disabled={busy}>{t('changes.apply')}</PrimaryButton>
      </div>
    </div>
  );
}

/** Comparison card for one swap candidate. */
export function MealSwapCard({ recipeId, preview, date, slot, onPick }: { recipeId: string; preview: ChangePreview; date: string; slot: MealSlot; onPick: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const r = RECIPE_MAP.get(recipeId)!;
  const day = preview.days.find(d => d.date === date);
  return (
    <li>
      <button type="button" onClick={onPick} className="pressable flex w-full items-start gap-3 rounded-card border border-border bg-surface p-3 text-left">
        <RecipeVisual recipe={r} slot={slot} foods={FOOD_MAP} className="size-14 shrink-0 rounded-2xl" iconClass="size-6" />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="text-support font-semibold leading-snug">{f.name(r.name)}</span>
            <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-text-2" />
          </span>
          {day && (
            <span className="num mt-1 block text-caption text-text-2">
              {t('changes.proteinDelta')}: <Delta before={day.before.protein} after={day.after.protein} unit={t('unit.g')} /> ·{' '}
              {t('changes.price')}: <Delta before={day.before.cost} after={day.after.cost} money />
            </span>
          )}
          <span className="mt-1.5 flex items-center gap-1.5">
            <StatusPill ok={preview.ok} />
            <span className="num text-caption text-text-2">{f.duration(r.timeMin)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

type MealMode = 'swap' | 'eatOut';

/** Swap one meal or mark it as eaten out. Always ends in a preview that must be confirmed. */
export function MealActionsSheet({ target, settings, stored, onClose }: {
  target?: { date: string; slot: MealSlot }; settings: AppSettings; stored: StoredPlan; onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const overrides = usePriceOverrides(settings.storeId) ?? [];
  const [mode, setMode] = useState<MealMode>('swap');
  const [options, setOptions] = useState<{ recipeId: string; preview: ChangePreview }[]>();
  const [preview, setPreview] = useState<ChangePreview>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [kcal, setKcal] = useState('800');
  const [protein, setProtein] = useState('40');
  const [key, setKey] = useState<string>();

  const run = async <T,>(job: ChangeJob): Promise<T | undefined> => {
    setLoading(true); setError(undefined);
    try { return await previewInWorker<T>({ settings, overrides, plan: stored.plan, job }); }
    catch { setError(t('changes.failed')); return undefined; }
    finally { setLoading(false); }
  };

  const k = target ? `${target.date}|${target.slot}` : undefined;
  if (target && k !== key) {
    setKey(k); setMode('swap'); setPreview(undefined); setOptions(undefined); setError(undefined);
    void run<{ recipeId: string; preview: ChangePreview }[]>({ kind: 'swapOptions', date: target.date, slot: target.slot }).then(setOptions);
  }
  const close = () => { setKey(undefined); onClose(); };
  const current = target && stored.plan.days.find(d => d.date === target.date)?.meals.find(m => m.slot === target.slot);

  const previewEatOut = async () => {
    const kc = Number(kcal), pr = Number(protein);
    if (!target || !(kc >= 50 && kc <= 3000) || !(pr >= 0 && pr <= 300)) { setError(t('changes.invalidNumbers')); return; }
    const p = await run<ChangePreview>({ kind: 'eatOut', date: target.date, slot: target.slot, kcal: kc, protein: pr });
    if (p) setPreview(p);
  };
  const apply = async () => { if (preview) { await applyPlanChange(stored.id, preview); close(); } };

  const title = preview ? t('changes.preview') : t('changes.mealActions');
  const description = target ? `${f.longDate(target.date)} · ${t(`slot.${target.slot}`)}${current ? ` · ${current.eatOut ? t('changes.eatOutLabel') : f.name(RECIPE_MAP.get(current.recipeId)!.name)}` : ''}` : undefined;
  const input = 'num h-12 w-full rounded-input border border-border bg-surface-2 px-4 text-body text-text outline-none focus:border-primary';

  return (
    <BottomSheet open={!!target} onOpenChange={o => !o && close()} title={title} description={description}>
      {preview ? (
        <>
          <button type="button" onClick={() => setPreview(undefined)} className="pressable mb-3 inline-flex h-11 items-center gap-1.5 text-support font-semibold text-primary">
            <ArrowLeft aria-hidden className="size-4" />{t('common.back')}
          </button>
          <ChangePreviewView preview={preview} onApply={() => void apply()} onCancel={close} />
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <SegmentedControl<MealMode> label={t('changes.mealActions')} value={mode} onChange={setMode}
            options={[{ value: 'swap', label: t('changes.swap') }, { value: 'eatOut', label: t('changes.eatOut') }]} />
          {error && <Banner tone="warning">{error}</Banner>}
          {mode === 'swap' && (loading && !options ? <LoadingState title={t('changes.loading')} /> : options && (
            options.length ? (
              <ul className="flex flex-col gap-2.5">
                {options.map(o => <MealSwapCard key={o.recipeId} {...o} date={target!.date} slot={target!.slot} onPick={() => setPreview(o.preview)} />)}
              </ul>
            ) : <p className="py-6 text-center text-support text-text-2">{t('changes.noOptions')}</p>
          ))}
          {mode === 'eatOut' && (
            <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); void previewEatOut(); }}>
              <p className="text-support text-text-2">{t('changes.eatOutHint')}</p>
              <label className="block"><span className="mb-1.5 block text-support font-medium">{t('changes.kcal')}</span>
                <input className={input} inputMode="numeric" value={kcal} onChange={e => setKcal(e.target.value)} /></label>
              <label className="block"><span className="mb-1.5 block text-support font-medium">{t('changes.protein')}</span>
                <input className={input} inputMode="numeric" value={protein} onChange={e => setProtein(e.target.value)} /></label>
              <PrimaryButton type="submit" disabled={loading}>{loading ? t('changes.loading') : t('changes.previewBtn')}</PrimaryButton>
            </form>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

type WeekView = 'menu' | 'exclude' | 'preview';

function ActionRow({ icon: Icon, title, hint, onClick, tone }: { icon: LucideIcon; title: string; hint: string; onClick: () => void; tone?: 'warning' }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="pressable flex w-full items-start gap-3 rounded-card border border-border bg-surface p-3.5 text-left">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl', tone === 'warning' ? 'bg-warning-bg text-warning' : 'bg-surface-2 text-primary')}>
          <Icon aria-hidden className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-support font-semibold">{title}</span>
          <span className="mt-0.5 block text-caption text-text-2">{hint}</span>
        </span>
        <ChevronRight aria-hidden className="mt-2.5 size-4 shrink-0 text-text-2" />
      </button>
    </li>
  );
}

/** Whole-week changes: new start/length (instant), restart the rest, exclude a food, fix store conflicts. */
export function WeekChangesSheet({ open, onOpenChange, settings, stored, onNewPlan }: {
  open: boolean; onOpenChange: (o: boolean) => void; settings: AppSettings; stored: StoredPlan; onNewPlan: (startDate: string, days: number) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const overrides = usePriceOverrides(settings.storeId) ?? [];
  const today = localISO();
  const [view, setView] = useState<WeekView>('menu');
  const [preview, setPreview] = useState<ChangePreview>();
  const [patch, setPatch] = useState<Partial<AppSettings>>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [start, setStart] = useState(today);
  const [days, setDays] = useState(String(settings.planDays ?? 7));
  const [q, setQ] = useState('');

  const store = STORES.find(s => s.id === settings.storeId)!;
  const conflicts = useMemo(() => storeConflicts(stored.plan, bookFor(settings.storeId, overrides)).filter(c => c.date >= today), [stored.plan, settings.storeId, overrides, today]);
  const planFoods = useMemo(() => {
    const ids = new Set(stored.plan.days.filter(d => d.date >= today).flatMap(d => d.meals.flatMap(m => Object.keys(m.myGrams))));
    const nq = q.trim().toLocaleLowerCase(f.locale);
    return [...ids].map(id => FOOD_MAP.get(id)!).filter(x => x && x.aisle !== 'spices' && (!nq || f.name(x.name).toLocaleLowerCase(f.locale).includes(nq)))
      .sort((a, b) => f.name(a.name).localeCompare(f.name(b.name), f.locale));
  }, [stored.plan, today, q, f]);

  const reset = () => { setView('menu'); setPreview(undefined); setPatch(undefined); setError(undefined); setQ(''); };
  const run = async (job: ChangeJob, settingsPatch?: Partial<AppSettings>) => {
    setLoading(true); setError(undefined);
    try {
      const p = await previewInWorker<ChangePreview>({ settings: { ...settings, ...settingsPatch }, overrides, plan: stored.plan, job });
      setPreview(p); setPatch(settingsPatch); setView('preview');
    } catch { setError(t('changes.failed')); }
    finally { setLoading(false); }
  };
  const apply = async () => { if (preview) { await applyPlanChange(stored.id, preview, patch); reset(); onOpenChange(false); } };
  const input = 'num h-12 w-full rounded-input border border-border bg-surface-2 px-4 text-body text-text outline-none focus:border-primary';

  return (
    <BottomSheet open={open} onOpenChange={o => { if (!o) reset(); onOpenChange(o); }} title={view === 'preview' ? t('changes.preview') : t('changes.title')}>
      {view !== 'menu' && (
        <button type="button" onClick={reset} className="pressable mb-3 inline-flex h-11 items-center gap-1.5 text-support font-semibold text-primary">
          <ArrowLeft aria-hidden className="size-4" />{t('common.back')}
        </button>
      )}
      {error && <div className="mb-3"><Banner tone="warning">{error}</Banner></div>}
      {loading && <LoadingState title={t('changes.loading')} />}

      {!loading && view === 'menu' && (
        <div className="flex flex-col gap-5">
          {conflicts.length > 0 && (
            <ul><ActionRow icon={Store} tone="warning" title={t('changes.fixStore', { store: store.name })} hint={t('changes.fixStoreHint', { count: conflicts.length })} onClick={() => void run({ kind: 'fixStore', today })} /></ul>
          )}
          <section className="rounded-card border border-border p-3.5">
            <h3 className="mb-3 flex items-center gap-2 text-support font-semibold"><CalendarClock aria-hidden className="size-5 text-primary" />{t('changes.startTitle')}</h3>
            <label className="block"><span className="mb-1.5 block text-caption font-medium text-text-2">{t('changes.start')}</span>
              <input type="date" className={input} min={today} max={addDaysISO(today, 30)} value={start} onChange={e => setStart(e.target.value || today)} /></label>
            <div className="mt-3">
              <span className="mb-1.5 block text-caption font-medium text-text-2">{t('changes.days')}</span>
              <SegmentedControl label={t('changes.days')} value={days} onChange={setDays}
                options={['3', '5', '7'].map(n => ({ value: n, label: t('changes.daysN', { count: Number(n) }) }))} />
            </div>
            <Button className="mt-3" onClick={() => { onNewPlan(start, Number(days)); onOpenChange(false); }}>{t('changes.createNow', { date: f.inlineDate(start) })}</Button>
          </section>
          <ul className="flex flex-col gap-2.5">
            <ActionRow icon={RotateCcw} title={t('changes.restart')} hint={t('changes.restartHint')} onClick={() => void run({ kind: 'restart', today, seed: (stored.seed ?? 1) + 11 })} />
            <ActionRow icon={Ban} title={t('changes.exclude')} hint={t('changes.excludeHint')} onClick={() => setView('exclude')} />
          </ul>
        </div>
      )}

      {!loading && view === 'exclude' && (
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">{t('changes.excludeSearch')}</span>
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-2" />
            <input type="search" className={cn(input, 'pl-12')} placeholder={t('changes.excludeSearch')} value={q} onChange={e => setQ(e.target.value)} />
          </label>
          <ul className="divide-y divide-border rounded-card border border-border">
            {planFoods.map(food => (
              <li key={food.id}>
                <button type="button" className="pressable flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-support"
                  onClick={() => void run({ kind: 'exclude', today, foodId: food.id }, { excludedFoods: [...new Set([...settings.excludedFoods, food.id])] })}>
                  <span>{f.name(food.name)}</span><UtensilsCrossed aria-hidden className="size-4 text-text-2" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && view === 'preview' && preview && <ChangePreviewView preview={preview} onApply={() => void apply()} onCancel={reset} />}
    </BottomSheet>
  );
}

export const SwapIcon = Repeat2;
