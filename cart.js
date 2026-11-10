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

  // ── Remove by uid; returns { item, index } so it can be restored ──
  remove(uid) {
    const cart  = ACC.get();
    const index = cart.findIndex(i => i.uid === uid);
    if (index < 0) return null;
    const [item] = cart.splice(index, 1);
    ACC.save(cart);
    return { item, index };
  },

  // ── Put a removed item back to its old place ──
  restore(item, index) {
    const cart = ACC.get();
    if (cart.some(i => i.uid === item.uid)) return;
    cart.splice(Math.min(Math.max(index, 0), cart.length), 0, item);
    ACC.save(cart);
  },

  // ── Update qty ──
  updateQty(uid, qty) {
    const cart = ACC.get().map(i => i.uid === uid ? { ...i, qty } : i);
    ACC.save(cart);
  },

  // ── Escape user text before it goes into HTML ──
  esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  },

  // ── Telegram contact: '' — пусто, null — не похоже на ник/ссылку/телефон,
  //    иначе приведённое значение (@username или номер) ──
  normalizeTelegram(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    const link = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/@?([^\/?#\s]+)\/?(?:[?#].*)?$/i);
    const phoneDigits = s.replace(/\D/g, '');
    if (!link && /^\+?[\d\s()\-]+$/.test(s)) {
      return phoneDigits.length >= 10 && phoneDigits.length <= 15 ? (s.trim().startsWith('+') ? '+' : '') + phoneDigits : null;
    }
    const user = link ? link[1] : s.replace(/^@/, '');
    return /^[A-Za-z0-9_]{5,32}$/.test(user) ? '@' + user : null;
  },

  // ── Total items count ──
  count() {
    return ACC.get().reduce((s, i) => s + (i.qty || 1), 0);
  },

  // ── Total price ──
  total() {
    return ACC.get().reduce((s, i) => s + (i.priceNum || 0) * (i.qty || 1), 0);
  },

  // ── Цена в долларах для английской версии. У старых позиций в корзине priceUsd нет —
  //    пересчитываем по курсу витрины капсул a1 и a3 (75 ₽ за $, до 5$) ──
  usd(item) {
    const m = String(item.priceUsd || '').match(/^(\d+)\$$/);
    if (m) return +m[1];
    return item.priceNum > 0 ? Math.max(5, Math.round(item.priceNum / 75 / 5) * 5) : 0;
  },
  totalUsd() {
    return ACC.get().reduce((s, i) => s + ACC.usd(i) * (i.qty || 1), 0);
  },
  // ── Цена позиции и итог: рубли, вторая цена — доллары (на обоих языках сайта) ──
  priceLabel(item) {
    const raw = String(item.price).replace(/&#8381;/g, '₽');
    const usd = ACC.usd(item);
    return usd ? `${raw} / ${usd}$` : raw;
  },
  totalLabel() {
    const t = ACC.total(), u = ACC.totalUsd();
    return t > 0 ? `${t.toLocaleString('ru-RU')} ₽ / ${u}$` : '';
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
    ACC._fbTimer = setTimeout(() => fb.classList.remove('show'), 3500); // хватает времени нажать «Открыть»
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
    // сообщение мастеру всегда на русском, даже из английской версии сайта
    const L = { head: 'Заказ с сайта accinthecloud', size: 'Размер', color: 'Пожелания по цвету/ткани', notes: 'Доп. пожелания', price: 'Цена', pcs: 'шт.', total: 'Итого: от', name: 'Имя', comment: 'Комментарий', refs: 'Референсы', later: 'фото пришлю в чате' };
    const cart = ACC.get();
    const items = cart.map((item, i) => {
      const line = [`${i+1}. ${item.name} (${item.capsule})`];
      if (item.size)  line.push(`   · ${L.size}: ${item.size}`);
      if (item.color) line.push(`   · ${L.color}: ${item.color}`);
      if (item.notes) line.push(`   · ${L.notes}: ${item.notes}`);
      // фото в чат по ссылке не передать — даём ссылки, Telegram сделает их кликабельными
      if (item.refs && item.refs.length) line.push(`   · ${L.refs}:\n` + item.refs.map(u => `     ${u}`).join('\n'));
      if (item.refsFailed) line.push(`   · ${L.refs}: ${item.refsFailed} ${L.later}`);
      line.push(`   · ${L.price}: ${ACC.priceLabel(item)} × ${item.qty || 1} ${L.pcs}`);
      return line.join('\n');
    }).join('\n\n');

    const total = ACC.totalLabel();
    return `${L.head}\n\n${items}\n\n` +
           `${total ? `${L.total} ${total}\n\n` : ''}` +
           `${L.name}: ${name}\nTelegram: ${telegram}` +
           `${comment ? `\n${L.comment}: ` + comment : ''}`;
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

  // ── Заявка в бота, когда клиент ушёл в Telegram: если он так и не нажмёт «Отправить»,
  //    мастер всё равно увидит заказ и сможет написать первым. keepalive — запрос доживёт,
  //    даже если страница сменилась на Telegram ──
  sendLead(text, telegram) {
    const lead = `🔔 Новая заявка: клиент открыл Telegram с готовым заказом.\n` +
                 `Если он не напишет — напиши первым: ${telegram}\n\n${text}`;
    const body = JSON.stringify({ text: lead });
    return fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .then(r => r.json().then(d => r.ok && d.ok === true, () => false))
      .catch(() => false);
  },

  // ── Заказ в базе (api/lead.js): «Оформить заказ» сохраняет его (draft), «Написать в Telegram» отмечает (sent).
  //    Мастер увидит клиента в админке, даже если тот так и не написал. Один id на оформление, живёт до отправки.
  //    true — сервер сохранил ──
  LEAD_KEY: 'acc_lead',
  saveLead(stage, { name, telegram, comment }) {
    let lead;
    try { lead = JSON.parse(sessionStorage.getItem(ACC.LEAD_KEY) || 'null'); } catch {}
    if (!lead || !/^[a-f0-9]{32}$/.test(lead.id)) {
      lead = { id: [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''), createdAt: Date.now() };
      try { sessionStorage.setItem(ACC.LEAD_KEY, JSON.stringify(lead)); } catch {}
    }
    const items = ACC.get().map(i => ({ name: i.name, capsule: i.capsule, size: i.size, color: i.color, notes: i.notes, price: ACC.priceLabel(i), qty: i.qty || 1, refs: i.refs || [] }));
    const body = JSON.stringify({ ...lead, stage, name, telegram, comment, consent: true, items, total: ACC.totalLabel(), lang: document.documentElement.lang === 'en' ? 'en' : 'ru' });
    if (stage === 'sent') try { sessionStorage.removeItem(ACC.LEAD_KEY); } catch {}
    return fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .then(r => r.ok, () => false);
  },

  // ── Фото-референсы со страницы «Индивидуальный пошив»: уменьшаем до JPEG и кладём на сервер (api/ref.js).
  //    У позиции в корзине остаются ссылки; что не загрузилось — считаем, клиент пришлёт в чате ──
  MAX_REFS: 5,
  async uploadRefs(files) {
    const res = await Promise.all(Array.from(files).slice(0, ACC.MAX_REFS).map(async f => {
      try {
        const r = await fetch('/api/ref', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: await ACC._shrink(f, 1600, 0.82) });
        const d = await r.json();
        return r.ok && d.url ? d.url : null;
      } catch { return null; }
    }));
    const urls = res.filter(Boolean);
    return { urls, failed: res.length - urls.length };
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
        c.toBlob(b => b ? resolve(b) : reject(new Error('jpeg')), 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  },

  // ── Fallback when the site can't deliver: open Telegram chat with the text ──
  CONTACT: 'accinthecloud',
  telegramLink(text) {
    return `https://t.me/${ACC.CONTACT}?text=${encodeURIComponent(text.slice(0, 3000))}`;
  },

  // ── Init: update badge on page load ──
  init() {
    document.addEventListener('DOMContentLoaded', () => ACC.updateBadge());
  }
};

ACC.init();
