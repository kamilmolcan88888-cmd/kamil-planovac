// Lobby pre co-op. Hostiteľ vytvorí miestnosť (4-znakový kód), ostatní zadajú kód.
// Hostiteľ vidí pripojených hráčov a spôsob spojenia (P2P = WebRTC, RELAY = cez server).
import Phaser from 'phaser';
import { W, HEROES, DIFFICULTY, DIFF_KEYS } from '../config.js';
import { text, Menu } from '../ui/ui.js';
import { settings, saveSettings } from '../settings.js';
import { net } from '../net/Net.js';
import { newSession, newPlayer, freeHero, freeSlot } from '../game/session.js';
import { toast } from '../platform/ios.js';
import { audio } from '../audio/Audio.js';

export class LobbyScene extends Phaser.Scene {
  constructor() { super('Lobby'); }

  create(data) {
    this.role = data.role;
    this.unsubs = [];
    this.players = [];
    this.cameras.main.setBackgroundColor('#141a33');
    this.add.tileSprite(0, 0, W, 270, 'bg2_far').setOrigin(0).setAlpha(0.5);
    text(this, W / 2, 14, this.role === 'host' ? 'CO-OP – HOSTITEĽ' : 'CO-OP – PRIPOJENIE', { scale: 2, ox: 0.5, color: 0xff9a2a });
    this.codeText = text(this, W / 2, 46, '', { scale: 3, ox: 0.5, color: 0xffd36a });
    this.info = text(this, W / 2, 82, '', { ox: 0.5, color: 0x8ec5ff });
    this.list = [0, 1, 2, 3].map((i) => text(this, 120, 104 + i * 14, ''));
    this.events.once('shutdown', () => { this.unsubs.forEach((u) => u()); this.hideCodeForm(); });

    if (this.role === 'host') this.setupHost(); else this.setupClient();
  }

  // ------------------------------------------------------------ HOSTITEĽ
  async setupHost() {
    this.info.setText('VYTVÁRAM MIESTNOSŤ…');
    this.players = [newPlayer(0, settings.hero, null, HEROES[settings.hero].name)];
    this.menu = new Menu(this, W / 2, 178, [
      { label: 'ŠTART HRY', action: () => this.startHost(), disabled: () => !net.code },
      {
        label: () => `OBTIAŽNOSŤ: < ${DIFFICULTY[settings.difficulty].name} >`,
        change: (d) => { const i = DIFF_KEYS.indexOf(settings.difficulty); settings.difficulty = DIFF_KEYS[(i + d + 3) % 3]; saveSettings(); this.broadcastLobby(); },
      },
      { label: 'SPÄŤ', action: () => this.leave() },
    ], { gap: 16 });
    this.renderList();
    try {
      const code = await net.createRoom();
      this.codeText.setText(code);
      this.info.setText('POVEDZ KÓD OSTATNÝM (MAX 4 HRÁČI)');
      this.menu.refresh();
    } catch (e) {
      this.info.setText(`CHYBA: ${e.message}`).setTint(0xe02a3a);
      toast('Signalizačný server nie je dostupný. Skontroluj Nastavenia → Server.', 5000);
      return;
    }
    this.unsubs.push(net.on('message', (from, m) => {
      if (m.t !== 'hello') return;
      if (this.players.some((p) => p.peerId === from)) return;
      const slot = freeSlot(this.players);
      if (slot < 0) return;
      const hero = freeHero(this.players, m.hero ?? 1);
      this.players.push(newPlayer(slot, hero, from, m.name || HEROES[hero].name));
      audio.sfx('powerup');
      this.broadcastLobby();
    }));
    this.unsubs.push(net.on('peer-left', (id) => {
      this.players = this.players.filter((p) => p.peerId !== id);
      this.broadcastLobby();
    }));
    this.unsubs.push(net.on('peer-mode', () => this.renderList()));
    this.unsubs.push(net.on('fatal', (why) => { toast(why); this.leave(); }));
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.renderList() });
  }

  lobbyPlayers() { return this.players.map((p) => ({ slot: p.slot, hero: p.hero, name: p.name, peer: p.peerId })); }

  broadcastLobby() {
    net.broadcast({ t: 'lobby', players: this.lobbyPlayers(), difficulty: settings.difficulty, code: net.code });
    this.renderList();
    this.menu?.refresh();
  }

  renderList() {
    this.list.forEach((t, i) => {
      const p = this.players.find((q) => q.slot === i);
      if (!p) { t.setText(`P${i + 1}  ---`).setTint(0x4a505e); return; }
      let conn = this.role === 'host' ? 'HOSTITEĽ' : '';
      if (this.role === 'host' && p.peerId) {
        const inf = net.peerInfo(p.peerId);
        conn = inf ? `${inf.mode} ${inf.rtt}MS` : '...';
      }
      if (this.role === 'client') conn = p.slot === this.mySlot ? 'TY' : p.peer ? '' : 'HOSTITEĽ';
      t.setText(`P${i + 1}  ${HEROES[p.hero].name.padEnd(7, ' ')} ${conn}`).setTint(HEROES[p.hero].color);
    });
  }

  startHost() {
    if (!net.code) return;
    const s = newSession('host', settings.difficulty, this.players, 0);
    this.registry.set('session', s);
    for (const p of this.players) {
      if (p.peerId) net.send(p.peerId, { t: 'start', level: 0, difficulty: s.difficulty, slot: p.slot, players: this.lobbyPlayers() });
    }
    this.scene.start('Game', { level: 0 });
  }

  // ------------------------------------------------------------ KLIENT
  setupClient() {
    this.info.setText('ZADAJ KÓD MIESTNOSTI');
    this.menu = new Menu(this, W / 2, 210, [
      { label: 'ZADAŤ KÓD', action: () => this.showCodeForm() },
      { label: 'SPÄŤ', action: () => this.leave() },
    ], { gap: 16 });
    this.showCodeForm();
  }

  showCodeForm() {
    const form = document.getElementById('codeForm');
    const input = document.getElementById('codeInput');
    form.classList.remove('hidden');
    input.value = '';
    setTimeout(() => input.focus(), 50);
    form.onsubmit = (e) => {
      e.preventDefault();
      const code = input.value.trim().toUpperCase();
      if (code.length !== 4) { toast('Kód má 4 znaky'); return; }
      input.blur();
      this.hideCodeForm();
      this.join(code);
    };
    document.getElementById('codeCancel').onclick = () => { this.hideCodeForm(); };
  }

  hideCodeForm() {
    document.getElementById('codeForm').classList.add('hidden');
    document.getElementById('codeInput').blur();
  }

  async join(code) {
    this.info.setText('PRIPÁJAM SA…');
    try {
      await net.joinRoom(code);
    } catch (e) {
      this.info.setText(`CHYBA: ${e.message}`).setTint(0xe02a3a);
      return;
    }
    this.codeText.setText(code);
    this.info.setText('ČAKÁM, KÝM HOSTITEĽ SPUSTÍ HRU…').setTint(0x8ec5ff);
    net.toHost({ t: 'hello', hero: settings.hero, name: HEROES[settings.hero].name });
    this.unsubs.push(net.on('message', (from, m) => {
      if (m.t === 'lobby') {
        this.players = m.players;
        this.mySlot = m.players.find((p) => p.peer === net.id)?.slot ?? -1;
        this.renderList();
      } else if (m.t === 'start') {
        const players = m.players.map((p) => newPlayer(p.slot, p.hero, p.peer ?? null, p.name));
        const s = newSession('client', m.difficulty, players, m.slot);
        this.registry.set('session', s);
        this.scene.start('Game', { level: m.level });
      }
    }));
    this.unsubs.push(net.on('fatal', (why) => { toast(why, 4000); this.leave(); }));
  }

  leave() {
    if (net.active) net.close();
    this.scene.start('Menu');
  }

  update() { this.menu?.update(); }
}
