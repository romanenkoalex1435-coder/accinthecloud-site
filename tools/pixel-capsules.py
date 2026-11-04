"""Пиксельные рисунки вещей для карточек капсул на главной: images/capsules/a1|a2|a3.png.
   Вещь собирается из деталей (полигоны в клетках), свет — сверху слева: у каждой детали
   светлый край сверху-слева и тень снизу-справа, контур чёрный. Фактура (камуфляж, деним, рубчик)
   кладётся по детали. На сумке — тканая нашивка со знаком, знак растрирован из js/logo-shape.json.
   PNG сохраняется увеличенным в SCALE раз без сглаживания.
   Запуск из папки сайта: python3 tools/pixel-capsules.py"""
import json, math, random
from PIL import Image, ImageDraw

INK = (13, 13, 13)
SCALE = 8
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def mul(c, f):
    return tuple(max(0, min(255, round(v * f))) for v in c)


def noise(w, h, cell, seed):
    """Плавный шум 0..1: случайная решётка + билинейная интерполяция."""
    rnd = random.Random(seed)
    gw, gh = w // cell + 2, h // cell + 2
    g = [[rnd.random() for _ in range(gw)] for _ in range(gh)]
    def at(x, y):
        fx, fy = x / cell, y / cell
        x0, y0 = int(fx), int(fy)
        tx, ty = fx - x0, fy - y0
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = g[y0][x0] * (1 - tx) + g[y0][x0 + 1] * tx
        b = g[y0 + 1][x0] * (1 - tx) + g[y0 + 1][x0 + 1] * tx
        return a * (1 - ty) + b * ty
    return at


def line(x0, y0, x1, y1):
    pts, dx, dy = [], abs(x1 - x0), -abs(y1 - y0)
    sx, sy, err = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1), abs(x1 - x0) - abs(y1 - y0)
    while True:
        pts.append((x0, y0))
        if (x0, y0) == (x1, y1): return pts
        e2 = 2 * err
        if e2 >= dy: err += dy; x0 += sx
        if e2 <= dx: err += dx; y0 += sy


class Art:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.lab = Image.new('L', (w, h), 0)
        self.d = ImageDraw.Draw(self.lab)
        self.mat = {}
        self.deco = {}

    def material(self, m, fn, flat=False):
        self.mat[m] = (fn, flat)

    def shaded(self, m, ramp, tex=None, cyl=True, base=0.55):
        """Деталь с рампой цветов (тёмный → светлый). cyl — объём как у цилиндра:
           в каждой строке светлее чуть левее середины детали, к краям темнее."""
        self.mat[m] = (ramp, tex, cyl, base)

    def poly(self, pts, m, sym=False):
        self.d.polygon([tuple(p) for p in pts], fill=m)
        if sym: self.d.polygon([(self.w - 1 - x, y) for x, y in pts], fill=m)

    def rect(self, x0, y0, x1, y1, m, sym=False):
        self.d.rectangle([x0, y0, x1, y1], fill=m)
        if sym: self.d.rectangle([self.w - 1 - x1, y0, self.w - 1 - x0, y1], fill=m)

    def dot(self, x, y, c, sym=False):
        self.deco[(x, y)] = c
        if sym: self.deco[(self.w - 1 - x, y)] = c

    def path(self, pts, c, dash=0, sym=False):
        """Ломаная поверх деталей; dash=3 — строчка «два стежка, пропуск»."""
        i = 0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for p in line(x0, y0, x1, y1)[(1 if i else 0):]:
                if not dash or i % dash != dash - 1: self.dot(*p, c, sym)
                i += 1

    def render(self):
        L, W, H = self.lab.load(), self.w, self.h
        lab = lambda x, y: L[x, y] if 0 <= x < W and 0 <= y < H else 0
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        px = img.load()
        for y in range(H):
            for x in range(W):
                m = lab(x, y)
                if m == 0:
                    if any(lab(x + dx, y + dy) for dx, dy in N4): px[x, y] = INK + (255,)
                    continue
                spec = self.mat[m]
                if len(spec) == 4:
                    px[x, y] = self.ramp_at(spec, m, x, y, lab) + (255,)
                    continue
                fn, flat = spec
                c = fn(x, y)
                if not flat:
                    if lab(x - 1, y) != m or lab(x, y - 1) != m: c = mul(c, 1.22)
                    elif lab(x + 1, y) != m or lab(x, y + 1) != m: c = mul(c, 0.58)
                    elif lab(x + 1, y + 1) != m or lab(x + 2, y) != m or lab(x, y + 2) != m: c = mul(c, 0.8)
                px[x, y] = c + (255,)
        for (x, y), c in self.deco.items():
            if 0 <= x < W and 0 <= y < H and px[x, y][3]: px[x, y] = c + (255,)
        return img

    def ramp_at(self, spec, m, x, y, lab):
        ramp, tex, cyl, base = spec
        v = base
        if cyl:
            x0 = x
            while lab(x0 - 1, y) == m: x0 -= 1
            x1 = x
            while lab(x1 + 1, y) == m: x1 += 1
            t = (x - x0 + 0.5) / (x1 - x0 + 1)
            v = base - 0.35 + 0.75 * max(0.0, 1 - abs(t - 0.4) / 0.6) ** 0.8
        f = v * (len(ramp) - 1)
        i, frac = int(f), f - int(f)
        # переход между тонами — шахматкой, как в ручном пиксель-арте
        if 0.42 < frac < 0.58: i += (x + y) % 2
        elif frac >= 0.58: i += 1
        if tex: i += tex(x, y)
        if lab(x - 1, y) != m or lab(x, y - 1) != m: i += 1
        elif lab(x + 1, y) != m or lab(x, y + 1) != m: i -= 2
        elif lab(x + 1, y + 1) != m or lab(x, y + 2) != m: i -= 1
        return ramp[max(0, min(len(ramp) - 1, i))]


def solid(c):
    return lambda x, y: c


def logo_mask(w, h):
    """Знак accinthecloud в клетках w×h: рисуем крупно, уменьшаем, режем по порогу."""
    d = json.load(open('js/logo-shape.json'))
    loops = sorted(d['loops'], key=len, reverse=True)
    xs = [p[0] for p in loops[0]]; ys = [p[1] for p in loops[0]]
    k = 16
    big = Image.new('L', (w * k, h * k), 0)
    dr = ImageDraw.Draw(big)
    sx = (w * k) / (max(xs) - min(xs)); sy = (h * k) / (max(ys) - min(ys))
    tr = lambda p: ((p[0] - min(xs)) * sx, (max(ys) - p[1]) * sy)
    dr.polygon([tr(p) for p in loops[0]], fill=255)
    for l in loops[1:]: dr.polygon([tr(p) for p in l], fill=0)
    small = big.resize((w, h), Image.BOX)
    # порог высокий, чтобы не заплыли тонкие щели между кольцом и «a»
    return [[small.getpixel((x, y)) > 190 for x in range(w)] for y in range(h)]


# ─── a1 · сумка через плечо, камуфляж ─────────────────────────────
def bag():
    a = Art(60, 62)
    camo = [(111, 119, 82), (77, 84, 55), (146, 141, 98), (47, 51, 36)]
    n1, n2 = noise(60, 62, 7, 3), noise(60, 62, 5, 11)
    def camo_at(x, y):
        v, u = n1(x, y), n2(x, y)
        if u > 0.66: return camo[3]
        if v > 0.62: return camo[1]
        if v < 0.3: return camo[2]
        return camo[0]
    a.material(1, camo_at)                                   # корпус
    a.material(2, lambda x, y: mul(camo_at(x, y), 0.92))     # передний карман
    a.material(3, solid((58, 60, 46)))                       # ремень, стропа
    a.material(4, solid((40, 40, 36)))                       # лента молнии
    a.material(5, solid((176, 176, 170)))                    # металл
    a.material(6, solid((226, 218, 196)), flat=True)         # нашивка
    a.material(7, solid((52, 55, 42)))                       # клапан кармана

    # ремень дугой через плечо: две эллиптические кромки
    cx, cy, rx, ry, t = 29.5, 27, 23, 25, 4
    outer = [(cx + rx * math.cos(q), cy - ry * math.sin(q)) for q in [i * math.pi / 40 for i in range(41)]]
    inner = [(cx + (rx - t) * math.cos(q), cy - (ry - t) * math.sin(q)) for q in [i * math.pi / 40 for i in range(41)]][::-1]
    a.poly(outer + inner, 3)
    for i in range(0, 41, 3):                                # строчка по ремню
        q = i * math.pi / 40
        a.dot(round(cx + (rx - 2) * math.cos(q)), round(cy - (ry - 2) * math.sin(q)), (92, 95, 74))
    # корпус-«полумесяц»
    a.poly([(8, 27), (51, 27), (55, 36), (57, 47), (55, 55), (47, 60), (12, 60), (4, 55), (2, 47), (4, 36)], 1)
    # молния по верху и бегунок
    a.rect(8, 27, 51, 29, 4)
    for x in range(9, 51, 2): a.dot(x, 28, (150, 150, 144))
    a.rect(40, 29, 41, 33, 5)
    a.dot(40, 33, INK); a.dot(41, 33, INK)
    # пряжки там, где ремень входит в корпус
    a.rect(5, 23, 11, 25, 5, sym=True)
    a.rect(6, 26, 10, 31, 3, sym=True)
    # передний карман с клапаном
    a.poly([(8, 34), (51, 34), (53, 46), (51, 57), (8, 57), (6, 46)], 2)
    a.rect(7, 32, 52, 35, 7)
    a.dot(10, 34, (176, 176, 170), sym=True)                # кнопки клапана
    a.path([(9, 56), (50, 56)], (130, 128, 92), dash=3)
    # тканая нашивка со знаком
    a.rect(12, 37, 47, 54, 6)
    a.path([(12, 37), (47, 37)], (246, 241, 226)); a.path([(12, 37), (12, 54)], (246, 241, 226))
    a.path([(13, 54), (47, 54)], (176, 166, 140)); a.path([(47, 38), (47, 54)], (176, 166, 140))
    a.path([(13, 38), (46, 38), (46, 53), (13, 53), (13, 38)], (196, 186, 160), dash=2)
    for y, row in enumerate(logo_mask(32, 14)):
        for x, on in enumerate(row):
            if on: a.dot(14 + x, 39 + y, INK)
    return a


# ─── a2 · бомбер, чёрный нейлон, оранжевая подкладка ──────────────
def jacket():
    a = Art(66, 60)
    BLACK = [(16, 16, 18), (28, 29, 31), (41, 42, 45), (56, 58, 62), (75, 78, 83), (100, 104, 110)]
    ORANGE = [(110, 42, 16), (160, 66, 26), (204, 96, 40), (236, 136, 68)]
    METAL, LIGHT = (176, 176, 170), (214, 214, 208)
    rib = lambda x, y: -1 if x % 2 else 0
    a.shaded(1, BLACK)                                      # корпус
    a.shaded(2, BLACK, base=0.5)                            # рукава
    a.shaded(3, BLACK, tex=rib, base=0.42)                  # рубчик: воротник, манжеты, пояс
    a.shaded(4, BLACK, cyl=False, base=0.1)                 # горловина изнутри
    a.shaded(5, ORANGE, cyl=False, base=0.6)                # подкладка в вырезе
    a.shaded(6, BLACK, cyl=False, base=0.62)                # карман на рукаве

    # рукава: пышные, к манжете сужаются
    a.poly([(18, 10), (11, 12), (6, 18), (3, 29), (1, 41), (1, 49), (11, 50), (12, 41), (14, 31), (17, 24)], 2, sym=True)
    a.poly([(2, 49), (11, 49), (11, 55), (3, 55)], 3, sym=True)
    # корпус шире пояса — ткань напускается на резинку
    a.poly([(18, 9), (47, 9), (51, 19), (52, 33), (51, 46), (48, 51), (17, 51), (14, 46), (13, 33), (14, 19)], 1)
    a.rect(17, 50, 48, 56, 3)
    # воротник-резинка и горловина
    a.poly([(22, 4), (43, 4), (46, 9), (38, 13), (27, 13), (19, 9)], 3)
    a.poly([(26, 5), (39, 5), (37, 9), (28, 9)], 4)
    # молния расстёгнута сверху: оранжевая подкладка клином
    a.poly([(27, 11), (38, 11), (33, 24), (32, 24)], 5)
    a.path([(27, 11), (32, 24)], (20, 20, 22)); a.path([(38, 11), (33, 24)], (20, 20, 22))
    a.path([(28, 12), (32, 22)], (120, 120, 116), dash=2); a.path([(37, 12), (33, 22)], (120, 120, 116), dash=2)
    for y in range(24, 56):
        a.dot(32, y, METAL if y % 2 else (110, 110, 106)); a.dot(33, y, (14, 14, 15))
    a.rect(31, 24, 31, 28, 1); a.path([(31, 24), (31, 28)], METAL); a.dot(31, 28, LIGHT)
    # косые карманы с клапаном на кнопке
    a.path([(18, 41), (24, 33)], (14, 14, 15), sym=True)
    a.path([(19, 41), (25, 33)], (88, 92, 98), sym=True)
    a.path([(17, 39), (23, 31)], (60, 62, 66), dash=3, sym=True)
    a.dot(23, 35, METAL, sym=True)
    # складки: локоть, над манжетой, напуск над поясом
    for pts in (((4, 30), (8, 28), (11, 29)), ((3, 37), (7, 35), (11, 36)), ((2, 45), (6, 44), (10, 45)),
                ((15, 22), (17, 25))):
        a.path(list(pts), BLACK[0], sym=True)
        a.path([(x, y - 1) for x, y in pts], BLACK[4], sym=True)
    for x in (19, 24, 28):
        a.path([(x, 46), (x + 1, 49)], BLACK[0], sym=True)
        a.path([(x - 1, 46), (x, 49)], BLACK[3], sym=True)
    # карман на рукаве с прорезями под ручку и бегунком
    a.rect(52, 22, 58, 30, 6)
    for x in (53, 55, 57): a.path([(x, 22), (x, 24)], BLACK[1])
    a.path([(52, 26), (58, 26)], (14, 14, 15)); a.dot(57, 27, METAL); a.dot(57, 28, LIGHT)
    # тканая бирка со знаком на груди
    a.rect(19, 17, 26, 20, 1)
    for x in range(19, 27):
        for y in range(17, 21): a.dot(x, y, (226, 218, 196))
    a.path([(20, 18), (25, 18)], INK); a.dot(20, 19, INK); a.dot(23, 19, INK); a.dot(25, 19, INK)
    a.dot(21, 19, (226, 218, 196))
    return a


# ─── a3 · широкие джинсы ──────────────────────────────────────────
def pants():
    """Джинсы капсулы a3 (CLASSIC, HERDSMAN, BOLT): тёмный сырой деним, широкие прямые штанины,
       клетчатая подкладка в карманах, ширинка на пуговицах, медные заклёпки. Без потёртостей."""
    a = Art(42, 64)
    RAW = [(12, 16, 30), (20, 26, 46), (28, 36, 62), (38, 48, 80), (50, 62, 100), (66, 80, 124), (90, 104, 148)]
    STITCH, COPPER, COPPER_HI = (196, 142, 62), (168, 108, 56), (214, 158, 96)
    RED, CREAM, NAVY, DARK = (150, 46, 40), (214, 196, 164), (34, 38, 62), (96, 28, 28)
    slub = noise(42, 64, 3, 23)
    def raw(x, y):
        """саржа по диагонали и редкие утолщения нити — у сырого денима нет выцветания"""
        d = -1 if (x + 2 * y) % 7 == 0 else 0
        if slub(x, y) > 0.82: d += 1
        return d
    def plaid(x, y):
        u, v = x % 4, y % 4
        if u == 0 and v == 0: return CREAM
        if u == 0 or v == 0: return CREAM if (x + y) % 2 else RED
        if u == 2 and v == 2: return NAVY
        return DARK if (u == 2 or v == 2) else RED
    mir = lambda pts: [(a.w - 1 - x, y) for x, y in pts]
    a.shaded(1, RAW, tex=raw, base=0.6)                     # левая штанина
    a.shaded(5, RAW, tex=raw, base=0.55)                    # правая штанина
    a.shaded(2, RAW, base=0.55)                             # пояс
    a.shaded(3, RAW, cyl=False, base=0.42)                  # подгибка низа
    a.shaded(4, RAW, cyl=False, base=0.4)                   # шлёвки
    a.material(7, plaid, flat=True)                         # клетка в кармане

    # широкие прямые штанины во всю длину
    leg = [(4, 6), (20, 6), (20, 21), (19, 24), (18, 60), (1, 60), (1, 26), (2, 13)]
    a.poly(leg, 1)
    a.poly(mir(leg), 5)
    a.rect(1, 59, 18, 61, 3, sym=True)
    a.rect(4, 1, 37, 6, 2)
    for x in (6, 12, 29, 35): a.rect(x, 0, x + 1, 7, 4)
    # клетчатая подкладка выглядывает из передних карманов
    pocket = [(4, 7), (10, 7), (12, 11), (11, 15), (3, 11)]
    a.poly(pocket, 7)
    a.poly(mir(pocket), 7)
    a.path([(3, 12), (11, 16)], RAW[0], sym=True)           # край кармана
    a.path([(2, 13), (11, 17)], STITCH, dash=3, sym=True)
    a.dot(12, 16, COPPER, sym=True); a.dot(12, 17, COPPER_HI, sym=True)
    a.dot(3, 7, COPPER, sym=True)
    # строчки пояса и подгибки
    a.path([(4, 5), (37, 5)], STITCH, dash=3)
    a.path([(1, 59), (18, 59)], STITCH, dash=3, sym=True)
    # ширинка на пуговицах
    a.path([(18, 7), (18, 18), (19, 20), (20, 21)], STITCH, dash=3)
    a.path([(21, 7), (21, 21)], RAW[0])
    for y in (3, 8, 12, 16):
        a.dot(21, y, COPPER); a.dot(20, y, COPPER_HI)
    a.path([(30, 8), (34, 8), (34, 12)], STITCH, dash=3)    # монетный кармашек
    # боковые швы
    a.path([(2, 15), (1, 27), (1, 58)], STITCH, dash=4, sym=True)
    # заутюженная стрелка: светлая полоса по передней стороне штанины
    a.path([(10, 27), (10, 52)], RAW[5], dash=5, sym=True)
    # залом над подгибкой — штанина ложится на ботинок
    for pts in (((2, 55), (6, 53), (11, 55), (16, 54)),):
        a.path([(x, y - 1) for x, y in pts], RAW[5], sym=True)
        a.path(list(pts), RAW[0], sym=True)
    return a


for key, build in (('a1', bag), ('a2', jacket), ('a3', pants)):
    art = build()
    img = art.render()
    img.resize((art.w * SCALE, art.h * SCALE), Image.NEAREST).save(f'images/capsules/{key}.png', optimize=True)
    print(key, art.w, 'x', art.h)
