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
    const count  = ACC.count();
    document.querySelectorAll('.cart-badge').forEach(b => {
      b.textContent = count;
      b.style.display = count > 0 ? 'flex' : 'none';
    });
    document.querySelectorAll('.cbadge').forEach(b => {
      b.textContent = count;
      b.classList.toggle('show', count > 0);
    });
    document.dispatchEvent(new Event('acc:update'));
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

  // ── Format cart items as plain-text order message ──
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
    return `Заказ с сайта accinthecloud\n\n${items}\n\n` +
           `${total > 0 ? `Итого: от ${total.toLocaleString('ru-RU')} ₽\n\n` : ''}` +
           `Имя: ${name}\nTelegram: ${telegram}` +
           `${comment ? '\nКомментарий: ' + comment : ''}`;
  },

  // ── Send order via /api/order; true only if it reached Telegram ──
  async sendOrder(text, photos) {
    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, photos: photos || [] })
      });
      const data = await res.json().catch(() => ({}));
      return res.ok && data.ok === true;
    } catch {
      return false;
    }
  },

  // ── Reference photos from order.html (shrunk, kept until the order is sent) ──
  PHOTOS_KEY: 'acc_photos',
  getPhotos() {
    try { return JSON.parse(localStorage.getItem(ACC.PHOTOS_KEY) || '[]'); }
    catch { return []; }
  },
  async savePhotos(files) {
    const out = [];
    for (const f of Array.from(files).slice(0, 5)) {
      try { out.push(await ACC._shrink(f, 1280, 0.8)); } catch {}
    }
    try { localStorage.setItem(ACC.PHOTOS_KEY, JSON.stringify(out)); }
    catch { localStorage.removeItem(ACC.PHOTOS_KEY); return []; }
    return out;
  },
  _shrink(file, max, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  },

  // ── Fallback when the site can't deliver: open Telegram chat with the text ──
  CONTACT: 'accinthecloud',
  telegramLink(text) {
    return `https://t.me/${ACC.CONTACT}?text=${encodeURIComponent(text.slice(0, 2000))}`;
  },

  // ── Init: update badge on page load ──
  init() {
    document.addEventListener('DOMContentLoaded', () => ACC.updateBadge());
  }
};

ACC.init();
