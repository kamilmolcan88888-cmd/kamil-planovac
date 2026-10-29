import { Check, Minus, Plus, Search, X, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

/** Large selectable card (radio or checkbox semantics). */
export function OptionCard({ selected, onClick, title, hint, icon: Icon, multi, children }: {
  selected: boolean; onClick: () => void; title: string; hint?: string; icon?: LucideIcon; multi?: boolean; children?: ReactNode;
}) {
  return (
    <button type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={selected} onClick={onClick}
      className={cn('pressable flex w-full items-center gap-3 rounded-card border-2 p-4 text-left transition-colors',
        selected ? 'border-primary bg-success-bg' : 'border-border bg-surface')}>
      {Icon && (
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', selected ? 'bg-primary text-on-primary' : 'bg-surface-2 text-primary')}>
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">{title}</span>
        {hint && <span className="mt-0.5 block text-caption text-text-2">{hint}</span>}
        {children}
      </span>
      <span aria-hidden className={cn('flex size-6 shrink-0 items-center justify-center border-2', multi ? 'rounded-md' : 'rounded-full',
        selected ? 'border-primary bg-primary text-on-primary' : 'border-border')}>
        {selected && <Check className="size-3.5" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

/** − value + with a 44 px target on each side. */
export function Stepper({ label, value, onChange, min, max, step = 1, unit, format }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; format?: (v: number) => string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <div className="flex items-center justify-between gap-3 rounded-card bg-surface p-3 shadow-card">
      <span className="min-w-0 text-support font-medium">{label}</span>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <button type="button" aria-label={`${label} −`} disabled={value <= min} onClick={() => set(value - step)}
          className="pressable flex size-11 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"><Minus aria-hidden className="size-5" /></button>
        <output aria-live="polite" className="num min-w-[4.5rem] text-center text-card font-bold">{format ? format(value) : value}{unit && <span className="ml-1 text-caption font-medium text-text-2">{unit}</span>}</output>
        <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => set(value + step)}
          className="pressable flex size-11 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"><Plus aria-hidden className="size-5" /></button>
      </div>
    </div>
  );
}

/** Labelled numeric input (decimal comma accepted). */
export function NumberField({ label, value, onChange, unit, min, max, id }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; min?: number; max?: number; id?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [last, setLast] = useState(value);
  if (value !== last) { setLast(value); setText(value === undefined ? '' : String(value)); }
  const invalid = text !== '' && (Number.isNaN(Number(text.replace(',', '.'))) || (min !== undefined && Number(text.replace(',', '.')) < min) || (max !== undefined && Number(text.replace(',', '.')) > max));
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-support font-medium">{label}</span>
      <span className="relative block">
        <input id={id} inputMode="decimal" value={text} aria-invalid={invalid}
          onChange={e => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(',', '.'));
            const ok = e.target.value !== '' && !Number.isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max);
            // Only a valid number changes the parent's value. For a half-typed or empty field the
            // parent keeps its old value, so `last` must stay in step with it – otherwise the sync
            // above would overwrite what the user is typing.
            if (ok) setLast(n);
            onChange(ok ? n : undefined);
          }}
          className={cn('num h-12 w-full rounded-input border bg-surface px-4 pr-14 text-body text-text outline-none focus:border-primary', invalid ? 'border-error' : 'border-border')} />
        {unit && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-support text-text-2">{unit}</span>}
      </span>
    </label>
  );
}

/** Multi-select chips. */
export function ChipToggle<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" role="checkbox" aria-checked={on}
            onClick={() => onChange(on ? value.filter(v => v !== o.value) : [...value, o.value])}
            className={cn('pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-support font-semibold',
              on ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-text')}>
            {on && <Check aria-hidden className="size-4" strokeWidth={3} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Searchable list with selected chips on top. */
export function SearchPicker({ items, value, onChange, placeholder, label, disabledIds }: {
  items: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder: string; label: string; disabledIds?: Set<string>;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const nq = norm(q.trim());
  const shown = nq ? items.filter(i => norm(i.label).includes(nq)).slice(0, 30) : [];
  const byId = new Map(items.map(i => [i.id, i]));
  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {value.map(id => (
            <li key={id}>
              <button type="button" onClick={() => onChange(value.filter(v => v !== id))} aria-label={`${byId.get(id)?.label ?? id} ×`}
                className="pressable inline-flex min-h-9 items-center gap-1 rounded-full bg-primary px-3 text-caption font-semibold text-on-primary">
                {byId.get(id)?.label ?? id}<X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="relative block">
        <span className="sr-only">{placeholder}</span>
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-2" />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
          className="h-12 w-full rounded-input border border-border bg-surface pl-12 pr-4 text-body text-text outline-none placeholder:text-text-2 focus:border-primary" />
      </label>
      {shown.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface shadow-card">
          {shown.map(i => {
            const on = value.includes(i.id);
            const dis = disabledIds?.has(i.id);
            return (
              <li key={i.id}>
                <button type="button" role="checkbox" aria-checked={on} disabled={dis}
                  onClick={() => onChange(on ? value.filter(v => v !== i.id) : [...value, i.id])}
                  className="pressable flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-support disabled:opacity-40">
                  {i.label}{on && <Check aria-hidden className="size-4 text-primary" strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-caption text-text-2">{t('onboarding.selected', { count: value.length })}</p>
    </div>
  );
}

export function StepHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-title font-bold tracking-tight">{title}</h1>
      {hint && <p className="mt-2 text-support text-text-2">{hint}</p>}
    </div>
  );
}
