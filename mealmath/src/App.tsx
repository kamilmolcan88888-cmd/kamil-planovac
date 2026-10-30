import { CalendarDays, Construction, Settings, ShoppingBasket, Tag } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localISO } from './state/dates';
import { createPlan, loadSettings, updateSettings, useCurrentPlan, useSettings } from './state/store';
import { AppHeader, AppShell, type Tab } from './ui/components/AppShell';
import { EmptyState, LoadingState } from './ui/components/primitives';
import { HomeScreen } from './ui/screens/HomeScreen';

// Everything except Home loads on demand (all of it is precached for offline use).
const RecipeScreen = lazy(() => import('./ui/screens/RecipeScreen').then(m => ({ default: m.RecipeScreen })));
const WeekScreen = lazy(() => import('./ui/screens/WeekScreen').then(m => ({ default: m.WeekScreen })));
const ShoppingScreen = lazy(() => import('./ui/screens/ShoppingScreen').then(m => ({ default: m.ShoppingScreen })));
const PricesScreen = lazy(() => import('./ui/screens/PricesScreen').then(m => ({ default: m.PricesScreen })));
const SettingsScreen = lazy(() => import('./ui/screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const TargetsScreen = lazy(() => import('./ui/screens/TargetsScreen').then(m => ({ default: m.TargetsScreen })));
const ProgressScreen = lazy(() => import('./ui/screens/ProgressScreen').then(m => ({ default: m.ProgressScreen })));
const Onboarding = lazy(() => import('./ui/onboarding/Onboarding').then(m => ({ default: m.Onboarding })));

type Route = { tab: Tab; recipe?: { id: string; date?: string; slot?: string }; targets?: boolean; progress?: boolean };
const TABS: Tab[] = ['home', 'week', 'shopping', 'prices', 'settings'];

/** Hash routes keep working on GitHub Pages / Cloudflare Pages without server rewrites. */
function parseHash(): Route {
  const [, a, b, c, d] = (location.hash || '#/home').split('/').map(decodeURIComponent);
  if (a === 'recipe' && b) return { tab: 'home', recipe: { id: b, date: c, slot: d } };
  if (a === 'targets') return { tab: 'settings', targets: true };
  if (a === 'progress') return { tab: 'settings', progress: true };
  return { tab: TABS.includes(a as Tab) ? (a as Tab) : 'home' };
}

function useHashRoute(): [Route, (hash: string) => void] {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (h: string) => { location.hash = h; }];
}

function useThemeAndLang(theme: string | undefined, lang: string | undefined) {
  const { i18n } = useTranslation();
  useEffect(() => { if (lang && i18n.language !== lang) void i18n.changeLanguage(lang); document.documentElement.lang = lang ?? 'sk'; }, [lang, i18n]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || ((theme ?? 'auto') === 'auto' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#111B16' : '#F7F8F4'));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function ComingSoon({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  const icon = { week: CalendarDays, shopping: ShoppingBasket, prices: Tag, settings: Settings, home: Construction }[tab];
  return (
    <>
      <AppHeader title={t(`nav.${tab}`)} />
      <EmptyState icon={icon} title={t('common.comingSoon')} text={t('common.comingSoonText')} />
    </>
  );
}

export function App() {
  useEffect(() => { void loadSettings(); }, []);
  const settings = useSettings();
  useThemeAndLang(settings?.theme, settings?.lang);
  const [route, go] = useHashRoute();
  // A recipe keeps the tab it was opened from highlighted.
  const lastTab = useRef<Tab>('home');
  if (!route.recipe && !route.targets && !route.progress) lastTab.current = route.tab;
  const activeTab = route.recipe ? lastTab.current : route.tab;
  const [redo, setRedo] = useState(false);
  const showOnboarding = !!settings && ((settings.profileIsDemo && !settings.onboardingSkipped) || redo);
  const stored = useCurrentPlan(settings?.currentPlanId); // undefined = loading, null = none
  const { t } = useTranslation();

  // One shared "generate a week" state for every screen.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const started = useRef(false);
  const generate = useCallback((seed?: number, startDate?: string) => {
    setBusy(true); setError(undefined);
    createPlan(startDate ?? localISO(), seed ?? (stored ? stored.seed + 1 : 1))
      .catch(e => setError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }, [stored]);
  useEffect(() => {
    if (stored === null && !started.current && settings && !showOnboarding) { started.current = true; generate(1); }
  }, [stored, generate, settings, showOnboarding]);

  if (!settings) return <div className="p-6"><LoadingState title={t('common.loading')} /></div>;
  const loading = <LoadingState title={t('common.loading')} />;
  if (showOnboarding) return <Suspense fallback={loading}><Onboarding initial={settings} onDone={() => { setRedo(false); go('#/home'); }} /></Suspense>;
  const openMeal = (id: string, date: string, slot: string) => go(`#/recipe/${encodeURIComponent(id)}/${date}/${slot}`);
  const back = () => (history.length > 1 ? history.back() : go('#/home'));

  return (
    <AppShell tab={activeTab} onTab={tab => go(`#/${tab}`)}>
      <Suspense fallback={loading}>
      {route.recipe ? <RecipeScreen recipeId={route.recipe.id} date={route.recipe.date} slot={route.recipe.slot} settings={settings} stored={stored} onBack={back} />
        : route.tab === 'home' ? <HomeScreen settings={settings} stored={stored} busy={busy} error={error} onGenerate={() => generate()} onOpenRecipe={openMeal} onOpenSettings={() => go('#/settings')} onOpenProgress={() => go('#/progress')} />
          : route.tab === 'week' ? <WeekScreen settings={settings} stored={stored} busy={busy} onOpenMeal={openMeal} onNewWeek={() => generate()}
            onNewPlan={(start, days) => void updateSettings({ planDays: days }).then(() => generate(undefined, start))} />
            : route.targets ? <TargetsScreen settings={settings} onBack={back} />
            : route.progress ? <ProgressScreen settings={settings} onBack={back} />
            : route.tab === 'settings' ? <SettingsScreen settings={settings} onOpenTargets={() => go('#/targets')} onOpenProgress={() => go('#/progress')} onOpenPrices={() => go('#/prices')}
                onRegenerate={() => { generate(); go('#/home'); }} onRedoOnboarding={() => setRedo(true)} />
            : route.tab === 'shopping' ? <ShoppingScreen settings={settings} stored={stored} busy={busy} onNewWeek={() => generate()} />
              : route.tab === 'prices' ? <PricesScreen settings={settings} />
                : <ComingSoon tab={route.tab} />}
      </Suspense>
    </AppShell>
  );
}
