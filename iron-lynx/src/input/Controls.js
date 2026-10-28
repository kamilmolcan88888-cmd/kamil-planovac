// Jednotný vstup: klávesnica + Bluetooth gamepad (Gamepad API) + dotykové ovládanie.
// Výsledok je jednoduchý objekt { left, right, up, down, jump, fire, pause } – ten istý
// tvar sa v multiplayeri posiela sieťou ako bitmaska.
import { touch } from './Touch.js';
import { settings } from '../settings.js';

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', KeyJ: 'jump', Space: 'jump',
  KeyX: 'fire', KeyK: 'fire', KeyL: 'fire',
  Enter: 'pause', Escape: 'pause', KeyP: 'pause',
};
const BITS = ['left', 'right', 'up', 'down', 'jump', 'fire'];

const keys = new Set();
const tapped = new Set();   // stlačené od poslednej snímky (aj keď už pustené) – krátky ťuk sa nestratí
window.addEventListener('keydown', (e) => {
  const a = KEYMAP[e.code];
  if (a) {
    keys.add(a);
    tapped.add(a);
    if (!e.target.matches?.('input')) e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) keys.delete(a); });
window.addEventListener('blur', () => keys.clear());

/** Prečíta prvý pripojený gamepad (štandardné mapovanie). */
function readGamepad(s) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const ax = gp.axes[0] || 0;
    const ay = gp.axes[1] || 0;
    const dz = 0.4; // mŕtva zóna analógu
    s.left ||= b(14) || ax < -dz;
    s.right ||= b(15) || ax > dz;
    s.up ||= b(12) || ay < -dz;
    s.down ||= b(13) || ay > dz;
    s.jump ||= b(0) || b(3);          // A / Y
    s.fire ||= b(2) || b(1) || b(7);   // X / B / RT
    s.pause ||= b(9);                  // Start
    controls.gamepad = gp;
    return;
  }
  controls.gamepad = null;
}

export const controls = {
  state: { left: false, right: false, up: false, down: false, jump: false, fire: false, pause: false },
  prev: {},
  gamepad: null,
  autoFireToggle: false,

  /** Volať raz za snímku – zlúči všetky zdroje vstupu. */
  poll() {
    this.prev = { ...this.state };
    const s = { left: false, right: false, up: false, down: false, jump: false, fire: false, pause: false };
    for (const k of keys) s[k] = true;
    for (const k of tapped) s[k] = true;
    tapped.clear();
    readGamepad(s);
    touch.merge(s);
    // automatická streľba: tlačidlo Streľba prepína trvalú paľbu
    if (settings.autoFire) {
      if (s.fire && !this.prev.fireRaw) this.autoFireToggle = !this.autoFireToggle;
      s.fireRaw = s.fire;
      s.fire = this.autoFireToggle;
    }
    this.state = s;
    return s;
  },
  pressed(name) { return this.state[name] && !this.prev[name]; },
};

export function toBits(s) {
  let b = 0;
  BITS.forEach((k, i) => { if (s[k]) b |= 1 << i; });
  return b;
}
export function fromBits(b) {
  const s = {};
  BITS.forEach((k, i) => { s[k] = !!(b & (1 << i)); });
  return s;
}
export const EMPTY_INPUT = fromBits(0);

/** Krátka vibrácia: telefón (Android) alebo gamepad. iOS Safari vibráciu nepodporuje – ticho ignoruje. */
export function vibrate(ms = 40, strength = 0.6) {
  if (!settings.vibrate) return;
  try { navigator.vibrate?.(ms); } catch { /* nepodporované */ }
  const act = controls.gamepad?.vibrationActuator;
  if (act?.playEffect) {
    act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }).catch(() => {});
  }
}
