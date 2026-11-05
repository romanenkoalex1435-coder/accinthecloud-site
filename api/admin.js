// API админки: вход по паролю, чтение и сохранение данных сайта, история версий, загрузка фото и видео.
// Пароль — переменная окружения ADMIN_PASSWORD в Vercel (ставится скриптом tools/set-admin.sh).
// Вход — подписанная cookie на 30 дней; смена пароля выкидывает всех.
// Пока пароль не задан, админка открыта всем (временно, на время показа механики).
const crypto = require('crypto');
const { load, save, versions, upload } = require('./_lib/store');

const COOKIE = 'acc_admin';
const DAYS = 30;
const MAX_UPLOAD = 4 * 1024 * 1024;
const TYPES = /^(image\/(jpeg|png|webp|avif)|video\/(mp4|webm|quicktime))$/;

const sign = (exp, key) => crypto.createHmac('sha256', key).update('admin:' + exp).digest('hex');

function authed(req) {
  const key = process.env.ADMIN_PASSWORD;
  if (!key) return true;
  const m = (req.headers.cookie || '').match(new RegExp(COOKIE + '=(\\d+)\\.([a-f0-9]{64})'));
  if (!key || !m || Number(m[1]) < Date.now()) return false;
  const want = Buffer.from(sign(m[1], key)), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function setCookie(res, value, maxAge) {
  const secure = process.env.VERCEL_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
}

// тело читаем сами (req.body не трогаем) — нужны и JSON, и сырые файлы
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_UPLOAD) { reject(new Error('too_big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Проверка формы данных: только то, что умеют показывать страницы
function clean(d) {
  const s = (v, n = 400) => String(v ?? '').slice(0, n);
  const num = v => Math.max(0, Math.min(10000000, Math.round(Number(v) || 0)));
  const url = v => { v = s(v, 600); return /^(https:\/\/|images\/|[a-z0-9-]+\.html|\?)/i.test(v) || v === '' ? v : ''; };
  const h = d.hero || {}, dr = h.drop || {};
  const out = {
    hero: { mode: h.mode === 'drop' ? 'drop' : 'mark', drop: {
      title: s(dr.title, 80), subtitle: s(dr.subtitle, 200), media: url(dr.media),
      mediaType: dr.mediaType === 'video' ? 'video' : 'image',
      startAt: s(dr.startAt, 40), endAt: s(dr.endAt, 40), countdown: !!dr.countdown,
      ctaBefore: s(dr.ctaBefore, 40), ctaBeforeHref: url(dr.ctaBeforeHref),
      ctaLabel: s(dr.ctaLabel, 40), ctaHref: url(dr.ctaHref),
    } },
    capsules: {},
  };
  for (const c of ['a1', 'a2', 'a3']) {
    const cap = (d.capsules || {})[c] || {};
    const seen = new Set();
    out.capsules[c] = { title: s(cap.title, 60), items: (cap.items || []).slice(0, 60).map(i => {
      let id = s(i.id, 60).replace(/[^a-z0-9-]/gi, '').toLowerCase() || c + '-item';
      while (seen.has(id)) id += '-2';
      seen.add(id);
      return {
        id, name: s(i.name, 60), kind: ['item', 'classic', 'unique'].includes(i.kind) ? i.kind : 'item',
        typeLabel: s(i.typeLabel, 60), priceNum: num(i.priceNum), usd: num(i.usd),
        specs: s(i.specs), temp: s(i.temp), desc: s(i.desc, 1200),
        status: ['order', 'sold', 'hidden'].includes(i.status) ? i.status : 'order',
        images: (i.images || []).slice(0, 12).map(url).filter(Boolean),
      };
    }) };
  }
  return out;
}

module.exports = async (req, res) => {
  const a = (req.query && req.query.a) || '';
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (a === 'login' && req.method === 'POST') {
      const key = process.env.ADMIN_PASSWORD;
      if (!key) return res.json({ ok: true });
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const given = Buffer.from(String(body.password || '')), want = Buffer.from(key);
      if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
        await new Promise(r => setTimeout(r, 800));
        return res.status(401).json({ ok: false, error: 'wrong' });
      }
      const exp = Date.now() + DAYS * 864e5;
      setCookie(res, exp + '.' + sign(exp, key), DAYS * 86400);
      return res.json({ ok: true });
    }
    if (a === 'logout') { setCookie(res, '', 0); return res.json({ ok: true }); }
    if (!authed(req)) return res.status(401).json({ ok: false, error: 'auth' });

    if (a === 'data' && req.method === 'GET') {
      const { data, version } = await load();
      return res.json({ ok: true, data, version });
    }
    if (a === 'save' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const cur = await load();
      // конфликт — только если после открытия админки кто-то опубликовал более новую версию
      // (список в Blob обновляется с задержкой, поэтому «моя версия новее списка» — не конфликт)
      if (!body.force && cur.version && (!body.version || cur.version > body.version)) return res.status(409).json({ ok: false, error: 'conflict' });
      const version = await save(clean(body.data || {}));
      return res.json({ ok: true, version });
    }
    if (a === 'history' && req.method === 'GET') {
      const list = (await versions()).map(b => ({ version: b.pathname, url: b.url, at: b.uploadedAt }));
      return res.json({ ok: true, list });
    }
    if (a === 'restore' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const v = (await versions()).find(b => b.pathname === body.version);
      if (!v) return res.status(404).json({ ok: false, error: 'not_found' });
      const data = await (await fetch(v.url, { cache: 'no-store' })).json();
      return res.json({ ok: true, version: await save(clean(data)) });
    }
    if (a === 'upload' && req.method === 'POST') {
      const type = String(req.headers['content-type'] || '').split(';')[0];
      if (!TYPES.test(type)) return res.status(415).json({ ok: false, error: 'type' });
      const body = await readBody(req);
      if (!body.length) return res.status(400).json({ ok: false, error: 'empty' });
      const url = await upload(decodeURIComponent(req.headers['x-filename'] || 'file'), type, body);
      return res.json({ ok: true, url });
    }
    return res.status(404).json({ ok: false, error: 'unknown' });
  } catch (e) {
    const big = e.message === 'too_big';
    return res.status(big ? 413 : 500).json({ ok: false, error: big ? 'too_big' : 'server' });
  }
};
