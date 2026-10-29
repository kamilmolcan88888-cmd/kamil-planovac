import { ArrowLeft, Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { bands, computeTargets } from '../../engine/targets';
import type { AppSettings } from '../../state/db';
import { AppHeader } from '../components/AppShell';
import { Banner, Card, IconButton } from '../components/primitives';
import { useFormat } from '../lib/format';

/** Every step of the target calculation with the numbers filled in. */
export function TargetsBreakdown({ settings }: { settings: Pick<AppSettings, 'profile' | 'targetsOverride'> }) {
  const { t } = useTranslation();
  const f = useFormat();
  const r = computeTargets(settings.profile);
  const final = settings.targetsOverride ? bands(settings.targetsOverride.kcal, settings.targetsOverride.protein) : r;
  // Formulas use "." internally; show them with the locale's decimal separator.
  const loc = (s: string) => s.replace(/(\d)\.(\d)/g, f.locale.startsWith('en') ? '$1.$2' : '$1,$2');
  return (
    <section aria-labelledby="calc-title">
      <h2 id="calc-title" className="mb-1 flex items-center gap-2 text-card font-semibold"><Calculator aria-hidden className="size-5 text-primary" />{t('targets.title')}</h2>
      <p className="mb-3 text-caption text-text-2">{t('targets.intro')}</p>
      <ol className="flex flex-col gap-2">
        {r.steps.map((s, i) => (
          <li key={s.key} className="flex gap-3 rounded-2xl bg-surface p-3 shadow-card">
            <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-caption font-bold text-primary">{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-support font-medium">{t(s.key)}</span>
              <span className="num mt-0.5 block break-words text-caption text-text-2">{loc(s.formula)}{s.unit === 'kcal' ? ` ${t('unit.kcal')}` : s.unit === 'g' ? ` ${t('unit.g')}` : ''}</span>
            </span>
          </li>
        ))}
      </ol>
      {settings.targetsOverride && <div className="mt-3"><Banner tone="info">{t('targets.manual')}</Banner></div>}
      <Card className="num mt-3 text-support">
        <p className="font-semibold">{t('targets.bands')}</p>
        <p className="mt-1 text-text-2">{t('onboarding.bandKcal', { lo: final.kcalBand[0], hi: final.kcalBand[1] })}</p>
        <p className="text-text-2">{t('onboarding.bandProtein', { lo: final.proteinBand[0], hi: final.proteinBand[1] })}</p>
      </Card>
    </section>
  );
}

export function TargetsScreen({ settings, onBack }: { settings: AppSettings; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="pt-2"><IconButton icon={ArrowLeft} label={t('common.back')} onClick={onBack} /></div>
      <AppHeader title={t('settings.goals')} />
      <TargetsBreakdown settings={settings} />
    </>
  );
}
