# Mapa: mierka, zdroje dát, formát

## Odporúčanie k mierke

**Ostať pri 1:1 (1 jednotka v Godote = 1 meter).** Dôvody:

- Fyzika enginu je nastavená na metre a kilogramy. Postava vysoká 1,8 m,
  auto dlhé 4,2 m a gravitácia 9,8 m/s² sa pri inej mierke správajú neprirodzene
  a všetko by sa muselo prepočítavať.
- Reálne dáta (OpenStreetMap, kataster, laserové skenovanie) sa dajú použiť
  bez úprav.
- Sabinov má zastavané územie zhruba 2 × 3 km. To je menej ako mapy bežných
  open-world hier, takže zmenšovať netreba – pešo ho prejdeš za pol hodiny,
  autom za pár minút.

Optimalizovať sa oplatí inde než na mierke:

| Čo | Ako |
|---|---|
| Rozsah detailu | Presne (ručne v Blenderi) modelovať len miesta, kde sa hrá – Komenského 18, námestie, pár kľúčových budov. Zvyšok generovať z pôdorysov. |
| Výkon | Mesto rozdeliť na dlaždice 200 × 200 m, načítavať len okolie hráča, vzdialené budovy zlúčiť do jednoduchých blokov (LOD). |
| Interiéry | Vstupovať len do vybraných budov, ostatné sú kulisa. |
| Terén | Na ulicu stačí rovina. Na celé mesto výškový model – Sabinov leží v údolí Torysy a mierne stúpa. |

## Zdroje dát podľa presnosti

1. **OpenStreetMap** – pôdorysy budov, cesty, chodníky, parkoviská, stromy.
   Zadarmo, hneď, licencia ODbL (v hre treba uviesť „© prispievatelia
   OpenStreetMap“). Presnosť pôdorysov okolo 1–3 m, výšky budov väčšinou chýbajú.
   Na to je `tools/osm_import.py`.
2. **ZBGIS a kataster (ÚGKK SR)** – oficiálne pôdorysy budov a parcely,
   presnosť v decimetroch. Dáta sú voľne dostupné cez geoportál a mapový
   klient ZBGIS.
3. **Letecké laserové skenovanie (ÚGKK SR)** – model terénu DMR 5.0 a model
   povrchu DMP 1.0, voľne na stiahnutie. Rozdiel DMP − DMR dá skutočnú výšku
   každej budovy a stromu, DMR dá terén.
4. **Ortofotomozaika SR** – letecké snímky ako podklad na kreslenie ciest,
   parkovísk a zelene.
5. **Vlastné fotky a meranie na mieste** – fasády, vchody, výšky podlaží,
   obrubníky, zábradlia. Pre Komenského 18 je to najpresnejší zdroj, lebo tam
   vieš všetko odfotiť a zmerať laserovým metrom.

Odporúčaný postup: teraz OSM (kostra do hodiny), potom výšky z laserového
skenovania, nakoniec ručný model domu a okolia podľa fotiek.

## Import skutočnej ulice

Na počítači s internetom (stačí Python 3.9+, žiadne knižnice):

```bash
cd sabinov-game
python3 tools/osm_import.py --street "Komenského" --number 18 --radius 200
python3 tools/map_preview.py        # náhľad do docs/mapa_nahlad.svg
```

Skript nájde adresu, stiahne okolie v danom polomere a prepíše
`data/maps/komenskeho_18.json`. Ak adresa v OSM chýba, zoberie stred ulice;
presnú polohu vieš zadať cez `--lat` a `--lon` (pravé tlačidlo v mapách →
súradnice). Väčší polomer (napr. 1500) stiahne celé mesto do jedného súboru –
na skúšku stačí, na hranie treba dlaždice.

Po importe:

- Skontroluj náhľad a v hre ladiace údaje (F3) – zobrazujú GPS polohu hráča,
  ktorú si vieš porovnať s mapou.
- Doplň `height` budovám, kde OSM nemá počet podlaží (predvolené sú 3 m na
  podlažie).
- Testovacie objekty (rampa, schody, debny) import neobsahuje – skopíruj si
  ich z pôvodného súboru do poľa `props` na voľné miesto.

## Formát mapy (JSON)

Všetky body sú `[východ, sever]` v metroch od počiatku `origin`. V 3D svete
platí `x = východ`, `z = −sever`, `y = výška`. Kurz (`heading`) je v stupňoch
v smere hodinových ručičiek od severu (0 = sever, 90 = východ).

| Pole | Obsah |
|---|---|
| `origin` | `{lat, lon}` – GPS poloha bodu `[0, 0]` |
| `placeholder` | `true`, ak mapa nie je podľa skutočnosti |
| `focus_address` | adresa budovy, ktorá sa zvýrazní |
| `roads[]` | `name`, `kind`, `width` (m), `points` (os cesty) |
| `sidewalks[]` | `width`, `points` – vyvýšené o 10 cm, s kolíziou |
| `areas[]` | `kind` (`parking`, `paved`, `grass`, `playground`, `water`), `polygon` |
| `buildings[]` | `footprint`, `height` (m), `levels`, `kind` (`apartments`, `house`, `garage`, `school`, `shop`, `church`, `industrial`), voliteľne `address`, `name` |
| `props[]` | `kind` + `pos`; statické: `tree`, `lamp`, `bench`, `ramp` (`heading`, `angle`), `stairs` (`heading`, `steps`); fyzikálne: `crate`, `bin`, `ball` |
| `npc_routes[]` | trasy chodcov ako zoznamy bodov |
| `spawns.player` | `pos`, `heading` |
| `spawns.cars[]` | `pos`, `heading` |
| `spawns.npcs[]` | `pos`, `route` (index trasy, −1 = stojí), `aggressive` |

Mapu načíta `scripts/world/world_builder.gd`; nový typ objektu pridáš vetvou
vo funkcii `_build_prop()`.

## Od ulice k mestu

1. Import s väčším polomerom rozdeliť na dlaždice (`data/maps/tiles/x_y.json`).
2. `WorldBuilder` spúšťať po dlaždiciach podľa polohy hráča a vzdialené uvoľňovať.
3. Terén z DMR 5.0 ako výšková mapa; cesty a budovy na ňu ukladať podľa výšky.
4. Vygenerované bloky postupne nahrádzať modelmi z Blenderu – podľa `osm_id`
   alebo adresy, aby sa pri novom importe nestratili.
