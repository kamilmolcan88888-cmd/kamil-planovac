# MealMath

Offline-first PWA na plánovanie jedál podľa makier, rozpočtu a obchodu (Lidl DE, Lidl SK, Kaufland SK).
Bez účtov a bez predplatného, všetky dáta zostávajú v zariadení.

> Stav: **etapa 1** – dáta, vzorce, validátor, testy. UI, plánovač a ceny prídu v ďalších etapách.

## Hlavný princíp

Žiadne nutričné číslo nepochádza z jazykového modelu. Každé makro sa počíta ako
`gramy × hodnota na 100 g` zo záznamu **USDA FoodData Central** (verejná doména).
Recepty neobsahujú predpočítané makrá a test (`src/data/__tests__/data.test.ts`) to stráži.

## Spustenie

```bash
cd mealmath
npm install
npm test          # Vitest: vzorce, validátor, integrita dát
npm run typecheck
```

## Dáta

| Súbor | Obsah |
|---|---|
| `scripts/food-list.txt` | ~370 surovín: ktorý USDA záznam, názvy EN/SK/DE, ulička, alergény, príznaky, trvanlivosť. **Bez čísel.** |
| `scripts/build-foods.ts` | Stiahne USDA SR Legacy + Foundation CSV a vytvorí `data/foods.json`. |
| `data/foods.json` | Vygenerované, nikdy needitovať ručne. |
| `data/foods-report.md` | Report párovania (presná / približná zhoda, fdcId, hodnoty). |
| `data/recipes/*.json` | 96 ručne písaných receptov (SK + DE), gramy s rozsahom min–max. |

### Aktualizácia `foods.json`

Automaticky: každý push, ktorý zmení `scripts/food-list.txt`, spustí GitHub Action
`.github/workflows/mealmath-build-foods.yml`. Tá stiahne USDA dáta a commitne `foods.json` a report.
Dá sa spustiť aj ručne cez *Actions → Run workflow*.

Lokálne: `npm run build:foods` (potrebuje prístup na `fdc.nal.usda.gov`).

Ak USDA záznam nesedí presne, skript skúsi približnú zhodu. Keď si nie je istý, zlyhá a vypíše
kandidátov do reportu. Konkrétny záznam sa dá pripnúť 11. stĺpcom (`fdcId`).

### Pridanie receptu

Pridaj objekt do príslušného súboru v `data/recipes/` (raňajky, hlavné jedlá, snacky):

- `ingredients`: `food` (id z food-list), `g` (bežná porcia), `min`/`max` (rozsah, v ktorom smie plánovač škálovať tvoju porciu; `min = max` znamená pevné množstvo, `min = 0` znamená voliteľný doplnok),
- `steps.sk` a `steps.de` s rovnakým počtom krokov,
- alergény a diéty sa **nepíšu**, odvodzujú sa zo surovín.

Potom spusti `npm test`.

## Obmedzenia

- Výrobky v obchodoch sa líšia od USDA záznamov (napr. skyr je mapovaný na grécky jogurt 0 %, bryndza na fetu). Použitý USDA záznam sa vždy zobrazí v „Ako sme to spočítali“.
- Alergény sú orientačné, vždy skontroluj etiketu výrobku.
- Ceny (etapa 2) sú **odhady**, nie živé ceny obchodov.
