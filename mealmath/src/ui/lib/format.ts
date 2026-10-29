import { useTranslation } from 'react-i18next';
import { LOCALE } from '../../i18n';
import type { Lang, Localized } from '../../engine/types';
import { fromISO } from '../../state/dates';

export function useFormat() {
  const { i18n, t } = useTranslation();
  const lang = (i18n.language as Lang) || 'sk';
  const locale = LOCALE[lang] ?? 'sk-SK';
  const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const eur = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
  return {
    lang,
    locale,
    int: (n: number) => int.format(Math.round(n)),
    dec1: (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n),
    /** 45 → "45 minút"; 231 → "3 h 51 min" */
    duration: (min: number) => (min < 60 ? t('unit.minutes', { count: min }) : t('unit.hm', { h: Math.floor(min / 60), m: min % 60 })),
    eur: (n: number) => eur.format(n),
    longDate: (iso: string) => { const s = fromISO(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1); },
    weekdayShort: (iso: string) => fromISO(iso).toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''),
    dayOfMonth: (iso: string) => String(fromISO(iso).getDate()),
    /** Name in the UI language; Czech falls back to Slovak, then English. */
    name: (n: Localized) => n[lang] ?? (lang === 'cs' ? n.sk : undefined) ?? n.en,
  };
}
