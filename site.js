/* Общая доступность: меню, модалки, карточки товаров.
   Подключается с defer — выполняется после скриптов страницы. */
(function () {
  const RU = { '✕': 'Закрыть', '←': 'Предыдущее фото', '→': 'Следующее фото', '−': 'Меньше', '+': 'Больше' };

  // ── Бургер-меню: состояние для скринридеров + закрытие по Escape ──
  const burger = document.getElementById('burgerBtn');
  const menu = document.getElementById('mobileMenu');
  if (burger && menu) {
    burger.setAttribute('aria-label', 'Меню');
    burger.setAttribute('aria-controls', 'mobileMenu');
    const sync = () => burger.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false');
    sync();
    new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('open') && typeof window.closeMobileMenu === 'function') {
        window.closeMobileMenu();
        burger.focus();
      }
    });
  }
  const menuClose = document.getElementById('menuClose');
  if (menuClose && !menuClose.getAttribute('aria-label')) menuClose.setAttribute('aria-label', 'Закрыть меню');

  // ── Кнопки-значки без подписи ──
  document.querySelectorAll('button').forEach(b => {
    const t = b.textContent.trim();
    if (!b.getAttribute('aria-label') && RU[t]) b.setAttribute('aria-label', RU[t]);
  });

  // ── Модалки: роль диалога, фокус внутрь и обратно ──
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    const box = ov.querySelector('.modal');
    if (!box) return;
    // имя на случай, пока заголовок модалки ещё пуст
    if (!box.getAttribute('aria-label')) box.setAttribute('aria-label', 'Карточка изделия');
    if (box.getAttribute('role')) return; // лукбук настроен сам
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const title = box.querySelector('h2, .modal-name');
    if (title) {
      if (!title.id) title.id = 'modalTitle';
      box.setAttribute('aria-labelledby', title.id);
    }
    let last = null;
    new MutationObserver(() => {
      if (ov.classList.contains('open')) {
        if (!box.contains(document.activeElement)) last = document.activeElement;
        const first = box.querySelector('.modal-close, button');
        if (first) first.focus({ preventScroll: true });
      } else if (last) {
        last.focus({ preventScroll: true });
        last = null;
      }
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  });

  // ── Ссылки в новой вкладке: безопасно и с подсказкой для скринридера ──
  document.querySelectorAll('a[target="_blank"]').forEach(a => {
    a.rel = 'noopener';
    if (!a.querySelector('.sr-only')) a.insertAdjacentHTML('beforeend', '<span class="sr-only"> (откроется в новой вкладке)</span>');
  });

  // ── Уведомление о добавлении в корзину читается скринридером ──
  const fb = document.getElementById('cartFeedback');
  if (fb) { fb.setAttribute('role', 'status'); fb.setAttribute('aria-live', 'polite'); }

  // ── Поле Telegram: «@» нарисована перед полем, свою «@» в начале убираем ──
  document.querySelectorAll('.field.tg input').forEach(el => {
    const strip = () => { const v = el.value.replace(/^\s*@+/, ''); if (v !== el.value) el.value = v; };
    strip();
    el.addEventListener('input', strip);
    addEventListener('load', strip);
  });

  // ── Карточки товаров открываются с клавиатуры ──
  document.querySelectorAll('.product-card:not(.is-sold)').forEach(card => {
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const name = card.querySelector('.card-name');
    if (name) card.setAttribute('aria-label', `${name.textContent.trim()} — подробнее`);
    card.addEventListener('keydown', e => {
      if (e.target !== card || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      (card.querySelector('.card-info') || card).click();
    });
  });
})();

/* Своя ссылка на каждую вещь: collection-a1.html?item=camo, lookbook.html?item=bag-n03.
   Страница вызывает set/clear при открытии и закрытии карточки. */
window.ACC_LINK = {
  set(slug) { history.replaceState(history.state, '', '?item=' + encodeURIComponent(slug) + location.hash); },
  clear() { if (location.search) history.replaceState(history.state, '', location.pathname + location.hash); },
  open(list, keyOf, openFn) {
    const slug = new URLSearchParams(location.search).get('item');
    const item = slug && list.find(x => keyOf(x) === slug);
    if (item) openFn(item); else if (slug) this.clear();
  },
  async share(title) {
    const url = location.href;
    const btn = document.getElementById('mShare');
    // на телефоне — системное меню «Поделиться», на компьютере — копируем
    if (navigator.share && matchMedia('(hover: none)').matches) {
      try { await navigator.share({ title: title ? title + ' — accinthecloud' : 'accinthecloud', url }); } catch (e) {}
      return;
    }
    try { await navigator.clipboard.writeText(url); } catch (e) { prompt('Ссылка на вещь', url); return; }
    if (btn) {
      btn.textContent = 'Ссылка скопирована';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.textContent = 'Поделиться ссылкой'; }, 2000);
    }
  }
};

/* Окно вещи раскрывается из её карточки: фото перетекает на место. */
window.ACC_MORPH = function (card, open) {
  const from = card && (card.querySelector('.card-gallery, .lb-card-slides') || card.querySelector('img'));
  if (!document.startViewTransition || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) return open();
  let to = null;
  from.style.viewTransitionName = 'acc-item';
  const vt = document.startViewTransition(async () => {
    from.style.viewTransitionName = '';
    // окно сразу на месте — иначе фото полетит туда, где шторка ещё за краем экрана
    document.documentElement.classList.add('vt-opening');
    open();
    to = document.querySelector('.modal-overlay.open [data-morph]');
    if (!to) return;
    to.style.viewTransitionName = 'acc-item';
    // ждём первое фото окна, но не дольше 300 мс
    const img = to.querySelector('img');
    if (img && !img.complete) await Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 300))]);
  });
  vt.finished.finally(() => { document.documentElement.classList.remove('vt-opening'); if (to) to.style.viewTransitionName = ''; });
};

// ── Вторая фотография при наведении: в первый слайд карточки кладём второе фото ──
if (matchMedia('(hover: hover)').matches) {
  const addAlt = card => {
    if (card._alt) return;
    card._alt = true;
    const slides = card.querySelectorAll('.card-gallery .slide, .lb-card-slide');
    const second = slides[1] && slides[1].querySelector('img');
    if (!second) return;
    const alt = document.createElement('img');
    alt.className = 'hover-alt';
    alt.alt = '';
    alt.decoding = 'async';
    alt.src = second.dataset.src || second.currentSrc || second.src;
    slides[0].style.position = 'relative';
    slides[0].appendChild(alt);
  };
  document.addEventListener('pointerover', e => {
    const card = e.target.closest && e.target.closest('.product-card:not(.is-sold), .lb-card');
    if (card) addAlt(card);
  });
}

/* ── Пружина для жестов: стартует с текущего места и скорости пальца, поэтому её можно перехватить ──
   response — за сколько секунд доходит до цели, damping 1 — без отскока, 0.8 — лёгкий отскок */
window.ACC_SPRING = function (from, to, v, opt, step, done) {
  const response = opt.response || 0.3, damping = opt.damping == null ? 1 : opt.damping;
  const k = (2 * Math.PI / response) ** 2, c = 4 * Math.PI * damping / response;
  let x = from, last = performance.now(), raf = 0;
  const tick = now => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    v += (-k * (x - to) - c * v) * dt;
    x += v * dt;
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 20) { step(to); if (done) done(); return; }
    step(x);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { stop() { cancelAnimationFrame(raf); }, get x() { return x; } };
};
// куда «долетит» бросок с такой скоростью (px/с) — как прокрутка в iOS
const accProject = v => (v / 1000) * 0.998 / (1 - 0.998);
// сопротивление за краем: чем дальше тянешь, тем меньше идёт
const accRubber = (over, dim) => (over * dim * 0.55) / (dim + 0.55 * Math.abs(over));
// скорость по последним 100 мс движения
function accVelocity(hist) {
  const now = performance.now();
  while (hist.length > 2 && now - hist[0][0] > 100) hist.shift();
  if (hist.length < 2) return 0;
  const [t0, p0] = hist[0], [t1, p1] = hist[hist.length - 1];
  return t1 > t0 ? (p1 - p0) / (t1 - t0) * 1000 : 0;
}

/* ── Окно вещи на телефоне — шторка снизу: потянул вниз — закрылась, отпустил рано — вернулась ── */
(function () {
  const phone = matchMedia('(max-width: 900px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    const box = ov.querySelector('.modal'), close = ov.querySelector('.modal-close');
    if (!box || !close) return;
    box.insertAdjacentHTML('afterbegin', '<div class="sheet-grip" aria-hidden="true"></div>');
    let y0 = null, x0 = 0, off = 0, drag = false, skip = false, hist = [], anim = null;
    const set = y => { off = y; box.style.transform = `translateY(${y}px)`; };
    const release = () => { box.style.transform = ''; box.style.transition = ''; off = 0; };
    // внутри окна что-то прокручено вниз — жест принадлежит прокрутке, а не шторке
    const scrolled = t => {
      for (let el = t; el && el !== ov; el = el.parentElement) if (el.scrollTop > 0) return true;
      return false;
    };
    box.addEventListener('touchstart', e => {
      if (!phone.matches || e.touches.length > 1 || document.documentElement.classList.contains('zoom-open')) { y0 = null; return; }
      skip = scrolled(e.target) || !!e.target.closest('input, textarea, select');
      if (anim) { anim.stop(); anim = null; }
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY - off;
      drag = off !== 0;
      hist = [];
    }, { passive: true });
    box.addEventListener('touchmove', e => {
      if (y0 === null || skip || e.touches.length > 1) return;
      const t = e.touches[0], dy = t.clientY - y0, dx = t.clientX - x0;
      if (!drag) {
        if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
        // вверх или вбок — это прокрутка и листание фото
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { y0 = null; return; }
        drag = true;
        y0 = t.clientY;
        box.style.transition = 'none';
      }
      e.preventDefault();
      const y = t.clientY - y0;
      set(y >= 0 ? y : accRubber(y, box.offsetHeight));
      hist.push([performance.now(), y]);
    }, { passive: false });
    const end = () => {
      if (y0 === null || !drag) { y0 = null; return; }
      y0 = null; drag = false;
      const v = accVelocity(hist), h = box.offsetHeight;
      if (off + accProject(v) > h * 0.4 && v > -100) {
        if (reduce.matches) { release(); close.click(); return; }
        anim = ACC_SPRING(off, h + 24, Math.max(v, 400), { response: 0.3 }, set, () => {
          anim = null;
          close.click();
          setTimeout(release, 400); // окно уже прозрачно — возвращаем его на место незаметно
        });
      } else if (reduce.matches) release();
      else anim = ACC_SPRING(off, 0, v, { response: 0.3, damping: 0.8 }, set, () => { anim = null; release(); });
    };
    box.addEventListener('touchend', end);
    box.addEventListener('touchcancel', end);
  });
})();

/* ── Фото вещи крупно: тап по фото в окне. Щипок и двойной тап приближают, свайп вниз закрывает,
   вбок — следующее фото. На компьютере клик приближает, фото ходит за мышью ── */
(function () {
  const SEL = '.modal-overlay.open [data-morph] img:not(.hover-alt)';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const EASE = 'cubic-bezier(.32,.72,0,1)';
  let view, img, count, prev, next, list = [], idx = 0, from = null;
  let s = 1, tx = 0, ty = 0, fit = { w: 0, h: 0 };
  const pts = new Map();
  let g = null, lastTap = null;

  function build() {
    view = document.createElement('div');
    view.className = 'zoom-view';
    view.setAttribute('role', 'dialog');
    view.setAttribute('aria-modal', 'true');
    view.setAttribute('aria-label', 'Фото крупно');
    view.innerHTML = '<img class="zoom-img" alt="" draggable="false">' +
      '<button type="button" class="zoom-close" aria-label="Закрыть">&#10005;</button>' +
      '<button type="button" class="zoom-arr zoom-prev" aria-label="Предыдущее фото">&#8592;</button>' +
      '<button type="button" class="zoom-arr zoom-next" aria-label="Следующее фото">&#8594;</button>' +
      '<p class="zoom-count" aria-live="polite"></p>';
    document.body.appendChild(view);
    img = view.querySelector('.zoom-img');
    count = view.querySelector('.zoom-count');
    prev = view.querySelector('.zoom-prev');
    next = view.querySelector('.zoom-next');
    view.querySelector('.zoom-close').addEventListener('click', close);
    prev.addEventListener('click', () => go(idx - 1));
    next.addEventListener('click', () => go(idx + 1));
    img.addEventListener('pointerdown', down);
    img.addEventListener('pointermove', move);
    img.addEventListener('pointerup', up);
    img.addEventListener('pointercancel', up);
    view.addEventListener('pointermove', hoverPan);
    addEventListener('resize', () => { if (view.classList.contains('open')) { layout(); reset(false); } });
  }

  const vw = () => innerWidth, vh = () => innerHeight;
  function layout() {
    const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
    const k = Math.min(vw() / nw, vh() / nh);
    fit = { w: nw * k, h: nh * k };
    Object.assign(img.style, { width: fit.w + 'px', height: fit.h + 'px', left: (vw() - fit.w) / 2 + 'px', top: (vh() - fit.h) / 2 + 'px' });
  }
  const bound = sc => ({ x: Math.max(0, (fit.w * sc - vw()) / 2), y: Math.max(0, (fit.h * sc - vh()) / 2) });
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  // за краем фото тянется с сопротивлением
  const soft = (v, m, dim) => v > m ? m + accRubber(v - m, dim) : v < -m ? -m + accRubber(v + m, dim) : v;
  function apply(animate) {
    img.style.transition = animate ? `transform .32s ${EASE}, opacity .2s ease` : 'none';
    img.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
  }
  function reset(animate) { s = 1; tx = 0; ty = 0; apply(animate); view.style.setProperty('--bg', 1); view.classList.remove('zoomed'); }
  function settle() {
    if (s <= 1.02) return reset(true);
    if (s > 5) s = 5;
    const b = bound(s);
    tx = clamp(tx, b.x); ty = clamp(ty, b.y);
    apply(true);
  }
  function zoomAt(px, py, ns) {
    const cx = vw() / 2, cy = vh() / 2;
    tx = px - cx - (px - cx - tx) * ns / s;
    ty = py - cy - (py - cy - ty) * ns / s;
    s = ns;
    const b = bound(s);
    tx = clamp(tx, b.x); ty = clamp(ty, b.y);
    view.classList.toggle('zoomed', s > 1.02);
    apply(true);
  }

  function show(i) {
    idx = i;
    img.src = list[i];
    count.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
    prev.hidden = i === 0; next.hidden = i === list.length - 1;
    if (list.length < 2) { prev.hidden = next.hidden = true; }
    // соседние фото грузим заранее, чтобы листание было мгновенным
    [i - 1, i + 1].forEach(j => { if (list[j]) new Image().src = list[j]; });
    return img.decode().catch(() => {}).then(layout);
  }

  function open(src) {
    if (!view) build();
    const box = src.closest('[data-morph]');
    const imgs = Array.from(box.querySelectorAll('img:not(.hover-alt)'));
    list = imgs.map(im => im.dataset.src || im.currentSrc || im.src);
    from = src;
    s = 1; tx = 0; ty = 0;
    img.style.transform = 'none';
    view.classList.add('open');
    document.documentElement.classList.add('zoom-open');
    view.style.setProperty('--bg', 1);
    show(Math.max(0, imgs.indexOf(src))).then(() => {
      if (reduce.matches) return;
      // фото вырастает из того места, где было в окне
      const r = from.getBoundingClientRect();
      const k = Math.max(r.width / fit.w, r.height / fit.h);
      const dx = r.left + r.width / 2 - vw() / 2, dy = r.top + r.height / 2 - vh() / 2;
      img.animate([{ transform: `translate(${dx}px,${dy}px) scale(${k})` }, { transform: 'translate(0,0) scale(1)' }], { duration: 320, easing: EASE });
    });
    view.querySelector('.zoom-close').focus({ preventScroll: true });
  }

  function close() {
    if (!view || !view.classList.contains('open')) return;
    view.classList.remove('open', 'zoomed');
    document.documentElement.classList.remove('zoom-open');
    pts.clear(); g = null;
    if (from) from.closest('.modal-overlay').querySelector('.modal-close')?.focus({ preventScroll: true });
  }

  function go(i, dir) {
    if (i < 0 || i >= list.length || i === idx) { settle(); return; }
    dir = dir || (i > idx ? -1 : 1);
    if (reduce.matches) { show(i).then(() => reset(false)); return; }
    tx = dir * vw(); img.style.opacity = 0; apply(true);
    setTimeout(() => {
      show(i).then(() => {
        s = 1; tx = -dir * vw() * 0.3; ty = 0; apply(false);
        img.getBoundingClientRect();
        img.style.opacity = 1; tx = 0; apply(true);
        view.classList.remove('zoomed');
      });
    }, 180);
  }

  // ── жесты ──
  function down(e) {
    img.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = Array.from(pts.values());
    if (p.length === 2) {
      g = { pinch: true, d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s0: s, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2, tx0: tx, ty0: ty };
    } else if (p.length === 1) {
      g = { x: e.clientX, y: e.clientY, tx0: tx, ty0: ty, t: performance.now(), mode: null, hist: [], mouse: e.pointerType === 'mouse' };
    }
    img.style.transition = 'none';
  }
  function move(e) {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = Array.from(pts.values());
    if (g.pinch && p.length === 2) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const ns = Math.max(0.7, Math.min(6, g.s0 * d / g.d0));
      const mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2, cx = vw() / 2, cy = vh() / 2;
      tx = mx - cx - (g.mx - cx - g.tx0) * ns / g.s0;
      ty = my - cy - (g.my - cy - g.ty0) * ns / g.s0;
      s = ns;
      view.classList.toggle('zoomed', s > 1.02);
      return apply(false);
    }
    if (g.pinch || g.mouse) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (s > 1.02) {
      const b = bound(s);
      tx = soft(g.tx0 + dx, b.x, vw()); ty = soft(g.ty0 + dy, b.y, vh());
      g.mode = 'pan';
      g.hist.push([performance.now(), tx, ty]);
      return apply(false);
    }
    if (!g.mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.mode = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }
    if (g.mode === 'y') { ty = dy; view.style.setProperty('--bg', Math.max(0.2, 1 - Math.abs(dy) / (vh() * 0.6))); g.hist.push([performance.now(), dy]); }
    else {
      // за первым и последним фото листание упирается
      const edge = (idx === 0 && dx > 0) || (idx === list.length - 1 && dx < 0);
      tx = edge ? accRubber(dx, vw()) : dx;
      g.hist.push([performance.now(), dx]);
    }
    apply(false);
  }
  function up(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.pinch) {
      // один палец остался — продолжаем двигать от него, без скачка
      const rest = Array.from(pts.values())[0];
      g = rest ? { x: rest.x, y: rest.y, tx0: tx, ty0: ty, t: 0, mode: 'pan', hist: [] } : null;
      if (s < 1.02 || !rest) settle();
      return;
    }
    const moved = Math.hypot(e.clientX - g.x, e.clientY - g.y);
    const cur = g; g = null;
    if (moved < 8 && performance.now() - cur.t < 350) return tap(e.clientX, e.clientY, cur.mouse);
    if (cur.mode === 'y') {
      const v = accVelocity(cur.hist);
      if (Math.abs(ty + accProject(v)) > vh() * 0.25) return close();
      ty = 0; view.style.setProperty('--bg', 1); return apply(true);
    }
    if (cur.mode === 'x') {
      const v = accVelocity(cur.hist), end = tx + accProject(v);
      if (end < -vw() * 0.2) return go(idx + 1, -1);
      if (end > vw() * 0.2) return go(idx - 1, 1);
      tx = 0; return apply(true);
    }
    if (cur.mode === 'pan') {
      // отпущенное фото проезжает ещё немного по инерции
      const h = cur.hist; const vx = accVelocity(h.map(([t, x]) => [t, x])), vy = accVelocity(h.map(([t, , y]) => [t, y]));
      tx += accProject(vx) * 0.35; ty += accProject(vy) * 0.35;
      settle();
    }
  }
  function tap(x, y, mouse) {
    if (mouse) return zoomAt(x, y, s > 1.02 ? 1 : 2.5);
    const now = performance.now();
    if (lastTap && now - lastTap.t < 300 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30) {
      lastTap = null;
      return zoomAt(x, y, s > 1.02 ? 1 : 2.5);
    }
    lastTap = { t: now, x, y };
  }
  // мышь: приближенное фото показывает ту часть, над которой курсор
  function hoverPan(e) {
    if (e.pointerType !== 'mouse' || s <= 1.02 || pts.size) return;
    const b = bound(s);
    tx = -(e.clientX / vw() - 0.5) * 2 * b.x;
    ty = -(e.clientY / vh() - 0.5) * 2 * b.y;
    img.style.transition = `transform .5s ${EASE}`;
    img.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
  }

  document.addEventListener('click', e => {
    const im = e.target.closest && e.target.closest(SEL);
    if (im) { e.preventDefault(); open(im); }
  });
  // поверх окна вещи: Esc закрывает только фото, стрелки листают фото
  addEventListener('keydown', e => {
    if (!view || !view.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(idx - 1, 1);
    else if (e.key === 'ArrowRight') go(idx + 1, -1);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
})();

/* ── «В корзину»: фото вещи улетает в значок корзины, значок подпрыгивает ── */
(function () {
  if (typeof ACC === 'undefined') return; // ACC объявлен через const — в window его нет
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // фото, которое сейчас видно в окне вещи (в галерее — то, на котором остановились)
  const shown = () => {
    let best = null, area = 0;
    document.querySelectorAll('.modal-overlay.open [data-morph] img:not(.hover-alt)').forEach(im => {
      // считаем по рамке галереи: соседние слайды за её краем не видны
      const r = im.getBoundingClientRect(), f = im.closest('[data-morph]').getBoundingClientRect();
      const w = Math.min(r.right, f.right, innerWidth) - Math.max(r.left, f.left, 0), h = Math.min(r.bottom, f.bottom, innerHeight) - Math.max(r.top, f.top, 0);
      if (w > 0 && h > 0 && w * h > area) { area = w * h; best = im; }
    });
    return best;
  };
  const icon = () => Array.from(document.querySelectorAll('.cart-icon-btn')).find(el => el.offsetParent);
  function bump(target) {
    if (navigator.vibrate) navigator.vibrate(10);
    if (!target || reduce.matches) return;
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' });
    const badge = target.querySelector('.cbadge, .cart-badge');
    if (badge) badge.animate([{ transform: 'scale(.7)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
  }
  const add = ACC.add;
  ACC.add = function (item) {
    const src = shown(), target = icon();
    add.call(ACC, item);
    if (!src || !target || reduce.matches) return bump(target);
    const a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
    const side = Math.min(a.width, a.height);
    const ghost = new Image();
    ghost.src = src.currentSrc || src.src;
    ghost.alt = '';
    ghost.className = 'cart-ghost';
    Object.assign(ghost.style, { left: a.left + (a.width - side) / 2 + 'px', top: a.top + (a.height - side) / 2 + 'px', width: side + 'px', height: side + 'px' });
    document.body.appendChild(ghost);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const k = Math.max(20 / side, 0.04);
    ghost.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0.5 }
    ], { duration: 460, easing: 'cubic-bezier(.77,0,.175,1)' }).finished.then(() => { ghost.remove(); bump(target); }, () => ghost.remove());
  };
})();

/* ── Фото вещей проявляются из размытия, когда догрузились ── */
(function () {
  const SEL = '.product-card img, .lb-card img, .capsule-art, .mslide img, .modal-slide img, .modal-img, .drop-card img';
  const wait = im => {
    if (im.classList.contains('hover-alt') || !im.matches(SEL)) return;
    // первые фото страницы не прячем: от них считается скорость загрузки (LCP)
    if (im.getAttribute('fetchpriority') === 'high' || im.getAttribute('loading') === 'eager') return;
    if (im.complete && im.naturalWidth) return;
    if (!im.getAttribute('src') && !im.getAttribute('srcset')) return; // ещё ждёт своей очереди (data-src)
    im.classList.add('img-wait');
    clearTimeout(im._fade);
    im._fade = setTimeout(() => done(im), 6000); // на случай, если загрузка зависла
  };
  const done = im => {
    if (!im.classList.contains('img-wait')) return;
    clearTimeout(im._fade);
    im.classList.remove('img-wait');
    im.classList.add('img-in');
    setTimeout(() => im.classList.remove('img-in'), 500);
  };
  document.querySelectorAll('img').forEach(wait);
  document.addEventListener('load', e => { if (e.target.tagName === 'IMG') done(e.target); }, true);
  document.addEventListener('error', e => { if (e.target.tagName === 'IMG') done(e.target); }, true);
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'attributes') { if (m.target.tagName === 'IMG') wait(m.target); return; }
    m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.tagName === 'IMG') wait(n); else n.querySelectorAll && n.querySelectorAll('img').forEach(wait);
    });
  })).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset'] });
})();
