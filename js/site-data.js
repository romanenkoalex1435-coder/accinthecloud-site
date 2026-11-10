// Данные из админки → формат, который понимают страницы капсул, лукбук, дроп и первый экран.
// Источник — window.ACC_SITE_RAW от /api/site. В предпросмотре (?preview=1) — черновик админки из localStorage.
// Если данных нет (нет сети, локальный сервер без API), страницы берут свои встроенные массивы.
// В английском режиме берём английский вариант текста из админки; пустой — остаётся русский, его переводит словарь i18n.
(function () {
  let raw = window.ACC_SITE_RAW || null;
  try {
    if (/[?&]preview=1\b/.test(location.search)) raw = JSON.parse(localStorage.getItem('acc_preview') || 'null') || raw;
  } catch (e) {}

  const EN = window.ACC_LANG === 'en';
  const t = (o, k) => (EN && o.en && o.en[k]) || o[k] || '';
  const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const src = u => /^https?:/.test(u) ? u : encodeURI(u);
  // уменьшенная копия фото: у своих файлов — папка sm/ рядом, у загруженных из админки — media/sm/
  const sm = u => /^https?:/.test(u)
    ? u.replace(/\/media\/(?!sm\/)([^/]+\.(jpg|jpeg|png|webp|avif))$/i, '/media/sm/$1')
    : u.replace(/\/([^/]+)\.jpe?g$/i, '/sm/$1.jpeg');

  function products(c) {
    const cap = raw && raw.capsules && raw.capsules[c];
    if (!cap || !Array.isArray(cap.items)) return null;
    return cap.items.filter(i => i.status !== 'hidden').map(i => {
      const sold = i.status === 'sold';
      const images = (i.images || []).map(src);
      return {
        id: i.id, type: i.kind, name: t(i, 'name'), typeLabel: t(i, 'typeLabel'),
        price: i.priceNum ? money(i.priceNum) + ' ₽' : (sold ? '—' : 'По запросу'),
        priceUsd: i.usd ? i.usd + '$' : (sold ? '—' : ''),
        priceNum: i.priceNum || 0,
        specs: t(i, 'specs'), temp: t(i, 'temp'), desc: t(i, 'desc'),
        sold, images, img: images[0] || '',
      };
    });
  }

  function lookbook() {
    const lb = raw && raw.lookbook;
    if (!lb || !Array.isArray(lb.items)) return null;
    return lb.items.filter(i => i.status !== 'hidden' && (i.images || []).length).map(i => ({
      id: i.id, num: i.num, name: t(i, 'name'), cat: i.cat, special: !!i.special, desc: t(i, 'desc'),
      images: i.images.map(src), photos: i.images.length,
    }));
  }

  // дроп с текстами на нужном языке
  function dropData() {
    const d = raw && raw.hero && raw.hero.drop;
    if (!d) return null;
    const out = { ...d };
    ['title', 'subtitle', 'kicker', 'ctaBefore', 'ctaLabel'].forEach(k => { out[k] = t(d, k); });
    out.models = (d.models || []).map(m => ({ name: t(m, 'name'), image: src(m.image) }));
    return out;
  }

  // Дроп на первом экране: только если включён и ещё не закончился
  function drop() {
    const h = raw && raw.hero;
    if (!h || h.mode !== 'drop' || !h.drop || !h.drop.title) return null;
    const end = Date.parse(h.drop.endAt);
    return !isNaN(end) && Date.now() > end ? null : dropData();
  }

  // Капсулы по порядку: a1–a3 со своими страницами, новые из админки — на общей capsule.html?c=…
  const BUILTIN = ['a1', 'a2', 'a3'];
  const capHref = c => BUILTIN.includes(c) ? `collection-${c}.html` : `capsule.html?c=${c}`;
  function capsule(c) {
    const cap = raw && raw.capsules && raw.capsules[c];
    if (!cap) return null;
    return { key: c, href: capHref(c), builtin: BUILTIN.includes(c), hidden: !!cap.hidden,
      title: cap.title || `Капсула ${c}${cap.name ? ' · ' + cap.name : ''}`, name: t(cap, 'name'), sub: t(cap, 'sub'), cover: cap.cover ? src(cap.cover) : '' };
  }
  const capsules = () => raw && raw.capsules ? Object.keys(raw.capsules).map(capsule) : null;

  // Баннеры на главной: место — под первым экраном (top) или под капсулами (mid)
  const banners = place => (raw && Array.isArray(raw.banners) ? raw.banners : [])
    .filter(b => !b.hidden && b.image && (b.place || 'top') === place)
    .map(b => ({ id: b.id, image: src(b.image), imageMobile: b.imageMobile ? src(b.imageMobile) : '',
      title: t(b, 'title'), text: t(b, 'text'), cta: t(b, 'cta'), href: b.href || '', size: b.size === 'half' ? 'half' : 'wide' }));

  window.ACC_SITE = { raw, products, lookbook, drop, dropPage: dropData, sm, capsule, capsules, capHref, banners };
})();
