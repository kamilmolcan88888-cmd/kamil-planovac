// Nastavenia a high score uložené v localStorage (prežijú reštart aj offline režim).
const KEY = 'ironlynx.settings.v1';

const defaults = {
  music: true,
  sfx: true,
  vibrate: true,
  autoFire: false,          // streľba bez držania tlačidla
  pixelPerfect: true,       // ostré pixely (celé násobky) vs. vyplniť obrazovku
  difficulty: 'normal',
  hero: 0,                  // 0 = Rys, 1 = Orlica
  name: '',
  highScore: 0,
  signalUrl: '',            // vlastný wss:// server (alternatíva s GitHub Pages)
  touch: { scale: 1, opacity: 0.55, pad: null, btns: null },  // pad/btns = {x,y} v px (null = predvolené)
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...defaults, ...raw, touch: { ...defaults.touch, ...(raw.touch || {}) } };
  } catch {
    return structuredClone(defaults);
  }
}

export const settings = load();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* súkromný režim */ }
}

/** Zapíše nové high score, ak je vyššie. Vráti true pri novom rekorde. */
export function submitScore(score) {
  if (score > settings.highScore) {
    settings.highScore = score;
    saveSettings();
    return true;
  }
  return false;
}
