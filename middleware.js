// Превью ссылки на вещь. Telegram, Instagram и мессенджеры не запускают JS страницы,
// поэтому для ссылок ?item= отдаём ту же страницу, но с названием, ценой и фото вещи в мета-тегах.
// Данные — js/og-items.json (собирает tools/og-items.py), вшиваются в middleware при сборке.
import ITEMS from './js/og-items.json' with { type: 'json' };

export const config = {
  matcher: ['/collection-a1.html', '/collection-a2.html', '/collection-a3.html', '/lookbook.html']
};

const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export default async function middleware(req) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('item');
  if (!slug) return;
  const page = url.pathname.slice(1).replace(/\.html$/, '');
  try {
    const it = ITEMS[page] && ITEMS[page][slug];
    if (!it) return;
    // доступ пробных версий (вход Vercel) передаём дальше, на открытом сайте заголовков нет
    const headers = {};
    for (const h of ['cookie', 'authorization', 'x-vercel-protection-bypass']) {
      const v = req.headers.get(h);
      if (v) headers[h] = v;
    }
    const res = await fetch(new URL(url.pathname, url), { headers });
    if (!res.ok) return;
    let html = await res.text();
    const title = `${it.name} — accinthecloud`;
    const desc = [it.price, it.desc].filter(Boolean).join(' · ');
    const set = (re, val) => { html = html.replace(re, (m, a, b) => a + attr(val) + b); };
    set(/(<title>)[^<]*(<\/title>)/, title);
    set(/(<meta name="description" content=")[^"]*(")/, desc);
    set(/(<meta property="og:title" content=")[^"]*(")/, title);
    set(/(<meta property="og:description" content=")[^"]*(")/, desc);
    set(/(<meta property="og:url" content=")[^"]*(")/, url.href);
    set(/(<meta property="og:image" content=")[^"]*(")/, new URL(it.img, url).href);
    html = html.replace(/\s*<meta property="og:image:(width|height)"[^>]*>/g, '');
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=0, s-maxage=3600',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin'
      }
    });
  } catch (e) {
    return; // что-то не так — обычная страница
  }
}
