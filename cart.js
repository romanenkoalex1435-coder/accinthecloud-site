/* ═══════════════════════════════════════════════
   accinthecloud — Cart Logic (cart.js)
   Подключать на всех страницах после <body>
═══════════════════════════════════════════════ */

const ACC = {

  // ── Storage key ──
  KEY: 'acc_cart',

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
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const count = ACC.count();
    badge.textContent = count;
    badge.classList.toggle('show', count > 0);
  },

  // ── Brief "added" feedback animation ──
  showAddedFeedback() {
    const fb = document.getElementById('cartFeedback');
    if (!fb) return;
    fb.classList.add('show');
    clearTimeout(ACC._fbTimer);
    ACC._fbTimer = setTimeout(() => fb.classList.remove('show'), 2000);
  },

  // ── Init: update badge on page load ──
  init() {
    document.addEventListener('DOMContentLoaded', () => ACC.updateBadge());
  }
};

ACC.init();
