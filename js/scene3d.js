/* 3D-знак @ на первом экране.
   Знак собран из настоящего контура логотипа (сетка в js/logo-mesh.json), поэтому
   остаётся чётким на любом экране. Без WebGL остаются картинки-заглушки. */
import * as THREE from './three.module.min.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?v= менять при перепечке: файлы js/ браузер хранит неделю
const meshData = fetch('js/logo-mesh.json?v=2').then(r => r.json());
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
// отдаём поток браузеру между тяжёлыми шагами, чтобы страница не подвисала
const breathe = () => new Promise(r => setTimeout(r, 0));

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  return r;
}

// Рисуем, только пока блок на экране и вкладка открыта
function runWhileVisible(el, frame) {
  let visible = false, raf = 0, last = 0;
  const tick = now => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    frame(dt, now / 1000);
  };
  const sync = () => {
    cancelAnimationFrame(raf);
    if (visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); }
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { rootMargin: '80px' }).observe(el);
  document.addEventListener('visibilitychange', sync);
}

// Горизонтальное перетаскивание крутит предмет; вертикальная прокрутка страницы не мешает
function dragSpin(el, onDelta, onEnd) {
  let id = null, x = 0, lastT = 0, v = 0;
  el.addEventListener('pointerdown', e => { id = e.pointerId; x = e.clientX; lastT = performance.now(); v = 0; });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const now = performance.now(), dx = e.clientX - x;
    x = e.clientX;
    v = dx / Math.max(now - lastT, 8);
    lastT = now;
    onDelta(dx);
  });
  const up = e => { if (e.pointerId !== id) return; id = null; onEnd(v); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/* ─────────── Знак @ на первом экране ───────────
   Повторяет прежний ролик: надутый знак с крупными плоскими гранями, сланцевый цвет,
   полный оборот за 9,4 с, сине-серая тень на полу. Отличие — вектор, края чёткие. */
const MARK_TURN = Math.PI * 2 / 9.375;
async function initMark() {
  const host = document.getElementById('hero3d');
  if (!host) return;
  const canvas = host.querySelector('canvas');
  const renderer = makeRenderer(canvas);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0xe4eaf4, 0x262b36, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-0.3, 7, -0.45);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 14;
  key.shadow.blurSamples = 20;
  key.shadow.bias = -0.002;
  Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 0.5, far: 10 });
  const fill = new THREE.DirectionalLight(0xc8d2e6, 0.9);
  fill.position.set(3, 0.5, 2);
  scene.add(key, fill);

  // сетка запечена заранее (tools/bake-mark.mjs), здесь только собираем буфер
  const m = await meshData;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(m.position, 3));
  geo.setIndex(m.index);
  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());

  const mat = new THREE.MeshStandardMaterial({ color: 0x4b5262, roughness: 0.7, metalness: 0, flatShading: true });
  const mark = new THREE.Mesh(geo, mat);
  mark.castShadow = true;
  const pivot = new THREE.Group();
  pivot.add(mark);
  // внешняя группа наклоняет знак к курсору или по наклону телефона
  const tilt = new THREE.Group();
  tilt.add(pivot);
  scene.add(tilt);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: 0x34426a, opacity: 0.34 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -size.y / 2 - 0.01;
  floor.receiveShadow = true;
  scene.add(floor);

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // размер как у прежнего ролика: на телефоне знак выходит за края, на компьютере — по высоте
    const px = Math.min(1.35 * w, (w > h && h < 500 ? 0.96 : 1.31) * h);
    const visH = h * size.x / px;
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // камера чуть сверху, как в ролике
    camera.position.set(0, dist * Math.sin(0.07), dist * Math.cos(0.07));
    camera.lookAt(0, 0, 0);
    // знак поднят над серединой, чтобы под ним поместилась надпись (расчёт в index.html)
    const lift = window.accHeroLayout ? window.accHeroLayout() : 0;
    camera.setViewOffset(w, h, 0, lift, w, h);
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(host);

  // вращение как в ролике; пальцем можно докрутить
  let angle = 0, spinV = 0, dragging = false;
  dragSpin(host, dx => { dragging = true; angle += dx * 0.008; }, v => { dragging = false; spinV = v * 8; });

  // знак чуть поворачивается за курсором; на телефоне — за наклоном телефона
  const look = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    addEventListener('pointermove', e => {
      aim.x = (e.clientX / innerWidth - 0.5) * 2;
      aim.y = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { aim.x = aim.y = 0; });
  } else if (window.DeviceOrientationEvent) {
    // ноль — то, как человек держит телефон; он медленно подстраивается под новое положение
    let base = null;
    const onTilt = e => {
      if (e.beta == null || e.gamma == null) return;
      if (!base) base = { b: e.beta, g: e.gamma };
      base.b += (e.beta - base.b) * 0.01;
      base.g += (e.gamma - base.g) * 0.01;
      aim.x = Math.max(-1, Math.min(1, (e.gamma - base.g) / 20));
      aim.y = Math.max(-1, Math.min(1, (e.beta - base.b) / 20));
    };
    const listen = () => addEventListener('deviceorientation', onTilt);
    // iPhone спрашивает разрешение — только после касания знака, а не сразу при входе
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      host.addEventListener('touchend', () => {
        DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') listen(); }).catch(() => {});
      }, { once: true });
    } else listen();
  }

  function frame(dt) {
    if (!dragging) {
      spinV = damp(spinV, 0, 2.2, dt);
      angle += (REDUCE ? 0 : MARK_TURN + spinV) * dt;
    }
    pivot.rotation.y = angle;
    look.x = damp(look.x, aim.x, 4, dt);
    look.y = damp(look.y, aim.y, 4, dt);
    tilt.rotation.y = look.x * 0.35;
    tilt.rotation.x = look.y * 0.16;
    renderer.render(scene, camera);
  }

  await breathe();
  const still = () => frame(0);
  still();
  host.classList.add('is-ready');
  if (REDUCE) { new ResizeObserver(still).observe(host); return; }
  runWhileVisible(host, frame);
}

function safe(fn) {
  fn().catch(err => console.warn('3D отключено:', err));
}
// Сборка 3D занимает процессор — ждём, пока страница загрузится и отрисуется
const idle = cb => (window.requestIdleCallback ? requestIdleCallback(cb, { timeout: 1200 }) : setTimeout(cb, 200));
const afterLoad = cb => (document.readyState === 'complete' ? idle(cb) : addEventListener('load', () => idle(cb), { once: true }));
// модуль подгружается страницей уже после вступительной анимации первого экрана
afterLoad(() => safe(initMark));
