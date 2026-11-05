/* Знак @ на первом экране — из пикселей.
   Тот же @, что был в js/scene3d.js: запечённая сетка, сланцевый цвет, тень на полу,
   постоянный оборот, наклон за курсором, вращение пальцем. Сверху добавлено:
   — нажатие выбивает из знака кубики-«пиксели» там, куда попал палец; они падают на пол,
     подпрыгивают и складываются в горку;
   — чем чаще бьёшь, тем крупнее куски; на 7-м ударе знак рушится целиком;
   — через паузу всё «бам» — пиксели влетают обратно на свои места.
   Знак пиксельный всегда: гладкая сетка задаёт только размер и служит основой для запекания.
   Кубики запечены заранее: node tools/bake-voxels.mjs → js/znak-voxels.json. */
import * as THREE from '/js/three.module.min.js';
import { haptic } from './znak-haptics.js?v=1';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const meshData = fetch('/js/logo-mesh.json?v=2').then(r => r.json());
const voxData = fetch('/js/znak-voxels.json?v=1').then(r => r.json());
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MARK_TURN = Math.PI * 2 / 9.375;

// Удары и физика
const HIT_RADII = [1.05, 1.5, 2.1, 2.9, 3.8, 4.8]; // радиус выбоины в кубиках: 1-й удар, 2-й, ...
const COLLAPSE_AT = 7;          // на этом ударе знак рушится целиком
const HIT_WINDOW = 3.5;         // удары чаще этого (с) считаются серией
const PARTIAL_WAIT = 4;         // после мелкой выбоины пиксели возвращаются через столько секунд тишины
const FULL_WAIT = 1.2;          // после полного обрушения — через столько после того, как всё легло
const GRAVITY = 14;
const BOUNCE = 0.32, FRICTION = 0.55;
const BACK_K = 240, BACK_C = 2 * 0.5 * Math.sqrt(240); // пружина возврата: резкая, с перелётом

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NoToneMapping;
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

async function initMark() {
  const host = document.getElementById('hero3d');
  const hint = document.getElementById('hint');
  const canvas = host.querySelector('canvas');
  const renderer = makeRenderer(canvas);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);

  // свет и тень — один в один с первым экраном
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

  const [m, V] = await Promise.all([meshData, voxData]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(m.position, 3));
  geo.setIndex(m.index);
  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());

  const mat = new THREE.MeshStandardMaterial({ color: 0x4b5262, roughness: 0.7, metalness: 0, flatShading: true });
  const mark = new THREE.Mesh(geo, mat);
  mark.castShadow = true;

  // слои: наклон за курсором → свободный поворот пальцем → обычный оборот вокруг оси
  const pivot = new THREE.Group();
  pivot.add(mark);
  const free = new THREE.Group();
  free.add(pivot);
  const tilt = new THREE.Group();
  tilt.add(free);
  scene.add(tilt);

  const floorY = -size.y / 2 - 0.01;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: 0x34426a, opacity: 0.34 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ─────────── Пиксели ───────────
   Два набора одинаковых кубиков. fixed живёт внутри знака и крутится вместе с ним;
   выбитый кубик там «гасится» (нулевая матрица) и переходит в loose — в мировые координаты,
   где его двигает физика. Возвращаясь на место, он снова переходит в fixed. */
  const N = V.count, ST = V.step, HALF = ST / 2;
  const [NX, NY, NZ] = V.dims, O = V.origin;
  const home = new Float32Array(N * 3), ijk = new Int16Array(N * 3);
  const occ = new Int32Array(NX * NY * NZ).fill(-1);
  {
    let id = 0;
    const R = V.runs;
    for (let r = 0; r < R.length; r += 4) {
      const i = R[r], j = R[r + 1];
      for (let k = R[r + 2]; k < R[r + 2] + R[r + 3]; k++, id++) {
        home.set([O[0] + (i + 0.5) * ST, O[1] + (j + 0.5) * ST, O[2] + (k + 0.5) * ST], id * 3);
        ijk.set([i, j, k], id * 3);
        occ[(i * NY + j) * NZ + k] = id;
      }
    }
  }
  const cube = new THREE.BoxGeometry(ST, ST, ST);
  const vmat = new THREE.MeshStandardMaterial({ color: 0x4b5262, roughness: 0.7, metalness: 0, flatShading: true });
  const fixed = new THREE.InstancedMesh(cube, vmat, N);
  fixed.castShadow = true;
  fixed.frustumCulled = false;
  const FA = fixed.instanceMatrix.array;
  const placeFixed = id => {
    const o = id * 16;
    FA.fill(0, o, o + 16);
    FA[o] = FA[o + 5] = FA[o + 10] = FA[o + 15] = 1;
    FA[o + 12] = home[id * 3]; FA[o + 13] = home[id * 3 + 1]; FA[o + 14] = home[id * 3 + 2];
  };
  for (let id = 0; id < N; id++) placeFixed(id);
  pivot.add(fixed);

  const loose = new THREE.InstancedMesh(cube, vmat, N);
  loose.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  loose.castShadow = true;
  loose.frustumCulled = false;
  loose.count = 0;
  scene.add(loose);
  const LA = loose.instanceMatrix.array;

  // состояние каждого кубика
  const ATTACHED = 0, FALLING = 1, SETTLING = 2, RESTING = 3, RETURNING = 4;
  const mode = new Uint8Array(N);                 // 0 — на месте в знаке
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const rot = new Float32Array(N * 4), spinW = new Float32Array(N * 3);
  const tgt = new Float32Array(N * 3), tgtQ = new Float32Array(N * 4);
  const delay = new Float32Array(N), age = new Float32Array(N);
  const bounces = new Uint8Array(N), restCell = new Int32Array(N), restLevel = new Int16Array(N);
  const slotOf = new Int32Array(N).fill(-1), slotId = new Int32Array(N);
  let looseCount = 0, attachedCount = N;

  // пол — сетка высот: каждый лёгший кубик поднимает свою клетку, поэтому они складываются в горку
  const FX0 = -2.6, FZ0 = -2.2, FW = Math.ceil(5.2 / ST), FD = Math.ceil(4 / ST);
  const height = new Int16Array(FW * FD);

  function writeLoose(id) {
    const o = slotOf[id] * 16, p = id * 3, q = id * 4;
    const x = rot[q], y = rot[q + 1], z = rot[q + 2], w = rot[q + 3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    LA[o] = 1 - (yy + zz); LA[o + 1] = xy + wz; LA[o + 2] = xz - wy; LA[o + 3] = 0;
    LA[o + 4] = xy - wz; LA[o + 5] = 1 - (xx + zz); LA[o + 6] = yz + wx; LA[o + 7] = 0;
    LA[o + 8] = xz + wy; LA[o + 9] = yz - wx; LA[o + 10] = 1 - (xx + yy); LA[o + 11] = 0;
    LA[o + 12] = pos[p]; LA[o + 13] = pos[p + 1]; LA[o + 14] = pos[p + 2]; LA[o + 15] = 1;
  }
  function addLoose(id) { slotOf[id] = looseCount; slotId[looseCount++] = id; }
  function removeLoose(id) {
    const s = slotOf[id], last = slotId[--looseCount];
    if (last !== id) { slotId[s] = last; slotOf[last] = s; LA.copyWithin(s * 16, looseCount * 16, looseCount * 16 + 16); }
    slotOf[id] = -1;
  }

  const pivotQ = new THREE.Quaternion();
  let PE = pivot.matrixWorld.elements;
  // где сейчас в мире место кубика внутри знака
  function homeWorld(id, out, o) {
    const x = home[id * 3], y = home[id * 3 + 1], z = home[id * 3 + 2];
    out[o] = PE[0] * x + PE[4] * y + PE[8] * z + PE[12];
    out[o + 1] = PE[1] * x + PE[5] * y + PE[9] * z + PE[13];
    out[o + 2] = PE[2] * x + PE[6] * y + PE[10] * z + PE[14];
  }

  // voxelMode — знак сейчас разбит (что-то выпало или летит); целый пиксельный знак — обычное состояние
  let voxelMode = false, fixedDirty = false, looseDirty = false;
  let bamPending = false;
  mark.visible = false;
  function enterVoxel() { voxelMode = true; }
  function exitVoxel() {
    voxelMode = false;
    hits = 0; collapsed = false;
    height.fill(0);
  }

  // текущая скорость оборота знака — выбитый кубик уносит её с собой
  let spinRate = 0;
  function detach(id, vx, vy, vz) {
    mode[id] = FALLING;
    attachedCount--;
    FA.fill(0, id * 16, id * 16 + 16);
    fixedDirty = true;
    homeWorld(id, pos, id * 3);
    const p = id * 3;
    vel[p] = vx + spinRate * pos[p + 2];
    vel[p + 1] = vy;
    vel[p + 2] = vz - spinRate * pos[p];
    rot.set([pivotQ.x, pivotQ.y, pivotQ.z, pivotQ.w], id * 4);
    const a = 4 + Math.random() * 8;
    spinW.set([(Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a], p);
    bounces[id] = 0;
    addLoose(id);
    writeLoose(id);
    looseDirty = true;
  }
  function reattach(id) {
    mode[id] = ATTACHED;
    attachedCount++;
    placeFixed(id);
    fixedDirty = true;
    removeLoose(id);
    looseDirty = true;
  }
  // кубик поднимают с пола — его клетка в горке опускается
  function liftOff(id) {
    if (mode[id] === SETTLING || mode[id] === RESTING) {
      const c = restCell[id];
      height[c] = Math.min(height[c], restLevel[id]);
    }
  }

  /* лёг: скатываемся с горки, пока в пределах трёх клеток есть место ниже больше чем на кубик,
     затем занимаем клетку. Склон выходит ~1:3 — горка низкая и широкая, а не гора выше знака. */
  const DX = [1, -1, 0, 0, 1, -1, 1, -1], DZ = [0, 0, 1, -1, 1, 1, -1, -1];
  const REACH = 3;
  const PILE_X = 1.9, PILE_FRONT = 0.45, PILE_BACK = -1.95;  // где может лежать горка; ближе к камере пол уходит за кадр
  const cxMin = Math.floor((-PILE_X - FX0) / ST), cxMax = Math.floor((PILE_X - FX0) / ST);
  const czMin = Math.floor((PILE_BACK - FZ0) / ST), czMax = Math.floor((PILE_FRONT - FZ0) / ST);
  function settle(id) {
    const p = id * 3;
    let cx = clamp(Math.floor((pos[p] - FX0) / ST), cxMin, cxMax), cz = clamp(Math.floor((pos[p + 2] - FZ0) / ST), czMin, czMax);
    for (let it = 0; it < 60; it++) {
      const start = (Math.random() * 8) | 0, hc = height[cz * FW + cx];
      let bestN = -1, bestScore = hc - 1;
      for (let n = 0; n < 8; n++) {
        const d = (start + n) & 7;
        for (let k = 1; k <= REACH; k++) {
          const x = cx + DX[d] * k, z = cz + DZ[d] * k;
          if (x < cxMin || x > cxMax || z < czMin || z > czMax) break;
          const hh = height[z * FW + x];
          if (hh > hc) break;                       // дальше выше — туда не катится
          const score = hh + k * 0.01;
          if (hh < hc - 1 && score < bestScore) { bestScore = score; bestN = d; }
        }
      }
      if (bestN < 0) break;
      cx += DX[bestN]; cz += DZ[bestN];
    }
    const c = cz * FW + cx;
    restCell[id] = c;
    restLevel[id] = height[c];
    height[c]++;
    tgt[p] = FX0 + ((c % FW) + 0.5) * ST;
    tgt[p + 1] = floorY + (restLevel[id] + 0.5) * ST;
    tgt[p + 2] = FZ0 + (Math.floor(c / FW) + 0.5) * ST;
    // лежит ровно, повёрнут только вокруг вертикали
    const yaw = (Math.random() - 0.5) * 0.6;
    tgtQ.set([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], id * 4);
    vel.fill(0, p, p + 3);
    mode[id] = SETTLING;
  }

  /* ─────────── Удары ─────────── */
  let hits = 0, lastHit = -1e9, lastAction = -1e9, lastBusy = -1e9, collapsed = false;
  let pending = [], pendAt = 0;           // очередь обрушения: [время, id]
  let clock = 0;

  function knock(hitId, rd) {
    used();
    hits = clock - lastHit < HIT_WINDOW ? hits + 1 : 1;
    lastHit = lastAction = clock;
    enterVoxel();
    if (hits >= COLLAPSE_AT) { haptic.rumble(); collapse(); return; }
    haptic.crack(hits);
    const R = HIT_RADII[Math.min(hits - 1, HIT_RADII.length - 1)], r = Math.ceil(R);
    const ci = ijk[hitId * 3], cj = ijk[hitId * 3 + 1], ck = ijk[hitId * 3 + 2];
    const hw = [0, 0, 0], vw = [0, 0, 0];
    homeWorld(hitId, hw, 0);
    const power = 0.6 + hits * 0.12;
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) for (let dk = -r; dk <= r; dk++) {
      // неровный край выбоины
      if (di * di + dj * dj + dk * dk > R * R * (0.75 + 0.5 * Math.random())) continue;
      const i = ci + di, j = cj + dj, k = ck + dk;
      if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) continue;
      const id = occ[(i * NY + j) * NZ + k];
      if (id < 0 || mode[id] !== ATTACHED) continue;
      homeWorld(id, vw, 0);
      let ax = vw[0] - hw[0], ay = vw[1] - hw[1], az = vw[2] - hw[2];
      const al = Math.hypot(ax, ay, az);
      if (al > 1e-6) { ax /= al; ay /= al; az /= al; }
      const s = power * (0.6 + Math.random() * 0.9), back = 0.5 + Math.random() * 0.7;
      detach(id, ax * s - rd.x * back, ay * s - rd.y * back + Math.random() * 0.6, az * s - rd.z * back);
    }
    // удар качает знак: толчок вокруг центра от точки попадания (r × направление удара)
    const rx = hw[0] - PE[12], ry = hw[1] - PE[13], rz = hw[2] - PE[14], push = 4 + hits * 0.8;
    let ix = (ry * rd.z - rz * rd.y) * push + (Math.random() - 0.5) * 0.6;
    let iz = (rx * rd.y - ry * rd.x) * push + (Math.random() - 0.5) * 0.6;
    // каждый удар качает заметно (около 5–8°, с серией сильнее), но не опрокидывает
    const il = Math.hypot(ix, iz) || 1, amp = clamp(il, 0.75 + hits * 0.15, 1.9);
    spin.x += ix / il * amp;
    spin.z += iz / il * amp;
    spinV += (rz * rd.x - rx * rd.z) * push * 0.1;
    shake = 1;
    // от сотрясения пиксели осыпаются по всему знаку, охотнее — по краям уже выбитых дыр
    pending = pending.filter(([, id]) => mode[id] === ATTACHED);
    const want = 3 + hits * 5;
    for (let n = 0, tries = 0; n < want && tries < want * 40; tries++) {
      const id = (Math.random() * N) | 0;
      if (mode[id] !== ATTACHED || !(nearHole(id) || Math.random() < 0.35)) continue;
      pending.push([clock + 0.04 + Math.random() * 0.75, id]);
      n++;
    }
    pending.sort((a, b) => a[0] - b[0]);
    pendAt = 0;
  }
  // рядом есть выбитый кубик
  function nearHole(id) {
    const i = ijk[id * 3], j = ijk[id * 3 + 1], k = ijk[id * 3 + 2];
    for (const [a, b, c] of NB) {
      const x = i + a, y = j + b, z = k + c;
      if (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ) continue;
      const o = occ[(x * NY + y) * NZ + z];
      if (o >= 0 && mode[o] !== ATTACHED) return true;
    }
    return false;
  }
  const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  // знак рушится: снизу вверх, верхние кубики чуть позже
  function collapse() {
    collapsed = true;
    pending = [];
    pendAt = 0;
    for (let id = 0; id < N; id++) {
      if (mode[id] !== ATTACHED) continue;
      const up = (home[id * 3 + 1] - O[1]) / (NY * ST);
      pending.push([clock + 0.02 + up * 0.22 + Math.random() * 0.08, id]);
    }
    pending.sort((a, b) => a[0] - b[0]);
  }

  // пнули горку или летящие кубики
  function kick(hp, rd) {
    used();
    haptic.kick();
    lastAction = clock;
    const R = ST * (2.2 + Math.min(hits, 6) * 0.4), R2 = R * R;
    for (let s = 0; s < looseCount; s++) {
      const id = slotId[s], p = id * 3;
      const dx = pos[p] - hp.x, dy = pos[p + 1] - hp.y, dz = pos[p + 2] - hp.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R2) continue;
      liftOff(id);
      const d = Math.sqrt(d2) || 1, f = 0.8 + Math.random();
      vel[p] = dx / d * f - rd.x * 0.5;
      vel[p + 1] = 1.4 + Math.random() * 1.6;
      vel[p + 2] = dz / d * f - rd.z * 0.5;
      const a = 4 + Math.random() * 8;
      spinW.set([(Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a], p);
      bounces[id] = 0;
      mode[id] = FALLING;
    }
  }

  // «бам»: всё летит обратно волной слева направо (после полного обрушения) или вразнобой
  function returnAll(full) {
    bamPending = full;
    for (let s = 0; s < looseCount; s++) {
      const id = slotId[s];
      if (mode[id] === RETURNING) continue;
      liftOff(id);
      mode[id] = RETURNING;
      delay[id] = full ? (home[id * 3] - O[0]) / (NX * ST) * 0.3 + Math.random() * 0.06 : Math.random() * 0.12;
      age[id] = 0;
    }
    hits = 0;
    collapsed = false;
  }

  /* ─────────── Куда попал палец ───────────
   Луч переводим в координаты знака и идём по сетке кубиков клетка за клеткой. */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4();
  const lo = new THREE.Vector3(), ld = new THREE.Vector3();
  function rayFixed(ro, rd) {
    inv.copy(pivot.matrixWorld).invert();
    lo.copy(ro).applyMatrix4(inv);
    ld.copy(rd).transformDirection(inv);
    const g = [(lo.x - O[0]) / ST, (lo.y - O[1]) / ST, (lo.z - O[2]) / ST], d = [ld.x, ld.y, ld.z], dim = [NX, NY, NZ];
    let t0 = 0, t1 = Infinity;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (g[a] < 0 || g[a] > dim[a]) return null; continue; }
      let ta = (0 - g[a]) / d[a], tb = (dim[a] - g[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 > t1) return null;
    const c = [], stp = [], tMax = [], tDel = [];
    for (let a = 0; a < 3; a++) {
      const p = g[a] + d[a] * (t0 + 1e-5);
      c[a] = clamp(Math.floor(p), 0, dim[a] - 1);
      stp[a] = d[a] > 0 ? 1 : -1;
      tDel[a] = Math.abs(1 / d[a]);
      tMax[a] = Math.abs(d[a]) < 1e-9 ? Infinity : t0 + ((c[a] + (d[a] > 0 ? 1 : 0)) - p) / d[a];
    }
    let t = t0;
    for (let n = 0; n < NX + NY + NZ + 3; n++) {
      const id = occ[(c[0] * NY + c[1]) * NZ + c[2]];
      if (id >= 0 && mode[id] === ATTACHED) return { id, t: t * ST };
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      t = tMax[a];
      c[a] += stp[a];
      if (c[a] < 0 || c[a] >= dim[a]) return null;
      tMax[a] += tDel[a];
    }
    return null;
  }
  function rayLoose(ro, rd) {
    let best = Infinity, bid = -1;
    const lim = (ST * 0.75) ** 2;
    for (let s = 0; s < looseCount; s++) {
      const id = slotId[s], p = id * 3;
      const dx = pos[p] - ro.x, dy = pos[p + 1] - ro.y, dz = pos[p + 2] - ro.z;
      const t = dx * rd.x + dy * rd.y + dz * rd.z;
      if (t < 0 || t > best) continue;
      const ex = dx - rd.x * t, ey = dy - rd.y * t, ez = dz - rd.z * t;
      if (ex * ex + ey * ey + ez * ez < lim) { best = t; bid = id; }
    }
    return bid < 0 ? null : { id: bid, t: best };
  }

  function hitAt(clientX, clientY) {
    if (REDUCE) {
      used();
      haptic.crack(1);
      // без движения: короткое затухание и возврат
      canvas.animate([{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }], { duration: 420, easing: 'ease-in-out' });
      return;
    }
    const rect = host.getBoundingClientRect();
    ndc.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const ro = ray.ray.origin, rd = ray.ray.direction;
    const a = rayFixed(ro, rd), b = rayLoose(ro, rd);
    if (a && (!b || a.t <= b.t)) knock(a.id, rd);
    else if (b) kick(new THREE.Vector3(pos[b.id * 3], pos[b.id * 3 + 1], pos[b.id * 3 + 2]), rd);
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const px = Math.min(1.35 * w, (w > h && h < 500 ? 0.96 : 1.31) * h);
    const visH = h * size.x / px;
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, dist * Math.sin(0.07), dist * Math.cos(0.07));
    camera.lookAt(0, 0, 0);
    const lift = window.accHeroLayout ? window.accHeroLayout() : 0;
    camera.setViewOffset(w, h, 0, lift, w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  resize();
  new ResizeObserver(resize).observe(host);

  /* ─────────── Вращение пальцем ───────────
   Поворот копится в кватернионе free (в мировых осях: вбок — вокруг Y, вверх-вниз — вокруг X).
   Каждый кадр часть «вокруг Y» перекладывается в обычный оборот angle, а наклон пружиной
   возвращается в ноль — знак встаёт ровно, но не раскручивается обратно.
   Выбитые пиксели лежат в мировых координатах, вращение их не трогает. */
  const DRAG = 0.008;                      // радиан на пиксель, как в scene3d.js
  const SPRING_K = 38, SPRING_C = 2 * 0.7 * Math.sqrt(38);
  const spin = new THREE.Vector3();        // угловая скорость наклона, рад/с
  const qStep = new THREE.Quaternion(), qTwist = new THREE.Quaternion(), axis = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  let angle = 0, spinV = 0, idleGain = 1, dragging = false;
  let shake = 0;                           // 1 сразу после удара: пружина наклона мягче, знак качается дольше

  function turnFree(ax, ay, az) {
    const a = Math.hypot(ax, ay, az);
    if (a < 1e-7) return;
    qStep.setFromAxisAngle(axis.set(ax / a, ay / a, az / a), a);
    free.quaternion.premultiply(qStep).normalize();
  }
  function absorbTwist() {
    const q = free.quaternion;
    const tw = 2 * Math.atan2(q.y, q.w);
    if (Math.abs(tw) < 1e-7) return;
    qTwist.setFromAxisAngle(Y, tw).invert();
    q.multiply(qTwist).normalize();
    angle += tw;
  }

  const ptr = { id: null, x: 0, y: 0, x0: 0, y0: 0, t0: 0, tLast: 0, moved: false, vx: 0, vy: 0 };
  host.addEventListener('pointerdown', e => {
    if (ptr.id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    ptr.id = e.pointerId;
    ptr.x = ptr.x0 = e.clientX; ptr.y = ptr.y0 = e.clientY;
    ptr.t0 = ptr.tLast = performance.now();
    ptr.moved = false; ptr.vx = ptr.vy = 0;
    host.setPointerCapture?.(e.pointerId);
  });
  host.addEventListener('pointermove', e => {
    if (e.pointerId !== ptr.id) return;
    if (!ptr.moved && Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0) < 5) return;
    if (!ptr.moved) { ptr.moved = true; dragging = true; spin.set(0, 0, 0); host.classList.add('is-grabbing'); }
    const now = performance.now(), dt = Math.max(now - ptr.tLast, 8) / 1000;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.tLast = now;
    turnFree(dy * DRAG, dx * DRAG, 0);
    // скорость сглаживаем, иначе на отпускании решает один случайный кадр
    ptr.vx += (dx * DRAG / dt - ptr.vx) * 0.5;
    ptr.vy += (dy * DRAG / dt - ptr.vy) * 0.5;
  });
  const up = e => {
    if (e.pointerId !== ptr.id) return;
    ptr.id = null;
    host.classList.remove('is-grabbing');
    if (!ptr.moved) {
      if (e.type === 'pointerup' && performance.now() - ptr.t0 < 500) hitAt(e.clientX, e.clientY);
      return;
    }
    dragging = false;
    // если палец замер перед отпусканием — без броска
    const fresh = performance.now() - ptr.tLast < 90 && !REDUCE;
    spinV = fresh ? clamp(ptr.vx, -14, 14) : 0;
    spin.set(fresh ? clamp(ptr.vy, -9, 9) : 0, 0, 0);
    idleGain = 0;
  };
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);

  // точка на экране над случайным кубиком знака (клавиатура и проверка)
  const _p = new THREE.Vector3(), _w = [0, 0, 0];
  function aim() {
    if (!attachedCount) return null;
    let id;
    do id = (Math.random() * N) | 0; while (mode[id] !== ATTACHED);
    homeWorld(id, _w, 0);
    _p.set(_w[0], _w[1], _w[2]).project(camera);
    const rect = host.getBoundingClientRect();
    return [rect.left + (_p.x + 1) / 2 * rect.width, rect.top + (1 - _p.y) / 2 * rect.height];
  }

  // с клавиатуры: Enter/пробел — удар по знаку, стрелки — подтолкнуть
  host.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const at = aim();
      if (at) hitAt(at[0], at[1]);
      return;
    }
    const k = { ArrowLeft: [0, -3], ArrowRight: [0, 3], ArrowUp: [-3, 0], ArrowDown: [3, 0] }[e.key];
    if (!k) return;
    e.preventDefault();
    if (REDUCE) { turnFree(k[0] * 0.08, k[1] * 0.08, 0); return; }
    spin.x += k[0]; spinV += k[1];
    idleGain = 0;
  });

  let hintUsed = false;
  function used() { if (!hintUsed) { hintUsed = true; hint && hint.classList.add('is-used'); } }

  // знак чуть поворачивается за курсором; на телефоне — за наклоном телефона
  const look = { x: 0, y: 0 }, aimTilt = { x: 0, y: 0 };
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    addEventListener('pointermove', e => {
      aimTilt.x = (e.clientX / innerWidth - 0.5) * 2;
      aimTilt.y = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { aimTilt.x = aimTilt.y = 0; });
  } else if (window.DeviceOrientationEvent) {
    let base = null;
    const onTilt = e => {
      if (e.beta == null || e.gamma == null) return;
      if (!base) base = { b: e.beta, g: e.gamma };
      base.b += (e.beta - base.b) * 0.01;
      base.g += (e.gamma - base.g) * 0.01;
      aimTilt.x = clamp((e.gamma - base.g) / 20, -1, 1);
      aimTilt.y = clamp((e.beta - base.b) / 20, -1, 1);
    };
    const listen = () => addEventListener('deviceorientation', onTilt);
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      host.addEventListener('touchend', () => {
        DeviceOrientationEvent.requestPermission().then(res => { if (res === 'granted') listen(); }).catch(() => {});
      }, { once: true });
    } else listen();
  }

  /* ─────────── Физика пикселей ───────────
   Двигаем только тех, кто в движении; лежащие на полу не трогаем вовсе. */
  let active = 0, returning = 0, physMs = 0;
  function physics(dt) {
    // цели возврата — текущее место в знаке (знак может крутиться)
    for (let s = 0; s < looseCount; s++) { const id = slotId[s]; if (mode[id] === RETURNING) homeWorld(id, tgt, id * 3); }
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    const settleK = 1 - Math.exp(-22 * h), turnK = 1 - Math.exp(-20 * h);
    active = 0; returning = 0;
    // с конца: вернувшийся кубик уходит из списка, на его место встаёт уже посчитанный последний
    for (let s = looseCount - 1; s >= 0; s--) {
      const id = slotId[s], m = mode[id];
      if (m === RESTING) continue;
      const p = id * 3, q = id * 4;
      if (m === RETURNING) {
        returning++;
        if (delay[id] > 0) {
          delay[id] -= dt;
          if (delay[id] > 0) continue;
          // подскок перед тем, как влететь на место
          vel[p] *= 0.3; vel[p + 1] = 1.6 + Math.random() * 1.2; vel[p + 2] *= 0.3;
        }
      }
      active++;
      for (let k = 0; k < n; k++) {
        if (mode[id] === FALLING) {
          vel[p + 1] -= GRAVITY * h;
          pos[p] += vel[p] * h; pos[p + 1] += vel[p + 1] * h; pos[p + 2] += vel[p + 2] * h;
          // стенки за краем пола, чтобы горка не уезжала из кадра
          if (Math.abs(pos[p]) > PILE_X) { pos[p] = clamp(pos[p], -PILE_X, PILE_X); vel[p] *= -0.3; }
          if (pos[p + 2] < PILE_BACK || pos[p + 2] > PILE_FRONT) { pos[p + 2] = clamp(pos[p + 2], PILE_BACK, PILE_FRONT); vel[p + 2] *= -0.3; }
          const cx = clamp(Math.floor((pos[p] - FX0) / ST), 0, FW - 1), cz = clamp(Math.floor((pos[p + 2] - FZ0) / ST), 0, FD - 1);
          const surf = floorY + height[cz * FW + cx] * ST;
          if (pos[p + 1] - HALF <= surf && vel[p + 1] < 0) {
            if (bounces[id] < 2 && -vel[p + 1] > 0.9) {
              pos[p + 1] = surf + HALF;
              vel[p + 1] *= -BOUNCE; vel[p] *= FRICTION; vel[p + 2] *= FRICTION;
              spinW[p] *= 0.6; spinW[p + 1] *= 0.6; spinW[p + 2] *= 0.6;
              bounces[id]++;
            } else settle(id);
          }
          // кувырок: q += ½·ω·q·dt
          const wx = spinW[p], wy = spinW[p + 1], wz = spinW[p + 2];
          const x = rot[q], y = rot[q + 1], z = rot[q + 2], w = rot[q + 3], hh = 0.5 * h;
          rot[q] = x + hh * (wx * w + wy * z - wz * y);
          rot[q + 1] = y + hh * (wy * w + wz * x - wx * z);
          rot[q + 2] = z + hh * (wz * w + wx * y - wy * x);
          rot[q + 3] = w - hh * (wx * x + wy * y + wz * z);
        } else if (mode[id] === SETTLING) {
          pos[p] += (tgt[p] - pos[p]) * settleK;
          pos[p + 1] += (tgt[p + 1] - pos[p + 1]) * settleK;
          pos[p + 2] += (tgt[p + 2] - pos[p + 2]) * settleK;
          nlerp(q, tgtQ, q, settleK);
          if (Math.abs(tgt[p] - pos[p]) + Math.abs(tgt[p + 1] - pos[p + 1]) + Math.abs(tgt[p + 2] - pos[p + 2]) < ST * 0.02) {
            pos.set(tgt.subarray(p, p + 3), p);
            rot.set(tgtQ.subarray(q, q + 4), q);
            mode[id] = RESTING;
            break;
          }
        } else if (mode[id] === RETURNING) {
          for (let a = 0; a < 3; a++) {
            vel[p + a] += (-BACK_K * (pos[p + a] - tgt[p + a]) - BACK_C * vel[p + a]) * h;
            pos[p + a] += vel[p + a] * h;
          }
          nlerp(q, PQ, 0, turnK);
          age[id] += h;
        }
      }
      // кувырок мог чуть «растянуть» кватернион
      const l = Math.hypot(rot[q], rot[q + 1], rot[q + 2], rot[q + 3]) || 1;
      rot[q] /= l; rot[q + 1] /= l; rot[q + 2] /= l; rot[q + 3] /= l;
      if (mode[id] === RETURNING) {
        const off = Math.abs(pos[p] - tgt[p]) + Math.abs(pos[p + 1] - tgt[p + 1]) + Math.abs(pos[p + 2] - tgt[p + 2]);
        const sp = Math.abs(vel[p]) + Math.abs(vel[p + 1]) + Math.abs(vel[p + 2]);
        if ((off < ST * 0.08 && sp < 0.4) || age[id] > 0.9) { reattach(id); continue; }
      }
      writeLoose(id);
      looseDirty = true;
    }
  }
  const PQ = new Float32Array(4);
  // плавный поворот к цели: нормализованная линейная смесь, коротким путём
  function nlerp(q, src, so, k) {
    let x = src[so], y = src[so + 1], z = src[so + 2], w = src[so + 3];
    if (x * rot[q] + y * rot[q + 1] + z * rot[q + 2] + w * rot[q + 3] < 0) { x = -x; y = -y; z = -z; w = -w; }
    rot[q] += (x - rot[q]) * k; rot[q + 1] += (y - rot[q + 1]) * k;
    rot[q + 2] += (z - rot[q + 2]) * k; rot[q + 3] += (w - rot[q + 3]) * k;
  }

  const swing = new THREE.Vector3();
  let frames = 0;
  function frame(dt) {
    clock += dt;
    frames++;
    if (!dragging) {
      // наклон — пружиной к нулю
      const q = free.quaternion;
      if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      const half = Math.acos(clamp(q.w, -1, 1)), sn = Math.sin(half);
      if (sn > 1e-6) swing.set(q.x, q.y, q.z).multiplyScalar(2 * half / sn); else swing.set(0, 0, 0);
      shake = Math.max(0, shake - dt / 1.6);
      const k = REDUCE ? 120 : SPRING_K, c = REDUCE ? 2 * Math.sqrt(120) : SPRING_C * (1 - 0.68 * shake);
      spin.x += (-k * swing.x - c * spin.x) * dt;
      spin.z += (-k * swing.z - c * spin.z) * dt;
      spin.y = 0;
      turnFree(spin.x * dt, 0, spin.z * dt);
      spinV = damp(spinV, 0, 2.2, dt);
      // пока знак разбит, обычный оборот замирает; после сборки возвращается плавно
      idleGain = damp(idleGain, voxelMode ? 0 : 1, voxelMode ? 3 : 1.4, dt);
      spinRate = (REDUCE ? 0 : MARK_TURN * idleGain) + spinV;
      angle += spinRate * dt;
    } else spinRate = 0;
    absorbTwist();
    pivot.rotation.y = angle;
    look.x = damp(look.x, aimTilt.x, 4, dt);
    look.y = damp(look.y, aimTilt.y, 4, dt);
    tilt.rotation.y = look.x * 0.35;
    tilt.rotation.x = look.y * 0.16;
    tilt.updateMatrixWorld(true);
    PE = pivot.matrixWorld.elements;
    pivotQ.setFromRotationMatrix(pivot.matrixWorld);
    PQ[0] = pivotQ.x; PQ[1] = pivotQ.y; PQ[2] = pivotQ.z; PQ[3] = pivotQ.w;

    if (voxelMode) {
      // очередь обрушения
      while (pendAt < pending.length && pending[pendAt][0] <= clock) {
        const id = pending[pendAt++][1];
        if (mode[id] === ATTACHED) detach(id, (Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4);
      }
      if (pendAt >= pending.length && pending.length) { pending = []; pendAt = 0; }
      const t0 = performance.now();
      physics(dt);
      physMs = performance.now() - t0;
      // толчок, когда волна почти собрала знак
      if (bamPending && attachedCount > N * 0.9) { haptic.bam(); bamPending = false; }
      if (active > 0) lastBusy = clock;
      const quiet = active === 0 && !pending.length;
      if (collapsed && quiet && attachedCount === 0 && clock - lastBusy > FULL_WAIT) returnAll(true);
      else if (!collapsed && looseCount > 0 && returning === 0 && clock - lastAction > PARTIAL_WAIT) returnAll(false);
      if (looseCount === 0 && !pending.length && attachedCount === N && active === 0) exitVoxel();
    }
    loose.count = looseCount;
    if (looseDirty) { loose.instanceMatrix.needsUpdate = true; looseDirty = false; }
    if (fixedDirty) { fixed.instanceMatrix.needsUpdate = true; fixedDirty = false; }
    renderer.render(scene, camera);
  }

  frame(0);
  host.classList.add('is-ready');
  runWhileVisible(host, frame);
  // для проверки из консоли
  // крючок для автотестов: только с ?znaktest в адресе
  if (/[?&]znaktest\b/.test(location.search)) window.__znak = {
    aim,
    get angle() { return angle; },
    get tilt() { return free.quaternion.toArray(); },
    get info() { return { voxelMode, attached: attachedCount, loose: looseCount, active, returning, hits, collapsed, total: N, clock, lastBusy, lastAction, physMs, pending: pending.length }; },
    debug() {
      const byMode = [0, 0, 0, 0, 0]; let maxH = 0, maxY = -9;
      for (let s = 0; s < looseCount; s++) { const id = slotId[s]; byMode[mode[id]]++; if (mode[id] === RESTING) maxY = Math.max(maxY, pos[id * 3 + 1]); }
      for (let c = 0; c < height.length; c++) maxH = Math.max(maxH, height[c]);
      return { byMode, maxH, maxY, floorY, step: ST };
    },
    get frames() { return frames; },
  };
}

initMark().catch(err => console.warn('3D отключено:', err));
