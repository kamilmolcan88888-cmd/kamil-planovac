// Sieť pre co-op (2–4 hráči), hviezdicová topológia: každý klient ↔ hostiteľ.
//
//  1) WebSocket na signalizačný server (miestnosť so 4-znakovým kódom, výmena SDP/ICE)
//  2) WebRTC: dva DataChannely – 'rel' (spoľahlivý, poradie) a 'snap' (nespoľahlivý, bez
//     opakovania – ideálny na snapshoty 20×/s, stará správa je aj tak zbytočná)
//  3) Kým sa WebRTC nespojí (alebo ak zlyhá – napr. mobilné dáta so symetrickým NAT),
//     správy idú RELAYOM cez WebSocket server. Hráč nič nerieši, hra funguje vždy.
//  4) Výpadok: WS sa sám znovu pripojí (resume s tokenom), pingy merajú odozvu a odhalia
//     „zamrznutého“ hráča; po 20 s ticha sa hráč považuje za odpojeného.
import { STUN, DEFAULT_SIGNAL_URL } from '../config.js';
import { settings } from '../settings.js';

class Emitter {
  constructor() { this.handlers = {}; }
  on(ev, fn) { (this.handlers[ev] ||= new Set()).add(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this.handlers[ev]?.delete(fn); }
  emit(ev, ...a) { for (const fn of [...(this.handlers[ev] || [])]) fn(...a); }
}

const STALL_MS = 4000;
const DROP_MS = 20000;

export function signalUrl() {
  const custom = settings.signalUrl || DEFAULT_SIGNAL_URL;
  if (custom) return custom;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

class Peer {
  constructor(id) {
    this.id = id;
    this.pc = null;
    this.rel = null;
    this.snap = null;
    this.lastHeard = performance.now();
    this.rtt = 0;
    this.stalled = false;
    this.pendingCand = [];
  }
  get mode() { return this.rel && this.rel.readyState === 'open' ? 'P2P' : 'RELAY'; }
}

class Net extends Emitter {
  constructor() {
    super();
    this.ws = null;
    this.role = null;      // 'host' | 'client' | null
    this.peers = new Map();
    this.code = null;
    this.id = null;
    this.token = null;
    this.hostId = null;
    this.closing = false;
  }

  get active() { return !!this.role; }

  // ------------------------------------------------------------ WebSocket
  openWs() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(signalUrl()); } catch (e) { reject(new Error('Neplatná adresa servera')); return; }
      const t = setTimeout(() => { ws.close(); reject(new Error('Server neodpovedá')); }, 6000);
      ws.onopen = () => { clearTimeout(t); this.ws = ws; resolve(ws); };
      ws.onerror = () => { clearTimeout(t); reject(new Error('Nedá sa pripojiť na server')); };
      ws.onmessage = (e) => this.onSignal(JSON.parse(e.data));
      ws.onclose = () => { if (this.ws === ws) this.onWsClose(); };
    });
  }

  wsSend(obj) {
    if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; }
    return false;
  }

  /** Čaká na konkrétnu odpoveď servera. */
  waitFor(types, ms = 6000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error('Server neodpovedá')); }, ms);
      const off = this.on('_signal', (m) => {
        if (types.includes(m.type)) { clearTimeout(t); off(); m.type === 'error' ? reject(new Error(m.msg)) : resolve(m); }
      });
    });
  }

  async createRoom() {
    this.reset();
    await this.openWs();
    this.role = 'host';
    this.wsSend({ type: 'create' });
    const m = await this.waitFor(['created', 'error']);
    Object.assign(this, { code: m.code, id: m.id, token: m.token });
    this.startTimers();
    return m.code;
  }

  async joinRoom(code) {
    this.reset();
    await this.openWs();
    this.role = 'client';
    this.wsSend({ type: 'join', code: code.toUpperCase() });
    let m;
    try { m = await this.waitFor(['joined', 'error']); } catch (e) { this.close(); throw e; }
    Object.assign(this, { code: m.code, id: m.id, token: m.token, hostId: m.hostId });
    const p = new Peer(m.hostId);
    this.peers.set(m.hostId, p);
    this.startTimers();
    this.emit('peer-open', m.hostId);
    return m;
  }

  onWsClose() {
    this.ws = null;
    if (this.closing || !this.role) return;
    this.emit('status', 'Obnovujem spojenie so serverom…');
    this.reconnect(0);
  }

  async reconnect(attempt) {
    if (this.closing || !this.role) return;
    if (attempt > 12) { this.emit('fatal', 'Spojenie so serverom sa stratilo'); return; }
    try {
      await this.openWs();
      this.wsSend({ type: 'resume', code: this.code, id: this.id, token: this.token });
      await this.waitFor(['resumed', 'error']);
      this.emit('status', 'Spojenie obnovené');
    } catch {
      setTimeout(() => this.reconnect(attempt + 1), Math.min(1000 * 2 ** (attempt / 2), 5000));
    }
  }

  // ------------------------------------------------------------ signalizácia
  onSignal(m) {
    this.emit('_signal', m);
    switch (m.type) {
      case 'peer-joined': {   // (host) nový klient – hneď komunikujeme cez relay, P2P sa dohodne na pozadí
        const p = new Peer(m.id);
        this.peers.set(m.id, p);
        this.emit('peer-open', m.id);
        this.startRtc(p);
        break;
      }
      case 'signal': this.onRtcSignal(m.from, m.data); break;
      case 'relay': this.onData(m.from, m.data); break;
      case 'peer-left': this.dropPeer(m.id, 'odišiel'); break;
      case 'host-left': this.emit('fatal', 'Hostiteľ ukončil hru'); this.close(); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ WebRTC
  newPc(p) {
    const pc = new RTCPeerConnection({ iceServers: STUN });
    p.pc = pc;
    pc.onicecandidate = (e) => { if (e.candidate) this.wsSend({ type: 'signal', to: p.id, data: { cand: e.candidate } }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {   // P2P zlyhalo → ostávame na relay
        this.closePc(p);
        this.emit('peer-mode', p.id, p.mode);
      }
    };
    return pc;
  }

  setupChannel(p, dc) {
    if (dc.label === 'rel') p.rel = dc; else p.snap = dc;
    dc.onopen = () => this.emit('peer-mode', p.id, p.mode);
    dc.onclose = () => this.emit('peer-mode', p.id, p.mode);
    dc.onmessage = (e) => this.onData(p.id, e.data);
  }

  async startRtc(p) {
    if (typeof RTCPeerConnection === 'undefined') return;
    try {
      const pc = this.newPc(p);
      this.setupChannel(p, pc.createDataChannel('rel', { ordered: true }));
      this.setupChannel(p, pc.createDataChannel('snap', { ordered: false, maxRetransmits: 0 }));
      await pc.setLocalDescription(await pc.createOffer());
      this.wsSend({ type: 'signal', to: p.id, data: { sdp: pc.localDescription } });
    } catch { this.closePc(p); }
  }

  async onRtcSignal(from, data) {
    let p = this.peers.get(from);
    if (!p) return;
    try {
      if (data.sdp) {
        if (data.sdp.type === 'offer') {
          this.closePc(p);
          const pc = this.newPc(p);
          pc.ondatachannel = (e) => this.setupChannel(p, e.channel);
          await pc.setRemoteDescription(data.sdp);
          await pc.setLocalDescription(await pc.createAnswer());
          this.wsSend({ type: 'signal', to: from, data: { sdp: pc.localDescription } });
        } else if (p.pc) {
          await p.pc.setRemoteDescription(data.sdp);
        }
        for (const c of p.pendingCand.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      } else if (data.cand) {
        if (p.pc && p.pc.remoteDescription) await p.pc.addIceCandidate(data.cand).catch(() => {});
        else p.pendingCand.push(data.cand);
      }
    } catch { this.closePc(p); }
  }

  closePc(p) {
    try { p.pc?.close(); } catch { /* */ }
    p.pc = p.rel = p.snap = null;
  }

  // ------------------------------------------------------------ dáta
  onData(from, raw) {
    const p = this.peers.get(from);
    if (!p) return;
    p.lastHeard = performance.now();
    if (p.stalled) { p.stalled = false; this.emit('peer-resume', from); }
    let m;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (m.t === '_ping') { this.send(from, { t: '_pong', ts: m.ts }); return; }
    if (m.t === '_pong') { p.rtt = performance.now() - m.ts; return; }
    this.emit('message', from, m);
  }

  /** Pošle správu peerovi. unreliable = cez 'snap' kanál (ak beží P2P). */
  send(id, msg, unreliable = false) {
    const p = this.peers.get(id);
    if (!p) return;
    const data = JSON.stringify(msg);
    const ch = unreliable && p.snap && p.snap.readyState === 'open' ? p.snap : p.rel;
    if (ch && ch.readyState === 'open') {
      // ochrana pred zahltením pomalého spojenia – snapshot radšej zahodíme
      if (unreliable && ch.bufferedAmount > 256 * 1024) return;
      try { ch.send(data); return; } catch { /* spadne na relay */ }
    }
    this.wsSend({ type: 'relay', to: id, data });
  }

  broadcast(msg, unreliable = false) { for (const id of this.peers.keys()) this.send(id, msg, unreliable); }
  toHost(msg, unreliable = false) { if (this.hostId) this.send(this.hostId, msg, unreliable); }

  dropPeer(id, why) {
    const p = this.peers.get(id);
    if (!p) return;
    this.closePc(p);
    this.peers.delete(id);
    if (this.role === 'client' && id === this.hostId) { this.emit('fatal', 'Spojenie s hostiteľom sa prerušilo'); this.close(); return; }
    this.emit('peer-left', id, why);
  }

  // ------------------------------------------------------------ pingy a kontrola výpadku
  startTimers() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const now = performance.now();
      for (const p of [...this.peers.values()]) {
        this.send(p.id, { t: '_ping', ts: now });
        const silent = now - p.lastHeard;
        if (silent > STALL_MS && !p.stalled) { p.stalled = true; this.emit('peer-stall', p.id); }
        if (silent > DROP_MS) this.dropPeer(p.id, 'výpadok spojenia');
      }
      this.wsSend({ type: 'ping' });
    }, 1000);
  }

  peerInfo(id) {
    const p = this.peers.get(id);
    return p ? { mode: p.mode, rtt: Math.round(p.rtt), stalled: p.stalled } : null;
  }

  reset() {
    this.closing = false;
    for (const p of this.peers.values()) this.closePc(p);
    this.peers.clear();
    this.role = this.code = this.id = this.token = this.hostId = null;
  }

  /** Ukončí multiplayer (zavrie všetko). */
  close() {
    this.closing = true;
    clearInterval(this.timer);
    this.wsSend({ type: 'leave' });
    try { this.ws?.close(); } catch { /* */ }
    this.ws = null;
    for (const p of this.peers.values()) this.closePc(p);
    this.peers.clear();
    this.role = null;
  }
}

export const net = new Net();

// zatvorenie/obnovenie stránky = úmyselný odchod → server o tom hneď informuje ostatných
// (pri prepnutí aplikácie na iOS sa pagehide nevolá, tam platí 30 s lehota na návrat)
window.addEventListener('pagehide', (e) => { if (!e.persisted && net.active) net.close(); });
