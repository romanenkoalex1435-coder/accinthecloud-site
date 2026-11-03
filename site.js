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
    if (!box || box.getAttribute('role')) return; // лукбук настроен сам
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
