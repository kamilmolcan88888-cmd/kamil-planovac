import { ArrowLeft, Scale, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STORES } from '../../data/stores';
import { paceFor, weightTrend, type WeightEntry } from '../../engine/progress';
import { localISO } from '../../state/dates';
import type { AppSettings } from '../../state/db';
import { deleteWeight, saveWeight, updateSettings, usePlanHistory, useWeights } from '../../state/store';
import { AppHeader } from '../components/AppShell';
import { NumberField } from '../components/forms';
import { Banner, Card, IconButton, PrimaryButton, SecondaryButton } from '../components/primitives';
import { useFormat } from '../lib/format';

/** Simple line chart of the last entries. The text summary next to it carries the same information. */
function WeightChart({ entries, label }: { entries: WeightEntry[]; label: string }) {
  if (entries.length < 2) return null;
  const W = 320, H = 120, P = 10;
  const kgs = entries.map(e => e.kg), lo = Math.min(...kgs), hi = Math.max(...kgs), span = Math.max(hi - lo, 1);
  const t0 = Date.parse(entries[0]!.date), t1 = Date.parse(entries[entries.length - 1]!.date), dt = Math.max(t1 - t0, 1);
  const pts = entries.map(e => [P + ((Date.parse(e.date) - t0) / dt) * (W - 2 * P), H - P - ((e.kg - lo) / span) * (H - 2 * P)] as const);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="h-32 w-full text-primary">
      <polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={pts.map(p => p.join(',')).join(' ')} />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="currentColor" />)}
    </svg>
  );
}

export function ProgressScreen({ settings, onBack }: { settings: AppSettings; onBack: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const weights = useWeights() ?? [];
  const plans = usePlanHistory() ?? [];
  const [date, setDate] = useState(localISO());
  const [kg, setKg] = useState<number | undefined>(settings.profile.weightKg);
  const [err, setErr] = useState(false);

  const trend = weightTrend(weights);
  const pace = paceFor(settings.profile.goal, trend);
  const recent = weights.slice(-30);
  const last = weights[weights.length - 1];
  const profileDiffers = last && Math.abs(last.kg - settings.profile.weightKg) >= 0.5;

  const save = async () => {
    if (kg === undefined || !date) { setErr(true); return; }
    setErr(false);
    await saveWeight({ date, kg });
  };

  return (
    <div className="flex flex-col gap-5">
      <AppHeader title={t('progress.title')} actions={<IconButton icon={ArrowLeft} label={t('common.back')} onClick={onBack} />} />

      <section aria-labelledby="weight-title" className="flex flex-col gap-3">
        <h2 id="weight-title" className="flex items-center gap-2 text-card font-semibold"><Scale aria-hidden className="size-5 text-primary" />{t('progress.weight')}</h2>
        <Card className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t('onboarding.weight')} unit={t('onboarding.kg')} value={kg} min={35} max={250} onChange={setKg} />
            <label className="block">
              <span className="mb-1.5 block text-support font-medium">{t('progress.date')}</span>
              <input type="date" value={date} max={localISO()} onChange={e => setDate(e.target.value)}
                className="h-12 w-full rounded-input border border-border bg-surface px-3 text-body text-text outline-none focus:border-primary" />
            </label>
          </div>
          {err && <p role="alert" className="text-support text-error">{t('progress.invalid')}</p>}
          <PrimaryButton size="md" className="w-full" onClick={() => void save()}>{t('progress.save')}</PrimaryButton>
        </Card>

        {trend && (
          <Card className="flex flex-col gap-2">
            <p className="num text-support">
              {t('progress.summary', { from: f.dec1(trend.first.kg), to: f.dec1(trend.last.kg), change: `${trend.changeKg > 0 ? '+' : ''}${f.dec1(trend.changeKg)}` })}
              {trend.perWeekKg !== undefined && <> · {t('progress.perWeek', { value: `${trend.perWeekKg > 0 ? '+' : ''}${f.dec1(trend.perWeekKg)}` })}</>}
            </p>
            <WeightChart entries={recent} label={t('progress.chartLabel', { count: recent.length })} />
            <Banner tone={pace === 'on_track' ? 'info' : 'warning'}>{t(`progress.pace.${pace}`)}</Banner>
          </Card>
        )}

        {profileDiffers && (
          <Banner tone="info">
            {t('progress.useInProfile', { kg: f.dec1(last.kg) })}
            <div className="mt-2">
              <SecondaryButton size="md" onClick={() => void updateSettings({ profile: { ...settings.profile, weightKg: last.kg }, planStale: true })}>{t('progress.apply')}</SecondaryButton>
            </div>
          </Banner>
        )}

        {weights.length > 0 && (
          <Card className="p-0"><ul className="divide-y divide-border">
            {[...weights].reverse().slice(0, 20).map(w => (
              <li key={w.date} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-support">{f.shortDate(w.date)}</span>
                <span className="num flex items-center gap-2 text-support font-semibold">
                  {f.dec1(w.kg)} {t('onboarding.kg')}
                  <button type="button" onClick={() => void deleteWeight(w.date)} aria-label={t('progress.delete', { date: f.shortDate(w.date) })}
                    className="pressable inline-flex size-10 items-center justify-center rounded-full text-error"><Trash2 aria-hidden className="size-[18px]" /></button>
                </span>
              </li>
            ))}
          </ul></Card>
        )}
        {weights.length === 0 && <p className="text-support text-text-2">{t('progress.empty')}</p>}
      </section>

      <section aria-labelledby="cost-title" className="flex flex-col gap-3">
        <h2 id="cost-title" className="flex items-center gap-2 text-card font-semibold"><Wallet aria-hidden className="size-5 text-primary" />{t('progress.costs')}</h2>
        {plans.length === 0 ? <p className="text-support text-text-2">{t('progress.noPlans')}</p> : (
          <Card className="p-0"><ul className="divide-y divide-border">
            {plans.map(p => {
              const days = Math.max(p.plan.days.length, 1);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-support font-semibold">{f.shortDate(p.startDate)} · {t('progress.days', { count: days })}</span>
                    <span className="block truncate text-caption text-text-2">{STORES.find(s => s.id === p.storeId)?.name ?? p.storeId}</span>
                  </span>
                  <span className="num text-right">
                    <span className="block text-support font-semibold">{f.eur(p.foodCost)}</span>
                    <span className="block text-caption text-text-2">{t('progress.perDay', { value: f.eur(p.foodCost / days) })}</span>
                  </span>
                </li>
              );
            })}
          </ul></Card>
        )}
        <p className="text-caption text-text-2">{t('prices.disclaimer')}</p>
      </section>
    </div>
  );
}
