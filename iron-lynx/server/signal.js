// IRON LYNX – server: statické súbory hry (dist/) + WebSocket signalizácia na /ws.
//
//   node server/signal.js            (PORT=8080, STATIC_DIR=dist)
//
// Miestnosť = 4-znakový kód. Prvý je hostiteľ, max. 4 hráči.
// Správy (JSON):
//   create → created{code,id,token}       join{code} → joined{code,id,hostId,token}
//   signal{to,data} → signal{from,data}   (SDP/ICE pre WebRTC)
//   relay{to,data}  → relay{from,data}    (záložný prenos herných dát, keď P2P nejde)
//   resume{code,id,token} → resumed       (obnovenie po výpadku WS, do 30 s)
//   leave, ping
// Server posiela: peer-joined{id}, peer-left{id}, host-left, error{msg}
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8080);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), process.env.STATIC_DIR || 'dist');
const MAX_PLAYERS = 4;
const GRACE_MS = 30000;               // koľko čakáme na návrat odpojeného hráča
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez 0/O, 1/I

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.ogg': 'audio/ogg',
};

// ------------------------------------------------------------------ HTTP (statické súbory)
const http = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const st = await stat(file);
    if (st.isDirectory()) throw new Error('dir');
    const data = await readFile(file);
    const headers = { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' };
    // hashované súbory z Vite (assets/*) sa môžu cachovať navždy, ostatné vždy overiť
    headers['Cache-Control'] = p.includes('/assets/index-') ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (p.endsWith('sw.js')) headers['Service-Worker-Allowed'] = './';
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Nenájdené');
  }
});

// ------------------------------------------------------------------ WebSocket signalizácia
const rooms = new Map();    // code → { code, hostId, peers: Map<id, {ws, token, timer}> }
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 512 * 1024 });

const newId = () => randomBytes(4).toString('hex');
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[randomBytes(1)[0] % CODE_CHARS.length];
    if (!rooms.has(c)) return c;
  }
}
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

function broadcast(room, obj, exceptId) {
  for (const [id, p] of room.peers) if (id !== exceptId) send(p.ws, obj);
}

/** Hráč definitívne odišiel. */
function removePeer(room, id) {
  const p = room.peers.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  room.peers.delete(id);
  if (id === room.hostId) {
    broadcast(room, { type: 'host-left' });
    rooms.delete(room.code);
    log(`miestnosť ${room.code} zrušená (hostiteľ odišiel)`);
  } else {
    broadcast(room, { type: 'peer-left', id });
    log(`${room.code}: hráč ${id} odišiel (${room.peers.size} v miestnosti)`);
  }
}

function log(...a) { console.log(new Date().toISOString(), ...a); }

wss.on('connection', (ws, req) => {
  let room = null;
  let id = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf) => {
    let m;
    try { m = JSON.parse(buf); } catch { return; }
    switch (m.type) {
      case 'create': {
        const code = newCode();
        id = newId();
        room = { code, hostId: id, peers: new Map() };
        room.peers.set(id, { ws, token: newId() + newId() });
        rooms.set(code, room);
        send(ws, { type: 'created', code, id, token: room.peers.get(id).token });
        log(`miestnosť ${code} vytvorená (${req.socket.remoteAddress})`);
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) { send(ws, { type: 'error', msg: 'Miestnosť neexistuje' }); return; }
        if (r.peers.size >= MAX_PLAYERS) { send(ws, { type: 'error', msg: 'Miestnosť je plná (max 4)' }); return; }
        room = r;
        id = newId();
        const token = newId() + newId();
        room.peers.set(id, { ws, token });
        send(ws, { type: 'joined', code: room.code, id, hostId: room.hostId, token });
        send(room.peers.get(room.hostId)?.ws, { type: 'peer-joined', id });
        log(`${room.code}: hráč ${id} sa pripojil (${room.peers.size}/4)`);
        break;
      }
      case 'resume': {
        const r = rooms.get(m.code);
        const p = r?.peers.get(m.id);
        if (!p || p.token !== m.token) { send(ws, { type: 'error', msg: 'Relácia vypršala' }); return; }
        clearTimeout(p.timer);
        p.timer = null;
        p.ws = ws;
        room = r;
        id = m.id;
        send(ws, { type: 'resumed' });
        log(`${room.code}: hráč ${id} obnovil spojenie`);
        break;
      }
      case 'signal':
      case 'relay': {
        if (!room) return;
        const to = room.peers.get(m.to);
        if (to) send(to.ws, { type: m.type, from: id, data: m.data });
        break;
      }
      case 'leave':
        if (room && id) removePeer(room, id);
        room = null;
        break;
      default: break;
    }
  });

  ws.on('close', () => {
    if (!room || !id) return;
    const p = room.peers.get(id);
    if (!p || p.ws !== ws) return;
    // daj hráčovi šancu vrátiť sa (prechod Wi-Fi ↔ mobilné dáta, zamknutie telefónu…)
    p.ws = null;
    p.timer = setTimeout(() => removePeer(room, id), GRACE_MS);
  });
});

// keepalive – proxy (Tailscale/NGINX) neukončí nečinné spojenie
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

http.listen(PORT, () => log(`IRON LYNX server beží na http://localhost:${PORT}  (statické: ${ROOT}, signalizácia: /ws)`));

export { http, wss, rooms };
