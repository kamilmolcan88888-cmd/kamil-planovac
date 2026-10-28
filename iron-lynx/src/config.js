// Globálne konštanty hry. Hodnoty tu ladíš (rýchlosti, zbrane, obtiažnosť).

export const W = 480;            // interné rozlíšenie
export const H = 270;
export const TILE = 16;

// 32-farebná paleta (rovnaká ako v tools/gen_assets.py) – na tónovanie častíc a UI
export const PAL = [
  0x0b0e1a, 0x141a33, 0x1f2a52, 0x2b3d75, 0x3a5bb0, 0x4f8ce0, 0x8ec5ff, 0xe8f4ff,
  0x0f2b22, 0x1a4a32, 0x2a7040, 0x4aa04a, 0x9ad35a,
  0x5a3a22, 0x8a5a32, 0xc08a52,
  0x7a2a12, 0xd0601a, 0xff9a2a, 0xffd36a,
  0x7a1020, 0xe02a3a,
  0x3a1a5a, 0x6a2aa0, 0xb04aff, 0xff6aff,
  0x2a2e38, 0x4a505e, 0x7a8294, 0xb8c0cc,
  0x2ae0d0, 0xffffff,
];

// Fyzika hráča
export const PHYS = {
  gravity: 760,
  jumpV: -310,         // počiatočná rýchlosť skoku
  jumpCut: -110,       // pri pustení tlačidla sa skok skráti (premenlivá výška)
  coyoteMs: 100,       // koľko ms po zídení z hrany ešte môžeš skočiť
  bufferMs: 130,       // stlačenie skoku tesne pred dopadom sa zapamätá
  proneDelayMs: 320,   // po koľkých ms držania „dole“ sa z kľaku stane ľah
  dropMs: 220,         // ako dlho sa ignorujú platformy pri zoskoku
  maxFall: 420,
};

// Postavy: Rys je rýchly, Orlica silná (vyšší damage). Hráči 3–4 v co-ope.
export const HEROES = [
  { key: 'rys', name: 'RYS', speed: 108, dmg: 1.0, color: PAL[5] },
  { key: 'orlica', name: 'ORLICA', speed: 88, dmg: 1.5, color: PAL[18] },
  { key: 'sokol', name: 'SOKOL', speed: 98, dmg: 1.2, color: PAL[11] },
  { key: 'vlk', name: 'VLK', speed: 98, dmg: 1.2, color: PAL[24] },
];

// Obtiažnosti – násobiče pre nepriateľov
export const DIFFICULTY = {
  easy: { name: 'ĽAHKÁ', fire: 0.55, bullet: 0.75, hp: 0.7, continues: 9 },
  normal: { name: 'NORMÁLNA', fire: 1.0, bullet: 1.0, hp: 1.0, continues: 3 },
  hard: { name: 'ŤAŽKÁ', fire: 1.5, bullet: 1.25, hp: 1.4, continues: 1 },
};
export const DIFF_KEYS = ['easy', 'normal', 'hard'];

// Zbrane. rate = ms medzi výstrelmi, dmg = poškodenie, pierce = prestrelí nepriateľov
export const WEAPONS = {
  basic: { name: 'ZÁKLADNÁ', letter: 'Z', rate: 210, speed: 320, dmg: 1, sfx: 'shot' },
  rapid: { name: 'RÝCHLA', letter: 'R', rate: 95, speed: 380, dmg: 0.8, sfx: 'rapid' },
  spread: { name: 'ROZPTYL', letter: 'S', rate: 300, speed: 290, dmg: 1, sfx: 'spread' },
  laser: { name: 'LASER', letter: 'L', rate: 380, speed: 560, dmg: 3, pierce: true, sfx: 'laser' },
  flame: { name: 'PLAMEŇ', letter: 'F', rate: 70, speed: 210, dmg: 0.55, pierce: true, life: 280, sfx: 'flame' },
};
// poradie snímok v powerups.png
export const POWERUPS = ['rapid', 'spread', 'laser', 'flame'];

// Snímky hráča v player_*.png (pozri tools/gen_assets.py)
export const PF = {
  idle: [0, 1], run: [2, 3, 4, 5, 6, 7], jump: [8, 9, 10, 11], crouch: 12, prone: 13,
  up: 14, diagUp: 15, diagDown: 16, runUp: [17, 18, 19, 20, 21, 22], runDown: [23, 24, 25, 26, 27, 28],
  death: [29, 30, 31, 32],
};

// Body za nepriateľov
export const SCORE = { infantry: 100, sniper: 300, drone: 500, turret: 500, arm: 1000, boss: 5000, powerup: 200 };

// Tabuľka textúr pre sieťové snapshoty (index = číslo v správe). Origin a hĺbka vykreslenia
// sa berú odtiaľto na hostiteľovi aj klientovi, aby to vyzeralo rovnako.
export const NET_TEX = [
  ['player_rys', 0.5, 0.5, 30], ['player_orlica', 0.5, 0.5, 30], ['player_sokol', 0.5, 0.5, 30], ['player_vlk', 0.5, 0.5, 30],
  ['infantry', 0.5, 0.5, 20], ['sniper', 0.5, 0.5, 20], ['drone', 0.5, 0.5, 22], ['turret', 0.5, 0.5, 19],
  ['turret_barrel', 0.1, 0.5, 18], ['bullets', 0.5, 0.5, 40], ['laser', 0.5, 0.5, 40], ['flame', 0.5, 0.5, 41],
  ['boulder', 0.5, 0.5, 39], ['powerups', 0.5, 0.5, 25], ['explosion', 0.5, 0.5, 50], ['spark', 0.5, 0.5, 51],
  ['checkpoint', 0.5, 1, 5], ['golem', 0.5, 0.5, 15], ['spider', 0.5, 0.5, 15], ['gate', 0.5, 0.5, 14],
  ['reactor', 0.5, 0.5, 15], ['arm', 0.5, 0.5, 16], ['armseg', 0.5, 0.5, 15],
];
export const TEX_INDEX = Object.fromEntries(NET_TEX.map((t, i) => [t[0], i]));
export const texOrigin = (key) => NET_TEX[TEX_INDEX[key]];

// Signalizačný server: prázdne = rovnaký server ako hra (/ws).
// Pri GitHub Pages nastav VITE_SIGNAL_URL alebo v hre Nastavenia → Server.
export const DEFAULT_SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || '';
export const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
export const SNAPSHOT_HZ = 20;
export const INTERP_MS = 100;
