// Данные сайта (товары капсул и первый экран) в Vercel Blob.
// Каждое сохранение — новый файл site/<время>.json, последний и есть текущий; старые — история.
// Локально (vercel dev) всё пишется в dev/, чтобы не трогать боевые данные.
const { put, list, del } = require('@vercel/blob');
const SEED = require('../../data/seed.json');

const ROOT = process.env.VERCEL_ENV === 'production' ? '' : 'dev/';
const SITE = ROOT + 'site/';
const KEEP = 30;

async function versions() {
  const all = [];
  let cursor;
  do {
    const r = await list({ prefix: SITE, cursor, limit: 1000 });
    all.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  return all.sort((a, b) => b.pathname.localeCompare(a.pathname));
}

async function load() {
  const [last] = await versions();
  if (!last) return { data: SEED, version: null };
  const r = await fetch(last.url, { cache: 'no-store' });
  if (!r.ok) throw new Error('blob ' + r.status);
  const data = await r.json();
  // версии, сохранённые до появления лукбука в админке, его не содержат — берём исходный
  if (!data.lookbook) data.lookbook = SEED.lookbook;
  return { data, version: last.pathname };
}

async function save(data) {
  const name = SITE + String(Date.now()).padStart(15, '0') + '.json';
  const blob = await put(name, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 31536000,
  });
  const old = (await versions()).slice(KEEP).map(b => b.url);
  if (old.length) await del(old);
  return blob.pathname;
}

// Фото кладём парой под одним ключом: media/<ключ>.jpg и уменьшенная media/sm/<ключ>.jpg — страницы берут sm для карточек
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const mediaPath = (key, type, small) => ROOT + 'media/' + (small ? 'sm/' : '') + key + '.' + (EXT[type] || 'bin');

async function upload(key, type, body, small) {
  const blob = await put(mediaPath(key, type, small), body, { access: 'public', contentType: type, addRandomSuffix: false, cacheControlMaxAge: 31536000 });
  return blob.url;
}

module.exports = { load, save, versions, upload, mediaPath, SEED };
