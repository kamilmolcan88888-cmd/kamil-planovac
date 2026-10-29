import { Ban, Download, Pencil, RotateCcw, Search, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOOD_MAP, FOODS } from '../../data/catalog';
import { PRICE_TABLES, STORES } from '../../data/stores';
import { exportPriceTable, importPriceTable, pricePerKg, type PriceBook } from '../../engine/pricing';
import { AISLES, type Aisle, type Food } from '../../engine/types';
import type { AppSettings } from '../../state/db';
import { localISO } from '../../state/dates';
import { resetOverride, saveOverride, saveOverrides, updateSettings, usePriceOverrides } from '../../state/store';
import { bookFor } from '../../workers/requestBase';
import { AppHeader } from '../components/AppShell';
import { BottomSheet } from '../components/BottomSheet';
import { Banner, Card, Chip, PrimaryButton, SecondaryButton } from '../components/primitives';
import { StoreSelector } from '../components/StoreSelector';
import { cn } from '../lib/cn';
import { isLiquid, useFormat } from '../lib/format';

export function PricesScreen({ settings }: { settings: AppSettings }) {
  const { t } = useTranslation();
  const f = useFormat();
  const overrides = usePriceOverrides(settings.storeId) ?? [];
  const book = useMemo(() => bookFor(settings.storeId, overrides), [settings.storeId, overrides]);
  const store = STORES.find(s => s.id === settings.storeId) ?? STORES[0]!;
  const [q, setQ] = useState('');
  const [aisle, setAisle] = useState<Aisle | 'all'>('all');
  const [editing, setEditing] = useState<Food>();
  const [note, setNote] = useState<{ tone: 'info' | 'warning'; text: string }>();
  const fileRef = useRef<HTMLInputElement>(null);

  const nameOf = (food: Food) => {
    const p = book.get(food.id);
    return settings.preferStoreLang && p.available ? p.name : f.name(food.name);
  };
  const norm = (s: string) => s.toLocaleLowerCase(f.locale).normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const items = useMemo(() => {
    const nq = norm(q.trim());
    return FOODS.filter(food => (aisle === 'all' || food.aisle === aisle) && (!nq ||
      [food.name.sk, food.name.de, food.name.en, book.get(food.id).available ? (book.get(food.id) as { name: string }).name : ''].some(n => n && norm(n).includes(nq))))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), f.locale));
  }, [q, aisle, book, settings.preferStoreLang, f.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const doExport = async () => {
    const data = JSON.stringify(exportPriceTable(book, localISO()), null, 1);
    const name = `mealmath-prices-${store.id}-${localISO()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch { return; }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = async (file: File) => {
    try {
      const r = importPriceTable(JSON.parse(await file.text()), PRICE_TABLES, FOOD_MAP, localISO());
      if (!r.storeId || r.errors.some(e => e === 'invalid_file' || e.startsWith('unknown_store'))) { setNote({ tone: 'warning', text: t('prices.importFailed') }); return; }
      await saveOverrides(r.overrides);
      const parts = [t('prices.imported', { count: r.overrides.length })];
      if (r.errors.length) parts.push(t('prices.importErrors', { count: r.errors.length }));
      if (r.storeId !== settings.storeId) parts.push(t('prices.importOtherStore', { store: PRICE_TABLES.get(r.storeId)!.store.name }));
      setNote({ tone: r.errors.length ? 'warning' : 'info', text: parts.join(' ') });
    } catch {
      setNote({ tone: 'warning', text: t('prices.importFailed') });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <AppHeader title={t('prices.title')} />
      <div className="-mt-3"><StoreSelector storeId={settings.storeId} onChange={id => void updateSettings({ storeId: id })} /></div>
      <Banner tone="info">{t('prices.disclaimer')}</Banner>

      <div className="grid grid-cols-2 gap-2.5">
        <SecondaryButton size="md" icon={Download} onClick={() => void doExport()}>{t('prices.export')}</SecondaryButton>
        <SecondaryButton size="md" icon={Upload} onClick={() => fileRef.current?.click()}>{t('prices.import')}</SecondaryButton>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden
          onChange={e => { const file = e.target.files?.[0]; if (file) void doImport(file); e.target.value = ''; }} />
      </div>
      {note && <div role="status"><Banner tone={note.tone}>{note.text}</Banner></div>}

      <label className="relative block">
        <span className="sr-only">{t('prices.search')}</span>
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-2" />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('prices.search')}
          className="h-12 w-full rounded-input border border-border bg-surface pl-12 pr-4 text-body text-text outline-none placeholder:text-text-2 focus:border-primary" />
      </label>

      <div className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none]" role="radiogroup" aria-label={t('prices.title')}>
        <div className="flex w-max gap-2">
          {(['all', ...AISLES] as const).map(a => (
            <button key={a} type="button" role="radio" aria-checked={aisle === a} onClick={() => setAisle(a)}
              className={cn('pressable h-9 shrink-0 rounded-full px-3.5 text-caption font-semibold', aisle === a ? 'bg-primary text-on-primary' : 'bg-surface text-text-2 shadow-card')}>
              {a === 'all' ? t('prices.all') : t(`aisle.${a}`)}
            </button>
          ))}
        </div>
      </div>

      <p className="num text-caption text-text-2">{t('prices.count', { shown: items.length, total: FOODS.length })}</p>

      {items.length === 0 ? <p className="py-8 text-center text-support text-text-2">{t('prices.resultsNone')}</p> : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {items.map(food => <PriceRow key={food.id} food={food} book={book} name={nameOf(food)} onEdit={() => setEditing(food)} />)}
          </ul>
        </Card>
      )}

      <PriceEditor food={editing} book={book} storeId={settings.storeId} onClose={() => setEditing(undefined)} name={editing ? nameOf(editing) : ''} />
    </div>
  );
}

function PriceRow({ food, book, name, onEdit }: { food: Food; book: PriceBook; name: string; onEdit: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const p = book.get(food.id);
  const custom = book.hasOverride(food.id);
  return (
    <li>
      <button type="button" onClick={onEdit} aria-label={t('prices.edit', { name })} className="pressable flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-body font-semibold">{name}</span>
            {custom && <Chip className="shrink-0 bg-success-bg px-2 py-0.5 text-primary"><Pencil aria-hidden className="size-3" />{t('prices.custom')}</Chip>}
          </span>
          {p.available ? (
            <span className="num mt-0.5 block text-caption text-text-2">
              {f.amount(p.packG, food)} · {t(isLiquid(food) ? 'prices.perL' : 'prices.perKg', { price: f.eur(pricePerKg(p)) })} · {t('prices.updated', { date: f.shortDate(p.updated) })}
            </span>
          ) : (
            <span className="mt-0.5 flex items-center gap-1 text-caption font-medium text-warning"><Ban aria-hidden className="size-3.5" />{t('prices.unavailable')}</span>
          )}
        </span>
        <span className="num shrink-0 text-right">
          {p.available ? <><span className="block text-body font-semibold">{f.eur(p.price)}</span><span className="block text-[11px] font-semibold uppercase text-text-2">{t('store.estimate')}</span></> : <span className="text-text-2">—</span>}
        </span>
      </button>
    </li>
  );
}

function PriceEditor({ food, book, storeId, name, onClose }: { food?: Food; book: PriceBook; storeId: string; name: string; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const p = food ? book.get(food.id) : undefined;
  const base = food ? PRICE_TABLES.get(storeId)!.items[food.id] : undefined;
  const [price, setPrice] = useState('');
  const [pack, setPack] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState(false);
  const [openFor, setOpenFor] = useState<string>();

  // Reset the form whenever a new item is opened.
  if (food && openFor !== food.id) {
    setOpenFor(food.id);
    setErr(false);
    setPrice(p?.available ? String(p.price).replace('.', f.locale.startsWith('en') ? '.' : ',') : '');
    setPack(p?.available ? String(p.packG) : '');
    setLabel(p?.available ? p.name : f.name(food.name));
  }

  const parse = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
  const save = async () => {
    const pr = parse(price), pk = parse(pack);
    if (!food || !(pr > 0 && pr < 1000) || !(pk > 0 && pk < 100000)) { setErr(true); return; }
    await saveOverride({ storeId, foodId: food.id, price: Math.round(pr * 100) / 100, packG: Math.round(pk), name: label.trim() || undefined, updated: localISO() });
    onClose();
  };
  const reset = async () => { if (food) await resetOverride(storeId, food.id); onClose(); };

  const input = 'h-12 w-full rounded-input border border-border bg-surface-2 px-4 text-body text-text outline-none focus:border-primary';
  return (
    <BottomSheet open={!!food} onOpenChange={o => { if (!o) { setOpenFor(undefined); onClose(); } }} title={t('prices.editTitle')} description={name}>
      {food && (
        <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void save(); }}>
          {base && 'unavailable' in base && !book.hasOverride(food.id) && <Banner tone="warning">{t('prices.notSold')}</Banner>}
          <label className="block">
            <span className="mb-1.5 block text-support font-medium">{t('prices.price')}</span>
            <input className={cn(input, 'num')} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} aria-invalid={err} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-support font-medium">{t('prices.pack')}</span>
            <input className={cn(input, 'num')} inputMode="numeric" value={pack} onChange={e => setPack(e.target.value)} aria-invalid={err} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-support font-medium">{t('prices.name')}</span>
            <input className={input} value={label} onChange={e => setLabel(e.target.value)} />
          </label>
          {err && <p role="alert" className="text-support text-error">{t('prices.invalid')}</p>}
          {base && !('unavailable' in base) && (
            <p className="num text-caption text-text-2">{t('prices.defaultWas', { price: f.eur(base.price), size: f.amount(base.packG, food) })} · {t('store.estimate')}</p>
          )}
          <PrimaryButton type="submit">{t('prices.save')}</PrimaryButton>
          {book.hasOverride(food.id) && <SecondaryButton icon={RotateCcw} onClick={() => void reset()}>{t('prices.reset')}</SecondaryButton>}
        </form>
      )}
    </BottomSheet>
  );
}
