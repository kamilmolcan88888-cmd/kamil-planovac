# IRON LYNX: Karpatský úder

2D side-scrolling run-and-gun pre iPhone (PWA, na šírku) aj PC prehliadač.
Co-op pre 2–4 hráčov cez WebRTC, všetka grafika a zvuk sú vlastné (generované kódom).

> Rok 2087. Korporácia Helios prebudila pod Tatrami prastarý stroj.
> Rys (rýchly, modrá výstroj) a Orlica (silná, oranžová výstroj) ho musia zastaviť.

| | |
|---|---|
| Engine | Phaser 3.90 + Vite 6, JavaScript (ES moduly) |
| Rozlíšenie | 480×270, celočíselné škálovanie (iPhone 11: 3× = ostré pixely) |
| Levely | 1 Džungľa a vodopády · 2 Kryštálová jaskyňa (vertikálne) · 3 Podzemná základňa · 4 Reaktor |
| Bossovia | Kamenný golem · Mechanický pavúk · Strážna brána · Hlavný reaktor (4 ramená) |
| Zbrane | základná (Z), rýchla (R), rozptyl (S), laser (L), plameň (F) |
| Multiplayer | host je autorita, klienti posielajú vstupy, snapshoty 20/s + interpolácia, relay záloha |

Plán a zoznam úloh: [docs/PLAN.md](docs/PLAN.md) · Nasadenie: [docs/DEPLOY.md](docs/DEPLOY.md)

---

## Rýchly štart (Windows)

1. Nainštaluj **Node.js 22 LTS** (nodejs.org) a **Python 3** (python.org, zaškrtni „Add to PATH“).
2. V priečinku `iron-lynx` (PowerShell):
   ```powershell
   npm install
   py -m pip install pillow        # iba ak chceš pregenerovať grafiku
   ```
3. Dva terminály:
   ```powershell
   npm run server     # signalizačný server na http://localhost:8080 (potrebný iba pre co-op)
   npm run dev        # hra na http://localhost:5173 (automaticky presmeruje /ws na server)
   ```
4. Otvor <http://localhost:5173>. Rýchly skok do levelu: <http://localhost:5173/?level=3>.

Ďalšie príkazy:

| príkaz | čo robí |
|---|---|
| `npm run build` | produkčný build do `dist/` |
| `npm start` | server, ktorý servíruje `dist/` + `/ws` (ako v Dockeri) |
| `npm run assets` | pregeneruje grafiku (`python tools/gen_assets.py`; na Windows prípadne `py tools\gen_assets.py`) |
| `npm test` | test signalizačného servera |

## Ovládanie

| | Klávesnica | Gamepad (Bluetooth) | Dotyk |
|---|---|---|---|
| pohyb / mierenie | šípky alebo WASD | D-pad / ľavá páčka | D-pad vľavo |
| skok | Z, J, medzerník | A / Y | SKOK |
| streľba | X, K, L | X / B / RT | STREĽBA |
| pauza | Enter, Esc, P | Start | II vpravo hore |

- **Kľak:** drž dole. **Ľah:** drž dole dlhšie (~0,3 s). **Zoskok z platformy:** dole + skok.
- **Streľba v 8 smeroch:** hore, šikmo hore/dole (aj za behu), vo vzduchu aj priamo dole.
- Skok má premenlivú výšku (krátke stlačenie = nízky skok), **coyote time** a **jump buffer**.
- V Nastaveniach: veľkosť/priehľadnosť a **rozloženie dotykového ovládania** (ťahaj prstom),
  automatická streľba, vibrácie, hudba/zvuky, ostré pixely vs. celá obrazovka, vlastný server.

## Štruktúra

```
iron-lynx/
├─ index.html            vstup, viewport (zákaz zoomu), DOM vrstva pre dotyk a „otoč telefón“
├─ public/               manifest.json, sw.js, icons/, assets/ (generovaná grafika)
├─ tools/gen_assets.py   Python + Pillow – všetky sprity, tilesety, pozadia, font, ikony
├─ src/
│  ├─ main.js            Phaser konfigurácia, pixel-perfect škálovanie
│  ├─ config.js          konštanty (fyzika, zbrane, postavy, obtiažnosti, sieť)
│  ├─ settings.js        nastavenia + high score (localStorage)
│  ├─ scenes/            Boot, Menu, Lobby, Game, Hud, Overlays (pauza, game over, víťazstvo, nastavenia)
│  ├─ game/              Player, Weapons, Enemies, Bosses, Level, Fx, NetView, session
│  ├─ levels/            Grid.js (kreslenie máp kódom), levels.js (4 levely)
│  ├─ input/             Controls.js (klávesnica + gamepad), Touch.js (dotyk)
│  ├─ audio/             Audio.js (SFX + sekvencer), songs.js (skladby), notes.js
│  ├─ net/Net.js         WebSocket signalizácia, WebRTC DataChannel, relay záloha
│  └─ platform/ios.js    odomknutie zvuku, Wake Lock, gestá, service worker
├─ server/signal.js      Node.js: statické súbory + WebSocket /ws (knižnica ws)
├─ tests/                server.test, smoke, coop, bosses, touch, offline
├─ Dockerfile, docker-compose.yml, deploy/github-pages.yml
└─ docs/PLAN.md, docs/DEPLOY.md
```

## Ako vymeniť grafiku za vlastnú / CC0

Každý PNG v `public/assets/` má pevné rozmery snímok (pozri `SHEETS` v `src/scenes/Boot.js`
a komentáre „FRAME MAPA“ v `tools/gen_assets.py`). Stačí nahradiť súbor iným s **rovnakým
rozložením snímok** – kód sa nemení. Napr. `player_rys.png` = 33 snímok 32×32 vedľa seba
(0–1 stoj, 2–7 beh, 8–11 skok, 12 kľak, 13 ľah, 14–16 mierenie, 17–28 beh s mierením, 29–32 smrť).
Pozor: `npm run assets` tvoje súbory prepíše – vlastné PNG si zálohuj.

## Ako to funguje (stručne)

- **Fyzika:** Arcade physics, dlaždice 16×16, jednosmerné platformy (kolízia iba zhora),
  zoskok = na 220 ms sa platformy ignorujú. Kamera ide iba dopredu a nenechá nikoho za okrajom.
- **Levely** sa „kreslia“ kódom (`Grid.js`) – deterministicky, aby si ich klient postavil sám.
- **Zvuk:** AudioContext sa vytvorí až po prvom dotyku (pravidlo iOS). SFX = oscilátory a šum,
  hudba = 4-kanálový sekvencer plánujúci noty ~120 ms dopredu (menu 90 BPM, džungľa 140 BPM A mol,
  jaskyňa 100, základňa 150, reaktor 120, boss 170 BPM).
- **Multiplayer:** hostiteľ simuluje všetko. Klient posiela iba bitmasku vstupu (pri zmene a 10×/s),
  hostiteľ posiela 20×/s snapshot (zoznam spritov: textúra, snímka, x, y, otočenie, flagy) +
  udalosti (zvuky, častice, otrasy). Klient vykresľuje so 100 ms oneskorením a interpoluje.
  Snapshoty idú nespoľahlivým kanálom (bez čakania na stratené pakety), ostatné spoľahlivým.
  Kým sa WebRTC nespojí alebo ak zlyhá, dáta idú **relayom cez WebSocket server** – hra funguje vždy.
- **Výpadky:** WS sa sám obnoví (token, 30 s lehota), pri tichu > 4 s sa hráč označí ako
  „výpadok“, po 20 s sa odpojí. Hráč sa môže pripojiť aj do rozohranej hry (dostane voľný slot).
  Keď odíde hostiteľ, klienti sa vrátia do menu.

---

## Testovanie po fázach

Pred testami: `npm install`, v jednom termináli `npm run server`, v druhom `npm run dev`.
Automatické testy používajú Playwright (`npm i -D playwright && npx playwright install chromium`).

### Fáza 1 – hráč + level 1 (PC prehliadač)
1. <http://localhost:5173> → ťukni → **HRAŤ – 1 HRÁČ**.
2. Skús: beh, nízky/vysoký skok (krátke/dlhé Z), skok tesne po zídení z hrany (coyote time),
   stlačenie skoku tesne pred dopadom (buffer), kľak a ľah (drž ↓), zoskok z drevenej platformy (↓ + Z).
3. Over parallax (hory, kopce, hmla), animovanú vodu a vodopády, pád do priepasti = strata života.
4. Automaticky: `node tests/smoke.mjs http://localhost:5173/ 1` (vypíše stav a „NO ERRORS“).

### Fáza 2 – nepriatelia a zbrane
1. Zostreľ dron (letí cez obrazovku) → padne power-up (R/S/L/F) → zober ho, v HUD sa zmení písmeno.
2. Strieľaj v 8 smeroch, over pešiakov, strelca na skale, vežu (otvorí sa, keď sa priblížiš).
3. Zomri: respawn s blikaním (nesmrteľnosť), po 3 smrtiach GAME OVER → POKRAČOVAŤ (od checkpointu).
4. Zmeň obtiažnosť v menu, over HI-SCORE po návrate do menu (uložené aj po reštarte prehliadača).

### Fáza 3 – dotyk a PWA
1. Mobil v rovnakej Wi-Fi: `http://IP-POČÍTAČA:5173` (na Windows zisti IP cez `ipconfig`).
2. Na výšku → výzva „Otoč telefón“. Na šírku: D-pad + SKOK + STREĽBA naraz (multi-touch).
3. Nastavenia → Upraviť rozloženie ovládania → potiahni ovládače, zmeň veľkosť.
4. PWA a offline potrebujú HTTPS – over až po nasadení (fáza 7), alebo lokálne:
   `npm run build && npm start` → <http://localhost:8080> → DevTools → Application → Service Workers,
   potom „Offline“ a obnov stránku. Automaticky: `node tests/offline.mjs http://localhost:8080/`.
5. Automaticky (iPhone 11 viewport, dva prsty): `node tests/touch.mjs`.

### Fáza 4 – levely a bossovia
1. Rýchly štart levelov: `/?level=1` … `/?level=4`.
2. Level 2 sa posúva **nahor** (zostaň nad spodným okrajom obrazovky).
3. Bossovia: golem (balvany, dupnutie), pavúk (vejár plazmy, skok dole), brána (zraniteľné iba
   fialové jadro, 2 veže), reaktor (najprv znič 4 ramená, potom jadro). Po bossovi ide ďalší level.
4. Automaticky: `node tests/bosses.mjs` (overí spawn a porážku všetkých bossov + víťaznú obrazovku).

### Fáza 5 – zvuk a hudba
1. Po prvom ťuknutí hrá hudba menu; v leveli hudba levelu, v aréne boss téma.
2. Over zvuky: výstrel (každá zbraň iný), výbuch, power-up arpeggio, skok, zásah, smrť, fanfára po bossovi.
3. Pauza → HUDBA/ZVUKY VYP – stlmí sa okamžite a nastavenie sa zapamätá.
4. Na iPhone: hra stíchne pri prepnutí aplikácie a po návrate sa ozve po ďalšom dotyku.

### Fáza 6 – multiplayer
1. Dve okná (alebo PC + mobil): prvé **CO-OP: VYTVORIŤ HRU** → zobrazí 4-znakový kód,
   druhé **CO-OP: PRIPOJIŤ SA** → zadaj kód. V lobby uvidíš `P2P xx MS` (WebRTC) alebo `RELAY`.
2. ŠTART HRY → obaja hráte; v HUD je vľavo dole typ spojenia a odozva.
3. Zatvor klientovi okno → hostiteľovi sa zobrazí „… sa odpojil(a)“. Pripoj sa znova tým istým
   kódom počas hry → objavíš sa pri ostatných.
4. Automaticky: `node tests/coop.mjs` (host + klient + neskoré pripojenie + odpojenie),
   `RELAY=1 node tests/coop.mjs` (simuluje sieť bez WebRTC).

### Fáza 7 – nasadenie
Pozri [docs/DEPLOY.md](docs/DEPLOY.md) – Docker na mnxserveri, Tailscale HTTPS, inštalácia na oba iPhony.

## Známe obmedzenia iOS

- Safari nepodporuje `navigator.vibrate` – vibrácie fungujú len na Androide a gamepadoch s rumble.
- Zámok orientácie v PWA iOS nepodporuje – preto výzva „Otoč telefón“.
- Wake Lock funguje v Safari od iOS 16.4, v aplikácii z plochy od iOS 18.4.
- Ak hostiteľ prepne aplikáciu do pozadia, iOS hru uspí a klientom sa hra zastaví
  (po návrate pokračuje; po 20 s sa klient odpojí).
