import { ArrowLeft, CalendarDays, Construction, Settings, ShoppingBasket, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RECIPE_MAP } from './data/catalog';
import { loadSettings, useCurrentPlan, useSettings } from './state/store';
import { AppHeader, AppShell, type Tab } from './ui/components/AppShell';
import { EmptyState, IconButton, LoadingState } from './ui/components/primitives';
import { useFormat } from './ui/lib/format';
import { HomeScreen } from './ui/screens/HomeScreen';

type Route = { tab: Tab; recipeId?: string };

/** Hash routes keep working on GitHub Pages / Cloudflare Pages without server rewrites. */
function parseHash(): Route {
  const [, a, b] = (location.hash || '#/home').split('/');
  if (a === 'recipe' && b) return { tab: 'home', recipeId: decodeURIComponent(b) };
  const tabs: Tab[] = ['home', 'week', 'shopping', 'prices', 'settings'];
  return { tab: tabs.includes(a as Tab) ? (a as Tab) : 'home' };
}

function useHashRoute(): [Route, (hash: string) => void] {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => { const on = () => setRoute(parseHash()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
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

function RecipePlaceholder({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const r = RECIPE_MAP.get(id);
  return (
    <>
      <div className="mb-2 pt-2"><IconButton icon={ArrowLeft} label={t('common.back')} onClick={onBack} /></div>
      <AppHeader title={r ? f.name(r.name) : t('recipe.title')} />
      <EmptyState icon={Construction} title={t('common.comingSoon')} text={t('common.comingSoonText')} />
    </>
  );
}

export function App() {
  useEffect(() => { void loadSettings(); }, []);
  const settings = useSettings();
  useThemeAndLang(settings?.theme, settings?.lang);
  const [route, go] = useHashRoute();
  // undefined = still loading, null = no plan yet
  const stored = useCurrentPlan(settings?.currentPlanId);
  const { t } = useTranslation();

  if (!settings) return <div className="p-6"><LoadingState title={t('common.loading')} /></div>;
  const plan = stored;

  return (
    <AppShell tab={route.tab} onTab={tab => go(`#/${tab}`)}>
      {route.recipeId ? <RecipePlaceholder id={route.recipeId} onBack={() => history.back()} />
        : route.tab === 'home'
          ? <HomeScreen settings={settings} stored={plan} onOpenRecipe={id => go(`#/recipe/${encodeURIComponent(id)}`)} onOpenSettings={() => go('#/settings')} />
          : <ComingSoon tab={route.tab} />}
    </AppShell>
  );
}
