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

  // ── Строки на пиксельном шрифте, где есть кириллица, — целиком Inter ──
  const CYR = /[А-Яа-яЁё]/, LAT = /[A-Za-z]/;
  const fixMixed = root => root.querySelectorAll('p, span, a, button, h2, h3, div').forEach(el => {
    if (el.children.length > 1 || el.classList.contains('mixed-script')) return;
    const t = el.textContent;
    if (!CYR.test(t) || !LAT.test(t)) return;
    if (!getComputedStyle(el).fontFamily.includes('PixelImpacted')) return;
    el.classList.add('mixed-script');
  });
  fixMixed(document);

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
