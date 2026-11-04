/* Запекает гранёный знак в js/logo-mesh.json (сайт грузит готовую сетку).
   Запуск из папки сайта: node tools/bake-mark.mjs  (нужен пакет three: npx -p three) */
import * as THREE from 'three';
import fs from 'fs';

/* Контур логотипа → плавная замкнутая кривая */
function logoLoops(d, samples) {
  return d.loops.map(l => {
    const curve = new THREE.CatmullRomCurve3(l.map(([x, y]) => new THREE.Vector3(x / d.h, y / d.h, 0)), true, 'centripetal');
    const n = Math.max(40, Math.round(samples * l.length / 208));
    const pts = curve.getSpacedPoints(n).slice(0, -1);
    // лёгкое сглаживание убирает «ступеньки» от пикселей исходной картинки
    return pts.map((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      return new THREE.Vector2((a.x + 2 * p.x + b.x) / 4, (a.y + 2 * p.y + b.y) / 4);
    });
  }).sort((a, b) => Math.abs(THREE.ShapeUtils.area(b)) - Math.abs(THREE.ShapeUtils.area(a)));
}

// Повторяемый случайный ряд — сетка граней одна и та же при каждой загрузке
function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

/* Надутый знак: точки сеткой внутри контура → треугольники (Делоне) → высота по расстоянию до края.
   Крупная сетка и плоская заливка дают те же грани, что в прежнем ролике. */
function delaunay(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  P.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const dm = Math.max(x1 - x0, y1 - y0) * 20, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const V = P.concat([[mx - dm, my - dm], [mx, my + dm], [mx + dm, my - dm]]);
  const n = P.length;
  const circ = (a, b, c) => {
    const [ax, ay] = V[a], [bx, by] = V[b], [cx, cy] = V[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return [a, b, c, ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
  };
  let T = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = V[i], edges = new Map(), keep = [];
    for (const t of T) {
      if ((px - t[3]) ** 2 + (py - t[4]) ** 2 < t[5]) {
        for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
          const k = a < b ? a + ',' + b : b + ',' + a;
          edges.set(k, edges.has(k) ? null : [a, b]);
        }
      } else keep.push(t);
    }
    for (const e of edges.values()) if (e) keep.push(circ(e[0], e[1], i));
    T = keep;
  }
  return T.filter(t => t[0] < n && t[1] < n && t[2] < n).map(t => [t[0], t[1], t[2]]);
}

function inflatedMark(loops, step, height, radius) {
  const segs = [];
  loops.forEach(l => l.forEach((p, i) => segs.push([p, l[(i + 1) % l.length]])));
  const inside = (x, y) => {
    let c = false;
    for (const [a, b] of segs) if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c;
    return c;
  };
  const edgeDist = (x, y) => {
    let m = Infinity;
    for (const [a, b] of segs) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      m = Math.min(m, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
    }
    return m;
  };
  // ряды точек вдоль контура (как полосы граней у ролика) и редкая сетка в глубине
  const P = [], z = [];
  const height_at = d => height * Math.sqrt(1 - (1 - Math.min(d / radius, 1)) ** 2);
  const far = (x, y, m) => P.every(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 > m * m);
  const add = (x, y, d) => { P.push([x, y]); z.push(d ? height_at(d) : 0); };
  const ROWS = [0, 0.06, 0.13];
  loops.forEach(l => {
    // точки контура через равный шаг
    // у маленькой дырки в «a» шаг мельче, иначе она становится многоугольником
    const perim = l.reduce((sum, p, i) => sum + p.distanceTo(l[(i + 1) % l.length]), 0);
    const st = Math.min(step, perim / 18);
    const pts = [];
    let acc = st;
    l.forEach((p, i) => {
      const q = l[(i + 1) % l.length];
      if (acc >= st) { pts.push(p); acc = 0; }
      acc += Math.hypot(q.x - p.x, q.y - p.y);
    });
    pts.forEach((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if (!inside(p.x + nx * 0.01, p.y + ny * 0.01)) { nx = -nx; ny = -ny; }
      ROWS.forEach(r => {
        const x = p.x + nx * r, y = p.y + ny * r;
        if (r === 0) return add(x, y, 0);
        if (!inside(x, y) || edgeDist(x, y) < r * 0.8 || !far(x, y, step * 0.45)) return;
        add(x, y, edgeDist(x, y));
      });
      // в узких местах (дуга над «a») ряды не помещаются — ставим точку посередине,
      // иначе грани от края до края выходят плоскими, будто кусок вырезан
      let w = 0.005;
      while (w < 0.3 && inside(p.x + nx * w, p.y + ny * w)) w += 0.005;
      if (w < 0.2) {
        const x = p.x + nx * w / 2, y = p.y + ny * w / 2;
        if (far(x, y, step * 0.4)) add(x, y, edgeDist(x, y));
      }
    });
  });
  const rand = rng(21);
  for (let y = -0.6; y < 0.6; y += step) for (let x = -1.2; x < 1.2; x += step) {
    const px = x + (rand() - 0.5) * step * 0.3, py = y + (rand() - 0.5) * step * 0.3;
    if (!inside(px, py)) continue;
    const d = edgeDist(px, py);
    if (d < ROWS[ROWS.length - 1] + step * 0.5 || !far(px, py, step * 0.6)) continue;
    add(px, py, d);
  }
  // рёбра не должны перескакивать через щели знака; рёбра по самому контуру допустимы
  const tris = delaunay(P).filter(([a, b, c]) => {
    const m = (i, j) => {
      const x = (P[i][0] + P[j][0]) / 2, y = (P[i][1] + P[j][1]) / 2;
      return inside(x, y) || edgeDist(x, y) < step * 0.12;
    };
    return inside((P[a][0] + P[b][0] + P[c][0]) / 3, (P[a][1] + P[b][1] + P[c][1]) / 3) && m(a, b) && m(b, c) && m(c, a);
  });
  const pos = [], idx = [], n = P.length;
  P.forEach(([x, y], i) => pos.push(x, y, z[i]));
  P.forEach(([x, y], i) => pos.push(x, y, -z[i]));
  tris.forEach(([a, b, c]) => {
    const cw = (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]) < 0;
    if (cw) [b, c] = [c, b];
    idx.push(a, b, c, n + a, n + c, n + b);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}


const d = JSON.parse(fs.readFileSync('js/logo-shape.json', 'utf8'));
const geo = inflatedMark(logoLoops(d, 400), 0.1, 0.21, 0.16);
geo.center();
const r = v => Math.round(v * 10000) / 10000;
fs.writeFileSync('js/logo-mesh.json', JSON.stringify({
  position: Array.from(geo.attributes.position.array, r),
  index: Array.from(geo.index.array)
}));
