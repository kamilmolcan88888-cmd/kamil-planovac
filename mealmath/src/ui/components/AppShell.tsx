import { CalendarDays, Home, Settings, ShoppingBasket, Tag, WifiOff, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { PwaNotices } from './PwaNotices';

export type Tab = 'home' | 'week' | 'shopping' | 'prices' | 'settings';

const TABS: { id: Tab; icon: LucideIcon }[] = [
  { id: 'home', icon: Home },
  { id: 'week', icon: CalendarDays },
  { id: 'shopping', icon: ShoppingBasket },
  { id: 'prices', icon: Tag },
  { id: 'settings', icon: Settings },
];

export function BottomNavigation({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 backdrop-blur-md"
      style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-lg grid-cols-5">
        {TABS.map(({ id, icon: Icon }) => {
          const on = id === active;
          return (
            <li key={id} className="flex">
              <button type="button" onClick={() => onChange(id)} aria-current={on ? 'page' : undefined}
                className={cn('pressable relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold', on ? 'text-primary' : 'text-text-2')}>
                {on && <motion.span layoutId="tab-indicator" className="absolute top-1.5 h-8 w-14 rounded-full bg-success-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <Icon aria-hidden className="relative size-[22px]" strokeWidth={on ? 2.4 : 2} />
                <span className="relative">{t(`nav.${id}`)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function OfflineIndicator() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-caption font-medium text-text-2" title={t('offline.text')}>
      <WifiOff aria-hidden className="size-3.5" /> {t('offline.badge')}<span className="sr-only"> · {t('offline.text')}</span>
    </div>
  );
}

/** Screen frame: safe areas, gutters, space for the tab bar. */
export function AppShell({ tab, onTab, children }: { tab: Tab; onTab: (t: Tab) => void; children: ReactNode }) {
  return (
    <div className="min-h-full bg-bg">
      <main
        className="mx-auto max-w-lg px-[var(--gutter)]"
        style={{ paddingTop: 'calc(12px + var(--safe-top))', paddingBottom: 'calc(var(--tabbar-h) + 28px + var(--safe-bottom))' }}
      >
        <OfflineIndicator />
        <PwaNotices />
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}>
          {children}
        </motion.div>
      </main>
      <BottomNavigation active={tab} onChange={onTab} />
    </div>
  );
}

export function AppHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3 pt-2">
      <div className="min-w-0">
        {subtitle && <p className="text-support font-medium text-text-2">{subtitle}</p>}
        <h1 className="mt-0.5 text-title font-bold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
