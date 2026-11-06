/* Пиксели, выпавшие из знака, падают дальше по всей странице и собираются в кучу на подвале.
   Слой — один холст во весь экран поверх страницы, нажатия сквозь него проходят.
   Координаты — страничные (с учётом прокрутки), поэтому дождь и куча едут вместе со страницей.
   Нажатие по куче разбрасывает пиксели вокруг пальца — они гаснут, а те, что лежали выше, осыпаются вниз. */

import { haptic } from './znak-haptics.js?v=1';

const COLORS = ['#2b3142', '#323949', '#3a4254', '#475069'];
const TERMINAL = 2600;          // предельная скорость падения, px/с
const SHRINK = 0.35;            // за столько секунд кубик ужимается до размера пикселя в куче
const POP_LIFE = 0.5;

let cv = null, ctx = null, dpr = 1, vw = 0, vh = 0;
let cell = 8, cols = 0, maxRows = 16, groundY = 0;
let stacks = [];                // по колонке — массив цветов снизу вверх
let fall = [];                  // {x, y, vx, vy, s0, t, c}
let pops = [];                  // {x, y, vx, vy, t, c}
let raf = 0, last = 0, hot = false;
let footer = null;

function setup() {
  footer = document.querySelector('footer');
  if (!footer) return false;
  cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100';
  document.body.appendChild(cv);
  ctx = cv.getContext('2d');
  layout();
  addEventListener('resize', layout);
  new ResizeObserver(() => { measureGround(); kick(); }).observe(document.body);
  addEventListener('scroll', kick, { passive: true });
  document.addEventListener('pointerdown', onPress, true);
  document.addEventListener('pointermove', onHover, { passive: true });
  return true;
}

// земля — верхняя линия подвала; куча растёт только в просвет над ним, чтобы не закрывать блок выше
function measureGround() {
  groundY = footer.getBoundingClientRect().top + scrollY;
  let above = footer.previousElementSibling;
  while (above && above.lastElementChild && above.tagName === 'MAIN') above = above.lastElementChild;
  const gap = above ? groundY - (above.getBoundingClientRect().bottom + scrollY) : 120;
  maxRows = Math.max(3, Math.floor((gap - 6) / cell));
}

function layout() {
  dpr = Math.min(2, devicePixelRatio || 1);
  vw = innerWidth; vh = innerHeight;
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  const nc = vw >= 768 ? 8 : 5;
  const ncols = Math.max(1, Math.floor(document.documentElement.clientWidth / nc));
  // ширина поменялась — раскладываем кучу по новым колонкам, сохраняя место по горизонтали
  if (ncols !== cols || nc !== cell) {
    const old = stacks, oc = cols;
    stacks = Array.from({ length: ncols }, () => []);
    for (let c = 0; c < oc; c++) for (const col of old[c]) land(Math.min(ncols - 1, Math.floor(c * ncols / oc)), col);
    cols = ncols; cell = nc;
  }
  measureGround();
  kick();
}

// кладёт пиксель в колонку; если рядом ниже — скатывается туда, как песок
function land(c, color) {
  for (let step = 0; step < cols; step++) {
    const h = stacks[c].length;
    const l = c > 0 && stacks[c - 1].length < h - 1, r = c < cols - 1 && stacks[c + 1].length < h - 1;
    if (!l && !r) break;
    c = l && r ? (Math.random() < 0.5 ? c - 1 : c + 1) : l ? c - 1 : c + 1;
  }
  if (stacks[c].length >= maxRows) return false;
  stacks[c].push(color);
  return true;
}

function kick() {
  if (!raf && cv) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const W = document.documentElement.clientWidth;
  for (let i = fall.length - 1; i >= 0; i--) {
    const p = fall[i];
    p.t += dt;
    p.vy += (p.g - p.vy * p.g / TERMINAL) * dt;
    p.vx *= Math.exp(-1.5 * dt);
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.3; }
    if (p.x > W - cell) { p.x = W - cell; p.vx = -Math.abs(p.vx) * 0.3; }
    const c = Math.min(cols - 1, Math.max(0, Math.floor((p.x + cell / 2) / cell)));
    if (p.y + cell >= groundY - stacks[c].length * cell) {
      if (!land(c, p.c)) pops.push({ x: p.x, y: p.y, vx: 0, vy: -60, t: 0, c: p.c });
      fall[i] = fall[fall.length - 1]; fall.pop();
    }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt; p.vy += 1800 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > POP_LIFE) { pops[i] = pops[pops.length - 1]; pops.pop(); }
  }
  draw();
  if (fall.length || pops.length) raf = requestAnimationFrame(frame);
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  const sy = scrollY, sx = scrollX;
  // куча — только когда подвал рядом с экраном
  const top = groundY - maxRows * cell - sy;
  if (top < vh && groundY - sy > 0) {
    for (let k = 0; k < COLORS.length; k++) {
      ctx.fillStyle = COLORS[k];
      for (let c = 0; c < cols; c++) {
        const s = stacks[c];
        for (let r = 0; r < s.length; r++) if (s[r] === k) ctx.fillRect(c * cell - sx, groundY - (r + 1) * cell - sy, cell, cell);
      }
    }
  }
  for (const p of fall) {
    const y = p.y - sy;
    if (y < -60 || y > vh) continue;
    const s = p.t < SHRINK ? p.s0 + (cell - p.s0) * (p.t / SHRINK) : cell;
    ctx.fillStyle = COLORS[p.c];
    ctx.fillRect(p.x - sx + (cell - s) / 2, y + (cell - s) / 2, s, s);
  }
  for (const p of pops) {
    const k = 1 - p.t / POP_LIFE, s = cell * (0.4 + 0.6 * k);
    ctx.globalAlpha = k;
    ctx.fillStyle = COLORS[p.c];
    ctx.fillRect(p.x - sx + (cell - s) / 2, p.y - sy + (cell - s) / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

// где по странице лежит куча под точкой (x, y)
function pileAt(x, y) {
  const c = Math.floor(x / cell);
  if (c < 0 || c >= cols) return false;
  const pad = cell * 3;
  let h = 0;
  for (let d = -3; d <= 3; d++) h = Math.max(h, stacks[c + d] ? stacks[c + d].length : 0);
  return h > 0 && y <= groundY + 4 && y >= groundY - h * cell - pad;
}

function onHover(e) {
  if (e.pointerType !== 'mouse' || !cv) return;
  const on = pileAt(e.clientX + scrollX, e.clientY + scrollY) && !e.target.closest('a,button,input,textarea,select,label');
  if (on !== hot) { hot = on; document.documentElement.style.cursor = on ? 'pointer' : ''; }
}

function onPress(e) {
  if (!cv || e.button > 0 || e.target.closest('a,button,input,textarea,select,label')) return;
  const x = e.clientX + scrollX, y = e.clientY + scrollY;
  if (!pileAt(x, y)) return;
  const R = vw >= 768 ? 72 : 52;
  let gone = 0;
  const c0 = Math.max(0, Math.floor((x - R) / cell)), c1 = Math.min(cols - 1, Math.floor((x + R) / cell));
  for (let c = c0; c <= c1; c++) {
    const s = stacks[c], cx = c * cell + cell / 2, keep = [];
    let cut = false;
    for (let r = 0; r < s.length; r++) {
      const cy = groundY - (r + 0.5) * cell;
      const dx = cx - x, dy = cy - y;
      if (dx * dx + dy * dy < R * R) {
        const a = Math.atan2(dy, dx), v = 250 + Math.random() * 450;
        pops.push({ x: c * cell, y: cy - cell / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 500, t: Math.random() * 0.15, c: s[r] });
        cut = true; gone++;
      } else if (cut) {
        // всё, что лежало над выбитым местом, осыпается вниз
        fall.push({ x: c * cell, y: cy - cell / 2, vx: 0, vy: 0, g: 2400, s0: cell, t: SHRINK, c: s[r] });
      } else keep.push(s[r]);
    }
    stacks[c] = keep;
  }
  if (gone) {
    haptic.kick();
    kick();
  }
}

/* x, y — точка на экране (px), vx, vy — скорость в px/с, g — ускорение падения, size — сторона кубика на экране */
export function drop(x, y, vx, vy, g, size) {
  if (!cv && !setup()) return;
  if (fall.length > 6000) return;
  fall.push({ x: x + scrollX - cell / 2, y: y + scrollY - cell / 2, vx, vy, g: Math.min(g, 6000), s0: size, t: 0, c: (Math.random() * COLORS.length) | 0 });
  kick();
}
