// iOS/Safari špecifiká: odomknutie zvuku po prvom dotyku, Wake Lock, zákaz gest a zoomu,
// toast správy, registrácia service workera.
import { audio } from '../audio/Audio.js';

/** Zabráni zoomu (pinch, dvojklik) a „gumovému“ scrollovaniu stránky. */
export function lockGestures() {
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest('input')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('contextmenu', stop);
}

/**
 * iOS dovolí spustiť zvuk až po geste používateľa – odomkneme pri prvom dotyku/klávese.
 * Poslucháč ostáva aktívny: po prerušení (hovor, prepnutie appky) iOS audio „uspí“
 * a ďalší dotyk ho znovu prebudí.
 */
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    if (!audio.ctx || audio.ctx.state !== 'running') audio.unlock();
    requestWakeLock();
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, true);
}

// ---- Wake Lock: displej nezhasne počas hrania (iOS 16.4+; v PWA na ploche od iOS 18.4) ----
let wakeLock = null;
export async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* nepodporované alebo zamietnuté – nevadí */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

// ---- Toast: krátka správa dole na obrazovke ----
let toastTimer = 0;
export function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const isPortrait = () => matchMedia('(orientation: portrait) and (pointer: coarse)').matches;

/** Service worker = offline režim. Len v produkčnom builde (pri vývoji by prekážal). */
export function registerSW() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}
