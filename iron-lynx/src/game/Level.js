// Postaví level z ASCII mriežky: tilemapa s kolíziami, jednosmerné platformy, voda,
// vodopády, parallax pozadie a zoznam spawnov (nepriatelia, checkpointy, boss…).
// Volá sa rovnako na hostiteľovi aj na klientovi (klient potrebuje iba vizuál).
import { W, H, TILE } from '../config.js';

export const T_TOP = 0;
export const T_FILL = 1;
export const T_PLAT = 2;
export const T_ROCK = 3;
export const SOLID_TILES = [0, 1, 3, 6, 7];
const SOLID_CH = '#RX';
const ENTITY_CH = 'PEeSDTCAB';

export class Level {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.grid = def.build();
    this.rows = this.grid.toStrings();
    this.cols = this.grid.cols;
    this.width = this.cols * TILE;
    this.height = this.grid.rows * TILE;
    this.spawns = [];
    this.waterTiles = [];
    this.build();
  }

  ch(x, y) { return this.grid.get(x, y); }
  isSolidCh(c) { return SOLID_CH.includes(c); }

  build() {
    const s = this.scene;
    const R = this.grid.rows;
    const C = this.cols;
    const solid = [];
    const deco = [];
    const waterRuns = [];
    const falls = [];
    for (let y = 0; y < R; y++) {
      const srow = new Array(C).fill(-1);
      const drow = new Array(C).fill(-1);
      let run = null;
      for (let x = 0; x < C; x++) {
        const c = this.ch(x, y);
        if (c === '#') srow[x] = this.isSolidCh(this.ch(x, y - 1)) || this.ch(x, y - 1) === '=' ? T_FILL : T_TOP;
        else if (c === 'R') srow[x] = T_ROCK;
        else if (c === 'X') srow[x] = 7;
        else if (c === '=') srow[x] = T_PLAT;
        else if (c === 'v') drow[x] = 4;
        else if (c === 'f') drow[x] = 5;
        else if (c === '|') falls.push({ x, y });
        else if (ENTITY_CH.includes(c)) this.spawns.push({ ch: c, col: x, row: y, x: x * TILE + TILE / 2, y: (y + 1) * TILE });
        // súvislé úseky hladiny
        if (c === '~') { if (!run) run = { x0: x, x1: x, y }; else run.x1 = x; } else if (run) { waterRuns.push(run); run = null; }
      }
      if (run) waterRuns.push(run);
      solid.push(srow);
      deco.push(drow);
    }

    // --- parallax pozadie (tileSprite pripnutý ku kamere) ---
    this.bgLayers = this.def.bg.map((b) => {
      const tex = s.textures.get(b.key).getSourceImage();
      const ts = s.add.tileSprite(0, b.y, W, tex.height, b.key).setOrigin(0, 0).setScrollFactor(0).setDepth(-100 + b.sf * 10);
      if (b.alpha) ts.setAlpha(b.alpha);
      if (b.tint) ts.setTint(b.tint);
      ts.def = b;
      return ts;
    });

    // --- tilemapa ---
    const tsKey = `tiles${this.def.theme}`;
    this.map = s.make.tilemap({ data: solid, tileWidth: TILE, tileHeight: TILE });
    const tileset = this.map.addTilesetImage(tsKey, tsKey, TILE, TILE, 0, 0);
    this.layer = this.map.createLayer(0, tileset, 0, 0).setDepth(10);
    this.layer.setCollision(SOLID_TILES.concat([T_PLAT]));
    // jednosmerné platformy: kolízia iba zhora
    this.layer.forEachTile((t) => { if (t.index === T_PLAT) t.setCollision(false, false, true, false); });

    const dmap = s.make.tilemap({ data: deco, tileWidth: TILE, tileHeight: TILE });
    const dts = dmap.addTilesetImage(tsKey, tsKey, TILE, TILE, 0, 0);
    this.decoLayer = dmap.createLayer(0, dts, 0, 0).setDepth(4);

    // --- voda: animovaná hladina + telo vody pod ňou (nad hráčmi, poloprieľadne = brodenie) ---
    this.water = [];
    for (const r of waterRuns) {
      const w = (r.x1 - r.x0 + 1) * TILE;
      const surf = s.add.tileSprite(r.x0 * TILE, r.y * TILE + 4, w, TILE, 'water', 0).setOrigin(0, 0).setDepth(35).setAlpha(0.85);
      this.water.push(surf);
      let y = r.y + 1;
      while (y < R && !this.isSolidCh(this.ch(r.x0, y))) y++;
      if (y > r.y + 1) {
        s.add.tileSprite(r.x0 * TILE, (r.y + 1) * TILE + 4, w, (y - r.y - 1) * TILE - 4, 'water_body').setOrigin(0, 0).setDepth(35).setAlpha(0.8);
      }
      this.waterTiles.push({ x0: r.x0 * TILE, x1: (r.x1 + 1) * TILE, y: r.y * TILE + 6 });
    }

    // --- vodopády: padajú od značky po vodu/zem, posúvajú sa nadol ---
    this.falls = [];
    for (const f of falls) {
      let y = f.y;
      while (y < R && !this.isSolidCh(this.ch(f.x, y)) && this.ch(f.x, y) !== '~' && this.ch(f.x, y) !== '=') y++;
      const h = (y - f.y) * TILE + 6;
      const wf = s.add.tileSprite(f.x * TILE, f.y * TILE, TILE, h, 'waterfall').setOrigin(0, 0).setDepth(3).setAlpha(0.9);
      this.falls.push(wf);
      // pena pod vodopádom
      const foam = s.add.particles(f.x * TILE + 8, y * TILE + 2, 'pixel', {
        speed: { min: 10, max: 40 }, angle: { min: 200, max: 340 }, lifespan: 500, scale: { start: 0.6, end: 0 },
        tint: [0xe8f4ff, 0x8ec5ff], frequency: 70, gravityY: 80,
      }).setDepth(36);
      this.falls.push(foam);
    }

    this.waterFrame = 0;
    this.waterTimer = 0;
  }

  /** Volať každú snímku – posúva parallax a animuje vodu. */
  update(cam, dt) {
    for (const ts of this.bgLayers) {
      const b = ts.def;
      if (this.def.scroll === 'y') ts.tilePositionY = cam.scrollY * b.sf;
      else ts.tilePositionX = cam.scrollX * b.sf + (b.drift ? (this.scene.time.now / 1000) * b.drift : 0);
    }
    this.waterTimer += dt;
    if (this.waterTimer > 140) {
      this.waterTimer = 0;
      this.waterFrame = (this.waterFrame + 1) % 4;
      for (const w of this.water) w.setFrame(this.waterFrame);
    }
    for (const f of this.falls) if (f.tilePositionY !== undefined) f.tilePositionY -= dt * 0.12;
  }

  /** Je na súradnici pevná dlaždica (alebo platforma, ak includePlat)? */
  solidAt(px, py, includePlat = true) {
    const t = this.layer.getTileAtWorldXY(px, py);
    if (!t) return false;
    return SOLID_TILES.includes(t.index) || (includePlat && t.index === T_PLAT);
  }

  /**
   * Nájde bezpečné miesto na respawn vo výreze kamery: dlaždica s voľným priestorom nad ňou,
   * čo najbližšie k preferovanému bodu (vľavo pri horizontálnom, v strede pri vertikálnom scrolle).
   */
  findSpawn(cam, prefX, prefY) {
    let best = null;
    let bestD = Infinity;
    const x0 = Math.max(1, Math.floor((cam.scrollX + 24) / TILE));
    const x1 = Math.min(this.cols - 2, Math.floor((cam.scrollX + W - 24) / TILE));
    const y0 = Math.max(3, Math.floor((cam.scrollY + 40) / TILE));
    const y1 = Math.min(this.grid.rows - 1, Math.floor((cam.scrollY + H - 8) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.layer.getTileAt(tx, ty);
        if (!t || t.index < 0) continue;
        const free = [1, 2, 3].every((k) => { const u = this.layer.getTileAt(tx, ty - k); return !u || u.index < 0; });
        if (!free) continue;
        const px = tx * TILE + 8;
        const py = ty * TILE;
        const d = Math.abs(px - prefX) + Math.abs(py - prefY) * 0.5;
        if (d < bestD) { bestD = d; best = { x: px, y: py - 16 }; }
      }
    }
    return best || { x: prefX, y: prefY };
  }

  /** Je bod pod hladinou vody? (na čľapkanie a vizuál) */
  inWater(x, y) {
    return this.waterTiles.some((w) => x >= w.x0 && x <= w.x1 && y >= w.y);
  }
}

