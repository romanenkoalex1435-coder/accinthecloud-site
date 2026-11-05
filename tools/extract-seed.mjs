// Собирает data/seed.json из массивов на страницах (капсулы, лукбук, дроп) — один раз, при переходе на админку.
// Английские варианты берутся из словаря js/i18n-en.json, чтобы в админке их было видно и можно было править.
import fs from 'node:fs'; import vm from 'node:vm';
const CAPS = { a1: 'Капсула a1 · Access', a2: 'Капсула a2 · Accept', a3: 'Капсула a3 · Accent' };
const DICT = JSON.parse(fs.readFileSync('js/i18n-en.json', 'utf8'));
const EN = v => { const k = String(v || '').trim(); return !/[А-Яа-яЁё]/.test(k) ? '' : DICT[k] || DICT[k.replace(/\s+/g, ' ')] || ''; };
const enOf = (o, keys) => Object.fromEntries(keys.map(k => [k, EN(o[k])]));
const out = { hero: { mode: 'mark', drop: {
  title: 'WINTER JACKETS', kicker: 'New drop · Winter',
  subtitle: 'Семь курток на зиму. Выбери модель и забронируй место на пошив — сошью по твоим меркам.',
  media: '', mediaType: 'image', startAt: '', endAt: '', countdown: true,
  ctaBefore: 'Подписаться на канал', ctaBeforeHref: 'https://t.me/accinthecloud1', ctaLabel: 'Смотреть', ctaHref: '',
  voteHref: 'https://t.me/accinthecloud1/1214',
  models: Array.from({ length: 7 }, (_, i) => ({ name: `Куртка №${i + 1}`, image: `images/drop/winter-${i + 1}.jpg`, en: { name: `Jacket No. ${i + 1}` } })),
} }, capsules: {}, lookbook: { items: [] } };
out.hero.drop.en = { ...enOf(out.hero.drop, ['title', 'subtitle', 'kicker', 'ctaBefore', 'ctaLabel']), ctaLabel: 'View' };
for (const c of Object.keys(CAPS)) {
  const s = fs.readFileSync(`collection-${c}.html`, 'utf8');
  const helpers = (s.match(/function (enc|imgs)\([\s\S]*?\n}\n/g) || []).join('\n');
  const arr = s.match(/const PRODUCTS = (?:ACC_SITE\.products\('a\d'\) \|\| )?(\[[\s\S]*?\n\]);/)[1];
  const list = vm.runInNewContext(`${helpers}\n(${arr})`);
  out.capsules[c] = { title: CAPS[c], items: list.map(p => ({
    id: p.id, name: p.name,
    kind: p.type === 'unique' || p.id.endsWith('-unique') ? 'unique' : p.type === 'classic' ? 'classic' : 'item',
    typeLabel: p.typeLabel || (c === 'a1' ? 'Сумка через плечо' : ''),
    priceNum: p.priceNum || 0, usd: parseInt(p.priceUsd) || 0,
    specs: p.specs || '', temp: p.temp || '', desc: p.desc || '',
    status: p.sold ? 'sold' : 'order',
    images: p.images ? p.images.map(decodeURI) : (p.img ? [p.img] : []),
    en: enOf({ ...p, typeLabel: p.typeLabel || (c === 'a1' ? 'Сумка через плечо' : '') }, ['name', 'typeLabel', 'specs', 'temp', 'desc']),
  })) };
}
{
  const s = fs.readFileSync('lookbook.html', 'utf8');
  const list = vm.runInNewContext('(' + s.match(/const ITEMS = (?:ACC_SITE\.lookbook\(\) \|\| )?(\[[\s\S]*?\n\])(?:\.map|;)/)[1] + ')');
  out.lookbook.items = list.map(i => ({
    id: i.id, num: i.num, name: i.name, cat: i.cat, special: !!i.special, desc: i.desc || '', status: 'order',
    images: Array.from({ length: i.photos }, (_, n) => `images/lookbook/${i.folder}/${String(n + 1).padStart(2, '0')}.jpeg`),
    en: enOf(i, ['name', 'desc']),
  }));
}
fs.writeFileSync('data/seed.json', JSON.stringify(out, null, 1));
console.log(Object.entries(out.capsules).map(([k, v]) => k + ':' + v.items.length).join(' '), 'lookbook:' + out.lookbook.items.length);
