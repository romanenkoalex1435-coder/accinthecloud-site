// Текущие данные сайта для страниц: <script src="/api/site"></script> кладёт их в window.ACC_SITE_RAW.
// Ответ держит CDN Vercel несколько секунд — сохранение в админке видно почти сразу.
const { load, SEED } = require('./_lib/store');

module.exports = async (req, res) => {
  let data;
  try { data = (await load()).data; } catch (e) { data = SEED; }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=600');
  res.status(200).send('window.ACC_SITE_RAW=' + JSON.stringify(data).replace(/</g, '\\u003c') + ';');
};
