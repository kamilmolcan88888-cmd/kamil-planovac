# IRON LYNX: Karpatský úder — plán projektu

## Architektúra (prehľad)

```
iron-lynx/
├─ index.html            # vstup, viewport, overlay „otoč telefón“, dotykové ovládanie (DOM)
├─ vite.config.js        # Vite, base './' (funguje aj na GitHub Pages v podpriečinku)
├─ public/
│  ├─ manifest.json      # PWA manifest (landscape, fullscreen, ikony)
│  ├─ sw.js              # service worker (offline cache)
│  ├─ icons/             # 180/192/512 px – generované
│  └─ assets/            # sprity, tilesety, pozadia, font – GENEROVANÉ skriptom
├─ tools/gen_assets.py   # Python + Pillow: všetka grafika (vymeniteľná za vlastnú/CC0)
├─ src/
│  ├─ main.js            # Phaser konfigurácia, pixel-perfect škálovanie
│  ├─ config.js          # konštanty, obtiažnosti, postavy, zbrane
│  ├─ scenes/            # Boot, Menu, Lobby, Game, Hud, Pause, GameOver, Victory, Settings
│  ├─ game/              # Player, Enemies, Bosses, Weapons, Level builder, NetView
│  ├─ levels/            # dáta levelov (ASCII mapy)
│  ├─ input/             # klávesnica + gamepad + dotyk → jednotný stav vstupu
│  ├─ audio/             # Web Audio: SFX syntéza + chiptune sekvencer
│  ├─ net/               # WebRTC DataChannel + WS signalizácia + WS relay fallback
│  └─ platform/          # iOS: odomknutie audia, Wake Lock, vibrácia, orientácia
├─ server/signal.js      # Node.js: statické súbory + WebSocket signalizácia (ws)
├─ Dockerfile, docker-compose.yml
└─ docs/DEPLOY.md        # nasadenie na mnxserver + Tailscale + pripojenie telefónov
```

### Kľúčové rozhodnutia
- **Interné rozlíšenie 480×270**, celočíselné škálovanie v *fyzických* pixeloch displeja
  (iPhone 11: 3× → ostré pixely). Voliteľne „vyplniť obrazovku“ (neceločíselné).
- **Arcade physics**, dlaždice 16×16, postavy 32×32.
- **Kamera sa posúva len dopredu** (vpravo, v leveli 2 nahor) – ako v klasických run-and-gun hrách.
- **Multiplayer: host je autorita.** Klienti nesimulujú nič, posielajú len vstupy (bitmaska)
  a vykresľujú „snapshoty“ (zoznam spritov: textúra, snímka, x, y, otočenie…) s interpoláciou
  ~100 ms. Vďaka tomu klient nepotrebuje logiku nepriateľov – je to „tenký“ renderer.
- **Spoľahlivosť siete:** WebRTC (STUN Google) → ak sa nepodarí spojiť (napr. mobilné dáta so
  symetrickým NAT), hra automaticky prepne na **relay cez WebSocket server**. Hráč nič nerieši.
- **Zvuk 100 % syntetizovaný** vo Web Audio API (žiadne súbory), hudba = vlastný sekvencer.
- **Grafika generovaná skriptom** s 32-farebnou paletou → dá sa kedykoľvek prepísať vlastnými PNG
  s rovnakými rozmermi.

## Zoznam úloh po fázach

### Fáza 1 – hráč + level 1 v prehliadači
- [x] Vite + Phaser 3 projekt, pixel-perfect škálovanie
- [x] Generátor assetov (Pillow): paleta, postavy, tilesety, pozadia, font, ikony
- [x] Hráč: beh, skok (premenlivá výška), kľak, ľahnutie, zoskok z platformy, coyote time, jump buffer
- [x] Level 1 (džungľa, vodopády): tilemapa, parallax hory + hmla, animovaná voda
- [x] Kamera len dopredu, smrť pádom, checkpointy

### Fáza 2 – nepriatelia a zbrane
- [x] Streľba v 8 smeroch, 5 zbraní (základná, rýchla, rozptylová, laser, plameň)
- [x] Pešiak, strelec na skale, dron-kapsula s power-upom, automatická veža
- [x] Výbuchy (particles), screen shake, skóre, životy, respawn s nesmrteľnosťou, continue
- [x] 3 obtiažnosti, high score v localStorage

### Fáza 3 – dotykové ovládanie a PWA
- [x] D-pad + tlačidlá Skok/Streľba (multi-touch), nastaviteľná veľkosť a pozícia
- [x] Gamepad API, safe-area, zákaz zoomu/scrollu, vibrácia, Wake Lock, výzva na otočenie
- [x] manifest.json, service worker, ikony

### Fáza 4 – levely a bossovia
- [x] Level 2 Kryštálová jaskyňa (vertikálny scroll), Level 3 Podzemná základňa, Level 4 Reaktor
- [x] Bossovia: Kamenný golem, Mechanický pavúk, Strážna brána (mini-boss), Hlavný reaktor (4 ramená)

### Fáza 5 – zvuk a hudba
- [x] SFX syntéza, chiptune sekvencer, 5 skladieb (menu 90, džungľa 140 Am, jaskyňa 100,
      základňa 150, boss 170 BPM), odomknutie audia po dotyku, vypínače

### Fáza 6 – multiplayer 2–4 hráči
- [x] Signalizačný server (ws), lobby so 4-znakovým kódom
- [x] WebRTC DataChannel, snapshoty 20/s, interpolácia, vstupy klientov
- [x] Výpadok spojenia (prepnutie na relay, obnovenie WS), odpojenie/pripojenie hráča počas hry

### Fáza 7 – nasadenie
- [x] Dockerfile + docker-compose pre mnxserver, Tailscale HTTPS (`tailscale serve`)
- [x] Alternatíva GitHub Pages + signalizácia na mnxserveri
- [x] Návod krok za krokom (docs/DEPLOY.md)
