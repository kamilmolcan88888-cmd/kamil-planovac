# Sabinov – Komenského 18 (demo)

Kostra open-world akčnej hry z pohľadu tretej osoby v Godot 4 (GDScript).
Jedna testovacia ulica, na ktorej sa ladí všetko ostatné: pohyb postavy,
súboje, autá, fyzika a pipeline na mapu mesta v mierke 1:1.

> **Stav overenia.** Projekt vznikol v cloudovom prostredí, kde sa Godot nedal
> spustiť. Skripty prešli kontrolou syntaxe (`gdparse`), Python nástroje sú
> otestované, **ale hra ešte nebola spustená v engine**. Pri prvom spustení rátaj
> s drobnými opravami – pozri [Prvé spustenie](#prvé-spustenie).
>
> **Mapa je zatiaľ schéma.** Rozmery sú reálne (cesta 6,5 m, chodník 2 m,
> bytovky 40 × 12 m), ale polohy a tvary budov nie sú zamerané – stiahnutie dát
> z OpenStreetMap sa z cloudu nepodarilo. Skutočnú ulicu doplníš jedným príkazom,
> pozri [docs/MAPA.md](docs/MAPA.md).

## Spustenie

1. Nainštaluj Godot **4.3 alebo novší** (štandardná verzia, nie .NET).
2. V Project Manageri daj **Import** a vyber `sabinov-game/project.godot`.
3. Počkaj, kým editor projekt načíta (zaregistruje triedy), a stlač **F5**.

Od verzie 4.4 odporúčam zapnúť fyziku Jolt (stabilnejšie autá a kolízie):
*Project Settings → Physics → 3D → Physics Engine → Jolt Physics*.

## Ovládanie

| Akcia | Klávesy |
|---|---|
| Pohyb / kamera | W A S D alebo šípky / myš |
| Šprint / chôdza / skok | Shift / Ctrl / Medzerník |
| Úder (tretí v sérii je silný) / kryt | ľavé / pravé tlačidlo myši |
| Nastúpiť, vystúpiť | F alebo E |
| V aute | W plyn, S brzda a spiatočka, A D volant, Medzerník ručná brzda |
| Návrat na štart / postaviť auto na kolesá | R |
| Reštart scény / uvoľniť myš | F5 / Esc |
| Nápoveda / ladiace údaje (FPS, poloha, GPS) | F1 / F3 |

## Čo demo obsahuje

- **Postava** (`Character`): chôdza, beh, šprint s výdržou, skok (coyote time,
  jump buffer), kontrola vo vzduchu, výstup na obrubníky a schody, tlačenie
  voľných predmetov.
- **Súboj**: údery so sériou (tretí je silný), kryt spredu, odhodenie, zrazenie
  na zem. Zrazená postava sa zmení na fyzikálne teleso a po chvíli vstane –
  to je miesto, kam neskôr príde skutočný ragdoll.
- **Auto** (`Car`): zadný pohon, odpruženie, riadenie závislé od rýchlosti,
  brzda, ručná brzda, spiatočka, poškodenie pri náraze, zranenie vodiča,
  zrážanie chodcov.
- **Chodci** (`Npc`): prechádzajú sa po chodníku, po útoku sa bránia alebo
  utekajú, svedkovia utekajú tiež.
- **Svet** z dátového súboru: cesty, chodníky s obrubníkom, budovy, parkovisko,
  stromy, lampy a testovacia plocha s rampou, schodmi, debnami a loptami.
- **Kamera** za postavou s ochranou proti prechodu cez steny, za autom sa sama
  vyrovná. **HUD** so zdravím, výdržou, tachometrom a nápovedou.

Vedome chýba: modely a animácie (postavy a autá sú z jednoduchých telies),
zvuk, zbrane, doprava, polícia, misie, ukladanie. Poradie je v pláne nižšie.

## Štruktúra projektu

```
sabinov-game/
├── project.godot            nastavenia, autoload Game, názvy fyzikálnych vrstiev
├── scenes/
│   ├── main.tscn            vstupná scéna (skript main.gd postaví všetko ostatné)
│   ├── player.tscn          hráč   – parametre sa ladia v Inspectore
│   ├── npc.tscn             chodec
│   └── car.tscn             auto
├── scripts/
│   ├── main.gd              načíta mapu, rozmiestni hráča, autá, chodcov, HUD
│   ├── core/
│   │   ├── game.gd          autoload: klávesy, zachytenie myši, reštart
│   │   └── layers.gd        fyzikálne vrstvy (svet, vozidlá, postavy, predmety)
│   ├── world/
│   │   ├── world_builder.gd mapa JSON → cesty, chodníky, budovy, objekty
│   │   ├── mesh_util.gd     generovanie geometrie (pás cesty, vytiahnutý pôdorys)
│   │   └── geo.gd           GPS ↔ metre
│   ├── characters/
│   │   ├── character.gd     spoločný základ: pohyb, zdravie, súboj, zrazenie
│   │   ├── player.gd        vstup z klávesnice, nastupovanie do áut
│   │   └── npc.gd           správanie chodca
│   ├── vehicles/car.gd      vozidlo
│   ├── camera/camera_rig.gd kamera
│   └── ui/hud.gd            HUD
├── data/maps/komenskeho_18.json   mapa ulice
├── tools/
│   ├── osm_import.py        skutočné dáta z OpenStreetMap → mapa hry (1:1)
│   └── map_preview.py       náhľad mapy zhora ako SVG
└── docs/
    ├── MAPA.md              formát mapy, mierka, zdroje dát, postup na celé mesto
    └── mapa_nahlad.svg      náhľad aktuálnej mapy
```

Zásady, na ktorých kostra stojí:

- **Dáta oddelené od kódu.** Nová štvrť je nový JSON, nie nový skript.
- **Postava nevie, kto ju ovláda.** `Character` číta len zámer (`wish_dir`,
  `wish_gait`, `wish_jump`); hráč ho plní z klávesnice, chodec z AI. Auto
  rovnako číta `input_throttle`, `input_steer`, `input_handbrake` – dopravu
  neskôr ovládne AI bez zásahu do `car.gd`.
- **Všetko poškodenie ide cez `take_hit(damage, impulse, attacker)`** – päsť,
  auto aj budúce zbrane.
- **Ladenie v Inspectore.** Rýchlosti, sila motora, tuhosť pruženia, poškodenie
  sú `@export` premenné na scénach `player.tscn`, `npc.tscn`, `car.tscn`.

## Prvé spustenie

Keďže hra nebola spustená v engine, over v tomto poradí a napíš mi, čo nesedí:

1. **Chyby v paneli Output / Debugger** – pošli ich text, opravím.
2. **Auto ide opačne alebo zatáča naopak** – `car.gd` predpokladá, že
   VehicleBody3D jazdí smerom k lokálnej osi +Z a kladný uhol riadenia zatáča
   doľava. Ak to v tvojej verzii nesedí, otoč znamienko `engine_force` alebo
   `steering` vo funkcii `_drive()`.
3. **Auto skáče alebo sa prevracia** – uprav v `car.tscn` `suspension_stiffness`,
   `damping_compression`, `damping_relaxation`, `grip_front`, `grip_rear`.
4. **Postava sa zasekáva na obrubníku alebo schodoch** – `step_height` v `player.tscn`.
5. **Budovy alebo chodníky vyzerajú tmavé či prevrátené** – daj vedieť,
   ide o orientáciu trojuholníkov v `mesh_util.gd`.

## Plán ďalších krokov

1. **Skutočná ulica** – spustiť `tools/osm_import.py`, skontrolovať náhľad,
   doplniť výšky a chýbajúce adresy.
2. **Vyladiť pocit z pohybu a jazdy** na testovacej ploche (rampa, schody, debny).
3. **Modely a animácie** – postava so skeletom (chôdza, beh, skok, údery),
   AnimationTree, potom skutočný ragdoll (PhysicalBoneSimulator3D).
4. **Model auta** a zvuk motora; viac typov áut cez rôzne hodnoty v `car.tscn`.
5. **Navigácia** – NavigationRegion3D pre chodcov, jazdné pruhy pre dopravu.
6. **Zbrane a krytie**, potom polícia a hľadanosť.
7. **Celé mesto** – dlaždice po 200 m, načítavanie podľa polohy, LOD.
8. **Misie, dialógy, ukladanie.**
