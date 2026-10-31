# MealMath – súhrn na pokračovanie

Vlož tento súbor (alebo odkaz naň) do nového okna a napíš, čo chceš robiť ďalej.

## Kde to je
- Repo: `kamilmolcan88888-cmd/kamil-planovac`, priečinok `mealmath/`
- Vývojová vetva: `claude/mealmath` → PR do `main`
- Testovací odkaz (po zlúčení PR a zapnutí Pages): https://kamilmolcan88888-cmd.github.io/kamil-planovac/mealmath/
- Zapnutie Pages (raz): GitHub → Settings → Pages → Source: **GitHub Actions**

## Príkazy (v `mealmath/`)
| Príkaz | Čo robí |
|---|---|
| `npm ci` | inštalácia |
| `npm run dev` | vývojový server |
| `npm test` | 646 testov (Vitest) |
| `npm run check:a11y` | axe audit všetkých obrazoviek (treba bežiaci `vite preview`) |
| `npm run build` | typecheck + produkčný build do `dist/` |
| `npm run check:data` | kontrola receptov a cien |
| `npm run format:recipes` | jednotný formát JSON receptov |
| `npm run build:foods` | USDA → `data/foods.json` (beží cez GitHub Action, v sandboxe je USDA blokované) |

## Stav (verzia 1.2)
Hotové: všetky etapy zadania – onboarding (14 krokov), plánovač (LP + lokálne hľadanie, každý deň v pásmach),
nezávislý validátor, 117 receptov, 372 potravín z USDA (všetky presná zhoda), ceny Lidl DE / Lidl SK / Kaufland SK
(odhady), nákupný zoznam, zmeny týždňa s náhľadom, PWA offline, SK/DE/EN/CS, svetlý/tmavý režim.
V 1.2 pribudlo: Windows verzia (`desktop/`, workflow `mealmath-windows.yml`; PWA inštalácia aj prenosný .exe), obrazovka Pokrok (váha + náklady), PIN zámok, pripomienka zálohy, Billa/Tesco/Aldi, kompletná čeština, kontrola prístupnosti (`npm run check:a11y`).
V 1.1 pribudlo: čistenie starých plánov (ponechá aktuálny + 4), voliteľné návrhy receptov cez Claude
(vlastný API kľúč, makrá vždy z USDA), API kľúč sa nedostane do zálohy.

## Architektúra v skratke
- `data/` – foods.json (generované), recipes/*.json; `prices/<obchod>.json` – jeden súbor = jeden obchod
- `src/engine/` – čistá logika bez UI: targets, nutrition, validator, pricing, shopping, planner/, changes, aiRecipe
- `src/workers/` – plánovač beží vo Web Workeri (`planRequest.ts` len vo workeri, hlavné vlákno importuje `requestBase.ts`)
- `src/state/` – Dexie (IndexedDB): settings, plans, priceOverrides; ai.ts (Claude), backup.ts, pwa.ts
- `src/ui/` – obrazovky, komponenty, onboarding, viewmodely; hash routing v `src/App.tsx`
- Windows: `desktop/` (Electron, vlastný package.json), build `.exe` v GitHub Actions (`mealmath-windows.yml`, ručne alebo tag `mealmath-v*`)
- Workflows: `.github/workflows/mealmath-ci.yml`, `mealmath-pages.yml`, `mealmath-build-foods.yml`

## Pravidlá, ktoré platia stále
- Nikdy nevymýšľať nutričné hodnoty; makrá = gramy × USDA na 100 g. Čísla od AI sa nikdy nepoužijú.
- Ceny sú vždy označené ako ODHAD, žiadne scrapovanie, žiadne volania obchodov/USDA za behu.
- Zmena obchodu neprepíše plán; zmeny plánu vždy s náhľadom a potvrdením.
- Vysvetlenia používateľovi po slovensky.

## Známe obmedzenia / nápady ďalej
- Ceny sú moje odhady – oprav ich v Ceny (export/import JSON).
- Vegán + veľmi vysoké bielkoviny je často nesplniteľné → plán s varovaním.
- Fotky jedál: vlož `src/photos/<recipeId>.webp`.
- Čaká na vstup od používateľa: reálne ceny (Ceny → upraviť, alebo poslať zoznam), jeho obľúbené recepty, skúška na reálnom iPhone, vlastné fotky jedál.
- Nápady: zdieľanie plánu, viac receptov podľa chuti, prehľad nákladov po týždňoch (teraz sa ukladá aktuálny plán + 4 staršie).
