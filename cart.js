/* ═══════════════════════════════════════════════
   accinthecloud — Cart Logic (cart.js)
   Подключать на всех страницах после <body>
═══════════════════════════════════════════════ */

const ACC = {

  // ── Storage key ──
  KEY: 'acc_cart',
  ORDERS_KEY: 'acc_orders',

  // ── Get cart array ──
  get() {
    try { return JSON.parse(localStorage.getItem(ACC.KEY) || '[]'); }
    catch { return []; }
  },

  // ── Save cart ──
  save(cart) {
    localStorage.setItem(ACC.KEY, JSON.stringify(cart));
    ACC.updateBadge();
  },

  // ── Add item ──
  add(item) {
    // item: { id, capsule, name, price, priceNum, size, color, notes, qty }
    const cart = ACC.get();
    const uid  = Date.now() + '-' + Math.random().toString(36).slice(2,7);
    cart.push({ ...item, uid, addedAt: new Date().toISOString() });
    ACC.save(cart);
    ACC.showAddedFeedback();
  },

  // ── Remove by uid ──
  remove(uid) {
    const cart = ACC.get().filter(i => i.uid !== uid);
    ACC.save(cart);
  },

  // ── Update qty ──
  updateQty(uid, qty) {
    const cart = ACC.get().map(i => i.uid === uid ? { ...i, qty } : i);
    ACC.save(cart);
  },

  // ── Total items count ──
  count() {
    return ACC.get().reduce((s, i) => s + (i.qty || 1), 0);
  },

  // ── Total price ──
  total() {
    return ACC.get().reduce((s, i) => s + (i.priceNum || 0) * (i.qty || 1), 0);
  },

  // ── Clear cart ──
  clear() {
    localStorage.removeItem(ACC.KEY);
    ACC.updateBadge();
  },

  // ── Update nav badge ──
  updateBadge() {
    const badges = document.querySelectorAll('.cart-badge');
    const count  = ACC.count();
    badges.forEach(b => {
      b.textContent = count;
      b.style.display = count > 0 ? 'flex' : 'none';
    });
  },

  // ── Brief "added" feedback animation ──
  showAddedFeedback() {
    const fb = document.getElementById('cartFeedback');
    if (!fb) return;
    fb.classList.add('show');
    clearTimeout(ACC._fbTimer);
    ACC._fbTimer = setTimeout(() => fb.classList.remove('show'), 2000);
  },

  // ── Save completed order to localStorage ──
  saveOrder(orderData) {
    const orders = JSON.parse(localStorage.getItem(ACC.ORDERS_KEY) || '[]');
    orders.unshift({
      ...orderData,
      ts: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
    });
    localStorage.setItem(ACC.ORDERS_KEY, JSON.stringify(orders));
  },

  // ── Format cart items as Telegram message text ──
  formatTelegramMessage(name, telegram, comment) {
    const cart = ACC.get();
    const items = cart.map((item, i) => {
      const line = [`${i+1}. ${item.name} (${item.capsule})`];
      if (item.size)  line.push(`   · Размер: ${item.size}`);
      if (item.color) line.push(`   · Пожелания по цвету/ткани: ${item.color}`);
      if (item.notes) line.push(`   · Доп. пожелания: ${item.notes}`);
      line.push(`   · Цена: ${item.price} × ${item.qty || 1} шт.`);
      return line.join('\n');
    }).join('\n\n');

    const total = ACC.total();
    return `🛒 <b>Заказ из корзины — accinthecloud</b>\n\n${items}\n\n` +
           `${total > 0 ? `💰 Итого: от ${total.toLocaleString('ru-RU')} ₽\n\n` : ''}` +
           `👤 Имя: ${name}\n✈️ Telegram: ${telegram}` +
           `${comment ? '\n💬 Комментарий: ' + comment : ''}`;
  },

  // ── Init: update badge on page load ──
  init() {
    document.addEventListener('DOMContentLoaded', () => ACC.updateBadge());
  }
};

ACC.init();
