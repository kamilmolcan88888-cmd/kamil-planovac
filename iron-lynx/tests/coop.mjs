// Co-op test: dva prehliadače (hostiteľ + klient) cez signalizačný server.
// Predpoklad: beží `npm run server` (8080) a `npm run dev` (5173, proxy /ws).
// Použitie: node tests/coop.mjs [url]
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] || 'http://localhost:5173/';
const out = process.env.OUT || '.';
const browser = await chromium.launch();
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  // RELAY=1: simuluje sieť, kde WebRTC nefunguje → hra musí prejsť na relay cez server
  if (process.env.RELAY) await ctx.addInitScript(() => { delete window.RTCPeerConnection; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}]`, m.text()); });
  await page.goto(`${url}?menu`);
  await page.waitForTimeout(1500);
  return page;
};
const host = await mk('host');
const client = await mk('client');
const scene = (p, k) => p.evaluate((key) => window.__game.scene.getScene(key)?.sys.isActive(), k);

// hostiteľ: menu → CO-OP: VYTVORIŤ HRU
await host.keyboard.press('ArrowDown');
await host.keyboard.press('Enter');
await host.waitForTimeout(1500);
const code = await host.evaluate(() => window.__game.scene.getScene('Lobby').codeText.text);
console.log('kód miestnosti:', code);

// klient: menu → CO-OP: PRIPOJIŤ SA → zadá kód
await client.keyboard.press('ArrowDown');
await client.keyboard.press('ArrowDown');
await client.keyboard.press('Enter');
await client.waitForTimeout(500);
await client.fill('#codeInput', code);
await client.press('#codeInput', 'Enter');
await client.waitForTimeout(2500);
const lobbyList = await host.evaluate(() => window.__game.scene.getScene('Lobby').list.map((t) => t.text));
console.log('lobby hostiteľa:', lobbyList);

// štart
await host.keyboard.press('Enter');
await host.waitForTimeout(2500);
console.log('host v hre:', await scene(host, 'Game'), ' klient v hre:', await scene(client, 'Game'));

// klient beží doprava a strieľa
await client.keyboard.down('ArrowRight');
await client.keyboard.down('KeyX');
await client.waitForTimeout(1500);
await client.keyboard.up('ArrowRight');
await client.waitForTimeout(800);
const hs = await host.evaluate(() => {
  const g = window.__game.scene.getScene('Game');
  return g.players.map((p) => ({ slot: p.slot, x: Math.round(p.x), y: Math.round(p.y), hero: p.hero.name }));
});
const cs = await client.evaluate(() => {
  const g = window.__game.scene.getScene('Game');
  return { sprites: g.view.sprites.size, hud: g.hud.players.map((p) => `${p.slot}:${p.score}`), net: g.hud.net };
});
console.log('hostiteľ vidí hráčov:', JSON.stringify(hs));
console.log('klient:', JSON.stringify(cs));
await host.screenshot({ path: `${out}/coop-host.png` });
await client.screenshot({ path: `${out}/coop-client.png` });

// tretí hráč sa pripojí počas hry
const late = await mk('late');
await late.keyboard.press('ArrowDown');
await late.keyboard.press('ArrowDown');
await late.keyboard.press('Enter');
await late.waitForTimeout(500);
await late.fill('#codeInput', code);
await late.press('#codeInput', 'Enter');
await late.waitForTimeout(3000);
const lateInfo = await late.evaluate(() => { const g = window.__game.scene.getScene('Game'); return g.sys.isActive() ? `v hre ako P${g.localSlot + 1}` : 'NIE JE V HRE'; });
const hostCount = await host.evaluate(() => window.__game.scene.getScene('Game').players.length);
console.log(`neskoré pripojenie: ${lateInfo}, hostiteľ má ${hostCount} hráčov`);
await late.close({ runBeforeUnload: true });

// odpojenie klienta → hostiteľ ho odstráni
await client.close({ runBeforeUnload: true });
await host.waitForTimeout(1500);
const after = await host.evaluate(() => window.__game.scene.getScene('Game').players.length);
console.log('hráčov po odpojení klienta:', after);
await browser.close();
