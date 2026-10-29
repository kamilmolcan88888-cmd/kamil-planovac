import { KeyRound, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOOD_MAP } from '../../data/catalog';
import { recipeMacros } from '../../engine/nutrition';
import type { MealSlot, Recipe } from '../../engine/types';
import type { AppSettings } from '../../state/db';
import { suggestRecipe, type SuggestResult } from '../../state/ai';
import { updateSettings, useCurrentPlan } from '../../state/store';
import { SegmentedControl, Switch } from './controls';
import { Banner, Card, PrimaryButton, SecondaryButton } from './primitives';
import { useFormat } from '../lib/format';

const input = 'h-12 w-full rounded-input border border-border bg-surface-2 px-4 text-body text-text outline-none focus:border-primary';

/** Settings panel for the optional Claude recipe suggestions. */
export function AiRecipesPanel({ settings }: { settings: AppSettings }) {
  const { t } = useTranslation();
  const f = useFormat();
  const stored = useCurrentPlan(settings.currentPlanId);
  const [key, setKey] = useState(settings.aiKey ?? '');
  const [slot, setSlot] = useState<MealSlot>('lunch');
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SuggestResult>();
  const custom = settings.customRecipes ?? [];
  const inPlan = new Set(stored?.plan.days.flatMap(d => d.meals.map(m => m.recipeId)) ?? []);

  const run = async () => {
    setBusy(true); setResult(undefined);
    try { setResult(await suggestRecipe({ ...settings, aiKey: key.trim() }, slot, wish)); } finally { setBusy(false); }
  };
  const save = async (r: Recipe) => {
    await updateSettings({ customRecipes: [...custom, r], planStale: true });
    setResult(undefined); setWish('');
  };
  const remove = (id: string) => updateSettings({ customRecipes: custom.filter(r => r.id !== id), planStale: true });

  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info">{t('ai.intro')}</Banner>
      <Card className="p-0 px-4 py-1.5">
        <Switch checked={!!settings.aiEnabled} onChange={v => void updateSettings({ aiEnabled: v })} label={t('ai.enable')} description={t('ai.enableHint')} />
      </Card>

      {settings.aiEnabled && (
        <>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-support font-medium"><KeyRound aria-hidden className="size-4" />{t('ai.key')}</span>
            <input className={input} type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={key}
              onChange={e => setKey(e.target.value)} onBlur={() => void updateSettings({ aiKey: key.trim() || undefined })} />
            <span className="mt-1 block text-caption text-text-2">{t('ai.keyHint')}</span>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-support font-medium">{t('ai.slot')}</span>
            <SegmentedControl<MealSlot> label={t('ai.slot')} value={slot} onChange={setSlot}
              options={(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(s => ({ value: s, label: t(`slot.${s}`) }))} />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-support font-medium">{t('ai.wish')}</span>
            <input className={input} value={wish} maxLength={200} placeholder={t('ai.wishPlaceholder')} onChange={e => setWish(e.target.value)} />
          </label>
          <PrimaryButton icon={Sparkles} disabled={busy || !key.trim()} onClick={() => void run()}>{busy ? t('ai.working') : t('ai.suggest')}</PrimaryButton>

          {result && !result.ok && (
            <div><Banner tone="warning">
              {result.reason === 'invalid' ? t('ai.err.invalid', { list: result.errors.join(', ') })
                : result.reason === 'constraints' ? t('ai.err.constraints', { list: result.foods.map(id => (FOOD_MAP.get(id) ? f.name(FOOD_MAP.get(id)!.name) : id)).join(', ') })
                : t(`ai.err.${result.reason}`)}
              {'detail' in result && result.detail ? <span className="mt-1 block text-caption">{result.detail}</span> : null}
            </Banner></div>
          )}
          {result?.ok && <Preview recipe={result.recipe} onSave={() => void save(result.recipe)} onDiscard={() => setResult(undefined)} />}
        </>
      )}

      {custom.length > 0 && (
        <section aria-labelledby="ai-saved" className="flex flex-col gap-2">
          <h3 id="ai-saved" className="px-1 text-caption font-semibold uppercase tracking-wide text-text-2">{t('ai.saved', { count: custom.length })}</h3>
          <Card className="p-0"><ul className="divide-y divide-border">
            {custom.map(r => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-support font-semibold">{f.name(r.name)}</span>
                  <span className="block text-caption text-text-2">{r.meals.map(m => t(`slot.${m}`)).join(', ')}{inPlan.has(r.id) ? ` · ${t('ai.inPlan')}` : ''}</span>
                </span>
                <button type="button" disabled={inPlan.has(r.id)} onClick={() => void remove(r.id)} aria-label={t('ai.delete', { name: f.name(r.name) })}
                  className="pressable inline-flex size-10 items-center justify-center rounded-full text-error disabled:opacity-40"><Trash2 aria-hidden className="size-[18px]" /></button>
              </li>
            ))}
          </ul></Card>
        </section>
      )}
    </div>
  );
}

function Preview({ recipe, onSave, onDiscard }: { recipe: Recipe; onSave: () => void; onDiscard: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const m = recipeMacros(recipe, FOOD_MAP).total;
  const steps = recipe.steps[f.lang] ?? recipe.steps.sk;
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-primary">{t('ai.preview')}</p>
        <h3 className="text-body font-bold">{f.name(recipe.name)}</h3>
        <p className="num text-caption text-text-2">{recipe.meals.map(s => t(`slot.${s}`)).join(', ')} · {f.duration(recipe.timeMin)}</p>
      </div>
      <p className="num rounded-xl bg-surface-2 px-3 py-2 text-support">
        <strong>{t('ai.macros', { kcal: f.int(m.kcal), protein: f.int(m.protein), carbs: f.int(m.carbs), fat: f.int(m.fat) })}</strong>
        <span className="block text-caption text-text-2">{t('ai.computed')}</span>
      </p>
      <ul className="text-support">
        {recipe.ingredients.map(i => (
          <li key={i.food} className="num flex justify-between gap-3 py-0.5">
            <span>{f.name(FOOD_MAP.get(i.food)!.name)}</span><span className="text-text-2">{i.g} g ({i.min}–{i.max})</span>
          </li>
        ))}
      </ul>
      <ol className="list-decimal pl-5 text-support text-text-2">{steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
      <div className="grid grid-cols-2 gap-2.5">
        <SecondaryButton size="md" onClick={onDiscard}>{t('ai.discard')}</SecondaryButton>
        <PrimaryButton size="md" onClick={onSave}>{t('ai.save')}</PrimaryButton>
      </div>
    </Card>
  );
}
