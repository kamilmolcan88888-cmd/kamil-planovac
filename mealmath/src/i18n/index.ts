import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import sk from './sk.json';
import de from './de.json';
import en from './en.json';
import cs from './cs.json';
import type { Lang } from '../engine/types';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'sk', label: 'Slovenčina' },
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'cs', label: 'Čeština' },
];

export const LOCALE: Record<Lang, string> = { sk: 'sk-SK', de: 'de-DE', en: 'en-GB', cs: 'cs-CZ' };

void i18n.use(initReactI18next).init({
  resources: { sk: { translation: sk }, de: { translation: de }, en: { translation: en }, cs: { translation: cs } },
  lng: 'sk',
  fallbackLng: { cs: ['sk', 'en'], default: ['en'] },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
