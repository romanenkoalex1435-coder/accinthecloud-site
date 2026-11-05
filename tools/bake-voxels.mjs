/* Запекает знак @ в кубики-«пиксели» для первого экрана (js/znak.js).
   Берёт сетку js/logo-mesh.json, по каждому столбику (x, y) пускает луч вдоль z,
   находит входы и выходы из знака, заполняет между ними и оставляет только наружный слой кубиков.
   Запуск из корня сайта:  node tools/bake-voxels.mjs [кубиков по ширине, по умолчанию 56]
   Результат: js/znak-voxels.json — шаг, угол сетки, размеры и столбики [i, j, k0, длина, ...]. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mesh = JSON.parse(readFileSync(join(here, '../js/logo-mesh.json'), 'utf8'));
const ACROSS = Number(process.argv[2]) || 56;

const P = mesh.position, I = mesh.index;
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) {
  min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]);
}
const step = (max[0] - min[0]) / ACROSS;
const dims = [0, 1, 2].map(k => Math.ceil((max[k] - min[k]) / step - 1e-6));
// сетку центрируем на знаке, чтобы кубики лежали ровно поверх гладкой формы
const origin = [0, 1, 2].map(k => (min[k] + max[k]) / 2 - dims[k] * step / 2);

const tris = [];
for (let t = 0; t < I.length; t += 3) {
  const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
  tris.push([P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]]);
}

// пересечения вертикального (вдоль z) луча через точку (x, y) со всеми треугольниками
function hitsAt(x, y) {
  const zs = [];
  for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of tris) {
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    zs.push(u * az + v * bz + w * cz);
  }
  zs.sort((p, q) => p - q);
  // одно и то же пересечение на общем ребре двух треугольников считаем один раз
  return zs.filter((z, i) => i === 0 || z - zs[i - 1] > 1e-6);
}

const grid = new Uint8Array(dims[0] * dims[1] * dims[2]);
const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) ? 0 : grid[(i * dims[1] + j) * dims[2] + k];
for (let i = 0; i < dims[0]; i++) {
  for (let j = 0; j < dims[1]; j++) {
    // крошечный сдвиг, чтобы луч не шёл точно по ребру
    const x = origin[0] + (i + 0.5) * step + 1.3e-5, y = origin[1] + (j + 0.5) * step + 0.7e-5;
    const zs = hitsAt(x, y);
    if (zs.length < 2) continue;
    for (let p = 0; p + 1 < zs.length; p += 2) {
      // кубик внутри, если его центр между входом и выходом
      const k0 = Math.ceil((zs[p] - origin[2]) / step - 0.5);
      const k1 = Math.floor((zs[p + 1] - origin[2]) / step - 0.5);
      if (k1 < k0) continue;
      for (let k = Math.max(0, k0); k <= Math.min(dims[2] - 1, k1); k++) grid[(i * dims[1] + j) * dims[2] + k] = 1;
    }
  }
}

// оставляем только наружный слой: иначе при обвале сплошная начинка насыпает гору на пол-экрана
const runs = [];
let count = 0;
for (let i = 0; i < dims[0]; i++) for (let j = 0; j < dims[1]; j++) {
  let start = -1;
  for (let k = 0; k <= dims[2]; k++) {
    const shell = k < dims[2] && at(i, j, k) && !(at(i - 1, j, k) && at(i + 1, j, k) && at(i, j - 1, k) && at(i, j + 1, k) && at(i, j, k - 1) && at(i, j, k + 1));
    if (shell && start < 0) start = k;
    if (!shell && start >= 0) { runs.push(i, j, start, k - start); count += k - start; start = -1; }
  }
}

const out = { step: +step.toFixed(6), origin: origin.map(v => +v.toFixed(6)), dims, count, runs };
writeFileSync(join(here, '../js/znak-voxels.json'), JSON.stringify(out));
console.log(`кубиков: ${count}, сетка ${dims.join('×')}, шаг ${step.toFixed(4)}`);
