// „Session“ = stav rozohranej hry naprieč levelmi (životy, skóre, zbrane, checkpoint).
// Ukladá sa do Phaser registry, aby ho videli všetky scény.
import { DIFFICULTY, HEROES } from '../config.js';

export function newPlayer(slot, hero, peerId = null, name = '') {
  return { slot, hero, peerId, name: name || HEROES[hero].name, lives: 3, score: 0, weapon: 'basic', connected: true };
}

/**
 * @param mode 'single' | 'host' | 'client'
 */
export function newSession(mode, difficulty, players, localSlot = 0) {
  return {
    mode,
    difficulty,
    level: 0,
    checkpoint: null,
    continuesLeft: DIFFICULTY[difficulty].continues,
    players,
    localSlot,
  };
}

/** Prvá voľná postava (ak je preferovaná obsadená). */
export function freeHero(players, preferred) {
  const used = new Set(players.map((p) => p.hero));
  if (!used.has(preferred)) return preferred;
  return [0, 1, 2, 3].find((h) => !used.has(h)) ?? 0;
}

export function freeSlot(players) {
  const used = new Set(players.map((p) => p.slot));
  return [0, 1, 2, 3].find((s) => !used.has(s)) ?? -1;
}
