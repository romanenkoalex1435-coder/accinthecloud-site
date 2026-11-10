// Заказы из корзины: клиент нажал «Оформить заказ» (stage: draft — заказ сохранён),
// и ещё раз — когда нажал «Написать в Telegram» (stage: sent).
// Так у мастера остаётся база тех, кто дошёл до заказа, но не написал. Смотреть — в админке, вкладка «Заявки».
const { saveLead } = require('./_lib/store');

const ID = /^[a-f0-9]{32}$/;
const TG = /^(@[A-Za-z0-9_]{5,32}|\+?[0-9 ()-]{7,20}|https:\/\/t\.me\/[A-Za-z0-9_+]{3,64})$/;
const MAX_BODY = 64 * 1024;
// ссылки на фото-референсы — только наши, из api/ref.js
const REF = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/(dev\/)?refs\/[\w\/.-]{1,120}\.jpg$/i;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  try {
    const raw = req.body && typeof req.body === 'object' ? req.body : JSON.parse(typeof req.body === 'string' ? req.body : await readBody(req) || '{}');
    const s = (v, n) => String(v ?? '').trim().slice(0, n);
    const id = s(raw.id, 32), telegram = s(raw.telegram, 80), name = s(raw.name, 80);
    if (!ID.test(id) || !TG.test(telegram) || !name || raw.consent !== true) return res.status(400).json({ ok: false, error: 'bad' });
    const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 30).map(i => ({
      name: s(i.name, 80), capsule: s(i.capsule, 40), size: s(i.size, 40), color: s(i.color, 120), notes: s(i.notes, 300),
      price: s(i.price, 40), qty: Math.max(1, Math.min(99, Math.round(Number(i.qty) || 1))),
      refs: (Array.isArray(i.refs) ? i.refs : []).filter(u => typeof u === 'string' && REF.test(u)).slice(0, 5),
    }));
    if (!items.length) return res.status(400).json({ ok: false, error: 'empty' });
    const now = Date.now();
    await saveLead(id, {
      stage: raw.stage === 'sent' ? 'sent' : 'draft', name, telegram, comment: s(raw.comment, 1000),
      items, total: s(raw.total, 40), lang: raw.lang === 'en' ? 'en' : 'ru',
      createdAt: Math.min(now, Math.max(now - 30 * 864e5, Number(raw.createdAt) || now)), updatedAt: now,
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.message === 'too_big' ? 413 : 500).json({ ok: false });
  }
};
