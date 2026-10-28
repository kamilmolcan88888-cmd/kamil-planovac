// Definície 4 levelov. Mapy sa „kreslia“ kódom cez Grid (pozri Grid.js pre význam znakov).
import { Grid } from './Grid.js';

// ---------------------------------------------------------------- LEVEL 1
function jungle() {
  const g = new Grid(232, 17);         // 17 riadkov × 16 px = 272 px výška
  g.ground(0, 27, 3);
  g.set(3, 13, 'P');
  g.on('E', 15); g.on('E', 24);
  g.plat(17, 10, 6);
  g.set(19, 9, 'E');
  // priepasť s malou platformou
  g.plat(29, 11, 2);
  g.ground(32, 63, 3);
  // brodisko pod vodopádom
  g.fill(36, 14, 46, 15, ' '); g.water(36, 46, 14);
  g.set(41, 0, '|'); g.set(38, 2, '|');
  g.on('E', 34);
  g.fill(50, 9, 52, 13, 'R'); g.set(51, 8, 'S');        // strelec na skale
  g.set(46, 5, 'D');                                     // dron s power-upom
  g.on('e', 58);
  for (let x = 54; x < 64; x += 3) g.set(x, 13, 'f');
  // zábradlie nad priepasťou
  g.plat(64, 11, 5);
  g.ground(69, 101, 4);
  g.on('C', 70);
  g.on('T', 78);
  g.plat(82, 8, 7); g.set(85, 7, 'E');
  g.on('E', 88); g.on('E', 94);
  g.on('T', 97);
  g.set(90, 4, 'D');
  for (let x = 70; x < 100; x += 4) g.set(x, 11, 'v');
  // nižšie terasy s vodou a dvomi vodopádmi
  g.ground(102, 112, 2);
  g.water(102, 112, 14);
  g.set(105, 0, '|'); g.set(109, 1, '|');
  g.plat(103, 10, 3); g.plat(108, 9, 3);
  g.ground(113, 142, 3);
  g.fill(119, 8, 122, 13, 'R'); g.set(120, 7, 'S');
  g.on('E', 116); g.on('e', 128);
  g.plat(124, 10, 6); g.set(127, 9, 'E');
  g.set(126, 4, 'D');
  g.on('C', 136);
  g.on('T', 140);
  // most cez priepasť
  g.plat(143, 12, 5);
  g.ground(148, 178, 3);
  g.plat(151, 9, 10); g.plat(164, 9, 8);
  g.set(155, 8, 'E'); g.set(167, 8, 'E');
  g.on('T', 158);
  g.on('e', 170);
  g.fill(174, 10, 176, 13, 'R'); g.set(175, 9, 'S');
  g.ground(179, 196, 2); g.water(179, 196, 14);
  g.set(183, 0, '|'); g.set(190, 0, '|');
  g.plat(181, 10, 4); g.plat(188, 10, 4);
  g.set(186, 5, 'D');
  // aréna golema
  g.ground(197, 231, 3);
  g.on('C', 198);
  g.set(201, 0, 'A');
  g.plat(203, 9, 4); g.plat(214, 9, 4);
  g.set(224, 13, 'B');
  return g;
}

// ---------------------------------------------------------------- LEVEL 2 (vertikálny)
function cave() {
  const rows = 130;
  const g = new Grid(30, rows);
  g.fill(0, 0, 1, rows - 1, '#'); g.fill(28, 0, 29, rows - 1, '#');
  g.fill(2, rows - 3, 27, rows - 1, '#');
  g.set(6, rows - 4, 'P');
  const pat = [[3, 8], [13, 7], [20, 7], [11, 9], [3, 9], [18, 9], [8, 10], [3, 6], [21, 6], [11, 8]];
  let i = 0;
  for (let y = rows - 6; y >= 19; y -= 3, i++) {
    const [x, len] = pat[i % pat.length];
    g.plat(x, y, len);
    if (i % 3 === 1) g.plat(x < 14 ? Math.min(x + 13, 22) : x - 12, y, 5);       // druhá platforma v riadku
    if (i % 4 === 2) g.set(x + (len >> 1), y - 1, 'E');
    if (i % 6 === 3) g.set(x + 1, y - 1, 'v');                      // kryštál
    if (i % 9 === 4) g.set(15, y - 3, 'D');
    if (i % 10 === 5) g.set(x + 2, y - 1, 'C');
  }
  // rímsy so strelcami a vežami na stenách
  [[110, 0], [96, 1], [80, 0], [66, 1], [50, 0], [36, 1], [24, 0]].forEach(([y, side], k) => {
    const x0 = side ? 24 : 2;
    g.fill(x0, y, x0 + 3, y, 'R');
    g.set(x0 + (side ? 2 : 1), y - 1, k % 2 ? 'T' : 'S');
  });
  // aréna pavúka (hore)
  g.plat(2, 16, 26);
  g.plat(5, 11, 5); g.plat(20, 11, 5);
  g.set(14, 15, 'C');
  g.set(15, 0, 'A');
  g.set(15, 4, 'B');
  return g;
}

// ---------------------------------------------------------------- LEVEL 3
function base() {
  const g = new Grid(200, 17);
  g.fill(0, 0, 199, 1, '#');                // strop
  g.ground(0, 199, 3);
  g.set(3, 13, 'P');
  for (let x = 6; x < 196; x += 9) g.set(x, 2, 'v');   // rúry pod stropom
  for (let x = 10; x < 196; x += 14) g.set(x, 12, 'f'); // výstražné svetlá
  g.on('E', 14); g.on('e', 22);
  g.fill(26, 10, 29, 13, 'R'); g.set(27, 9, 'S');
  g.on('T', 34);
  g.plat(38, 9, 8); g.set(41, 8, 'E');
  g.fill(48, 14, 53, 16, ' ');              // jama
  g.plat(49, 11, 4);
  g.on('T', 58); g.set(62, 5, 'D');
  g.on('e', 66);
  g.on('C', 72);
  g.fill(76, 2, 79, 8, '#');                // stĺp zo stropu (prekážka, pod ním sa dá prejsť)
  g.plat(80, 10, 6); g.set(83, 9, 'E');
  g.on('T', 88); g.on('T', 96);
  g.fill(100, 11, 103, 13, 'R'); g.set(101, 10, 'S');
  g.fill(106, 14, 111, 16, ' '); g.plat(107, 11, 4);
  g.on('e', 116); g.set(118, 5, 'D');
  g.on('C', 124);
  g.plat(128, 9, 12); g.set(131, 8, 'T'); g.set(137, 8, 'E');
  g.on('E', 134); g.on('T', 144);
  g.fill(148, 10, 151, 13, 'R'); g.set(149, 9, 'S');
  g.on('e', 156);
  g.set(160, 5, 'D');
  g.on('C', 166);
  // aréna – strážna brána
  g.set(170, 0, 'A');
  g.plat(174, 9, 5); g.plat(183, 7, 4);
  g.set(195, 13, 'B');
  return g;
}

// ---------------------------------------------------------------- LEVEL 4
function reactor() {
  const g = new Grid(122, 17);
  g.fill(0, 0, 89, 1, '#');
  g.ground(0, 121, 2);
  g.set(3, 14, 'P');
  for (let x = 5; x < 88; x += 7) g.set(x, 2, 'v');
  g.on('E', 12); g.on('e', 20);
  g.plat(16, 10, 6); g.set(18, 9, 'S');
  g.on('T', 28); g.set(30, 5, 'D');
  g.fill(34, 13, 38, 16, ' '); g.plat(35, 11, 3);
  g.on('C', 42);
  g.plat(44, 9, 8); g.set(47, 8, 'T');
  g.on('E', 50); g.on('e', 56);
  g.fill(60, 11, 63, 14, 'R'); g.set(61, 10, 'S');
  g.on('T', 68); g.set(72, 4, 'D');
  g.on('E', 78);
  g.on('C', 86);
  // aréna reaktora
  g.set(92, 0, 'A');
  g.plat(94, 10, 5); g.plat(113, 10, 5); g.plat(103, 12, 6);
  g.set(107, 5, 'B');
  return g;
}

export const LEVELS = [
  {
    name: 'DŽUNGĽA A VODOPÁDY', theme: 1, music: 'jungle', scroll: 'x', boss: 'golem', build: jungle,
    drops: ['spread', 'rapid', 'laser', 'spread', 'flame', 'spread'],
    bg: [
      { key: 'bg1_sky', sf: 0, y: 0 }, { key: 'bg1_far', sf: 0.08, y: 30 }, { key: 'bg1_mid', sf: 0.22, y: 120 },
      { key: 'bg1_near', sf: 0.45, y: 170 }, { key: 'fog', sf: 0.6, y: 200, alpha: 0.8, drift: 8 },
    ],
  },
  {
    name: 'KRYŠTÁLOVÁ JASKYŇA', theme: 2, music: 'cave', scroll: 'y', boss: 'spider', build: cave,
    drops: ['spread', 'laser', 'rapid', 'flame', 'spread', 'laser'],
    bg: [{ key: 'bg2_far', sf: 0.15, y: 0 }, { key: 'bg2_near', sf: 0.4, y: 0 }],
  },
  {
    name: 'PODZEMNÁ ZÁKLADŇA', theme: 3, music: 'base', scroll: 'x', boss: 'gate', build: base,
    drops: ['rapid', 'spread', 'flame', 'laser', 'spread'],
    bg: [{ key: 'bg3_sky', sf: 0, y: 0 }, { key: 'bg3_far', sf: 0.15, y: 0 }, { key: 'bg3_near', sf: 0.4, y: 0 }],
  },
  {
    name: 'REAKTOR', theme: 4, music: 'reactor', scroll: 'x', boss: 'reactor', build: reactor,
    drops: ['spread', 'laser', 'spread', 'flame'],
    bg: [
      { key: 'bg4_sky', sf: 0, y: 0 }, { key: 'bg4_far', sf: 0.15, y: 0 }, { key: 'bg4_near', sf: 0.35, y: 0 },
      { key: 'fog', sf: 0.6, y: 210, alpha: 0.35, drift: 14, tint: 0xb04aff },
    ],
  },
];
