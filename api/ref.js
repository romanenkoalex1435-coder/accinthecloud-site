// Фото-референс индивидуального заказа: страница order.html уменьшает снимок до JPEG и присылает сюда.
// Возвращаем публичную ссылку — она попадает в корзину, в текст заказа для Telegram и в заявку в админке.
// В сам чат Telegram сайт фото передать не может: ссылка на чат несёт только текст.
const { saveRef } = require('./_lib/store');

const MAX_BODY = 2 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  if (!/^image\/jpeg\b/.test(req.headers['content-type'] || '')) return res.status(415).json({ ok: false });
  try {
    const buf = Buffer.isBuffer(req.body) ? req.body : await readBody(req);
    if (buf.length > MAX_BODY) return res.status(413).json({ ok: false });
    // только настоящий JPEG: FF D8 FF в начале
    if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return res.status(400).json({ ok: false, error: 'bad' });
    return res.json({ ok: true, url: await saveRef(buf) });
  } catch (e) {
    return res.status(e.message === 'too_big' ? 413 : 500).json({ ok: false });
  }
};
