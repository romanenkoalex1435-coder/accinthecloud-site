"""Пиксельные рисунки вещей для карточек капсул на главной: images/capsules/a1|a2|a3.svg.
   Рисунок задан левой половиной (зеркалится), фактура (камуфляж, деним) добавляется шумом.
   Запуск из папки сайта: python3 tools/pixel-capsules.py"""
import random

INK = '#0d0d0d'

def mirror(rows):
    return [r + r[::-1] for r in rows]

BAG = mirror([
    ".......#####",
    ".....###....",
    "....##......",
    "...##.......",
    "...##.......",
    "..##........",
    "..##........",
    "..##........",
    ".###########",
    ".#aaaaaaaaaa",
    ".#bbbbbbbbbb",
    ".#bbbbbbbbbb",
    ".#aaaaaaaaa#",
    ".#aaaaaaaaa#",
    ".#aaaaaaaaaa",
    ".#aaaaaaaaaa",
    ".#a######aaa",
    ".#a#bbbb#aaa",
    ".#a#bbbb#aaa",
    ".#a#bbbb#aaa",
    ".#a######aaa",
    ".#aaaaaaaaaa",
    ".#aaaaaaaaaa",
    "..##########",
])

JACKET = mirror([
    "........#######",
    ".......#cccc#..",
    "......#a#ccc#..",
    ".....#aaa#cc#..",
    "...##aaaaa#c#..",
    "..#aaaaaaaa##.#",
    ".#aaaaaaaaaaa##",
    ".#aa#aaaaaaaaa#",
    "#aaa#a#####aaa#",
    "#aaa#a#bbb#aaa#",
    "#aaa#a#####aaa#",
    "#aaa#aaaaaaaaa#",
    "#aaa#aaaaaaaaa#",
    "#aaa#aaaaaaaaa#",
    "#aaa#aaaaaaaaa#",
    "#aaa#aaaaaaaaa#",
    "#aaa#a######aa#",
    "#aaa#a#bbbb#aa#",
    "#aaa#a#bbbb#aa#",
    "#ccc#a######aa#",
    "#ccc#aaaaaaaaa#",
    "#####cccccccccc",
    "....###########",
])

PANTS = mirror([
    "############",
    "#cc#cccccc#c",
    "############",
    "#aaaaaaaaa#a",
    "#a######aa#a",
    "#a#bbbb#aa#a",
    "#a######aa#a",
    "#aaaaaaaaa#a",
    "#aaaaaaaaaa#",
    "#aaaaaaaaaa#",
    "#aaaaaaaaa#.",
    "#aaaaaaaaa#.",
    "#aaaaaaaa#..",
    "#aaaaaaaa#..",
    "#aaaaaaaa#..",
    "#aaaaaaaa#..",
    "#aaaaaaaa#..",
    "#aaaaaaaa#..",
    "#aa####aa#..",
    "#aaaaaaaa#..",
    ".#aaaaaaa#..",
    ".#aaaaaaa#..",
    ".#aaaaaaa#..",
    ".#aaaaaaa#..",
    ".#aaaaaaa#..",
    ".#aaaaaaa#..",
    ".#ccccccc#..",
    ".#########..",
])

def texture(rows, pal, kind, seed):
    rnd = random.Random(seed)
    h, w = len(rows), len(rows[0])
    grid = [list(r) for r in rows]
    if kind == 'camo':
        # пятна: несколько центров, клетка берёт цвет ближайшего
        spots = [(rnd.uniform(0, w), rnd.uniform(0, h), rnd.choice('bcd')) for _ in range(16)]
        for y in range(h):
            for x in range(w):
                if grid[y][x] != 'a': continue
                sx, sy, col = min(spots, key=lambda s: (s[0]-x)**2 + ((s[1]-y)*1.3)**2)
                if (sx-x)**2 + ((sy-y)*1.3)**2 < 5.5: grid[y][x] = col
    elif kind == 'denim':
        for y in range(h):
            for x in range(w):
                if grid[y][x] == 'a' and (x + y) % 5 == 0: grid[y][x] = 'd'
    return grid

def svg(grid, pal, cell=10):
    h, w = len(grid), len(grid[0])
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w*cell} {h*cell}" shape-rendering="crispEdges">']
    for y, row in enumerate(grid):
        x = 0
        while x < w:
            ch = row[x]
            if ch == '.': x += 1; continue
            x0 = x
            while x < w and row[x] == ch: x += 1
            out.append(f'<rect x="{x0*cell}" y="{y*cell}" width="{(x-x0)*cell}" height="{cell}" fill="{INK if ch == "#" else pal[ch]}"/>')
    out.append('</svg>')
    return ''.join(out)

ITEMS = {
    'a1': (BAG, {'a': '#6f7752', 'b': '#4d5437', 'c': '#8e9568', 'd': '#3b3f2c'}, 'camo'),
    'a2': (JACKET, {'a': '#3a3a3a', 'b': '#242424', 'c': '#8a8a8a', 'd': '#2e2e2e'}, None),
    'a3': (PANTS, {'a': '#3f5878', 'b': '#2d4059', 'c': '#7d93ad', 'd': '#4c6890'}, 'denim'),
}
for k, (rows, pal, kind) in ITEMS.items():
    assert len({len(r) for r in rows}) == 1, k
    open(f'images/capsules/{k}.svg', 'w').write(svg(texture(rows, pal, kind, 7), pal))
    print(k, len(rows[0]), 'x', len(rows))
