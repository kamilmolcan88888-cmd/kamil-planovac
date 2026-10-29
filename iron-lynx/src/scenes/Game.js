// Hlavná herná scéna.
//  • single / host: plná simulácia (fyzika, nepriatelia, strely, životy). Host navyše posiela
//    snapshoty klientom a prijíma ich vstupy.
//  • client: postaví rovnaký level (vizuál) a iba vykresľuje snapshoty (NetView).
import Phaser from 'phaser';
import { W, H, PHYS, DIFFICULTY, SNAPSHOT_HZ } from '../config.js';
import { LEVELS } from '../levels/levels.js';
import { Level, T_PLAT } from '../game/Level.js';
import { Fx } from '../game/Fx.js';
import { Player } from '../game/Player.js';
import { Infantry, Sniper, Drone, Turret } from '../game/Enemies.js';
import { BOSSES } from '../game/Bosses.js';
import { updatePlayerBullets, updateEnemyBullets } from '../game/Weapons.js';
import { NetView } from '../game/NetView.js';
import { netify, encodeSprite } from '../game/net-util.js';
import { newPlayer, freeHero, freeSlot } from '../game/session.js';
import { controls, toBits, fromBits, EMPTY_INPUT } from '../input/Controls.js';
import { touch } from '../input/Touch.js';
import { audio } from '../audio/Audio.js';
import { net } from '../net/Net.js';
import { settings, submitScore } from '../settings.js';
import { toast } from '../platform/ios.js';

const BOSS_NAMES = { golem: 'KAMENNÝ GOLEM', spider: 'MECHANICKÝ PAVÚK', gate: 'STRÁŽNA BRÁNA', reactor: 'HLAVNÝ REAKTOR' };

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) {
    this.levelIdx = data.level ?? 0;
  }

  create() {
    const session = this.registry.get('session');
    this.session = session;
    this.mode = session.mode;
    this.isClient = this.mode === 'client';
    this.isHost = this.mode === 'host';
    this.diff = DIFFICULTY[session.difficulty];
    this.def = LEVELS[this.levelIdx];
    this.scrollAxis = this.def.scroll;
    this.localSlot = session.localSlot ?? 0;
    this.nextNid = 1;
    this.unsubs = [];
    this.inputBlocked = false;
    this.ended = false;

    this.level = new Level(this, this.def);
    this.fx = new Fx(this, this.isHost);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.level.width, this.level.height);
    cam.roundPixels = true;

    this.hud = { players: [], boss: -1, hi: settings.highScore, msg: '', msgUntil: 0, net: '', level: this.levelIdx };
    if (!this.scene.isActive('Hud')) this.scene.launch('Hud');
    this.scene.bringToTop('Hud');
    touch.setVisible(true);
    audio.playMusic(this.def.music);

    if (this.isClient) this.setupClient(); else this.setupSim();
    this.showMessage(`${this.levelIdx + 1}. ${this.def.name}`, 2600);

    this.events.once('shutdown', () => this.cleanup());
  }

  cleanup() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.view?.destroy();
    touch.setVisible(false);
  }

  showMessage(text, ms = 2000) {
    this.hud.msg = text;
    this.hud.msgUntil = this.time.now + ms;
  }

  // ================================================================ SIMULÁCIA (single/host)
  setupSim() {
    const P = this.physics;
    P.world.gravity.y = PHYS.gravity;
    this.pBullets = P.add.group();
    this.eBullets = P.add.group();
    this.items = P.add.group();
    this.enemies = P.add.group();
    this.walkers = P.add.group();
    this.playerGroup = P.add.group();
    this.players = [];
    this.decor = [];
    this.blockers = [];
    this.spawners = [];
    this.checkpoints = [];
    this.remoteInputs = new Map();
    this.dropIdx = 0;
    this.boss = null;
    this.arenaLocked = false;

    const L = this.level.layer;
    // hráči: jednosmerné platformy sa ignorujú počas zoskoku
    P.add.collider(this.playerGroup, L, null, (p, tile) => !(tile.index === T_PLAT && this.time.now < p.dropUntil));
    P.add.collider(this.walkers, L);
    P.add.collider(this.items, L);
    P.add.collider(this.pBullets, L, (b) => { this.fx.burst('spark', b.x, b.y, 3); b.destroy(); }, (b, t) => t.index !== T_PLAT);
    P.add.collider(this.eBullets, L, (b) => {
      if (b.kind === 'boulder') this.fx.burst('debris', b.x, b.y, 8);
      b.destroy();
    }, (b, t) => t.index !== T_PLAT);
    P.add.overlap(this.pBullets, this.enemies, (b, e) => this.bulletHit(b, e));
    P.add.overlap(this.eBullets, this.playerGroup, (b, p) => { if (p.hit()) b.destroy(); });
    P.add.overlap(this.enemies, this.playerGroup, (e, p) => { if (e.contact && !e.dying && e.active) p.hit(); });
    P.add.overlap(this.items, this.playerGroup, (it, p) => { if (!p.dead && it.active) it.collect(p); });

    // štart / checkpoint
    const sp = this.level.spawns;
    const cp = this.session.checkpoint && this.session.checkpoint.level === this.levelIdx ? this.session.checkpoint : null;
    const start = cp || sp.find((s) => s.ch === 'P');
    const cam = this.cameras.main;
    if (this.scrollAxis === 'x') cam.scrollX = Phaser.Math.Clamp(start.x - 90, 0, this.level.width - W);
    else cam.scrollY = Phaser.Math.Clamp(start.y - H + 70, 0, this.level.height - H);

    this.session.players.forEach((s, i) => {
      if (s.lives > 0 && s.connected) this.spawnPlayer(s, start.x + i * 14, start.y - 16);
    });

    // spawny zoradené v smere postupu; tie za kamerou preskočíme
    const A = sp.find((s) => s.ch === 'A');
    this.arenaPos = A ? (this.scrollAxis === 'x' ? { x: A.col * 16, y: 0 } : { x: 0, y: A.row * 16 }) : null;
    this.bossSpawn = sp.find((s) => s.ch === 'B');
    const behind = (s) => (this.scrollAxis === 'x' ? s.x < cam.scrollX - 8 : s.y > cam.scrollY + H + 8);
    this.pending = sp.filter((s) => 'EeSDTC'.includes(s.ch) && (!behind(s) || s.ch === 'C'))
      .sort((a, b) => (this.scrollAxis === 'x' ? a.x - b.x : b.y - a.y));
    if (cp) this.pending = this.pending.filter((s) => s.ch !== 'C' || (this.scrollAxis === 'x' ? s.x > cp.x + 8 : s.y < cp.y - 8));

    this.snapTimer = 0;
    if (this.isHost) this.setupHostNet();
  }

  spawnPlayer(sp, x, y) {
    const local = sp.peerId === null;
    const input = local
      ? () => (this.inputBlocked ? EMPTY_INPUT : controls.state)
      : () => this.remoteInputs.get(sp.peerId) || EMPTY_INPUT;
    const p = new Player(this, x, y, sp, input);
    this.playerGroup.add(p);
    p.body.setMaxVelocityY(PHYS.maxFall);
    this.players.push(p);
    return p;
  }

  bulletHit(b, e) {
    if (!b.active || !e.active || e.dying) return;
    if (b.hitSet.has(e)) return;
    b.hitSet.add(e);
    const ok = e.damage(b.dmg, b.owner, b);
    if (ok) this.fx.burst(e.isBoss ? 'purple' : 'fire', b.x, b.y, 3);
    if (!b.pierce) b.destroy();
  }

  addScore(slot, pts) {
    const sp = this.session.players.find((p) => p.slot === slot);
    if (sp) sp.score += pts;
  }

  update(time, dt) {
    if (controls.pressed('pause') && !this.ended) this.openPause();
    if (this.isClient) { this.updateClient(time, dt); return; }
    const cam = this.cameras.main;
    this.level.update(cam, dt);

    for (const p of this.players) p.update(time, dt);
    for (const e of this.enemies.getChildren().slice()) if (e.active) e.tick(time, dt);
    for (const it of this.items.getChildren().slice()) if (it.active) it.tick(time, dt);
    updatePlayerBullets(this, time);
    updateEnemyBullets(this, time);

    this.updateSpawns(time);
    this.updateCamera();
    this.updateBlockers();
    this.checkFalls();
    this.updateCheckpoints();
    this.updateHud();

    if (this.isHost) {
      this.snapTimer += dt;
      if (this.snapTimer >= 1000 / SNAPSHOT_HZ) { this.snapTimer = 0; this.sendSnapshot(); }
    }
  }

  // ---------------------------------------------------------------- spawny
  updateSpawns(time) {
    const cam = this.cameras.main;
    const ahead = (s) => (this.scrollAxis === 'x' ? s.x < cam.scrollX + W + 24 : s.y > cam.scrollY - 24);
    while (this.pending.length && ahead(this.pending[0])) this.activate(this.pending.shift());

    for (const sp of this.spawners) {
      const inRange = this.scrollAxis === 'x' ? sp.x > cam.scrollX - 40 && sp.x < cam.scrollX + W + 160 : true;
      sp.kids = sp.kids.filter((k) => k.active);
      if (!inRange || this.arenaLocked || time < sp.next || sp.kids.length >= 2) continue;
      sp.next = time + 2600 / this.diff.fire;
      // pešiak pribehne z pravého okraja obrazovky
      const col = Math.floor((Math.min(sp.x, cam.scrollX + W + 8)) / 16);
      const top = this.level.grid.top(col);
      if (top >= this.level.grid.rows) continue;
      sp.kids.push(new Infantry(this, col * 16 + 8, top * 16 - 16));
    }
    this.spawners = this.spawners.filter((sp) => this.scrollAxis !== 'x' || sp.x > cam.scrollX - 40);
  }

  activate(s) {
    const cam = this.cameras.main;
    switch (s.ch) {
      case 'E': new Infantry(this, s.x, s.y - 16); break;
      case 'S': new Sniper(this, s.x, s.y - 16); break;
      case 'T': new Turret(this, s.x, s.y - 16); break;
      case 'D': {
        const drop = this.def.drops[this.dropIdx++ % this.def.drops.length];
        new Drone(this, cam.scrollX - 12, s.y - 8, drop);
        break;
      }
      case 'e': this.spawners.push({ x: s.x, y: s.y, next: 0, kids: [] }); break;
      case 'C': {
        const f = netify(this, this.add.sprite(s.x, s.y, 'checkpoint', 0), 'checkpoint');
        this.checkpoints.push({ f, s, done: false });
        break;
      }
      default: break;
    }
  }

  updateCheckpoints() {
    for (const c of this.checkpoints) {
      if (c.done) continue;
      const reached = this.players.some((p) => !p.dead && (this.scrollAxis === 'x' ? p.x > c.s.x - 4 : p.y < c.s.y));
      if (!reached) continue;
      c.done = true;
      c.f.setFrame(1);
      this.session.checkpoint = { level: this.levelIdx, x: c.s.x, y: c.s.y };
      this.fx.sound('checkpoint');
      this.fx.message('CHECKPOINT', 1200);
    }
  }

  // ---------------------------------------------------------------- kamera (iba dopredu)
  updateCamera() {
    const cam = this.cameras.main;
    const alive = this.players.filter((p) => !p.dead && !p.out);
    if (!alive.length) return;
    if (this.scrollAxis === 'x') {
      const maxX = Math.max(...alive.map((p) => p.x));
      const minX = Math.min(...alive.map((p) => p.x));
      const target = Math.min(maxX - W * 0.42, minX - 24);   // nikoho nenechá za okrajom
      let sx = Phaser.Math.Clamp(Math.max(cam.scrollX, target), 0, this.level.width - W);
      if (this.arenaPos && !this.arenaLocked && sx >= this.arenaPos.x - 40) this.lockArena();
      if (this.arenaLocked) sx = Math.min(this.arenaPos.x, cam.scrollX + 2);   // plynulo dojde do arény
      cam.scrollX = Math.round(sx);
      for (const p of this.players) {
        const l = cam.scrollX + 8;
        const r = cam.scrollX + W - 8;
        if (p.x < l) { p.x = l; if (p.body.velocity.x < 0) p.body.setVelocityX(0); }
        if (p.x > r) { p.x = r; if (p.body.velocity.x > 0) p.body.setVelocityX(0); }
      }
    } else {
      const minY = Math.min(...alive.map((p) => p.y));
      const maxY = Math.max(...alive.map((p) => p.y));
      const target = Math.max(minY - H * 0.45, maxY - H + 40);
      let sy = Phaser.Math.Clamp(Math.min(cam.scrollY, target), 0, this.level.height - H);
      // aréna je hore – zamkne sa, keď je jej väčšia časť na obrazovke, a kamera sa dovezie
      if (this.arenaPos && !this.arenaLocked && sy <= this.arenaPos.y + 90) this.lockArena();
      if (this.arenaLocked) sy = Math.max(this.arenaPos.y, cam.scrollY - 2);
      cam.scrollY = Math.round(sy);
    }
  }

  updateBlockers() {
    for (const b of this.blockers) {
      if (!b.active) continue;
      const left = b.body.left;
      for (const p of this.players) {
        if (p.body.right > left && p.x < b.x) { p.x -= p.body.right - left; if (p.body.velocity.x > 0) p.body.setVelocityX(0); }
      }
    }
  }

  checkFalls() {
    const cam = this.cameras.main;
    for (const p of this.players) {
      if (p.out) continue;
      const fell = this.scrollAxis === 'x' ? p.y > this.level.height + 24 : p.y > cam.scrollY + H + 24;
      if (fell) {
        if (!p.dead) p.hit(true);
        p.body.setVelocity(0, 0);
        p.body.allowGravity = false;
        p.setVisible(false);
      }
    }
  }

  /** Smrť dohraná – respawn alebo vypadnutie z hry. */
  onPlayerDeathDone(p) {
    if (this.ended) return;
    p.body.allowGravity = true;
    if (p.sp.lives > 0) {
      const cam = this.cameras.main;
      const pref = this.scrollAxis === 'x' ? { x: cam.scrollX + 70, y: cam.scrollY + 60 } : { x: cam.scrollX + W / 2, y: cam.scrollY + H * 0.4 };
      const pos = this.level.findSpawn(cam, pref.x, pref.y);
      p.respawn(pos.x, pos.y - 8);
    } else {
      p.out = true;
      p.setVisible(false);
      p.body.enable = false;
      if (this.players.every((q) => q.out)) this.gameOver();
    }
  }

  // ---------------------------------------------------------------- boss
  lockArena() {
    this.arenaLocked = true;
    this.spawners = [];
    this.pending = this.pending.filter((s) => s.ch === 'C');
    audio.playMusic('boss');
    this.fx.sound('alarm');
    this.fx.message(`VAROVANIE! ${BOSS_NAMES[this.def.boss]}`, 2500);
    this.time.delayedCall(900, () => {
      const B = this.bossSpawn;
      this.arena = this.arenaPos;
      this.boss = new BOSSES[this.def.boss](this, B.x, B.y);
      this.hudBossName = BOSS_NAMES[this.def.boss];
    });
  }

  bossDefeated() {
    this.boss = null;
    this.ended = true;
    for (const b of this.eBullets.getChildren().slice()) b.destroy();
    for (const e of this.enemies.getChildren().slice()) if (e.active && !e.isBoss) e.kill(null);
    audio.stopMusic();
    this.time.delayedCall(1500, () => {
      this.fx.sound('fanfare');
      this.fx.message('OBLASŤ VYČISTENÁ!', 3500);
      for (const p of this.players) p.invulnUntil = this.time.now + 99999;
    });
    this.time.delayedCall(5500, () => this.nextLevel());
  }

  nextLevel() {
    const s = this.session;
    s.checkpoint = null;
    for (const p of s.players) if (p.lives <= 0) p.lives = 1;   // vypadnutí sa v co-ope vrátia
    if (this.levelIdx + 1 >= LEVELS.length) {
      this.finishGame('victory');
      return;
    }
    s.level = this.levelIdx + 1;
    if (this.isHost) net.broadcast({ t: 'level', level: s.level, players: this.publicPlayers() });
    this.scene.restart({ level: s.level });
  }

  finishGame(kind) {
    const best = Math.max(0, ...this.session.players.map((p) => p.score));
    const record = submitScore(best);
    if (this.isHost) net.broadcast({ t: kind, score: best });
    this.scene.stop('Hud');
    this.scene.start(kind === 'victory' ? 'Victory' : 'Menu', { score: best, record });
  }

  gameOver() {
    if (this.ended) return;
    this.ended = true;
    audio.stopMusic();
    this.fx.sound('death');
    if (this.isHost) net.broadcast({ t: 'gameover', continues: this.session.continuesLeft });
    this.scene.launch('GameOver', { host: true, continues: this.session.continuesLeft });
  }

  /** Volá GameOver scéna. */
  continueGame() {
    const s = this.session;
    s.continuesLeft -= 1;
    for (const p of s.players) { p.lives = 3; p.score = 0; p.weapon = 'basic'; }
    if (this.isHost) net.broadcast({ t: 'level', level: this.levelIdx, players: this.publicPlayers() });
    this.scene.restart({ level: this.levelIdx });
  }

  quitToMenu() {
    if (this.mode !== 'client') {
      const best = Math.max(0, ...this.session.players.map((p) => p.score));
      submitScore(best);
    }
    if (net.active) net.close();
    this.scene.stop('Hud');
    this.scene.stop('GameOver');
    this.scene.stop('Pause');
    this.scene.start('Menu');
  }

  openPause() {
    if (this.scene.isActive('Pause') || this.scene.isActive('GameOver')) return;
    const solo = this.mode === 'single';
    this.inputBlocked = true;
    touch.setVisible(false);
    if (solo) { this.physics.pause(); this.scene.pause(); this.time.paused = true; }
    this.scene.launch('Pause', { solo });
  }

  resumeFromPause(solo) {
    this.inputBlocked = false;
    touch.setVisible(true);
    if (solo) { this.time.paused = false; this.physics.resume(); this.scene.resume(); }
  }

  // ---------------------------------------------------------------- HUD
  updateHud() {
    const h = this.hud;
    h.players = this.session.players.map((s) => ({ slot: s.slot, hero: s.hero, lives: s.lives, score: s.score, weapon: s.weapon, me: s.slot === this.localSlot }));
    h.boss = this.boss ? (this.boss.hpFrac ?? Math.max(0, this.boss.hp) / this.boss.maxHp) : -1;
    h.bossName = this.boss ? this.hudBossName : '';
    h.hi = Math.max(settings.highScore, ...h.players.map((p) => p.score));
    if (this.isHost) {
      const parts = [];
      for (const s of this.session.players) {
        if (!s.peerId) continue;
        const info = net.peerInfo(s.peerId);
        if (info) parts.push(`P${s.slot + 1} ${info.stalled ? 'VÝPADOK' : `${info.mode} ${info.rtt}MS`}`);
      }
      h.net = parts.join('  ');
    }
  }

  // ================================================================ HOST – sieť
  publicPlayers() {
    return this.session.players.map((p) => ({ slot: p.slot, hero: p.hero, name: p.name }));
  }

  setupHostNet() {
    this.unsubs.push(net.on('message', (from, m) => {
      if (m.t === 'in') this.remoteInputs.set(from, fromBits(m.b));
      else if (m.t === 'hello') this.lateJoin(from, m);
    }));
    this.unsubs.push(net.on('peer-left', (id) => this.removeRemote(id)));
    this.unsubs.push(net.on('peer-stall', (id) => {
      this.remoteInputs.delete(id);
      const s = this.session.players.find((p) => p.peerId === id);
      if (s) toast(`${s.name}: výpadok spojenia…`);
    }));
    this.unsubs.push(net.on('peer-resume', (id) => {
      const s = this.session.players.find((p) => p.peerId === id);
      if (s) toast(`${s.name} je späť`);
    }));
  }

  /** Hráč sa pripojil počas hry – dostane voľný slot a objaví sa pri ostatných. */
  lateJoin(peerId, m) {
    if (this.session.players.some((p) => p.peerId === peerId)) return;
    const slot = freeSlot(this.session.players);
    if (slot < 0) return;
    const sp = newPlayer(slot, freeHero(this.session.players, m.hero ?? slot), peerId, m.name);
    this.session.players.push(sp);
    const cam = this.cameras.main;
    const pos = this.level.findSpawn(cam, cam.scrollX + 80, cam.scrollY + 60);
    this.spawnPlayer(sp, pos.x, pos.y - 8);
    net.send(peerId, { t: 'start', level: this.levelIdx, difficulty: this.session.difficulty, slot, players: this.publicPlayers() });
    toast(`${sp.name} sa pripojil(a)!`);
  }

  removeRemote(peerId) {
    const idx = this.session.players.findIndex((p) => p.peerId === peerId);
    if (idx < 0) return;
    const sp = this.session.players[idx];
    this.session.players.splice(idx, 1);
    const p = this.players.find((q) => q.sp === sp);
    if (p) {
      if (!p.out) this.fx.explosion(p.x, p.y);
      this.players = this.players.filter((q) => q !== p);
      p.destroy();
    }
    this.remoteInputs.delete(peerId);
    toast(`${sp.name} sa odpojil(a)`);
    if (this.players.length && this.players.every((q) => q.out)) this.gameOver();
  }

  sendSnapshot() {
    const cam = this.cameras.main;
    const e = [];
    for (const o of this.children.list) if (o.nid && o.active) e.push(encodeSprite(o));
    const h = this.hud;
    net.broadcast({
      t: 'snap',
      ts: Math.round(performance.now()),
      cam: [cam.scrollX, cam.scrollY],
      e,
      h: { p: h.players.map((p) => [p.slot, p.hero, p.lives, p.score, p.weapon]), b: Math.round(h.boss * 1000), bn: h.bossName },
      ev: this.fx.drain(),
    }, true);
  }

  // ================================================================ KLIENT
  setupClient() {
    this.view = new NetView(this);
    this.lastBits = -1;
    this.inputTimer = 0;
    this.unsubs.push(net.on('message', (from, m) => {
      switch (m.t) {
        case 'snap':
          this.view.push(m);
          this.hud.players = m.h.p.map(([slot, hero, lives, score, weapon]) => ({ slot, hero, lives, score, weapon, me: slot === this.localSlot }));
          this.hud.boss = m.h.b < 0 ? -1 : m.h.b / 1000;
          this.hud.bossName = m.h.bn;
          this.hud.hi = Math.max(settings.highScore, ...this.hud.players.map((p) => p.score));
          for (const ev of m.ev) this.fx.replay(ev, this.localSlot);
          break;
        case 'level':
          this.scene.stop('GameOver');
          this.session.level = m.level;
          this.scene.restart({ level: m.level });
          break;
        case 'gameover':
          audio.stopMusic();
          this.scene.launch('GameOver', { host: false, continues: m.continues });
          break;
        case 'victory': {
          const me = this.hud.players.find((p) => p.me);
          const record = submitScore(me ? me.score : 0);
          net.close();
          this.scene.stop('Hud');
          this.scene.start('Victory', { score: me ? me.score : m.score, record });
          break;
        }
        default: break;
      }
    }));
    this.unsubs.push(net.on('fatal', (why) => { toast(why, 4000); this.quitToMenu(); }));
    this.unsubs.push(net.on('status', (s) => toast(s)));
  }

  updateClient(time, dt) {
    this.level.update(this.cameras.main, dt);
    this.view.update();
    // vstup posielame pri zmene + 10× za sekundu ako „keepalive“
    const bits = this.inputBlocked ? 0 : toBits(controls.state);
    this.inputTimer += dt;
    if (bits !== this.lastBits || this.inputTimer > 100) {
      net.toHost({ t: 'in', b: bits });
      this.lastBits = bits;
      this.inputTimer = 0;
    }
    const info = net.peerInfo(net.hostId);
    this.hud.net = this.view.stale ? 'SLABÉ SPOJENIE…' : info ? `${info.mode} ${info.rtt}MS` : '';
  }
}

