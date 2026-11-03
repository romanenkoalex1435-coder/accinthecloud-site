"""Собирает js/og-items.json — названия, цены и первое фото вещей для превью ссылок
(middleware.js подставляет их, когда ссылку ?item= открывает Telegram, Instagram и т. п.).
Запуск при поднятом локальном сервере на 5181:  ~/Documents/proverka/.venv/bin/python tools/og-items.py"""
import json
from playwright.sync_api import sync_playwright

B = 'http://localhost:5181/'
GET = {
    'collection-a1': """PRODUCTS.filter(p => p.img).map(p => ({ slug: p.id.replace(/^a\\d-/, ''), name: p.name,
        price: [p.price, p.priceUsd].filter(Boolean).join(' / '), img: p.img }))""",
    'collection-a2': """PRODUCTS.filter(p => p.images && p.images.length).map(p => ({ slug: p.id.replace(/^a\\d-/, ''), name: p.name,
        price: p.sold ? 'Sold out' : [p.price, p.priceUsd].filter(x => x && x !== '—').join(' / '), img: p.images[0] }))""",
    'collection-a3': """PRODUCTS.filter(p => p.images && p.images.length).map(p => ({ slug: p.id.replace(/^a\\d-/, ''), name: p.name,
        price: [p.price, p.priceUsd].filter(Boolean).join(' / '), img: p.images[0] }))""",
    'lookbook': """ITEMS.map(it => ({ slug: it.id, name: it.name, price: 'Индивидуальный пошив',
        img: `images/lookbook/${it.folder}/01.jpeg`, desc: (it.desc || '').split('\\n')[0] }))""",
}
out = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    for page, js in GET.items():
        pg.goto(B + page + '.html')
        out[page] = {x.pop('slug'): x for x in pg.evaluate(js)}
    b.close()
json.dump(out, open('js/og-items.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print({k: len(v) for k, v in out.items()})
