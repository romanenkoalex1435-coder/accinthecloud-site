/* Согласие на cookie и Яндекс Метрика.
   Метрика загружается ТОЛЬКО после «Принять все» и только если ниже указан номер счётчика.
   Выбор хранится в localStorage (acc_consent: all | necessary). Повторно открыть плашку:
   accCookieSettings() — кнопка есть на странице политики конфиденциальности.
   Подключение: <script src="/js/consent.js?v=1" defer></script> на всех страницах, кроме админки. */
(function () {
  // предпросмотр в админке (?preview=1, во фрейме): ни плашки, ни Метрики — это не посетитель
  if (/[?&]preview=1\b/.test(location.search) || window.top !== window) return;
  // ← номер счётчика Яндекс Метрики (metrika.yandex.ru → Настройки → номер). Пусто — Метрика не грузится
  const METRIKA_ID = '';

  const KEY = 'acc_consent';
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const set = v => { try { localStorage.setItem(KEY, JSON.stringify({ v, at: new Date().toISOString() })); } catch (e) {} };

  let metrikaOn = false;
  function loadMetrika() {
    const id = Number(METRIKA_ID);
    if (!id || metrikaOn) return;
    metrikaOn = true;
    // официальный код счётчика Метрики, без изменений по сути
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }

  const css = `
.cc{position:fixed;z-index:9000;left:24px;bottom:24px;width:min(380px,calc(100vw - 32px));
  background:#fff;color:#0d0d0d;border:1px solid #0d0d0d;
  opacity:0;transform:translateY(12px);transition:opacity .24s cubic-bezier(.23,1,.32,1),transform .24s cubic-bezier(.23,1,.32,1)}
.cc.is-in{opacity:1;transform:none}
html.modal-open .cc{display:none}
.cc.is-out{opacity:0;transform:translateY(8px);transition-duration:.18s}
.cc-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:14px 16px 12px;border-bottom:1px solid #0d0d0d}
.cc-title{margin:0;font-family:var(--f-pixel,'PixelImpacted',sans-serif)!important;font-size:32px!important;font-weight:400;line-height:1!important;letter-spacing:0!important;color:#0d0d0d}
.cc-body{padding:14px 16px 16px}
.cc-text{margin:0 0 16px;font-family:var(--f-text,'Inter',sans-serif);font-size:13px;line-height:1.5;letter-spacing:0;color:#3a3a3a}
.cc-text a{color:#0d0d0d;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}
.cc-text a:hover{text-decoration-thickness:2px}
.cc-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cc-btn{min-height:44px;padding:0 12px;border:1px solid #0d0d0d;border-radius:0;cursor:pointer;
  font-family:var(--f-text,'Inter',sans-serif);font-size:12px;font-weight:400;letter-spacing:.06em;text-transform:uppercase;
  transition:background-color .2s ease,color .2s ease,transform .16s cubic-bezier(.23,1,.32,1)}
.cc-btn:active{transform:scale(.97)}
.cc-btn--ghost{background:#fff;color:#0d0d0d}
.cc-btn--solid{background:#0d0d0d;color:#fff}
@media (hover:hover){.cc-btn--ghost:hover{background:#0d0d0d;color:#fff}.cc-btn--solid:hover{background:#3a3a3a;border-color:#3a3a3a}}
.cc-btn:focus-visible{outline:2px solid #0d0d0d;outline-offset:2px}
@media (max-width:600px){.cc{left:16px;right:16px;bottom:16px;width:auto}}
@media (prefers-reduced-motion:reduce){.cc,.cc.is-in,.cc.is-out{transform:none}}
`;

  let box = null;
  function close(choice) {
    set(choice);
    if (choice === 'all') loadMetrika();
    if (!box) return;
    const b = box; box = null;
    b.classList.remove('is-in'); b.classList.add('is-out');
    setTimeout(() => b.remove(), 220);
  }

  function show() {
    if (box) return;
    if (!document.getElementById('cc-style')) {
      const st = document.createElement('style'); st.id = 'cc-style'; st.textContent = css; document.head.appendChild(st);
    }
    box = document.createElement('section');
    box.className = 'cc';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Согласие на cookie');
    box.innerHTML =
      '<div class="cc-head"><p class="cc-title">cookie</p></div>' +
      '<div class="cc-body">' +
        '<p class="cc-text">Мы используем cookie и Яндекс Метрику, чтобы понимать, какие вещи смотрят чаще, и делать сайт удобнее. ' +
        'Метрика включится, только если вы согласитесь. Подробнее — в <a href="/privacy">политике конфиденциальности</a></p>' +
        '<div class="cc-btns">' +
          '<button type="button" class="cc-btn cc-btn--ghost" data-c="necessary">Только нужные</button>' +
          '<button type="button" class="cc-btn cc-btn--solid" data-c="all">Принять все</button>' +
        '</div>' +
      '</div>';
    box.addEventListener('click', e => { const c = e.target.closest('[data-c]'); if (c) close(c.dataset.c); });
    // первым в body: в порядке Tab плашка стоит в начале страницы, а на экране остаётся внизу (position:fixed); фокус не забираем
    document.body.insertBefore(box, document.body.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => box && box.classList.add('is-in')));
  }

  window.accCookieSettings = show;

  function start() {
    const c = get();
    if (c && c.v === 'all') loadMetrika();
    else if (!c) setTimeout(show, 1200);   // не мешаем первому впечатлению — плашка выезжает чуть позже
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
