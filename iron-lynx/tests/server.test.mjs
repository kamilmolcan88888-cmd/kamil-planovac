// Test signalizačného servera (bez prehliadača): node tests/server.test.mjs  (alebo npm test)
// Overí: vytvorenie miestnosti, pripojenie kódom, signal/relay, obnovenie po výpadku,
// odchod hráča, plnú miestnosť a zrušenie miestnosti po odchode hostiteľa.
import assert from 'node:assert/strict';
import WebSocket from 'ws';

process.env.PORT = '18181';
process.env.STATIC_DIR = 'public';
const { http } = await import('../server/signal.js');
const URL = 'ws://localhost:18181/ws';

function client() {
  const ws = new WebSocket(URL);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    const i = waiters.findIndex((w) => w.type === m.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else queue.push(m);
  });
  return {
    ws,
    open: () => new Promise((r) => ws.on('open', r)),
    send: (o) => ws.send(JSON.stringify(o)),
    next: (type) => {
      const i = queue.findIndex((m) => m.type === type);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        waiters.push({ type, resolve });
        setTimeout(() => reject(new Error(`timeout: ${type}`)), 2000);
      });
    },
  };
}

const host = client(); await host.open();
host.send({ type: 'create' });
const created = await host.next('created');
assert.match(created.code, /^[A-Z2-9]{4}$/);

const a = client(); await a.open();
a.send({ type: 'join', code: created.code.toLowerCase() });       // kód nezáleží na veľkosti písmen
const joined = await a.next('joined');
assert.equal(joined.hostId, created.id);
const pj = await host.next('peer-joined');
assert.equal(pj.id, joined.id);

// signal + relay
a.send({ type: 'signal', to: created.id, data: { sdp: 'x' } });
assert.deepEqual((await host.next('signal')).data, { sdp: 'x' });
host.send({ type: 'relay', to: joined.id, data: '{"t":"snap"}' });
const rel = await a.next('relay');
assert.equal(rel.from, created.id);

// výpadok + obnovenie (resume s tokenom)
a.ws.close();
await new Promise((r) => setTimeout(r, 200));
const a2 = client(); await a2.open();
a2.send({ type: 'resume', code: created.code, id: joined.id, token: 'zly' });
assert.equal((await a2.next('error')).msg, 'Relácia vypršala');
a2.send({ type: 'resume', code: created.code, id: joined.id, token: joined.token });
await a2.next('resumed');
host.send({ type: 'relay', to: joined.id, data: 'po-obnoveni' });
assert.equal((await a2.next('relay')).data, 'po-obnoveni');

// plná miestnosť (max 4)
const others = [];
for (let i = 0; i < 2; i++) { const c = client(); await c.open(); c.send({ type: 'join', code: created.code }); await c.next('joined'); others.push(c); }
const full = client(); await full.open();
full.send({ type: 'join', code: created.code });
assert.match((await full.next('error')).msg, /plná/);

// neexistujúca miestnosť
full.send({ type: 'join', code: 'ZZZZ' });
assert.equal((await full.next('error')).msg, 'Miestnosť neexistuje');

// odchod hráča → ostatní dostanú peer-left
others[0].send({ type: 'leave' });
const left = await host.next('peer-left');
assert.ok(left.id);

// odchod hostiteľa → klienti dostanú host-left
host.send({ type: 'leave' });
await a2.next('host-left');

console.log('SERVER TEST OK');
for (const c of [host, a2, full, ...others]) c.ws.close();
http.close();
process.exit(0);
