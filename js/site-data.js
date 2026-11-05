// Данные из админки → формат, который понимают страницы капсул и первый экран.
// Источник — window.ACC_SITE_RAW от /api/site. В предпросмотре (?preview=1) — черновик админки из localStorage.
// Если данных нет (нет сети, локальный сервер без API), страницы берут свои встроенные массивы.
(function () {
  let raw = window.ACC_SITE_RAW || null;
  try {
    if (/[?&]preview=1\b/.test(location.search)) raw = JSON.parse(localStorage.getItem('acc_preview') || 'null') || raw;
  } catch (e) {}

  const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const src = u => /^https?:/.test(u) ? u : encodeURI(u);

  function products(c) {
    const cap = raw && raw.capsules && raw.capsules[c];
    if (!cap || !Array.isArray(cap.items)) return null;
    return cap.items.filter(i => i.status !== 'hidden').map(i => {
      const sold = i.status === 'sold';
      const images = (i.images || []).map(src);
      return {
        id: i.id, type: i.kind, name: i.name, typeLabel: i.typeLabel || '',
        price: i.priceNum ? money(i.priceNum) + ' ₽' : (sold ? '—' : 'По запросу'),
        priceUsd: i.usd ? i.usd + '$' : (sold ? '—' : ''),
        priceNum: i.priceNum || 0,
        specs: i.specs || '', temp: i.temp || '', desc: i.desc || '',
        sold, images, img: images[0] || '',
      };
    });
  }

  // Дроп на первом экране: только если включён и ещё не закончился
  function drop() {
    const h = raw && raw.hero;
    if (!h || h.mode !== 'drop' || !h.drop || !h.drop.title) return null;
    const end = Date.parse(h.drop.endAt);
    return !isNaN(end) && Date.now() > end ? null : h.drop;
  }

  window.ACC_SITE = { raw, products, drop };
})();
