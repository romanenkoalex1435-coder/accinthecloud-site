// Текущие данные сайта для страниц: <script src="/api/site"></script> кладёт их в window.ACC_SITE_RAW.
// Ответ держит CDN Vercel несколько секунд — сохранение в админке видно почти сразу.
const { load, SEED } = require('./_lib/store');

module.exports = async (req, res) => {
  let data, failed = false;
  try { data = (await load()).data; } catch (e) { data = SEED; failed = true; }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  // хранилище не ответило — запасные данные не кешируем, следующий посетитель спросит заново
  res.setHeader('Cache-Control', failed ? 'no-store' : 'public, max-age=0, s-maxage=30, stale-while-revalidate=600');
  res.status(200).send('window.ACC_SITE_RAW=' + JSON.stringify(data).replace(/</g, '\\u003c') + ';');
};
