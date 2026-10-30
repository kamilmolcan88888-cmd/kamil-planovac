import { Delete } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

/** Dots + 3×4 keypad. Calls onComplete(pin) as soon as `length` digits are entered, then clears. */
export function PinPad({ length, onComplete, disabled, error }: { length: number; onComplete: (pin: string) => void; disabled?: boolean; error?: boolean }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  useEffect(() => { if (error) setPin(''); }, [error]);

  const push = (d: string) => {
    if (disabled) return;
    const next = pin + d;
    if (next.length >= length) { setPin(''); onComplete(next); } else setPin(next);
  };
  const key = 'pressable flex size-[72px] items-center justify-center rounded-full bg-surface-2 text-title font-semibold disabled:opacity-40';
  return (
    <div className="flex flex-col items-center gap-8">
      <div role="img" aria-label={t('lock.entered', { count: pin.length, total: length })} className="flex gap-4">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cn('size-3.5 rounded-full border-2', i < pin.length ? 'border-primary bg-primary' : error ? 'border-error' : 'border-border')} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} type="button" className={key} disabled={disabled} onClick={() => push(d)}>{d}</button>)}
        <span aria-hidden />
        <button type="button" className={key} disabled={disabled} onClick={() => push('0')}>0</button>
        <button type="button" className={cn(key, 'bg-transparent')} disabled={disabled || pin.length === 0} onClick={() => setPin(p => p.slice(0, -1))} aria-label={t('lock.delete')}>
          <Delete aria-hidden className="size-6" />
        </button>
      </div>
    </div>
  );
}
