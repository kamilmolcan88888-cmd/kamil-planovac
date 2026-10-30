import { Activity, ShieldAlert as AllergenIcon, Ban, BookOpen, Calculator, ChefHat, ChevronRight, CookingPot, Database, Download, Globe, Info, Lock, Moon, RefreshCw, Ruler, Salad, Sparkles, Store, Tag, Target, TrendingDown, Upload, Users, Wallet, WifiOff, type LucideIcon } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { FOODS_GENERATED_AT, FOODS_SOURCE } from '../../data/catalog';
import { STORES } from '../../data/stores';
import { LANGS } from '../../i18n';
import type { Lang } from '../../engine/types';
import { importAll, saveBackupFile } from '../../state/backup';
import type { AppSettings, Theme } from '../../state/db';
import { updateSettings, usePriceOverrides } from '../../state/store';
import { targetsFor } from '../../workers/requestBase';
import { AppHeader } from '../components/AppShell';
import { BottomSheet } from '../components/BottomSheet';
import { SegmentedControl, Switch } from '../components/controls';
import { Banner, Card, PrimaryButton, SecondaryButton } from '../components/primitives';
import { StoreSelector } from '../components/StoreSelector';
import { PinSettings } from '../components/PinSettings';
import { AiRecipesPanel } from '../components/aiRecipes';
import { cn } from '../lib/cn';
import { useFormat } from '../lib/format';
import {
  ActivityStep, AllergyStep, BatchStep, BodyStep, BudgetStep, DietStep, EquipmentStep, FoodsStep, GoalStep, HouseholdStep, MealsStep, TargetsStep, type StepProps,
} from '../onboarding/steps';

type Editor = { title: string; render: React.ComponentType<StepProps>; affectsPlan: boolean };

function Row({ icon: Icon, label, value, onClick }: { icon: LucideIcon; label: string; value?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="pressable flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary"><Icon aria-hidden className="size-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-support font-semibold">{label}</span>
          {value && <span className="num block truncate text-caption text-text-2">{value}</span>}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-2" />
      </button>
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 px-1 text-caption font-semibold uppercase tracking-wide text-text-2">{title}</h2>
      <Card className="p-0"><ul className="divide-y divide-border">{children}</ul></Card>
    </section>
  );
}

export function SettingsScreen({ settings, onOpenTargets, onOpenProgress, onOpenPrices, onRegenerate, onRedoOnboarding }: {
  settings: AppSettings; onOpenTargets: () => void; onOpenProgress: () => void; onOpenPrices: () => void; onRegenerate: () => void; onRedoOnboarding: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const overrides = usePriceOverrides(settings.storeId) ?? [];
  const [editor, setEditor] = useState<Editor>();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [note, setNote] = useState<{ tone: 'info' | 'warning'; text: string }>();
  const [info, setInfo] = useState<'methodology' | 'usda' | 'prices' | 'offline'>();
  const [ai, setAi] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tg = targetsFor(settings);
  const p = settings.profile;

  const open = (e: Editor) => { setDraft(settings); setEditor(e); };
  const save = async () => {
    if (!editor) return;
    const { key: _k, ...rest } = draft;
    await updateSettings({ ...rest, ...(editor.affectsPlan ? { planStale: true } : {}) });
    setEditor(undefined);
  };

  const doExport = () => void saveBackupFile();
  const doImport = async (file: File) => {
    if (!window.confirm(t('settings.importConfirm'))) return;
    try { await importAll(JSON.parse(await file.text())); setNote({ tone: 'info', text: t('settings.imported') }); }
    catch { setNote({ tone: 'warning', text: t('settings.importFailed') }); }
  };

  const slotsText = settings.slots.map(s => t(`slot.${s}`)).join(', ');
  const E = (title: string, render: Editor['render'], affectsPlan = true): Editor => ({ title, render, affectsPlan });

  return (
    <div className="flex flex-col gap-6">
      <AppHeader title={t('settings.title')} />

      {settings.planStale && (
        <Banner tone="warning">
          {t('settings.stale')}
          <div className="mt-2"><SecondaryButton size="md" icon={RefreshCw} onClick={onRegenerate}>{t('settings.regenerate')}</SecondaryButton></div>
        </Banner>
      )}
      {settings.profileIsDemo && <Banner tone="info"><strong>{t('demo.title')}.</strong> {t('demo.text')}</Banner>}

      <Section title={t('settings.personal')}>
        <Row icon={Target} label={t('settings.goals')} value={t('settings.goalsValue', { kcal: f.int(tg.kcal), protein: tg.protein })} onClick={() => open(E(t('settings.goals'), p2 => <><GoalStep {...p2} /><div className="mt-6"><TargetsStep {...p2} /></div></>))} />
        <Row icon={Calculator} label={t('targets.title')} onClick={onOpenTargets} />
        <Row icon={TrendingDown} label={t('progress.row')} onClick={onOpenProgress} />
        <Row icon={Ruler} label={t('settings.body')} value={`${t(`onboarding.${p.sex}`)}, ${p.age} ${t('onboarding.years')}, ${p.heightCm} cm, ${f.dec1(p.weightKg)} kg`} onClick={() => open(E(t('settings.body'), BodyStep))} />
        <Row icon={Activity} label={t('settings.activity')} value={`${p.workoutsPerWeek} ×`} onClick={() => open(E(t('settings.activity'), ActivityStep))} />
        <Row icon={Users} label={t('settings.household')} value={t('shopping.household', { adults: settings.household.adults, kids: settings.household.kids })} onClick={() => open(E(t('settings.household'), HouseholdStep))} />
        <Row icon={ChefHat} label={t('settings.meals')} value={`${slotsText} · ${t(`onboarding.batch.${settings.repetition}`)}`} onClick={() => open(E(t('settings.meals'), p2 => <><MealsStep {...p2} /><div className="mt-6"><BatchStep {...p2} /></div></>))} />
      </Section>

      <Section title={t('settings.food')}>
        <Row icon={Salad} label={t('settings.diet')} value={settings.diets.length ? settings.diets.map(d => t(`recipe.diet.${d}`)).join(', ') : t('onboarding.dietNone')} onClick={() => open(E(t('settings.diet'), DietStep))} />
        <Row icon={AllergenIcon} label={t('settings.allergies')} value={settings.allergens.length ? settings.allergens.map(a => t(`allergen.${a}`)).join(', ') : t('settings.none')} onClick={() => open(E(t('settings.allergies'), AllergyStep))} />
        <Row icon={Ban} label={t('settings.foods')} value={`${t('onboarding.favorites')}: ${settings.favoriteFoods.length} · ${t('onboarding.excluded')}: ${settings.excludedFoods.length}`} onClick={() => open(E(t('settings.foods'), FoodsStep))} />
        <Row icon={CookingPot} label={t('settings.equipment')} value={settings.equipment.map(e => t(`equipment.${e}`)).join(', ')} onClick={() => open(E(t('settings.equipment'), EquipmentStep))} />
        <Row icon={Sparkles} label={t('ai.row')} value={settings.aiEnabled ? t('ai.on', { count: settings.customRecipes?.length ?? 0 }) : t('ai.off')} onClick={() => setAi(true)} />
      </Section>

      <section aria-label={t('settings.shopping')}>
        <h2 className="mb-2 px-1 text-caption font-semibold uppercase tracking-wide text-text-2">{t('settings.shopping')}</h2>
        <div className="mb-2.5"><StoreSelector storeId={settings.storeId} onChange={id => void updateSettings({ storeId: id })} /></div>
        <Card className="p-0">
          <ul className="divide-y divide-border">
            <Row icon={Wallet} label={t('settings.budget')} value={settings.budget !== undefined ? f.eur(settings.budget) : t('onboarding.noBudget')} onClick={() => open(E(t('settings.budget'), BudgetStep))} />
            <Row icon={Tag} label={t('settings.prices')} value={t('settings.pricesValue', { count: overrides.length })} onClick={onOpenPrices} />
          </ul>
          <div className="border-t border-border px-4 py-1.5">
            <Switch checked={settings.preferStoreLang} onChange={v => void updateSettings({ preferStoreLang: v })} label={t('settings.storeLang')}
              description={STORES.find(s => s.id === settings.storeId)?.name} />
          </div>
        </Card>
      </section>

      <section aria-label={t('settings.app')} className="flex flex-col gap-3">
        <h2 className="px-1 text-caption font-semibold uppercase tracking-wide text-text-2">{t('settings.app')}</h2>
        <Card className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-support font-semibold"><Globe aria-hidden className="size-[18px] text-primary" />{t('settings.language')}</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.language')}>
            {LANGS.map(l => (
              <button key={l.id} type="button" role="radio" aria-checked={settings.lang === l.id} onClick={() => void updateSettings({ lang: l.id as Lang })}
                className={cn('pressable h-11 rounded-xl border-2 text-support font-semibold', settings.lang === l.id ? 'border-primary bg-success-bg' : 'border-border')}>{l.label}</button>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-2 text-support font-semibold"><Moon aria-hidden className="size-[18px] text-primary" />{t('settings.theme')}</p>
          <SegmentedControl<Theme> label={t('settings.theme')} value={settings.theme} onChange={v => void updateSettings({ theme: v })}
            options={(['auto', 'light', 'dark'] as const).map(v => ({ value: v, label: t(`settings.themes.${v}`) }))} />
        </Card>
        <Card className="flex flex-col gap-2.5">
          <p className="flex items-center gap-2 text-support font-semibold"><Database aria-hidden className="size-[18px] text-primary" />{t('settings.dataTitle')}</p>
          <div className="flex flex-col gap-2.5">
            <SecondaryButton size="md" icon={Download} onClick={doExport}>{t('settings.export')}</SecondaryButton>
            <SecondaryButton size="md" icon={Upload} onClick={() => fileRef.current?.click()}>{t('settings.import')}</SecondaryButton>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden
            onChange={e => { const file = e.target.files?.[0]; if (file) void doImport(file); e.target.value = ''; }} />
          {note && <div role="status"><Banner tone={note.tone}>{note.text}</Banner></div>}
        </Card>
        <Card className="p-0"><ul className="divide-y divide-border">
          <Row icon={Lock} label={t('lock.row')} value={settings.pinHash ? t('lock.on') : t('lock.off')} onClick={() => setPinOpen(true)} />
          <Row icon={WifiOff} label={t('settings.offline')} onClick={() => setInfo('offline')} />
          <Row icon={RefreshCw} label={t('settings.redoOnboarding')} onClick={onRedoOnboarding} />
        </ul></Card>
      </section>

      <Section title={t('settings.info')}>
        <Row icon={BookOpen} label={t('settings.methodology')} onClick={() => setInfo('methodology')} />
        <Row icon={Info} label={t('settings.usda')} onClick={() => setInfo('usda')} />
        <Row icon={Store} label={t('settings.priceInfo')} onClick={() => setInfo('prices')} />
      </Section>
      <p className="text-center text-caption text-text-2">MealMath · {t('settings.version', { v: '1.2' })} · {t('app.tagline')}</p>

      <BottomSheet open={!!editor} onOpenChange={o => !o && setEditor(undefined)} title={editor?.title ?? ''}>
        {editor && (
          <div className="flex flex-col gap-5">
            <div><editor.render draft={draft} set={patch => setDraft(d => ({ ...d, ...patch }))} /></div>
            <PrimaryButton onClick={() => void save()}>{t('settings.save')}</PrimaryButton>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={pinOpen} onOpenChange={setPinOpen} title={t('lock.row')}>
        {pinOpen && <PinSettings settings={settings} onDone={() => setPinOpen(false)} />}
      </BottomSheet>

      <BottomSheet open={ai} onOpenChange={setAi} title={t('ai.row')}>
        {ai && <AiRecipesPanel settings={settings} />}
      </BottomSheet>

      <BottomSheet open={!!info} onOpenChange={o => !o && setInfo(undefined)} title={info ? t(info === 'methodology' ? 'settings.methodology' : info === 'usda' ? 'settings.usda' : info === 'prices' ? 'settings.priceInfo' : 'settings.offline') : ''}>
        <p className="text-body leading-relaxed">
          {info === 'methodology' && t('settings.methodologyText')}
          {info === 'usda' && t('settings.usdaText', { source: FOODS_SOURCE, date: FOODS_GENERATED_AT.slice(0, 10) })}
          {info === 'prices' && <>{t('settings.priceInfoText')} {t('prices.disclaimer')}</>}
          {info === 'offline' && t('settings.offlineText')}
        </p>
      </BottomSheet>
    </div>
  );
}
