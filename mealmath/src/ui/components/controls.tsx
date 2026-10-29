import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import { cn } from '../lib/cn';

/** iOS-style segmented control (radiogroup). */
export function SegmentedControl<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-surface-2 p-1">
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cn('pressable relative h-10 min-w-0 flex-1 rounded-xl px-2 text-support font-semibold', on ? 'text-text' : 'text-text-2')}>
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-xl bg-surface shadow-card" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className="relative truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Accessible on/off switch. */
export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="pressable flex min-h-11 w-full items-center justify-between gap-3 text-left">
      <span className="min-w-0">
        <span className="block text-support font-medium">{label}</span>
        {description && <span className="block text-caption text-text-2">{description}</span>}
      </span>
      <span aria-hidden className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border')}>
        <span className={cn('absolute top-0.5 size-6 rounded-full bg-surface shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

export type BandState = 'in' | 'low' | 'high';
export const bandState = (v: number, lo: number, hi: number): BandState => (v < lo - 0.5 ? 'low' : v > hi + 0.5 ? 'high' : 'in');

/**
 * Horizontal bar with the target band shaded and the day's value as a fill.
 * The state is also given as an icon and text (never colour alone).
 */
export function MacroProgress({ value, low, high, tone, valueText, stateText, bandText }: {
  value: number; low: number; high: number; tone: 'kcal' | 'protein' | 'cost'; valueText: string; stateText: string; bandText?: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(high * 1.15, value * 1.02, 1);
  const st = bandState(value, low, high);
  const fill = tone === 'protein' ? 'bg-protein' : tone === 'kcal' ? 'bg-kcal' : 'bg-text-2';
  const Icon = st === 'in' ? Check : st === 'low' ? ArrowDown : ArrowUp;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="num text-body font-semibold">{valueText}</span>
        <span className={cn('inline-flex items-center gap-1 text-caption font-semibold', st === 'in' ? 'text-primary' : 'text-warning')}>
          <Icon aria-hidden className="size-3.5" strokeWidth={3} />{stateText}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-ring-track" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-[color-mix(in_oklab,var(--c-primary)_22%,transparent)]"
          style={{ left: `${(low / max) * 100}%`, width: `${Math.max(((high - low) / max) * 100, 1.5)}%` }} />
        <motion.div className={cn('absolute inset-y-0 left-0 rounded-full', fill)}
          initial={{ width: reduce ? `${(value / max) * 100}%` : 0 }} animate={{ width: `${Math.min((value / max) * 100, 100)}%` }}
          transition={{ duration: reduce ? 0 : 0.5, ease: [0.2, 0.8, 0.2, 1] }} />
      </div>
      {bandText && <p className="num mt-1 text-caption text-text-2">{bandText}</p>}
    </div>
  );
}
