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

// Незавершённые заказы: клиент заполнил форму корзины и дал согласие, но мог не нажать «Отправить заказ в Telegram».
// Один файл на оформление leads/<id>.json; id — 128 случайных бит от браузера, адрес не угадать.
// Хранятся 90 дней, старые удаляются при открытии списка в админке.
const LEADS = ROOT + 'leads/';
const LEAD_DAYS = 90;

async function saveLead(id, lead) {
  await put(LEADS + id + '.json', JSON.stringify(lead), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
  });
}

async function listLeads() {
  const all = [];
  let cursor;
  do {
    const r = await list({ prefix: LEADS, cursor, limit: 1000 });
    all.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  const old = all.filter(b => Date.now() - new Date(b.uploadedAt) > LEAD_DAYS * 864e5);
  if (old.length) await del(old.map(b => b.url));
  await dropOldRefs();
  const fresh = all.filter(b => !old.includes(b));
  const leads = await Promise.all(fresh.map(b => fetch(b.url + '?t=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null).then(l => l && { ...l, id: b.pathname.slice(LEADS.length, -5) }).catch(() => null)));
  return leads.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function deleteLead(id) {
  const r = await list({ prefix: LEADS + id + '.json', limit: 1 });
  if (r.blobs.length) await del(r.blobs[0].url);
}

// Фото-референсы индивидуального заказа: клиент прикрепил их на странице «Индивидуальный пошив».
// refs/<месяц>/ref-<случайный хвост>.jpg — ссылка уходит в текст заказа и в заявку; живут столько же, сколько заявки.
const REFS = ROOT + 'refs/';

async function saveRef(buf) {
  const blob = await put(REFS + new Date().toISOString().slice(0, 7) + '/ref.jpg', buf, {
    access: 'public', contentType: 'image/jpeg', addRandomSuffix: true, cacheControlMaxAge: 31536000,
  });
  return blob.url;
}

async function dropOldRefs() {
  const old = [];
  let cursor;
  do {
    const r = await list({ prefix: REFS, cursor, limit: 1000 });
    old.push(...r.blobs.filter(b => Date.now() - new Date(b.uploadedAt) > LEAD_DAYS * 864e5).map(b => b.url));
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  if (old.length) await del(old);
}

module.exports = { load, save, versions, upload, mediaPath, SEED, saveLead, listLeads, deleteLead, saveRef };
