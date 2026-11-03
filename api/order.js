// Приём заказа с сайта → сообщение в Telegram.
// Токен и чат хранятся в переменных окружения Vercel, не в коде страниц:
//   TELEGRAM_BOT_TOKEN — токен от @BotFather
//   TELEGRAM_CHAT_ID   — куда слать (личный чат владельца или группа)

const MAX_TEXT = 3800;
const MAX_PHOTOS = 5;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const text = String(body.text || '').trim().slice(0, MAX_TEXT);
  if (!text) return res.status(400).json({ ok: false, error: 'empty' });

  const api = `https://api.telegram.org/bot${token}`;

  try {
    const msg = await fetch(`${api}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    }).then(r => r.json());
    if (!msg.ok) throw new Error(msg.description || 'sendMessage');

    const photos = (Array.isArray(body.photos) ? body.photos : [])
      .slice(0, MAX_PHOTOS)
      .map(p => /^data:image\/(jpeg|png|webp);base64,/.exec(p) && p)
      .filter(Boolean);

    if (photos.length) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('reply_to_message_id', String(msg.result.message_id));
      form.append('media', JSON.stringify(photos.map((_, i) => ({ type: 'photo', media: `attach://p${i}` }))));
      photos.forEach((p, i) => {
        const buf = Buffer.from(p.split(',')[1], 'base64');
        form.append(`p${i}`, new Blob([buf], { type: 'image/jpeg' }), `ref${i + 1}.jpg`);
      });
      // Фото — дополнение: если не ушли, заказ всё равно принят
      await fetch(`${api}/sendMediaGroup`, { method: 'POST', body: form }).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('order:', err.message);
    return res.status(502).json({ ok: false, error: 'telegram' });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
