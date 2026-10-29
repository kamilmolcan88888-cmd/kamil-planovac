import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/cn';

/**
 * Circular progress. Colour is never the only signal: the value, target and a status text
 * are always rendered next to it (by the caller) and announced via aria-label.
 */
export function MacroRing({ value, target, tone, label, ariaLabel, unit, size = 132, stroke = 12 }: {
  value: number; target: number; tone: 'kcal' | 'protein'; label: string; ariaLabel: string; unit: string; size?: number; stroke?: number;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const color = tone === 'kcal' ? 'var(--c-kcal)' : 'var(--c-protein)';

  return (
    <div role="img" aria-label={ariaLabel} className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-ring-track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: reduce ? 0 : 0.65, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cn('num text-[28px] font-bold leading-none tracking-tight')}>{Math.round(value)}</span>
        <span className="num mt-1 text-caption text-text-2">/ {Math.round(target)} {unit}</span>
        <span className="mt-0.5 text-caption font-medium text-text-2">{label}</span>
      </div>
    </div>
  );
}
