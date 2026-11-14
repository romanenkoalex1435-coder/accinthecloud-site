<?php
// API админки: вход по паролю, чтение и сохранение данных сайта, история версий, загрузка фото и видео, заявки.
// Пароль — в public_html/_data/config.php на хостинге (ставится скриптом tools/set-admin-host.sh), в коде его нет.
// Вход — подписанная cookie на 30 дней; смена пароля выкидывает всех. Без пароля админка закрыта.
define('ACC', 1);
require __DIR__ . '/_lib/store.php';

const COOKIE = 'acc_admin';
const DAYS = 30;
const MAX_IMAGE = 4 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;
const TYPES = '#^(image/(jpeg|png|webp|avif)|video/(mp4|webm|quicktime))$#';
const VIDEO = '#^video/(mp4|webm|quicktime)$#';
const KEY = '/^[a-z0-9][a-z0-9-]{7,79}$/';

function now_ms() { return (int)floor(microtime(true) * 1000); }
function sign($exp, $key) { return hash_hmac('sha256', 'admin:' . $exp, $key); }

function authed() {
  $key = cfg('admin_password');
  if (!$key) return false; // пока пароль не задан, админка закрыта целиком
  if (!preg_match('/^(\d+)\.([a-f0-9]{64})$/', $_COOKIE[COOKIE] ?? '', $m) || (int)$m[1] < now_ms()) return false;
  return hash_equals(sign($m[1], $key), $m[2]);
}

function set_cookie($value, $maxAge) {
  header('Set-Cookie: ' . COOKIE . "=$value; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=$maxAge; Secure");
}

// Проверка формы данных: только то, что умеют показывать страницы
function str($v, $n = 400) {
  $v = is_bool($v) ? ($v ? 'true' : 'false') : (is_scalar($v) ? (string)$v : '');
  // HTML в текстах не нужен: угловые скобки и прямые кавычки — типографские
  return str_replace(['<', '>', '"'], ['‹', '›', '”'], mb_substr($v, 0, $n));
}
function num($v) { return max(0, min(10000000, (int)round(is_numeric($v) ? (float)$v : 0))); }
function url($v) {
  $v = mb_substr(is_scalar($v) ? (string)$v : '', 0, 600);
  if (preg_match('/["\'<>\s`\\\\]/', $v)) return '';
  return $v === '' || preg_match('#^(https://|images/|media/|[a-z0-9-]+\.html|\?)#i', $v) ? $v : '';
}
function en($o, $keys) { $o = is_array($o) ? $o : []; $r = []; foreach ($keys as [$k, $n]) $r[$k] = str($o[$k] ?? '', $n); return $r; }
function arr($v) { return is_array($v) ? array_values($v) : []; }
function obj($v) { return is_array($v) ? $v : []; }
function ids($list, $prefix) {
  $seen = []; $out = [];
  foreach ($list as $i) {
    $id = strtolower(preg_replace('/[^a-z0-9-]/i', '', str(obj($i)['id'] ?? '', 60))) ?: $prefix . '-item';
    while (isset($seen[$id])) $id .= '-2';
    $seen[$id] = 1; $out[] = $id;
  }
  return $out;
}
function images($v) { return array_values(array_filter(array_map('url', array_slice(arr($v), 0, 12)), 'strlen')); }

function clean($d) {
  $d = obj($d);
  $h = obj($d['hero'] ?? null); $dr = obj($h['drop'] ?? null);
  $models = [];
  foreach (array_slice(arr($dr['models'] ?? null), 0, 12) as $m) {
    $m = obj($m);
    $x = ['name' => str($m['name'] ?? '', 60), 'image' => url($m['image'] ?? ''), 'en' => en($m['en'] ?? null, [['name', 60]])];
    if ($x['image'] !== '') $models[] = $x;
  }
  $out = [
    'hero' => ['mode' => ($h['mode'] ?? '') === 'drop' ? 'drop' : 'mark', 'drop' => [
      'title' => str($dr['title'] ?? '', 80), 'subtitle' => str($dr['subtitle'] ?? '', 200), 'kicker' => str($dr['kicker'] ?? '', 60),
      'media' => url($dr['media'] ?? ''), 'mediaType' => ($dr['mediaType'] ?? '') === 'video' ? 'video' : 'image',
      'startAt' => str($dr['startAt'] ?? '', 40), 'endAt' => str($dr['endAt'] ?? '', 40), 'countdown' => !empty($dr['countdown']),
      'ctaBefore' => str($dr['ctaBefore'] ?? '', 40), 'ctaBeforeHref' => url($dr['ctaBeforeHref'] ?? ''),
      'ctaLabel' => str($dr['ctaLabel'] ?? '', 40), 'ctaHref' => url($dr['ctaHref'] ?? ''), 'voteHref' => url($dr['voteHref'] ?? ''),
      'models' => $models,
      'en' => en($dr['en'] ?? null, [['title', 80], ['subtitle', 200], ['kicker', 60], ['ctaBefore', 40], ['ctaLabel', 40]]),
    ]],
    'capsules' => [],
    'lookbook' => ['items' => []],
    'banners' => [],
  ];
  // баннеры на главной: фото (и своё для телефона), текст и кнопка необязательны, ссылка — на весь баннер
  $bl = array_slice(arr($d['banners'] ?? null), 0, 8); $bid = ids($bl, 'bn');
  foreach ($bl as $n => $b) {
    $b = obj($b);
    $x = ['id' => $bid[$n], 'image' => url($b['image'] ?? ''), 'imageMobile' => url($b['imageMobile'] ?? ''),
      'title' => str($b['title'] ?? '', 80), 'text' => str($b['text'] ?? '', 200), 'cta' => str($b['cta'] ?? '', 40), 'href' => url($b['href'] ?? ''),
      'size' => ($b['size'] ?? '') === 'half' ? 'half' : 'wide', 'place' => ($b['place'] ?? '') === 'mid' ? 'mid' : 'top', 'hidden' => !empty($b['hidden']),
      'en' => en($b['en'] ?? null, [['title', 80], ['text', 200], ['cta', 40]])];
    if ($x['image'] !== '') $out['banners'][] = $x;
  }
  // a1–a3 есть всегда (у них свои страницы), новые a4, a5… — из админки, на общей capsule.html?c=…
  $caps = obj($d['capsules'] ?? null);
  $keys = array_slice(array_values(array_unique(array_merge(['a1', 'a2', 'a3'],
    array_filter(array_map('strval', array_keys($caps)), fn($k) => preg_match('/^a\d{1,2}$/', $k))))), 0, 20);
  foreach ($keys as $c) {
    $cap = obj($caps[$c] ?? null);
    $list = array_slice(arr($cap['items'] ?? null), 0, 60); $id = ids($list, $c);
    $builtin = in_array($c, ['a1', 'a2', 'a3'], true); $name = trim(str($cap['name'] ?? '', 40));
    $items = [];
    foreach ($list as $n => $i) {
      $i = obj($i);
      $items[] = ['id' => $id[$n], 'name' => str($i['name'] ?? '', 60),
        'kind' => in_array($i['kind'] ?? '', ['item', 'classic', 'unique'], true) ? $i['kind'] : 'item',
        'typeLabel' => str($i['typeLabel'] ?? '', 60), 'priceNum' => num($i['priceNum'] ?? 0), 'usd' => num($i['usd'] ?? 0),
        'specs' => str($i['specs'] ?? ''), 'temp' => str($i['temp'] ?? ''), 'desc' => str($i['desc'] ?? '', 1200),
        'status' => in_array($i['status'] ?? '', ['order', 'sold', 'hidden'], true) ? $i['status'] : 'order',
        'images' => images($i['images'] ?? null),
        'en' => en($i['en'] ?? null, [['name', 60], ['typeLabel', 60], ['specs', 400], ['temp', 400], ['desc', 1200]])];
    }
    $out['capsules'][$c] = [
      'title' => $builtin ? str($cap['title'] ?? '', 60) : "Капсула $c" . ($name !== '' ? ' · ' . $name : ''),
      'name' => $name, 'sub' => str($cap['sub'] ?? '', 120), 'cover' => $builtin ? '' : url($cap['cover'] ?? ''), 'hidden' => !empty($cap['hidden']),
      'en' => en($cap['en'] ?? null, [['name', 40], ['sub', 120]]),
      'items' => $items];
  }
  $lb = array_slice(arr(obj($d['lookbook'] ?? null)['items'] ?? null), 0, 120); $lid = ids($lb, 'lb');
  foreach ($lb as $n => $i) {
    $i = obj($i);
    $out['lookbook']['items'][] = ['id' => $lid[$n], 'num' => str($i['num'] ?? '', 12), 'name' => str($i['name'] ?? '', 80),
      'cat' => in_array($i['cat'] ?? '', ['tops', 'bottoms', 'bags', 'accessories'], true) ? $i['cat'] : 'tops', 'special' => !empty($i['special']),
      'desc' => str($i['desc'] ?? '', 2000), 'status' => ($i['status'] ?? '') === 'hidden' ? 'hidden' : 'order',
      'images' => images($i['images'] ?? null),
      'en' => en($i['en'] ?? null, [['name', 80], ['desc', 2000]])];
  }
  return $out;
}

$a = $_GET['a'] ?? '';
$post = $_SERVER['REQUEST_METHOD'] === 'POST';
header('Cache-Control: no-store');
try {
  if ($a === 'login' && $post) {
    $key = cfg('admin_password');
    if (!$key) json_out(401, ['ok' => false, 'error' => 'wrong']);
    $given = (string)(body_json()['password'] ?? '');
    if (!hash_equals($key, $given)) { usleep(800000); json_out(401, ['ok' => false, 'error' => 'wrong']); }
    $exp = now_ms() + DAYS * 86400000;
    set_cookie($exp . '.' . sign($exp, $key), DAYS * 86400);
    json_out(200, ['ok' => true]);
  }
  if ($a === 'logout') { set_cookie('', 0); json_out(200, ['ok' => true]); }
  if (!authed()) json_out(401, ['ok' => false, 'error' => 'auth']);

  if ($a === 'data' && !$post) { $l = load(); json_out(200, ['ok' => true, 'data' => $l['data'], 'version' => $l['version']]); }
  if ($a === 'save' && $post) {
    $body = body_json(4 * 1024 * 1024);
    $cur = load();
    // конфликт — только если после открытия админки кто-то опубликовал более новую версию
    if (empty($body['force']) && $cur['version'] && (empty($body['version']) || strcmp($cur['version'], (string)$body['version']) > 0))
      json_out(409, ['ok' => false, 'error' => 'conflict']);
    json_out(200, ['ok' => true, 'version' => save(clean($body['data'] ?? []))]);
  }
  if ($a === 'history' && !$post) {
    json_out(200, ['ok' => true, 'list' => array_map(fn($v) => ['version' => $v['version'], 'at' => $v['at']], versions())]);
  }
  if ($a === 'restore' && $post) {
    $want = (string)(body_json()['version'] ?? '');
    foreach (versions() as $v) if ($v['version'] === $want) {
      json_out(200, ['ok' => true, 'version' => save(clean(json_decode(file_get_contents($v['file']), true)))]);
    }
    json_out(404, ['ok' => false, 'error' => 'not_found']);
  }
  if ($a === 'upload' && $post) {
    $type = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if (!preg_match(TYPES, $type)) json_out(415, ['ok' => false, 'error' => 'type']);
    $key = (string)($_SERVER['HTTP_X_KEY'] ?? '');
    if (!preg_match(KEY, $key)) json_out(400, ['ok' => false, 'error' => 'key']);
    $small = ($_SERVER['HTTP_X_VARIANT'] ?? '') === 'sm';
    $url = upload_stream($key, $type, $small, preg_match(VIDEO, $type) ? MAX_VIDEO : MAX_IMAGE);
    json_out(200, ['ok' => true, 'url' => $url]);
  }
  // заявки — личные данные клиентов: показываем только за паролем, даже если остальная админка открыта
  if ($a === 'leads' || $a === 'lead-del') {
    if (!cfg('admin_password')) json_out(403, ['ok' => false, 'error' => 'no_password']);
    if ($a === 'leads' && !$post) json_out(200, ['ok' => true, 'list' => list_leads()]);
    if ($a === 'lead-del' && $post) {
      $id = (string)(body_json()['id'] ?? '');
      if (!preg_match('/^[a-f0-9]{32}$/', $id)) json_out(400, ['ok' => false, 'error' => 'id']);
      @unlink(lead_file($id));
      json_out(200, ['ok' => true]);
    }
  }
  json_out(404, ['ok' => false, 'error' => 'unknown']);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'server']);
}
