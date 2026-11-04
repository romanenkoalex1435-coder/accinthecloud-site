/* Русский / English. Подключается в <head> обычным скриптом (без defer).
   Русский — исходный текст страниц. В английском режиме тексты подменяются по словарю
   js/i18n-en.json и шаблонам ниже; новые элементы (карточки, окна) переводятся на лету.
   Выбор хранится в localStorage; ?lang=en|ru в ссылке переключает сразу. */
(function () {
  const KEY = 'acc_lang';
  const html = document.documentElement;
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
                  set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} } };
  let lang = new URLSearchParams(location.search).get('lang');
  if (lang === 'en' || lang === 'ru') store.set(lang);
  else lang = store.get() || (/^(ru|uk|be|kk)\b/i.test(navigator.language || 'ru') ? 'ru' : 'en');
  window.ACC_LANG = lang;
  window.ACC_T = s => s;

  // Переключатель в шапке: перед корзиной или справа в простой шапке
  function addSwitch() {
    const nav = document.querySelector('nav');
    if (!nav || nav.querySelector('.lang-switch')) return;
    const box = document.createElement('div');
    box.className = 'lang-switch';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', lang === 'en' ? 'Language' : 'Язык');
    ['ru', 'en'].forEach(l => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = l.toUpperCase();
      b.setAttribute('aria-pressed', String(l === lang));
      b.lang = l;
      b.addEventListener('click', () => {
        if (l === lang) return;
        store.set(l);
        const u = new URL(location.href);
        u.searchParams.delete('lang');
        location.replace(u.href);
      });
      box.appendChild(b);
    });
    const cart = nav.querySelector('.cart-icon-btn');
    if (cart) cart.parentElement.insertBefore(box, cart);
    else { box.classList.add('lang-switch--end'); nav.insertBefore(box, nav.lastElementChild); }
  }

  if (lang !== 'en') { document.addEventListener('DOMContentLoaded', addSwitch); return; }

  html.lang = 'en';
  // прячем страницу, пока не переведена, — без мелькания русского
  const hide = document.createElement('style');
  hide.textContent = 'body{opacity:0!important}';
  document.head.appendChild(hide);
  const show = () => hide.remove();
  setTimeout(show, 2500);

  const plural = (n, one, many) => `${n} ${+n === 1 ? one : many}`;
  const RULES = [
    [/^Больше: (.+)$/, 'More: $1'],
    [/^Меньше: (.+)$/, 'Less: $1'],
    [/^Удалить: (.+)$/, 'Remove: $1'],
    [/^(.+) — подробнее$/, '$1 — details'],
    [/^(.+) — открыть$/, '$1 — open'],
    [/^(.+) — фото (\d+) из (\d+)$/, '$1 — photo $2 of $3'],
    [/^(.+) — фото (\d+)$/, '$1 — photo $2'],
    [/^Фото (\d+) из (\d+)$/, 'Photo $1 of $2'],
    [/^Сумка (.+)$/, '$1 bag'],
    [/^Зимняя куртка №(\d+)$/, 'Winter jacket No. $1'],
    [/^Куртка №(\d+)$/, 'Jacket No. $1'],
    [/^Забронировать №(\d+) в Telegram$/, 'Book No. $1 on Telegram'],
    [/^(\d+) позици(я|и|й)$/, (m, n) => plural(n, 'item', 'items')],
    [/^Размер: (.+)$/, 'Size: $1'],
    [/^Цвет\/ткань: (.+)$/, 'Colour/fabric: $1'],
    [/^Выбрано (\d+) фото: (.+)$/, (m, n, list) => `${plural(n, 'photo', 'photos')} selected: ${list}`],
    [/^Можно не больше (\d+) фото — выбрано (\d+), прикрепятся первые (\d+)$/, 'Up to $1 photos — you chose $2, the first $3 will be attached'],
    [/^Капсула (a\d) (\S+)$/, 'Capsule $1 $2'],
  ];
  const CYR = /[А-Яа-яЁё]/;
  let DICT = {};
  function tr(s) {
    if (!s || !CYR.test(s)) return null;
    const key = s.trim();
    let out = DICT[key];
    if (out === undefined) {
      const k1 = key.replace(/\s+/g, ' ');
      out = DICT[k1];
      if (out === undefined) {
        const r = RULES.find(([re]) => re.test(k1));
        if (!r) return null;
        out = k1.replace(r[0], r[1]);
        // имя внутри шаблона тоже может быть русским («Удалить: Своя идея»)
        out = out.replace(/[^:—]*[А-Яа-яЁё][^:—]*/g, part => (DICT[part.trim()] ? part.replace(part.trim(), DICT[part.trim()]) : part));
      }
    }
    return s.replace(key, out);
  }
  window.ACC_T = s => tr(s) || s;

  const ATTRS = ['alt', 'title', 'placeholder', 'aria-label', 'aria-roledescription'];
  function walk(root) {
    if (root.nodeType === 3) { const t = tr(root.nodeValue); if (t !== null && t !== root.nodeValue) root.nodeValue = t; return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(root.tagName)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement && n.parentElement.tagName)) continue;
      const t = tr(n.nodeValue);
      if (t !== null && t !== n.nodeValue) n.nodeValue = t;
    }
    const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[alt],[title],[placeholder],[aria-label],[aria-roledescription]')] : [];
    els.forEach(el => ATTRS.forEach(a => {
      const v = el.getAttribute && el.getAttribute(a);
      const t = v ? tr(v) : null;
      if (t && t !== v) el.setAttribute(a, t); // только если перевод есть — иначе наблюдатель зациклится
    }));
  }

  // ?v= поднимать вместе с i18n.js?v= в страницах при правке словаря: js/ браузер хранит неделю
  const dict = fetch('/js/i18n-en.json?v=5').then(r => r.json()).then(d => { DICT = d; }).catch(() => {});
  document.addEventListener('DOMContentLoaded', () => dict.then(() => {
    walk(document.documentElement);
    const t = tr(document.title); if (t) document.title = t;
    addSwitch();
    new MutationObserver(list => list.forEach(m => {
      if (m.type === 'characterData') walk(m.target);
      else if (m.type === 'attributes') walk(m.target);
      else m.addedNodes.forEach(walk);
    })).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    show();
  }));
})();
