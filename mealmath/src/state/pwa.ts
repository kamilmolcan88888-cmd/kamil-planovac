// Service worker registration, update prompt and storage persistence.
import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

type State = { needRefresh: boolean; offlineReady: boolean };
let state: State = { needRefresh: false, offlineReady: false };
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };

let update: ((reload?: boolean) => Promise<void>) | undefined;

export function initPwa() {
  // The desktop app (Electron) serves everything locally and doesn't need a service worker.
  if (!('serviceWorker' in navigator) || /Electron/i.test(navigator.userAgent)) return;
  update = registerSW({
    immediate: true,
    onNeedRefresh: () => emit({ needRefresh: true }),
    onOfflineReady: () => emit({ offlineReady: true }),
  });
  // Ask the browser not to evict our IndexedDB (plans, prices). Best effort – Safari may ignore it.
  void navigator.storage?.persist?.().catch(() => undefined);
}

export const usePwa = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
export const applyUpdate = () => update?.(true);
export const dismissOfflineReady = () => emit({ offlineReady: false });

/** iPhone/iPad Safari that is not yet running as an installed app. */
export function shouldShowInstallHint(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem('mm-install-hint') === '1'; } catch { /* private mode */ }
  return ios && !standalone && !dismissed;
}
export function dismissInstallHint() { try { localStorage.setItem('mm-install-hint', '1'); } catch { /* ignore */ } }
