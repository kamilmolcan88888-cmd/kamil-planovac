# Nasadenie IRON LYNX na mnxserver + pripojenie dvoch iPhonov

Výsledok: hra beží v Dockeri na mnxserveri, cez **Tailscale HTTPS** je dostupná ako
`https://mnxserver.<tvoj-tailnet>.ts.net` – s platným certifikátom, takže funguje PWA
(inštalácia na plochu, offline), Wake Lock aj `wss://` signalizácia. Funguje doma aj mimo domu
(mobilné dáta), stačí mať na telefóne zapnutý Tailscale.

```
iPhone A ─┐                      ┌─ mnxserver (Docker: Node server :8080)
          ├── Tailscale (VPN) ───┤     ├─ statické súbory hry
iPhone B ─┘                      │     └─ /ws signalizácia + relay
                                 └─ tailscale serve → https://mnxserver.xxx.ts.net
Herné dáta: iPhone A ⇄ iPhone B priamo (WebRTC P2P), alebo cez server (RELAY), ak P2P nejde.
```

---

## 1. Príprava servera (raz)

Predpoklady na mnxserveri: Linux, Docker s pluginom compose, Tailscale (prihlásený do tailnetu).

```bash
# z Windows (PowerShell) – doma cez LAN, inak cez Tailscale IP
ssh tvoj-user@192.168.8.170
# alebo
ssh tvoj-user@100.102.144.92

# kontrola nástrojov
docker --version && docker compose version && tailscale status
```

Ak Docker chýba (Debian/Ubuntu): `curl -fsSL https://get.docker.com | sh` a
`sudo usermod -aG docker $USER` (potom sa odhlás a prihlás).

## 2. Stiahnutie kódu na server

**Možnosť A – git (odporúčané, ľahké aktualizácie):**
```bash
cd ~
git clone https://github.com/kamilmolcan88888-cmd/kamil-planovac.git
cd kamil-planovac
git checkout claude/iron-lynx-game      # alebo main, keď bude zmergované
cd iron-lynx
```
Repozitár je súkromný → git si vypýta meno a **Personal Access Token** (GitHub → Settings →
Developer settings → Fine-grained tokens, právo *Contents: Read* pre tento repozitár).

**Možnosť B – skopírovanie z Windows** (bez `node_modules` a `dist`):
```powershell
cd C:\cesta\k\kamil-planovac
scp -r iron-lynx\server iron-lynx\src iron-lynx\public iron-lynx\index.html iron-lynx\package.json iron-lynx\package-lock.json iron-lynx\vite.config.js iron-lynx\Dockerfile iron-lynx\docker-compose.yml iron-lynx\.dockerignore tvoj-user@192.168.8.170:~/iron-lynx/
```

## 3. Spustenie kontajnera

```bash
cd ~/kamil-planovac/iron-lynx        # (alebo ~/iron-lynx pri možnosti B)
docker compose up -d --build
docker compose ps                     # STATUS: Up (healthy)
curl http://localhost:8080/health     # {"ok":true,"rooms":0}
docker compose logs -f                # logy (Ctrl+C = koniec sledovania)
```

Kontajner sa po reštarte servera spustí sám (`restart: unless-stopped`).
Rýchly test v LAN: v prehliadači na PC `http://192.168.8.170:8080` (hrať sa dá, ale PWA,
offline a Wake Lock vyžadujú HTTPS → krok 4).

> Ak build zlyhá na „429 Too Many Requests“ (limit Docker Hubu), použi zrkadlo:
> `docker compose build --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine && docker compose up -d`

## 4. HTTPS cez Tailscale (`tailscale serve`)

1. V administrácii Tailscale (<https://login.tailscale.com/admin/dns>):
   - zapni **MagicDNS**,
   - v časti **HTTPS Certificates** klikni **Enable HTTPS**.
2. Na mnxserveri:
   ```bash
   sudo tailscale serve --bg 8080
   tailscale serve status
   ```
   Vypíše adresu, napr. `https://mnxserver.tail1234.ts.net` → proxy na `http://127.0.0.1:8080`
   (WebSockety `/ws` fungujú automaticky). Nastavenie prežije reštart.
   *Staršie verzie Tailscale:* `sudo tailscale serve https / http://127.0.0.1:8080`.
3. Test z PC s Tailscale: otvor `https://mnxserver.tail1234.ts.net` – zámok v adrese = platný certifikát.
   `https://mnxserver.tail1234.ts.net/health` vráti `{"ok":true,...}`.

Zrušenie: `sudo tailscale serve reset`.
(Ak by si chcel hru sprístupniť verejne bez Tailscale, existuje `tailscale funnel 8080` – nie je to potrebné.)

## 5. Pripojenie oboch iPhonov

Na **každom** iPhone:

1. App Store → nainštaluj **Tailscale** → prihlás sa.
   - Ak je druhý telefón iného človeka: v administrácii Tailscale **Users → Invite users**
     (pozvi ho do tailnetu), alebo **Machines → mnxserver → Share** (zdieľaj iba server).
2. V aplikácii Tailscale zapni prepínač (VPN „Connected“). V zozname zariadení uvidíš `mnxserver`.
3. Otvor **Safari** (nie Chrome – inštalácia na plochu na iOS ide najspoľahlivejšie zo Safari)
   a choď na `https://mnxserver.tail1234.ts.net`.
4. Počkaj, kým sa hra načíta (logo IRON LYNX), potom **Zdieľať (štvorec so šípkou) →
   Pridať na plochu → Pridať**.
5. Spúšťaj hru z ikony na ploche – beží na celú obrazovku, bez lišty Safari. Otoč telefón na šírku.
6. Prvý dotyk odomkne zvuk. **Vypni tichý režim** (prepínač na boku iPhonu) – Web Audio ho rešpektuje.

### Hranie vo dvojici

| iPhone A (hostiteľ) | iPhone B |
|---|---|
| Menu → **CO-OP: VYTVORIŤ HRU** | Menu → **CO-OP: PRIPOJIŤ SA** |
| zobrazí sa kód, napr. `K7QM` | zadaj `K7QM` → PRIPOJIŤ |
| v zozname sa objaví P2 (`P2P 30MS` alebo `RELAY 60MS`) | „Čakám, kým hostiteľ spustí hru…“ |
| (voliteľne zmeň obtiažnosť) → **ŠTART HRY** | hra sa spustí automaticky |

- `P2P` = telefóny sa spojili priamo (WebRTC, STUN `stun.l.google.com`), najnižšia odozva.
- `RELAY` = dáta idú cez mnxserver (napr. pri mobilných dátach so symetrickým NAT). Hrá sa rovnako,
  len s o niečo vyššou odozvou. Prepnutie je automatické.
- Ďalší hráči (3–4) sa môžu pripojiť rovnakým kódom aj počas hry.
- Hostiteľ by nemal prepínať aplikáciu do pozadia – iOS by hru uspal a ostatným by stála.

## 6. Aktualizácia na novú verziu

```bash
cd ~/kamil-planovac && git pull
cd iron-lynx && docker compose up -d --build
```
Pri väčšej zmene zvýš `VERSION` v `public/sw.js` (napr. `ironlynx-v2`), aby telefóny zahodili
starú cache. Telefón dostane novú verziu pri ďalšom spustení s internetom
(niekedy treba aplikáciu úplne zavrieť – potiahnuť nahor v prepínači aplikácií – a otvoriť znova).

## 7. Alternatíva: hra na GitHub Pages, signalizácia na mnxserveri

Statické súbory hostuje GitHub, mnxserver robí iba signalizáciu/relay (kontajner z kroku 3 + `tailscale serve`).

1. Skopíruj `iron-lynx/deploy/github-pages.yml` do `.github/workflows/ironlynx-pages.yml` (v koreni repozitára).
   **Pozor:** repozitár obsahuje aj Plánovač – ak už používa GitHub Pages, tento workflow ho nahradí.
   Vtedy radšej vytvor pre hru samostatný repozitár.
2. GitHub → repozitár → **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables → New variable**:
   `SIGNAL_URL` = `wss://mnxserver.tail1234.ts.net/ws`
4. Spusti workflow (Actions → „IRON LYNX → GitHub Pages“ → Run workflow).
   Hra bude na `https://<user>.github.io/<repo>/`.
5. Telefóny stále potrebujú zapnutý Tailscale (signalizačný server je v tailnete).
   Adresu servera sa dá zmeniť aj v hre: **Nastavenia → Server**.

> Upozornenie: GitHub Pages pre súkromný repozitár vyžaduje platený GitHub plán.

## 8. Riešenie problémov

| Problém | Riešenie |
|---|---|
| „Server neodpovedá“ / „Nedá sa pripojiť na server“ | Je zapnutý Tailscale na telefóne? `docker compose ps` na serveri, `tailscale serve status`, otvor `/health`. |
| „Miestnosť neexistuje“ | Preklep v kóde, alebo hostiteľ odišiel. Kódy nerozlišujú malé/veľké písmená. |
| Stále `RELAY` | Normálne na niektorých sieťach, hra funguje. P2P skús v rovnakej Wi-Fi. |
| Nehrá zvuk | Ťukni na obrazovku, vypni tichý režim, skontroluj Nastavenia → HUDBA/ZVUKY. |
| Stará verzia po aktualizácii | Zvýš `VERSION` v `public/sw.js`, zavri aplikáciu úplne a otvor 2×. |
| Displej zhasína | Wake Lock v aplikácii z plochy funguje od iOS 18.4; v Safari od 16.4. |
| Trhá sa hra u klienta | Pozri odozvu v HUD vľavo dole; pri `SLABÉ SPOJENIE…` je problém v sieti hostiteľa. |
| Logy servera | `docker compose logs -f` – vidno vytvorenie miestností, pripojenia, odchody. |
