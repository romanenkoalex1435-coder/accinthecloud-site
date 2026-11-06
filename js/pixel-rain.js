/* Пиксели, выпавшие из знака, падают дальше по всей странице до самого низа и ссыпаются там горкой.
   Это те же объёмные кубики, что и в знаке: тот же материал и свет, кувыркаются в полёте.
   Слой — один WebGL-холст во весь экран поверх страницы, нажатия сквозь него проходят.
   Мир сцены = страница: 1 единица = 1 px, x — вправо, y — вверх (минус координата на странице), z — к зрителю;
   камера смотрит прямо и едет вместе с прокруткой, поэтому кубик при z = 0 стоит ровно в своей точке страницы;
   глаз поднят над верхним краем экрана (сдвиг кадра), поэтому все кубики показывают верхнюю грань.
   С первым пикселем подвал вытягивается вниз — под ссылками появляется место для кучи.
   Нажатие по куче разбрасывает кубики вокруг пальца, а те, что лежали выше, осыпаются вниз. */
import * as THREE from '/js/three.module.min.js';
import { haptic } from './znak-haptics.js?v=1';

const TERMINAL = 2600;          // предельная скорость падения, px/с
const SHRINK = 0.35;            // за столько секунд кубик ужимается до размера кубика в куче
const POP_LIFE = 0.55;
const MAX_PILE = 5200, MAX_FLY = 6000;
const EYE = 0.3;                // глаз выше верхнего края экрана на столько высот экрана
const DIST = 1.6;               // и отстоит от страницы на столько высот экрана

let renderer, scene, camera, pileMesh, flyMesh, PA, FA;
let vw = 0, vh = 0, cell = 10, depth = 4, cols = 0, maxRows = 22, groundY = 0;
let grid = new Int16Array(0);   // высота кучи в каждой клетке [колонка * depth + ряд вглубь]
let pile = [];                  // лежащие кубики: {c, k, r}
let pileDirty = false;
let fly = [];                   // летящие и разлетающиеся: {x, y, z, vx, vy, vz, g, s0, t, q, w, pop}
let raf = 0, last = 0, hot = false, reserved = false;
let footer = null;
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();

function setup() {
  footer = document.querySelector('footer');
  if (!footer) return false;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100';
  document.body.appendChild(cv);
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 10, 40000);
  // свет — как у знака на первом экране
  scene.add(new THREE.HemisphereLight(0xe4eaf4, 0x262b36, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-0.3, 7, -0.45);
  const fill = new THREE.DirectionalLight(0xc8d2e6, 0.9);
  fill.position.set(3, 0.5, 2);
  scene.add(key, fill);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x4b5262, roughness: 0.7, metalness: 0, flatShading: true });
  pileMesh = new THREE.InstancedMesh(box, mat, MAX_PILE);
  flyMesh = new THREE.InstancedMesh(box, mat, MAX_FLY);
  pileMesh.count = flyMesh.count = 0;
  // у каждого кубика чуть свой оттенок — в куче видно отдельные пиксели, как в знаке
  const C = new THREE.Color();
  for (let i = 0; i < MAX_PILE; i++) pileMesh.setColorAt(i, C.setScalar(0.82 + 0.3 * Math.random()));
  for (let i = 0; i < MAX_FLY; i++) flyMesh.setColorAt(i, C.setScalar(0.82 + 0.3 * Math.random()));
  pileMesh.frustumCulled = flyMesh.frustumCulled = false;
  flyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  PA = pileMesh.instanceMatrix.array; FA = flyMesh.instanceMatrix.array;
  scene.add(pileMesh, flyMesh);
  layout();
  addEventListener('resize', layout);
  new ResizeObserver(() => { measureGround(); kick(); }).observe(document.body);
  addEventListener('scroll', kick, { passive: true });
  document.addEventListener('pointerdown', onPress, true);
  document.addEventListener('pointermove', onHover, { passive: true });
  return true;
}

// земля — самый низ страницы; куча растёт вверх в место, добавленное под ссылками подвала
function reserve() {
  if (reserved) return;
  reserved = true;
  const base = parseFloat(getComputedStyle(footer).paddingBottom) || 0;
  footer.style.setProperty('padding-bottom', base + maxRows * cell + 'px', 'important');
  measureGround();
}
function measureGround() {
  const g = footer.getBoundingClientRect().bottom + scrollY;
  if (g !== groundY) { groundY = g; pileDirty = true; }
}

function layout() {
  vw = innerWidth; vh = innerHeight;
  renderer.setSize(vw, vh, false);
  // полный кадр симметричен вокруг глаза, экран — его нижняя часть: масштаб на странице 1:1, а смотрим сверху
  const half = (1 + EYE) * vh, d = DIST * vh;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(half / d));
  camera.aspect = vw / (2 * half);
  camera.setViewOffset(vw, 2 * half, 0, half + EYE * vh, vw, vh);
  camera.updateProjectionMatrix();
  const nc = vw >= 768 ? 10 : 6, nd = vw >= 768 ? 4 : 3;
  if (!reserved) maxRows = vw >= 768 ? 22 : 36;
  const ncols = Math.max(1, Math.floor(document.documentElement.clientWidth / nc));
  // ширина поменялась — раскладываем кучу по новым колонкам, сохраняя место по горизонтали
  if (ncols !== cols || nc !== cell || nd !== depth) {
    const old = pile, oc = cols || 1;
    cols = ncols; cell = nc; depth = nd;
    grid = new Int16Array(cols * depth); pile = [];
    for (const b of old) land(Math.min(cols - 1, Math.floor(b.c * cols / oc)), Math.min(depth - 1, b.k));
  }
  measureGround();
  pileDirty = true;
  kick();
}

const hAt = (c, k) => (c < 0 || c >= cols || k < 0 || k >= depth) ? 1e9 : grid[c * depth + k];
// кладёт кубик в клетку; пока рядом есть клетка ниже — скатывается туда, как песок, и выходит горка
function land(c, k) {
  for (let step = 0; step < 300; step++) {
    const h = hAt(c, k);
    let bc = c, bk = k, best = h;
    for (const [dc, dk] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = hAt(c + dc, k + dk);
      // на крутом склоне скатывается всегда, на пологом — не всегда: края горки выходят неровными
      if ((n < h - 1 || (n < h && Math.random() < 0.6)) && (n < best || (n === best && Math.random() < 0.5))) { best = n; bc = c + dc; bk = k + dk; }
    }
    if (bc === c && bk === k) break;
    c = bc; k = bk;
  }
  const r = grid[c * depth + k];
  if (r >= maxRows || pile.length >= MAX_PILE) return false;
  grid[c * depth + k] = r + 1;
  pile.push({ c, k, r });
  pileDirty = true;
  return true;
}

const zOf = k => (k - (depth - 1) / 2) * cell;
const cellCenter = (c, k, r) => [c * cell + cell / 2, groundY - (r + 0.5) * cell, zOf(k)];

function rebuildPile() {
  pileDirty = false;
  const n = pile.length;
  for (let i = 0; i < n; i++) {
    const b = pile[i], [x, y, z] = cellCenter(b.c, b.k, b.r), o = i * 16;
    PA.fill(0, o, o + 16);
    PA[o] = PA[o + 5] = PA[o + 10] = cell; PA[o + 15] = 1;
    PA[o + 12] = x; PA[o + 13] = -y; PA[o + 14] = z;
  }
  pileMesh.count = n;
  pileMesh.instanceMatrix.needsUpdate = true;
}

function kick() {
  if (!raf && renderer) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const W = document.documentElement.clientWidth;
  let n = 0;
  for (let i = 0; i < fly.length; i++) {
    const p = fly[i];
    p.t += dt;
    if (p.pop) {
      p.vy += 1800 * dt;
      if (p.t > POP_LIFE) continue;
    } else {
      p.vy += (p.g - p.vy * p.g / TERMINAL) * dt;
      p.vx *= Math.exp(-1.5 * dt);
      if (p.x < cell / 2) { p.x = cell / 2; p.vx = Math.abs(p.vx) * 0.3; }
      if (p.x > W - cell / 2) { p.x = W - cell / 2; p.vx = -Math.abs(p.vx) * 0.3; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    // кувырок: q += ½·ω·q·dt
    const q = p.q, w = p.w, x = q[0], y = q[1], z = q[2], ww = q[3], hh = 0.5 * dt;
    q[0] = x + hh * (w[0] * ww + w[1] * z - w[2] * y);
    q[1] = y + hh * (w[1] * ww + w[2] * x - w[0] * z);
    q[2] = z + hh * (w[2] * ww + w[0] * y - w[1] * x);
    q[3] = ww - hh * (w[0] * x + w[1] * y + w[2] * z);
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
    if (!p.pop) {
      const c = Math.min(cols - 1, Math.max(0, Math.floor(p.x / cell)));
      const k = Math.min(depth - 1, Math.max(0, Math.round(p.z / cell + (depth - 1) / 2)));
      if (p.y + cell / 2 >= groundY - grid[c * depth + k] * cell) {
        if (!land(c, k)) fly[n++] = Object.assign(p, { pop: true, t: 0, vy: -200, vx: 0 });
        continue;
      }
    }
    fly[n++] = p;
  }
  fly.length = n;
  draw();
  if (fly.length) raf = requestAnimationFrame(frame);
}

function draw() {
  if (pileDirty) rebuildPile();
  const sy = scrollY, sx = scrollX;
  let m = 0;
  for (const p of fly) {
    let s;
    if (p.pop) s = cell * Math.max(0, 1 - p.t / POP_LIFE);
    else s = p.t < SHRINK ? p.s0 + (cell - p.s0) * (p.t / SHRINK) : cell;
    if (s <= 0 || p.y < sy - 200 || p.y > sy + vh + 200) continue;
    Q.set(p.q[0], p.q[1], p.q[2], p.q[3]);
    M.compose(P.set(p.x, -p.y, p.z), Q, S.set(s, s, s));
    M.toArray(FA, m * 16);
    if (++m >= MAX_FLY) break;
  }
  flyMesh.count = m;
  flyMesh.instanceMatrix.needsUpdate = true;
  camera.position.set(sx + vw / 2, -sy + EYE * vh, DIST * vh);
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
}

function colTop(c) {
  let h = 0;
  for (let k = 0; k < depth; k++) h = Math.max(h, grid[c * depth + k]);
  return h;
}
// лежит ли куча под точкой страницы (x, y)
function pileAt(x, y) {
  const c = Math.floor(x / cell);
  if (c < 0 || c >= cols || !pile.length) return false;
  let h = 0;
  for (let d = -3; d <= 3; d++) if (c + d >= 0 && c + d < cols) h = Math.max(h, colTop(c + d));
  return h > 0 && y <= groundY + 4 && y >= groundY - h * cell - cell * 3;
}

function onHover(e) {
  if (e.pointerType !== 'mouse' || !renderer) return;
  const on = pileAt(e.clientX + scrollX, e.clientY + scrollY) && !e.target.closest('a,button,input,textarea,select,label');
  if (on !== hot) { hot = on; document.documentElement.style.cursor = on ? 'pointer' : ''; }
}

const spin = a => [(Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a];

function onPress(e) {
  if (!renderer || e.button > 0 || e.target.closest('a,button,input,textarea,select,label')) return;
  const x = e.clientX + scrollX, y = e.clientY + scrollY;
  if (!pileAt(x, y)) return;
  const R = vw >= 768 ? 72 : 52;
  const keep = [];
  let gone = 0;
  // что попало в круг — разлетается; что лежало над выбитым в той же клетке — осыпается заново
  const cut = new Int16Array(cols * depth).fill(32767);
  for (const b of pile) {
    const [cx, cy] = cellCenter(b.c, b.k, b.r), dx = cx - x, dy = cy - y;
    if (dx * dx + dy * dy < R * R) {
      const a = Math.atan2(dy, dx), v = 250 + Math.random() * 450;
      fly.push({ x: cx, y: cy, z: zOf(b.k), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 500, vz: (Math.random() - 0.5) * 300,
        g: 0, s0: cell, t: Math.random() * 0.15, q: [0, 0, 0, 1], w: spin(16), pop: true });
      const i = b.c * depth + b.k;
      cut[i] = Math.min(cut[i], b.r); gone++;
    } else keep.push(b);
  }
  if (!gone) return;
  pile = [];
  grid.fill(0);
  keep.sort((a, b) => a.r - b.r);
  for (const b of keep) {
    if (b.r > cut[b.c * depth + b.k]) {
      const [cx, cy] = cellCenter(b.c, b.k, b.r);
      fly.push({ x: cx, y: cy, z: zOf(b.k), vx: 0, vy: 0, vz: 0, g: 2400, s0: cell, t: SHRINK, q: [0, 0, 0, 1], w: spin(3), pop: false });
    } else {
      b.r = grid[b.c * depth + b.k]++;
      pile.push(b);
    }
  }
  pileDirty = true;
  haptic.kick();
  kick();
}

/* x, y — точка на экране (px), vx, vy — скорость в px/с, g — ускорение падения, size — сторона кубика на экране */
export function drop(x, y, vx, vy, g, size) {
  if (!renderer && !setup()) return;
  if (fly.length >= MAX_FLY) return;
  reserve();
  fly.push({ x: x + scrollX, y: y + scrollY, z: 0, vx, vy, vz: (Math.random() - 0.5) * cell * 2 * depth,
    g: Math.min(g, 6000), s0: size, t: 0, q: [0, 0, 0, 1], w: spin(10), pop: false });
  kick();
}

// для проверки: сколько лежит и летит
export const stats = () => ({ pile: pile.length, fly: fly.length, cols, depth, maxRows, cell, top: Math.max(0, ...grid) });
