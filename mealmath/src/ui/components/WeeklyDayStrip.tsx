import { Check, Minus, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DayStatus } from '../viewmodel/home';
import { cn } from '../lib/cn';
import { useFormat } from '../lib/format';

const STYLE: Record<DayStatus, { cls: string; Icon: typeof Check }> = {
  verified: { cls: 'bg-primary text-on-primary', Icon: Check },
  outside: { cls: 'bg-warning-bg text-warning', Icon: TriangleAlert },
  incomplete: { cls: 'bg-error-bg text-error', Icon: X },
  none: { cls: 'bg-surface-2 text-text-2', Icon: Minus },
};

/** Seven days with their validator status. Each status has an icon and a text label, not colour alone. */
export function WeeklyDayStrip({ days, today, onSelect }: { days: { date: string; status: DayStatus }[]; today: string; onSelect?: (date: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label={t('dayStatus.legend')}>
      {days.map(d => {
        const { cls, Icon } = STYLE[d.status];
        const isToday = d.date === today;
        const label = `${f.longDate(d.date)}: ${t(`dayStatus.${d.status}`)}`;
        return (
          <li key={d.date}>
            <button type="button" onClick={() => onSelect?.(d.date)} aria-label={label} aria-current={isToday ? 'date' : undefined}
              className={cn('pressable flex w-full flex-col items-center gap-1.5 rounded-2xl py-2', isToday && 'bg-surface-2')}>
              <span className={cn('text-caption font-medium capitalize', isToday ? 'text-text' : 'text-text-2')}>{f.weekdayShort(d.date)}</span>
              <span className={cn('flex size-8 items-center justify-center rounded-full', cls)}>
                <Icon aria-hidden className="size-4" strokeWidth={2.6} />
              </span>
              <span className={cn('num text-caption', isToday ? 'font-bold text-text' : 'text-text-2')}>{f.dayOfMonth(d.date)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function DayStatusLegend() {
  const { t } = useTranslation();
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-text-2">
      {(['verified', 'outside', 'incomplete', 'none'] as const).map(s => {
        const { cls, Icon } = STYLE[s];
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn('flex size-4 items-center justify-center rounded-full', cls)}><Icon aria-hidden className="size-2.5" strokeWidth={3} /></span>
            {t(`dayStatus.${s}`)}
          </li>
        );
      })}
    </ul>
  );
}
