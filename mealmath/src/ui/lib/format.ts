import { useTranslation } from 'react-i18next';
import { LOCALE } from '../../i18n';
import type { Food, Lang, Localized } from '../../engine/types';
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
    /** 450 → "450 g", 1500 → "1,5 kg"; liquids in ml / l. */
    amount: (g: number, food?: Food) => {
      const liquid = !!food && isLiquid(food);
      const r = g >= 1000 ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(g / 1000) : int.format(Math.round(g));
      return g >= 1000 ? `${r} ${liquid ? 'l' : 'kg'}` : `${r} ${liquid ? 'ml' : 'g'}`;
    },
    shortDate: (iso: string) => fromISO(iso).toLocaleDateString(locale, { day: 'numeric', month: 'numeric', year: 'numeric' }),
    /** Name in the UI language; Czech falls back to Slovak, then English. */
    name: (n: Localized) => n[lang] ?? (lang === 'cs' ? n.sk : undefined) ?? n.en,
  };
}

const LIQUIDS = new Set(['milk_semi', 'milk_whole', 'milk_skim', 'buttermilk', 'kefir', 'soy_milk', 'almond_milk', 'olive_oil', 'rapeseed_oil',
  'sunflower_oil', 'sesame_oil', 'vinegar', 'vinegar_spirit', 'balsamic', 'soy_sauce', 'broth_veg', 'broth_chicken', 'cream_light', 'cream_heavy',
  'orange_juice', 'apple_juice', 'tomato_juice', 'coffee', 'tea', 'coconut_milk', 'egg_white', 'maple_syrup', 'worcestershire']);
export const isLiquid = (f: Food) => LIQUIDS.has(f.id);
