// Собирает data/seed.json из массивов PRODUCTS на страницах капсул — один раз, при переходе на админку.
import fs from 'node:fs'; import vm from 'node:vm';
const CAPS = { a1: 'Капсула a1 · Access', a2: 'Капсула a2 · Accept', a3: 'Капсула a3 · Accent' };
const out = { hero: { mode: 'mark', drop: { title: '', subtitle: '', media: '', mediaType: 'image', startAt: '', endAt: '', countdown: true,
  ctaBefore: 'Подписаться на канал', ctaBeforeHref: 'https://t.me/accinthecloud1', ctaLabel: 'Смотреть', ctaHref: '' } }, capsules: {} };
for (const c of Object.keys(CAPS)) {
  const s = fs.readFileSync(`collection-${c}.html`, 'utf8');
  const helpers = (s.match(/function (enc|imgs)\([\s\S]*?\n}\n/g) || []).join('\n');
  const arr = s.match(/const PRODUCTS = (\[[\s\S]*?\n\]);/)[1];
  const list = vm.runInNewContext(`${helpers}\n(${arr})`);
  out.capsules[c] = { title: CAPS[c], items: list.map(p => ({
    id: p.id, name: p.name,
    kind: p.type === 'unique' || p.id.endsWith('-unique') ? 'unique' : p.type === 'classic' ? 'classic' : 'item',
    typeLabel: p.typeLabel || (c === 'a1' ? 'Сумка через плечо' : ''),
    priceNum: p.priceNum || 0, usd: parseInt(p.priceUsd) || 0,
    specs: p.specs || '', temp: p.temp || '', desc: p.desc || '',
    status: p.sold ? 'sold' : 'order',
    images: p.images ? p.images.map(decodeURI) : (p.img ? [p.img] : []),
  })) };
}
fs.writeFileSync('data/seed.json', JSON.stringify(out, null, 1));
console.log(Object.entries(out.capsules).map(([k, v]) => k + ':' + v.items.length).join(' '));
