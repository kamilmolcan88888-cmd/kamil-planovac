import { CalendarDays, Construction, Settings, ShoppingBasket, Tag } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localISO } from './state/dates';
import { createPlan, loadSettings, useCurrentPlan, useSettings } from './state/store';
import { AppHeader, AppShell, type Tab } from './ui/components/AppShell';
import { EmptyState, LoadingState } from './ui/components/primitives';
import { HomeScreen } from './ui/screens/HomeScreen';
import { RecipeScreen } from './ui/screens/RecipeScreen';
import { WeekScreen } from './ui/screens/WeekScreen';

type Route = { tab: Tab; recipe?: { id: string; date?: string; slot?: string } };
const TABS: Tab[] = ['home', 'week', 'shopping', 'prices', 'settings'];

/** Hash routes keep working on GitHub Pages / Cloudflare Pages without server rewrites. */
function parseHash(): Route {
  const [, a, b, c, d] = (location.hash || '#/home').split('/').map(decodeURIComponent);
  if (a === 'recipe' && b) return { tab: 'home', recipe: { id: b, date: c, slot: d } };
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
  if (!route.recipe) lastTab.current = route.tab;
  const activeTab = route.recipe ? lastTab.current : route.tab;
  const stored = useCurrentPlan(settings?.currentPlanId); // undefined = loading, null = none
  const { t } = useTranslation();

  // One shared "generate a week" state for every screen.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const started = useRef(false);
  const generate = useCallback((seed?: number) => {
    setBusy(true); setError(undefined);
    createPlan(localISO(), seed ?? (stored ? stored.seed + 1 : 1))
      .catch(e => setError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }, [stored]);
  useEffect(() => { if (stored === null && !started.current) { started.current = true; generate(1); } }, [stored, generate]);

  if (!settings) return <div className="p-6"><LoadingState title={t('common.loading')} /></div>;
  const openMeal = (id: string, date: string, slot: string) => go(`#/recipe/${encodeURIComponent(id)}/${date}/${slot}`);
  const back = () => (history.length > 1 ? history.back() : go('#/home'));

  return (
    <AppShell tab={activeTab} onTab={tab => go(`#/${tab}`)}>
      {route.recipe ? <RecipeScreen recipeId={route.recipe.id} date={route.recipe.date} slot={route.recipe.slot} settings={settings} stored={stored} onBack={back} />
        : route.tab === 'home' ? <HomeScreen settings={settings} stored={stored} busy={busy} error={error} onGenerate={() => generate()} onOpenRecipe={openMeal} onOpenSettings={() => go('#/settings')} />
          : route.tab === 'week' ? <WeekScreen settings={settings} stored={stored} busy={busy} onOpenMeal={openMeal} onNewWeek={() => generate()} />
            : <ComingSoon tab={route.tab} />}
    </AppShell>
  );
}
