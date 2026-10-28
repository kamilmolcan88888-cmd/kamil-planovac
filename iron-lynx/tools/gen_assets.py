#!/usr/bin/env python3
"""
IRON LYNX – generátor grafiky (Python 3 + Pillow).

Spustenie (Windows):   py tools\\gen_assets.py
Spustenie (Linux/Mac): python3 tools/gen_assets.py

Všetko sa kreslí procedurálne do public/assets/ a public/icons/.
Každý súbor má pevné rozmery a rozloženie snímok (pozri FRAME MAPY nižšie a src/config.js),
takže ho neskôr môžeš nahradiť vlastným PNG (alebo CC0 grafikou) s rovnakým rozložením.

Pravidlo: používame iba 32-farebnú paletu PAL (+ priehľadnosť a poloprieľadná hmla).
"""
import math
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets')
ICONS = os.path.join(ROOT, 'public', 'icons')
os.makedirs(OUT, exist_ok=True)
os.makedirs(ICONS, exist_ok=True)

# ---------------------------------------------------------------------------
# PALETA – 32 farieb (tmavomodrá, zelená, oranžová, neónová fialová …)
# ---------------------------------------------------------------------------
PAL_HEX = [
    '#0b0e1a', '#141a33', '#1f2a52', '#2b3d75', '#3a5bb0', '#4f8ce0', '#8ec5ff', '#e8f4ff',  # 0-7  modré
    '#0f2b22', '#1a4a32', '#2a7040', '#4aa04a', '#9ad35a',                                    # 8-12 zelené
    '#5a3a22', '#8a5a32', '#c08a52',                                                          # 13-15 hnedé
    '#7a2a12', '#d0601a', '#ff9a2a', '#ffd36a',                                               # 16-19 oranžové/žltá
    '#7a1020', '#e02a3a',                                                                     # 20-21 červené
    '#3a1a5a', '#6a2aa0', '#b04aff', '#ff6aff',                                               # 22-25 fialové/neón
    '#2a2e38', '#4a505e', '#7a8294', '#b8c0cc',                                               # 26-29 sivé
    '#2ae0d0', '#ffffff',                                                                     # 30 cyan neón, 31 biela
]


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


PAL = [hx(h) for h in PAL_HEX]
T = (0, 0, 0, 0)  # priehľadná
OUTLINE = PAL[0]

rng = random.Random(2087)  # deterministický výstup – rovnaký pri každom spustení


def new(w, h, fill=T):
    return Image.new('RGBA', (w, h), fill)


def save(img, name, folder=OUT):
    img.save(os.path.join(folder, name))
    print('  ', name, img.size)


def outline(img, color=OUTLINE):
    """Pridá 1 px obrys okolo nepriehľadných pixelov (klasický pixel-art vzhľad)."""
    w, h = img.size
    src = img.load()
    out = img.copy()
    o = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] > 0:
                        o[x, y] = color
                        break
    return out


def sheet(frames, fw, fh):
    """Poskladá zoznam snímok vedľa seba do jedného spritesheetu."""
    s = new(fw * len(frames), fh)
    for i, f in enumerate(frames):
        s.paste(f, (i * fw, 0), f)
    return s


def L(d, a, b, c, w=1):
    d.line([a, b], fill=c, width=w)


# ---------------------------------------------------------------------------
# POSTAVY (vojaci) – 32×32, tvár doprava (doľava sa otáča v hre cez flipX)
# ---------------------------------------------------------------------------
def pt(p, ang, ln):
    """Bod vo vzdialenosti ln od p; ang v stupňoch, 0 = dole, + = dopredu (doprava)."""
    r = math.radians(ang)
    return (p[0] + math.sin(r) * ln, p[1] + math.cos(r) * ln)


def draw_leg(d, hip, thigh, shin, col, boot):
    knee = pt(hip, thigh, 6)
    foot = pt(knee, shin, 6)
    L(d, hip, knee, col, 3)
    L(d, knee, foot, col, 3)
    fx, fy = round(foot[0]), round(foot[1])
    d.rectangle([fx - 1, fy - 1, fx + 2, fy], fill=boot)


def draw_gun(d, shoulder, aim, c):
    """aim: 0 = vpred, -90 = hore, 90 = dole (stupne). Ruka + puška."""
    r = math.radians(aim)
    ux, uy = math.cos(r), math.sin(r)
    hand = (shoulder[0] + ux * 4, shoulder[1] + uy * 4)
    tip = (hand[0] + ux * 9, hand[1] + uy * 9)
    L(d, shoulder, hand, c['arm'], 3)
    L(d, hand, tip, PAL[27], 2)
    L(d, (hand[0] + ux * 6, hand[1] + uy * 6), tip, PAL[28], 1)
    d.point((round(tip[0]), round(tip[1])), fill=PAL[29])


def draw_head(d, cx, top, c):
    d.rounded_rectangle([cx - 3, top, cx + 3, top + 6], radius=2, fill=c['helmet'])
    d.rectangle([cx, top + 2, cx + 3, top + 3], fill=c['visor'])        # vizor
    d.point((cx - 2, top + 1), fill=PAL[29])                              # odlesk


def soldier(c, hip=(14, 19), legs=((10, 0), (-10, 0)), aim=0, bob=0):
    img = new(32, 32)
    d = ImageDraw.Draw(img)
    hx_, hy = hip[0], hip[1] + bob
    draw_leg(d, (hx_, hy), legs[1][0], legs[1][1], c['dark'], PAL[1])     # zadná noha
    d.rectangle([hx_ - 3, hy - 10, hx_ + 2, hy], fill=c['armor'])        # trup
    d.rectangle([hx_ - 3, hy - 10, hx_ - 2, hy], fill=c['dark'])
    d.line([(hx_ - 3, hy - 1), (hx_ + 2, hy - 1)], fill=c['dark'])        # opasok
    draw_leg(d, (hx_, hy), legs[0][0], legs[0][1], c['armor'], PAL[1])    # predná noha
    draw_head(d, hx_, hy - 17, c)
    draw_gun(d, (hx_, hy - 8), aim, c)
    return outline(img)


def run_legs(i, n=6):
    """Fázy behu – dve nohy v protifáze."""
    res = []
    for k in (0, math.pi):
        p = 2 * math.pi * i / n + k
        th = 38 * math.sin(p)
        sh = th - (35 if math.cos(p) < 0 else 0)
        res.append((th, sh))
    return res


def kneel(c, aim=0):
    img = new(32, 32)
    d = ImageDraw.Draw(img)
    hip = (14, 25)
    draw_leg(d, hip, 15, -95, c['dark'], PAL[1])        # zadná noha – koleno na zemi
    d.rectangle([hip[0] - 3, hip[1] - 10, hip[0] + 2, hip[1]], fill=c['armor'])
    d.rectangle([hip[0] - 3, hip[1] - 10, hip[0] - 2, hip[1]], fill=c['dark'])
    draw_leg(d, hip, 80, 0, c['armor'], PAL[1])          # predná noha – stehno vodorovne
    draw_head(d, hip[0], hip[1] - 17, c)
    draw_gun(d, (hip[0], hip[1] - 8), aim, c)
    return outline(img)


def prone(c):
    img = new(32, 32)
    d = ImageDraw.Draw(img)
    y = 27
    L(d, (3, y + 1), (12, y + 1), c['dark'], 3)          # nohy dozadu
    d.rectangle([1, y, 3, y + 2], fill=PAL[1])
    d.rectangle([11, y - 2, 20, y + 2], fill=c['armor'])  # trup
    d.line([(11, y + 2), (20, y + 2)], fill=c['dark'])
    d.rounded_rectangle([20, y - 4, 26, y + 1], radius=2, fill=c['helmet'])
    d.rectangle([23, y - 2, 26, y - 1], fill=c['visor'])
    L(d, (18, y), (22, y + 1), c['arm'], 2)
    L(d, (21, y + 1), (31, y + 1), PAL[27], 2)
    return outline(img)


def ball(c, rot):
    img = new(32, 32)
    d = ImageDraw.Draw(img)
    d.ellipse([9, 9, 22, 22], fill=c['armor'])
    d.ellipse([11, 11, 20, 20], fill=c['dark'])
    d.rounded_rectangle([14, 8, 21, 14], radius=2, fill=c['helmet'])
    d.rectangle([18, 10, 21, 11], fill=c['visor'])
    L(d, (12, 18), (19, 23), PAL[27], 2)
    return outline(img.rotate(-rot, resample=Image.NEAREST))


def corpse(c, fade=False):
    img = prone(c).transpose(Image.FLIP_LEFT_RIGHT)
    if fade:  # rozpadá sa – vynechá každý druhý pixel
        p = img.load()
        for y in range(32):
            for x in range(32):
                if (x + y) % 2 == 0:
                    p[x, y] = T
    return img


def player_sheet(c):
    """
    FRAME MAPA hráča (32×32):
      0-1 stoj | 2-7 beh | 8-11 skok (kotúľ) | 12 kľak | 13 ľah | 14 mier hore
      15 mier šikmo hore | 16 mier šikmo dole | 17-22 beh+šikmo hore | 23-28 beh+šikmo dole
      29-32 smrť
    """
    f = []
    f += [soldier(c, bob=0), soldier(c, bob=1)]
    f += [soldier(c, legs=run_legs(i), bob=(1 if i % 3 == 1 else 0)) for i in range(6)]
    f += [ball(c, r) for r in (0, 90, 180, 270)]
    f += [kneel(c), prone(c)]
    f += [soldier(c, aim=-90), soldier(c, aim=-45), soldier(c, aim=40)]
    f += [soldier(c, legs=run_legs(i), aim=-45, bob=(1 if i % 3 == 1 else 0)) for i in range(6)]
    f += [soldier(c, legs=run_legs(i), aim=40, bob=(1 if i % 3 == 1 else 0)) for i in range(6)]
    f += [soldier(c, aim=-30).rotate(25, resample=Image.NEAREST),
          soldier(c, aim=-60).rotate(70, resample=Image.NEAREST),
          corpse(c), corpse(c, True)]
    return sheet(f, 32, 32)


def colors(armor, dark, helmet, visor, arm=None):
    return dict(armor=PAL[armor], dark=PAL[dark], helmet=PAL[helmet], visor=PAL[visor], arm=PAL[arm if arm is not None else armor])


HEROES = {
    'rys': colors(4, 3, 5, 30, 6),         # Rys – modrá výstroj
    'orlica': colors(17, 16, 18, 19, 15),  # Orlica – oranžová výstroj
    'sokol': colors(11, 10, 12, 30, 12),   # hráč 3 – zelená
    'vlk': colors(23, 22, 24, 25, 24),     # hráč 4 – fialová
}


def enemies():
    inf = colors(27, 26, 28, 21, 28)       # Helios pešiak: sivá prilba, červený vizor
    # pešiak: 0-3 beh, 4 strelba, 5 strelba šikmo hore, 6-7 smrť
    f = [soldier(inf, legs=run_legs(i, 4)) for i in range(4)]
    f += [soldier(inf, aim=0), soldier(inf, aim=-40)]
    f += [soldier(inf, aim=-30).rotate(30, resample=Image.NEAREST), corpse(inf)]
    save(sheet(f, 32, 32), 'infantry.png')

    sn = colors(9, 8, 28, 21, 10)          # strelec na skale: kľačí, 4 smery
    # 0 vpred, 1 šikmo hore, 2 hore, 3 šikmo dole, 4-5 smrť
    f = [kneel(sn, 0), kneel(sn, -40), kneel(sn, -80), kneel(sn, 35),
         kneel(sn, -20).rotate(35, resample=Image.NEAREST), corpse(sn)]
    save(sheet(f, 32, 32), 'sniper.png')

    # dron-kapsula 24×16: 0-1 (blikajúce svetlo + rotor)
    f = []
    for i in range(2):
        img = new(24, 16)
        d = ImageDraw.Draw(img)
        d.ellipse([3, 5, 20, 14], fill=PAL[27])
        d.ellipse([5, 6, 18, 12], fill=PAL[28])
        d.rectangle([9, 7, 14, 10], fill=PAL[24] if i == 0 else PAL[25])   # power-up jadro
        L(d, (11, 5), (11, 2), PAL[26], 1)
        L(d, (4 + i * 6, 1), (18 - i * 6, 1), PAL[29], 1)                    # rotor
        d.point((20, 9), fill=PAL[21] if i == 0 else PAL[19])
        f.append(outline(img))
    save(sheet(f, 24, 16), 'drone.png')

    # automatická veža 32×32: 0 zatvorená, 1 otvorená, 2 zničená
    f = []
    for st in range(3):
        img = new(32, 32)
        d = ImageDraw.Draw(img)
        d.rectangle([3, 18, 28, 31], fill=PAL[26])
        d.rectangle([5, 20, 26, 29], fill=PAL[27])
        for x in range(6, 26, 4):
            d.point((x, 30), fill=PAL[19])
        if st < 2:
            d.pieslice([6, 6, 25, 31], 180, 360, fill=PAL[28] if st == 1 else PAL[27])
            d.rectangle([13, 12, 18, 15], fill=PAL[21] if st == 1 else PAL[20])
        else:
            d.polygon([(6, 18), (10, 12), (14, 16), (19, 10), (25, 18)], fill=PAL[26])
            d.point((12, 17), fill=PAL[17])
        f.append(outline(img))
    save(sheet(f, 32, 32), 'turret.png')
    img = new(16, 6)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 1, 15, 4], fill=PAL[26])
    d.rectangle([0, 2, 15, 3], fill=PAL[28])
    d.rectangle([13, 1, 15, 4], fill=PAL[27])
    save(img, 'turret_barrel.png')   # hlaveň – origin vľavo v strede, otáča sa v kóde


# ---------------------------------------------------------------------------
# STRELY, POWER-UPY, EFEKTY
# ---------------------------------------------------------------------------
def projectiles():
    # bullets 8×8: 0 základná, 1 rýchla, 2 rozptylová, 3 nepriateľská, 4 plazma bossa
    f = []
    for spec in [(19, 31, 2), (18, 19, 1), (21, 18, 3), (21, 25, 2), (24, 25, 3)]:
        img = new(8, 8)
        d = ImageDraw.Draw(img)
        r = spec[2]
        d.ellipse([4 - r - 1, 4 - r - 1, 3 + r + 1, 3 + r + 1], fill=PAL[spec[0]])
        d.ellipse([4 - r, 4 - r, 3 + r, 3 + r], fill=PAL[spec[1]])
        f.append(img)
    save(sheet(f, 8, 8), 'bullets.png')

    img = new(24, 4)            # laser
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 23, 3], fill=PAL[30])
    d.rectangle([2, 1, 23, 2], fill=PAL[31])
    save(img, 'laser.png')

    f = []                      # plameň 16×16: 0-3 rastie a chladne
    for i in range(4):
        img = new(16, 16)
        d = ImageDraw.Draw(img)
        r = 3 + i * 1.5
        for k, col in enumerate([PAL[16], PAL[17], PAL[18], PAL[19]][:4 - (1 if i == 3 else 0)]):
            rr = r - k * 1.4
            if rr > 0:
                d.ellipse([8 - rr, 8 - rr, 8 + rr, 8 + rr], fill=col)
        f.append(img)
    save(sheet(f, 16, 16), 'flame.png')

    f = []                      # balvan golema 16×16
    for i in range(2):
        img = new(16, 16)
        d = ImageDraw.Draw(img)
        d.ellipse([1, 1, 14, 14], fill=PAL[27])
        d.ellipse([3, 2, 11, 9], fill=PAL[28])
        d.point((5 + i * 4, 10), fill=PAL[26])
        d.point((9, 4 + i * 3), fill=PAL[26])
        f.append(outline(img))
    save(sheet(f, 16, 16), 'boulder.png')

    # power-upy 16×16: 0 R rýchla, 1 S rozptyl, 2 L laser, 3 F plameň
    letters = ['R', 'S', 'L', 'F']
    cols = [18, 21, 30, 17]
    f = []
    for i, ch in enumerate(letters):
        img = new(16, 16)
        d = ImageDraw.Draw(img)
        d.polygon([(8, 0), (15, 4), (15, 11), (8, 15), (0, 11), (0, 4)], fill=PAL[cols[i]])
        d.polygon([(8, 2), (13, 5), (13, 10), (8, 13), (2, 10), (2, 5)], fill=PAL[2])
        draw_text(img, ch, 6, 3, PAL[31], scale=1)
        f.append(outline(img))
    save(sheet(f, 16, 16), 'powerups.png')

    f = []                      # výbuch 32×32, 7 snímok
    for i in range(7):
        img = new(32, 32)
        d = ImageDraw.Draw(img)
        r = 4 + i * 2.2
        rr = random.Random(i)
        if i < 6:
            for k, col in enumerate([PAL[16], PAL[17], PAL[18], PAL[19], PAL[31]]):
                q = r - k * (1.8 + i * 0.3)
                if q > 0:
                    d.ellipse([16 - q, 16 - q, 16 + q, 16 + q], fill=col)
        for _ in range(6 + i * 2):  # dym a iskry
            a = rr.random() * 6.28
            dist = r * (0.6 + rr.random() * 0.6)
            x, y = 16 + math.cos(a) * dist, 16 + math.sin(a) * dist
            col = PAL[27] if i > 3 else PAL[19]
            d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=col)
        if i == 6:
            img = img.resize((32, 32))
        f.append(img)
    save(sheet(f, 32, 32), 'explosion.png')

    f = []                      # iskra pri zásahu 8×8
    for i in range(3):
        img = new(8, 8)
        d = ImageDraw.Draw(img)
        r = 1 + i
        L(d, (4 - r, 4), (3 + r, 4), PAL[31])
        L(d, (4, 4 - r), (4, 3 + r), PAL[19])
        f.append(img)
    save(sheet(f, 8, 8), 'spark.png')

    img = new(4, 4, PAL[31])    # univerzálna častica (tónuje sa v hre)
    save(img, 'pixel.png')

    f = []                      # checkpoint vlajka 16×32: 0 neaktívna, 1 aktívna
    for i in range(2):
        img = new(16, 32)
        d = ImageDraw.Draw(img)
        d.rectangle([3, 4, 4, 31], fill=PAL[28])
        d.polygon([(5, 4), (14, 8), (5, 12)], fill=PAL[21] if i == 0 else PAL[30])
        d.rectangle([1, 29, 6, 31], fill=PAL[27])
        f.append(outline(img))
    save(sheet(f, 16, 32), 'checkpoint.png')


# ---------------------------------------------------------------------------
# BOSSOVIA
# ---------------------------------------------------------------------------
def bosses():
    # Kamenný golem 64×64: 0-1 chôdza, 2 nápřah, 3 dupnutie, 4 rozpadnutý
    f = []
    for st in range(5):
        img = new(64, 64)
        d = ImageDraw.Draw(img)
        if st == 4:
            for k in range(9):
                x = 6 + k * 6
                d.ellipse([x, 48 + (k % 3) * 3, x + 11, 60 + (k % 3)], fill=PAL[27 + (k % 2)])
            f.append(outline(img))
            continue
        lift = [0, 2, 0, -2][st]
        sw = [3, -3, 0, 0][st]
        d.rectangle([18 + sw, 44, 28 + sw, 63 - max(0, lift)], fill=PAL[27])       # nohy
        d.rectangle([36 - sw, 44, 46 - sw, 63], fill=PAL[27])
        d.ellipse([10, 14 + lift, 54, 52 + lift], fill=PAL[28])                   # trup
        d.ellipse([14, 18 + lift, 46, 44 + lift], fill=PAL[27])
        for k in range(7):                                                         # praskliny/mach
            x, y = 16 + rng.randint(0, 28), 20 + rng.randint(0, 22) + lift
            d.line([(x, y), (x + 3, y + 2)], fill=PAL[26])
        d.ellipse([22, 8 + lift, 42, 26 + lift], fill=PAL[28])                    # hlava
        d.rectangle([26, 15 + lift, 30, 17 + lift], fill=PAL[18])                 # žiariace oči
        d.rectangle([34, 15 + lift, 38, 17 + lift], fill=PAL[18])
        d.ellipse([27, 30 + lift, 37, 40 + lift], fill=PAL[24])                   # Helios jadro
        d.ellipse([30, 33 + lift, 34, 37 + lift], fill=PAL[25])
        arm_y = {0: 30, 1: 32, 2: 4, 3: 40}[st]                                    # ruky
        d.ellipse([0, arm_y + lift, 14, arm_y + 18 + lift], fill=PAL[28])
        d.ellipse([50, (arm_y if st != 2 else 30) + lift, 63, (arm_y if st != 2 else 30) + 18 + lift], fill=PAL[28])
        d.point((5, arm_y + 6 + lift), fill=PAL[11])
        f.append(outline(img))
    save(sheet(f, 64, 64), 'golem.png')

    # Mechanický pavúk 96×48: 0-2 chôdza, 3 otvorené jadro
    f = []
    for st in range(4):
        img = new(96, 48)
        d = ImageDraw.Draw(img)
        for side in (-1, 1):
            for k in range(4):
                ph = (st + k) % 3
                bx = 48 + side * (10 + k * 6)
                kx = 48 + side * (22 + k * 7)
                ky = 6 + ph * 2
                fx = 48 + side * (30 + k * 4)
                L(d, (bx, 22), (kx, ky), PAL[26], 3)
                L(d, (kx, ky), (fx, 46), PAL[27], 2)
                d.point((kx, ky), fill=PAL[24])
        d.ellipse([22, 10, 74, 36], fill=PAL[27])
        d.ellipse([26, 12, 70, 32], fill=PAL[28])
        for e in range(4):
            d.rectangle([36 + e * 7, 30, 39 + e * 7, 32], fill=PAL[21])   # oči
        if st == 3:
            d.ellipse([38, 14, 58, 30], fill=PAL[25])
            d.ellipse([42, 17, 54, 27], fill=PAL[31])
        else:
            d.ellipse([38, 14, 58, 30], fill=PAL[22])
            d.line([(48, 14), (48, 30)], fill=PAL[26])
        f.append(outline(img))
    save(sheet(f, 96, 48), 'spider.png')

    # Strážna brána 64×128: 0 celá, 1 poškodená, 2 zničená
    f = []
    for st in range(3):
        img = new(64, 128)
        d = ImageDraw.Draw(img)
        d.rectangle([4, 0, 59, 127], fill=PAL[26])
        for y in range(0, 128, 16):
            d.line([(4, y), (59, y)], fill=PAL[1])
            for x in (8, 54):
                d.point((x, y + 4), fill=PAL[28])
        d.rectangle([10, 0, 18, 127], fill=PAL[27])
        d.rectangle([46, 0, 54, 127], fill=PAL[27])
        for y in range(4, 128, 12):
            d.line([(20, y), (44, y + 6)], fill=PAL[19] if (y // 12) % 2 else PAL[1], width=2)
        cy = 64
        if st < 2:
            d.ellipse([20, cy - 12, 44, cy + 12], fill=PAL[23])
            d.ellipse([24, cy - 8, 40, cy + 8], fill=PAL[24] if st == 0 else PAL[21])
            d.ellipse([29, cy - 3, 35, cy + 3], fill=PAL[31])
        if st >= 1:
            for k in range(10):
                x, y = rng.randint(6, 56), rng.randint(4, 124)
                d.line([(x, y), (x + rng.randint(-6, 6), y + 6)], fill=PAL[0])
        if st == 2:
            d.rectangle([4, 0, 59, 127], fill=T)
            d.polygon([(4, 127), (8, 90), (20, 100), (30, 80), (44, 104), (59, 92), (59, 127)], fill=PAL[26])
        f.append(outline(img))
    save(sheet(f, 64, 128), 'gate.png')

    # Hlavný reaktor 64×64: 0-1 pulz (štít), 2 odkryté jadro, 3 zničené
    f = []
    for st in range(4):
        img = new(64, 64)
        d = ImageDraw.Draw(img)
        d.ellipse([4, 4, 59, 59], fill=PAL[26])
        d.ellipse([8, 8, 55, 55], fill=PAL[27])
        for a in range(0, 360, 45):
            x, y = 32 + math.cos(math.radians(a)) * 24, 32 + math.sin(math.radians(a)) * 24
            d.rectangle([x - 2, y - 2, x + 2, y + 2], fill=PAL[19] if st != 3 else PAL[26])
        if st in (0, 1):
            d.ellipse([16, 16, 47, 47], fill=PAL[22])
            d.ellipse([20 - st * 2, 20 - st * 2, 43 + st * 2, 43 + st * 2], fill=PAL[23])
            d.ellipse([27, 27, 36, 36], fill=PAL[24])
        elif st == 2:
            d.ellipse([16, 16, 47, 47], fill=PAL[24])
            d.ellipse([22, 22, 41, 41], fill=PAL[25])
            d.ellipse([28, 28, 35, 35], fill=PAL[31])
        else:
            d.ellipse([16, 16, 47, 47], fill=PAL[1])
            d.line([(18, 30), (46, 34)], fill=PAL[16], width=2)
        f.append(outline(img))
    save(sheet(f, 64, 64), 'reactor.png')

    # rameno reaktora 32×32: 0 pokoj, 1 strieľa | článok ramena 8×8
    f = []
    for st in range(2):
        img = new(32, 32)
        d = ImageDraw.Draw(img)
        d.ellipse([6, 6, 25, 25], fill=PAL[27])
        d.ellipse([9, 9, 22, 22], fill=PAL[28])
        d.polygon([(16, 2), (20, 8), (12, 8)], fill=PAL[29])
        d.polygon([(16, 29), (20, 23), (12, 23)], fill=PAL[29])
        d.ellipse([12, 12, 19, 19], fill=PAL[21] if st == 1 else PAL[23])
        f.append(outline(img))
    save(sheet(f, 32, 32), 'arm.png')
    img = new(8, 8)
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, 7, 7], fill=PAL[27])
    d.ellipse([2, 2, 5, 5], fill=PAL[23])
    save(img, 'armseg.png')


# ---------------------------------------------------------------------------
# TILESETY 16×16 (8 dlaždíc vedľa seba)
#   0 povrch zeme | 1 výplň | 2 platforma (zoskočiteľná) | 3 skala
#   4 dekor A | 5 dekor B | 6 kov/most | 7 výplň tmavá
# ---------------------------------------------------------------------------
def noise_tile(base, spots, n=14, seed=0):
    r = random.Random(seed)
    img = new(16, 16, base)
    d = ImageDraw.Draw(img)
    for _ in range(n):
        x, y = r.randrange(16), r.randrange(16)
        c = spots[r.randrange(len(spots))]
        d.point((x, y), fill=c)
        if r.random() < 0.4:
            d.point((min(15, x + 1), y), fill=c)
    return img


def tileset(theme):
    tiles = []
    if theme == 'jungle':
        top = noise_tile(PAL[13], [PAL[14], PAL[16]], seed=1)
        d = ImageDraw.Draw(top)
        d.rectangle([0, 0, 15, 4], fill=PAL[10])
        for x in range(0, 16, 2):
            d.line([(x, 0), (x, 5 + (x * 7) % 3)], fill=PAL[11])
        d.line([(0, 0), (15, 0)], fill=PAL[12])
        fill = noise_tile(PAL[13], [PAL[14], PAL[0], PAL[16]], seed=2)
        plat = new(16, 16)
        d = ImageDraw.Draw(plat)
        d.rectangle([0, 0, 15, 5], fill=PAL[14])
        d.line([(0, 0), (15, 0)], fill=PAL[15])
        for x in (3, 11):
            d.line([(x, 1), (x, 5)], fill=PAL[13])
        d.line([(0, 5), (15, 5)], fill=PAL[0])
        rock = noise_tile(PAL[27], [PAL[28], PAL[26]], seed=3)
        ImageDraw.Draw(rock).line([(0, 0), (15, 0)], fill=PAL[29])
        decoA = new(16, 16)  # liana
        d = ImageDraw.Draw(decoA)
        for y in range(16):
            d.point((7 + int(math.sin(y / 2) * 2), y), fill=PAL[10])
            if y % 5 == 0:
                d.point((9 + int(math.sin(y / 2) * 2), y), fill=PAL[11])
        decoB = new(16, 16)  # paprade
        d = ImageDraw.Draw(decoB)
        for k in range(5):
            d.line([(8, 15), (2 + k * 3, 6 + abs(2 - k) * 2)], fill=PAL[10 + (k % 2)])
        metal = noise_tile(PAL[14], [PAL[13]], seed=4)
        d = ImageDraw.Draw(metal)
        d.line([(0, 0), (15, 0)], fill=PAL[15])
        d.line([(0, 15), (15, 15)], fill=PAL[0])
        dark = noise_tile(PAL[0], [PAL[13]], seed=5)
    elif theme == 'cave':
        top = noise_tile(PAL[22], [PAL[23], PAL[1]], seed=6)
        d = ImageDraw.Draw(top)
        d.rectangle([0, 0, 15, 3], fill=PAL[23])
        for x in range(1, 16, 5):
            d.polygon([(x, 3), (x + 2, -2), (x + 4, 3)], fill=PAL[30])
            d.point((x + 2, 0), fill=PAL[31])
        fill = noise_tile(PAL[22], [PAL[1], PAL[23]], seed=7)
        plat = new(16, 16)
        d = ImageDraw.Draw(plat)
        d.rectangle([0, 0, 15, 5], fill=PAL[23])
        d.polygon([(2, 0), (5, -3), (8, 0)], fill=PAL[24])
        d.line([(0, 0), (15, 0)], fill=PAL[24])
        d.line([(0, 5), (15, 5)], fill=PAL[0])
        rock = noise_tile(PAL[23], [PAL[24], PAL[22]], seed=8)
        decoA = new(16, 16)  # kryštál
        d = ImageDraw.Draw(decoA)
        d.polygon([(8, 2), (12, 10), (8, 15), (4, 10)], fill=PAL[30])
        d.polygon([(8, 2), (8, 15), (4, 10)], fill=PAL[5])
        decoB = new(16, 16)
        d = ImageDraw.Draw(decoB)
        d.polygon([(4, 6), (7, 15), (1, 15)], fill=PAL[24])
        d.polygon([(11, 3), (15, 15), (8, 15)], fill=PAL[25])
        metal = noise_tile(PAL[2], [PAL[3]], seed=9)
        dark = noise_tile(PAL[0], [PAL[22]], seed=10)
    else:  # base / reactor – kovové
        neon = PAL[24] if theme == 'reactor' else PAL[19]
        top = noise_tile(PAL[27], [PAL[26]], n=4, seed=11)
        d = ImageDraw.Draw(top)
        d.rectangle([0, 0, 15, 2], fill=PAL[28])
        d.line([(0, 3), (15, 3)], fill=neon)
        d.point((2, 8), fill=PAL[29]); d.point((13, 8), fill=PAL[29])
        fill = noise_tile(PAL[26], [PAL[27], PAL[1]], n=6, seed=12)
        d = ImageDraw.Draw(fill)
        d.rectangle([0, 0, 15, 15], outline=PAL[1])
        plat = new(16, 16)
        d = ImageDraw.Draw(plat)
        d.rectangle([0, 0, 15, 4], fill=PAL[28])
        for x in range(0, 16, 4):
            d.line([(x, 1), (x + 2, 4)], fill=PAL[26])
        d.line([(0, 0), (15, 0)], fill=PAL[29])
        rock = noise_tile(PAL[2], [PAL[3]], n=6, seed=13)
        ImageDraw.Draw(rock).rectangle([0, 0, 15, 15], outline=neon)
        decoA = new(16, 16)  # rúra
        d = ImageDraw.Draw(decoA)
        d.rectangle([5, 0, 10, 15], fill=PAL[27])
        d.line([(6, 0), (6, 15)], fill=PAL[29])
        d.rectangle([4, 6, 11, 8], fill=PAL[26])
        decoB = new(16, 16)  # výstražné svetlo
        d = ImageDraw.Draw(decoB)
        d.rectangle([4, 4, 11, 11], fill=PAL[26])
        d.ellipse([5, 5, 10, 10], fill=PAL[21] if theme == 'base' else PAL[25])
        metal = noise_tile(PAL[27], [PAL[28]], n=4, seed=14)
        d = ImageDraw.Draw(metal)
        for x in range(0, 16, 8):
            d.line([(x, 0), (x + 8, 15)], fill=PAL[19])
        dark = noise_tile(PAL[1], [PAL[26]], n=6, seed=15)
    tiles = [top, fill, plat, rock, decoA, decoB, metal, dark]
    return sheet(tiles, 16, 16)


def water():
    f = []   # hladina 16×16, 4 snímky
    for i in range(4):
        img = new(16, 16, hx(PAL_HEX[3], 200))
        d = ImageDraw.Draw(img)
        for x in range(16):
            y = 1 + round(math.sin((x + i * 4) / 16 * 2 * math.pi) * 1.2)
            d.line([(x, 0), (x, y)], fill=T)
            d.point((x, y + 1), fill=PAL[6])
            if (x + i * 3) % 7 == 0:
                d.point((x, y + 4), fill=PAL[5])
        f.append(img)
    save(sheet(f, 16, 16), 'water.png')
    img = new(16, 16, hx(PAL_HEX[2], 210))
    d = ImageDraw.Draw(img)
    d.point((4, 5), fill=PAL[3]); d.point((11, 12), fill=PAL[3])
    save(img, 'water_body.png')
    img = new(16, 32, hx(PAL_HEX[5], 230))   # vodopád – v hre sa posúva tilePositionY
    d = ImageDraw.Draw(img)
    for x in range(0, 16, 3):
        for y in range(0, 32, 2):
            if (x * 5 + y * 3) % 11 < 4:
                d.line([(x, y), (x, y + 3)], fill=PAL[6])
            if (x * 7 + y) % 13 == 0:
                d.point((x + 1, y), fill=PAL[7])
    save(img, 'waterfall.png')


# ---------------------------------------------------------------------------
# POZADIA – parallax vrstvy, horizontálne opakovateľné (šírka 480)
# ---------------------------------------------------------------------------
def periodic(w, x, terms, seed):
    r = random.Random(seed)
    v = 0
    for k, amp in terms:
        ph = r.random() * 6.28
        v += amp * math.sin(2 * math.pi * k * x / w + ph)
    return v


def gradient(w, h, stops):
    img = new(w, h)
    d = ImageDraw.Draw(img)
    n = len(stops)
    for y in range(h):
        # pásikovaný (dither-like) gradient iba z farieb palety
        t = y / h * (n - 1)
        i = min(int(t), n - 2)
        frac = t - i
        c = stops[i + 1] if (frac > 0.5 or ((y % 2 == 0) and frac > 0.35)) else stops[i]
        d.line([(0, y), (w, y)], fill=c)
    return img


def mountains(w, h, base, snow, col, dark, seed, height=0.7, snowline=0.25):
    img = new(w, h)
    d = ImageDraw.Draw(img)
    for x in range(w):
        v = periodic(w, x, [(1, 0.35), (3, 0.25), (7, 0.12), (13, 0.05)], seed)
        y = int(h * (1 - height) + (v + 0.5) * h * 0.35)
        y = max(2, min(h - 1, y))
        d.line([(x, y), (x, h)], fill=col)
        sh = periodic(w, x + 3, [(7, 1)], seed + 1)
        if sh > 0.3:
            d.line([(x, y + 2), (x, h)], fill=dark)
        if snow and y < h * (1 - height) + h * snowline:
            d.line([(x, y), (x, y + 2 + (x % 3))], fill=snow)
    return img


def trees(w, h, col, dark, seed):
    img = new(w, h)
    d = ImageDraw.Draw(img)
    r = random.Random(seed)
    for x in range(w):
        v = periodic(w, x, [(5, 0.3), (11, 0.2), (23, 0.1)], seed)
        y = int(h * 0.45 + v * h * 0.3)
        d.line([(x, y), (x, h)], fill=col)
    for k in range(24):  # palmy/smreky ako siluety
        x = r.randrange(w)
        tt = r.randrange(int(h * 0.1), int(h * 0.4))
        for yy in range(tt, h):
            wdt = (yy - tt) // 3
            d.line([(x - wdt, yy), (x + wdt, yy)], fill=dark if k % 2 else col)
            if x - wdt < 0:
                d.line([(w + x - wdt, yy), (w - 1, yy)], fill=dark if k % 2 else col)
            if x + wdt >= w:
                d.line([(0, yy), (x + wdt - w, yy)], fill=dark if k % 2 else col)
    return img


def fog(w, h, col, alpha=90):
    img = new(w, h)
    d = ImageDraw.Draw(img)
    for y in range(h):
        a = int(alpha * math.sin(math.pi * y / h))
        for x in range(w):
            if periodic(w, x, [(3, 0.5), (9, 0.3)], y // 6) + (y % 3) * 0.1 > -0.2:
                d.point((x, y), fill=(col[0], col[1], col[2], a))
    return img


def backgrounds():
    # Level 1 – džungľa a vodopády pod Tatrami
    save(gradient(480, 270, [PAL[1], PAL[2], PAL[3], PAL[23], PAL[17]]), 'bg1_sky.png')
    save(mountains(480, 180, None, PAL[7], PAL[2], PAL[1], 1, height=0.8, snowline=0.18), 'bg1_far.png')
    save(mountains(480, 140, None, None, PAL[9], PAL[8], 2, height=0.55), 'bg1_mid.png')
    save(trees(480, 120, PAL[9], PAL[8], 3), 'bg1_near.png')
    save(fog(480, 60, PAL[6], 70), 'fog.png')
    # Level 2 – kryštálová jaskyňa (opakuje sa aj vertikálne)
    img = new(480, 270, PAL[0])
    d = ImageDraw.Draw(img)
    r = random.Random(20)
    for _ in range(120):
        x, y = r.randrange(480), r.randrange(270)
        s = r.randrange(3, 12)
        d.polygon([(x, y - s), (x + s // 2, y), (x, y + s), (x - s // 2, y)],
                  fill=[PAL[22], PAL[23], PAL[2]][r.randrange(3)])
    save(img, 'bg2_far.png')
    img = new(480, 270)
    d = ImageDraw.Draw(img)
    for side in (0, 1):
        for y in range(270):
            v = periodic(270, y, [(2, 0.5), (5, 0.25), (9, 0.1)], 30 + side)
            wdt = int(40 + v * 40)
            x0 = 0 if side == 0 else 480 - wdt
            d.line([(x0, y), (x0 + wdt, y)], fill=PAL[22])
            d.point((x0 + (wdt if side == 0 else 0), y), fill=PAL[24] if y % 9 < 2 else PAL[23])
    for _ in range(30):
        x = r.choice([r.randrange(10, 80), r.randrange(400, 470)])
        y = r.randrange(260)
        d.polygon([(x, y), (x + 4, y + 10), (x - 4, y + 10)], fill=PAL[30] if r.random() < 0.5 else PAL[25])
    save(img, 'bg2_near.png')
    # Level 3 – podzemná základňa
    save(gradient(480, 270, [PAL[0], PAL[1], PAL[26], PAL[1]]), 'bg3_sky.png')
    img = new(480, 270)
    d = ImageDraw.Draw(img)
    for x in range(0, 480, 60):
        d.rectangle([x + 4, 0, x + 40, 270], fill=PAL[1])
        d.rectangle([x + 8, 0, x + 12, 270], fill=PAL[26])
        for y in range(10, 270, 40):
            d.rectangle([x + 18, y, x + 34, y + 20], fill=PAL[2])
            d.rectangle([x + 20, y + 2, x + 32, y + 6], fill=PAL[30] if (x // 60 + y // 40) % 3 == 0 else PAL[3])
    save(img, 'bg3_far.png')
    img = new(480, 270)
    d = ImageDraw.Draw(img)
    for y in (40, 70, 200):
        d.rectangle([0, y, 479, y + 8], fill=PAL[27])
        d.line([(0, y + 1), (479, y + 1)], fill=PAL[28])
        for x in range(0, 480, 48):
            d.rectangle([x, y - 2, x + 6, y + 10], fill=PAL[26])
    save(img, 'bg3_near.png')
    # Level 4 – reaktor
    save(gradient(480, 270, [PAL[0], PAL[22], PAL[23], PAL[22]]), 'bg4_sky.png')
    img = new(480, 270)
    d = ImageDraw.Draw(img)
    for x in range(0, 480, 80):
        d.rectangle([x + 20, 30, x + 60, 270], fill=PAL[1])
        for y in range(40, 270, 16):
            d.line([(x + 24, y), (x + 56, y)], fill=PAL[24] if (y // 16) % 4 == 0 else PAL[22])
        d.ellipse([x + 26, 10, x + 54, 40], fill=PAL[23])
        d.ellipse([x + 34, 18, x + 46, 32], fill=PAL[25])
    save(img, 'bg4_far.png')
    img = new(480, 270)
    d = ImageDraw.Draw(img)
    for k in range(6):
        y = 20 + k * 40
        pts = [(x, y + int(10 * math.sin(x / 480 * 2 * math.pi * 2 + k))) for x in range(0, 481, 8)]
        d.line(pts, fill=PAL[26], width=4)
        d.line(pts, fill=PAL[23], width=1)
    save(img, 'bg4_near.png')


# ---------------------------------------------------------------------------
# PIXELOVÝ FONT 6×10 (5×7 glyf + 2 riadky na diakritiku), iba veľké písmená
# ---------------------------------------------------------------------------
GLYPHS = {
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'N': ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ' ': ['00000'] * 7,
    '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
    '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
    ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
    '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
    '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
    ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
    "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
    '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
    '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
    '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
    '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
    '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
    '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
    '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
    '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
    '[': ['01110', '01000', '01000', '01000', '01000', '01000', '01110'],
    ']': ['01110', '00010', '00010', '00010', '00010', '00010', '01110'],
}
# diakritika: písmeno → (základ, typ značky)
ACCENTS = {'Á': ('A', 'acute'), 'Ä': ('A', 'uml'), 'Č': ('C', 'caron'), 'Ď': ('D', 'caron'), 'É': ('E', 'acute'),
           'Í': ('I', 'acute'), 'Ĺ': ('L', 'acute'), 'Ľ': ('L', 'apos'), 'Ň': ('N', 'caron'), 'Ó': ('O', 'acute'),
           'Ô': ('O', 'circ'), 'Ŕ': ('R', 'acute'), 'Š': ('S', 'caron'), 'Ť': ('T', 'caron'), 'Ú': ('U', 'acute'),
           'Ý': ('Y', 'acute'), 'Ž': ('Z', 'caron')}
FONT_CHARS = ''.join(GLYPHS.keys()) + ''.join(ACCENTS.keys())
FONT_W, FONT_H = 6, 10


def glyph_bits(ch):
    """Vráti 10 riadkov × 5 bitov (2 riadky diakritika + 7 glyf + 1 medzera)."""
    if ch in ACCENTS:
        base, kind = ACCENTS[ch]
        rows = list(GLYPHS[base])
        mark = {'acute': ['00010', '00100'], 'uml': ['01010', '00000'], 'caron': ['01010', '00100'],
                'circ': ['00100', '01010'], 'apos': ['00000', '00000']}[kind]
        if kind == 'apos':
            rows = [r[:3] + ('1' if i in (0, 1) else r[3]) + r[4] for i, r in enumerate(rows)]
        return mark + rows + ['00000']
    return ['00000', '00000'] + GLYPHS[ch] + ['00000']


def draw_text(img, text, x, y, col, scale=1):
    """Kreslí text fontom do obrázka (použité pre power-upy a ikony). y = horný okraj glyfu."""
    p = img.load()
    for i, ch in enumerate(text):
        rows = glyph_bits(ch)[2:9]
        for ry, row in enumerate(rows):
            for rx, b in enumerate(row):
                if b == '1':
                    for sy in range(scale):
                        for sx in range(scale):
                            px_, py_ = x + (i * 6 + rx) * scale + sx, y + ry * scale + sy
                            if 0 <= px_ < img.size[0] and 0 <= py_ < img.size[1]:
                                p[px_, py_] = col


def font():
    cols = 16
    rows = math.ceil(len(FONT_CHARS) / cols)
    img = new(cols * FONT_W, rows * FONT_H)
    p = img.load()
    for i, ch in enumerate(FONT_CHARS):
        ox, oy = (i % cols) * FONT_W, (i // cols) * FONT_H
        for ry, row in enumerate(glyph_bits(ch)):
            for rx, b in enumerate(row):
                if b == '1':
                    p[ox + rx, oy + ry] = PAL[31]
    save(img, 'font.png')
    # znaky pre Phaser RetroFont (v src/config.js sa načítajú z tohto súboru)
    with open(os.path.join(OUT, 'font.json'), 'w', encoding='utf-8') as fp:
        import json
        json.dump({'chars': FONT_CHARS, 'w': FONT_W, 'h': FONT_H, 'perRow': cols}, fp, ensure_ascii=False)


# ---------------------------------------------------------------------------
# UI + IKONY
# ---------------------------------------------------------------------------
def ui():
    # ui 8×8: 0 život (medaila), 1 srdce, 2 lebka, 3 hviezda
    f = []
    img = new(8, 8); d = ImageDraw.Draw(img)
    d.rectangle([2, 0, 5, 2], fill=PAL[21]); d.ellipse([1, 2, 6, 7], fill=PAL[19]); d.point((3, 4), fill=PAL[31])
    f.append(img)
    img = new(8, 8); d = ImageDraw.Draw(img)
    d.polygon([(4, 7), (0, 3), (1, 1), (4, 2), (6, 1), (7, 3)], fill=PAL[21])
    f.append(img)
    img = new(8, 8); d = ImageDraw.Draw(img)
    d.ellipse([1, 0, 6, 5], fill=PAL[29]); d.rectangle([2, 5, 5, 7], fill=PAL[29])
    d.point((2, 2), fill=PAL[0]); d.point((5, 2), fill=PAL[0])
    f.append(img)
    img = new(8, 8); d = ImageDraw.Draw(img)
    d.polygon([(4, 0), (5, 3), (7, 3), (5, 5), (6, 7), (4, 6), (2, 7), (3, 5), (1, 3), (3, 3)], fill=PAL[19])
    f.append(img)
    save(sheet(f, 8, 8), 'ui.png')


def emblem(size=64):
    """Emblém hry – hlava rysa s prilbou (ikona aj logo v menu)."""
    img = new(size, size, PAL[1])
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, size - 1, size - 1], outline=PAL[24])
    # hlava rysa
    d.polygon([(14, 50), (10, 14), (22, 24), (42, 24), (54, 14), (50, 50), (32, 58)], fill=PAL[17])
    d.polygon([(10, 14), (8, 6), (14, 16)], fill=PAL[0])   # štetiny na ušiach
    d.polygon([(54, 14), (56, 6), (50, 16)], fill=PAL[0])
    d.polygon([(18, 46), (32, 56), (46, 46), (40, 40), (24, 40)], fill=PAL[19])
    # vizor (železný rys)
    d.rectangle([16, 28, 48, 36], fill=PAL[2])
    d.rectangle([18, 30, 30, 33], fill=PAL[30])
    d.rectangle([34, 30, 46, 33], fill=PAL[30])
    d.polygon([(28, 44), (36, 44), (32, 48)], fill=PAL[0])
    return outline(img, PAL[0])


def icons():
    e = emblem(64)
    for s in (180, 192, 512):
        save(e.resize((s, s), Image.NEAREST), f'icon-{s}.png', ICONS)
    save(emblem(64), 'emblem.png')


if __name__ == '__main__':
    print('Generujem grafiku do', OUT)
    for name, c in HEROES.items():
        save(player_sheet(c), f'player_{name}.png')
    enemies()
    projectiles()
    bosses()
    for i, theme in enumerate(['jungle', 'cave', 'base', 'reactor'], start=1):
        save(tileset(theme), f'tiles{i}.png')
    water()
    backgrounds()
    font()
    ui()
    icons()
    print('Hotovo.')
