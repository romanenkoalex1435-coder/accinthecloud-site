<?php
// Превью ссылки на вещь или капсулу. Telegram, Instagram и мессенджеры не запускают JS страницы,
// поэтому для ссылок ?item= (и capsule.html?c=…) отдаём ту же страницу, но с названием, ценой и фото в мета-тегах.
// Данные — те же, что видит сайт: последняя публикация из админки (или исходные data/seed.json).
// Сюда направляет .htaccess.
define('ACC', 1);
require __DIR__ . '/_lib/store.php';

$page = $_GET['p'] ?? '';
if (!in_array($page, ['collection-a1', 'collection-a2', 'collection-a3', 'lookbook', 'capsule'], true)) { http_response_code(404); exit; }
$html = file_get_contents(WEB . "/$page.html");
header('Content-Type: text/html; charset=utf-8');

try { $data = json_decode(json_encode(load()['data']), true); } catch (Throwable $e) { $data = null; }
if (!is_array($data)) { echo $html; exit; }

$slug = (string)($_GET['item'] ?? '');
$money = fn($n) => number_format((int)$n, 0, '', ' ');
$first = fn($s) => trim(explode("\n", (string)$s)[0]);
$it = null;

if ($page === 'lookbook') {
  foreach ($data['lookbook']['items'] ?? [] as $i) {
    if (($i['id'] ?? '') !== $slug || ($i['status'] ?? '') === 'hidden' || empty($i['images'])) continue;
    $it = ['name' => $i['name'], 'price' => 'Индивидуальный пошив', 'desc' => $first($i['desc'] ?? ''), 'img' => $i['images'][0]];
  }
} else {
  $c = $page === 'capsule' ? (string)($_GET['c'] ?? '') : substr($page, -2);
  $cap = $data['capsules'][$c] ?? null;
  if (!is_array($cap) || !empty($cap['hidden'])) { echo $html; exit; }
  if ($slug === '') {
    // ссылка на саму новую капсулу: её название, подпись и обложка
    if ($page === 'capsule' && ($cap['cover'] ?? '') !== '')
      $it = ['name' => $cap['title'] ?? "Капсула $c", 'price' => '', 'desc' => $cap['sub'] ?? '', 'img' => $cap['cover']];
  } else {
    foreach ($cap['items'] ?? [] as $i) {
      $id = (string)($i['id'] ?? '');
      $key = str_starts_with($id, "$c-") ? substr($id, strlen($c) + 1) : $id;
      if ($key !== $slug || ($i['status'] ?? '') === 'hidden' || empty($i['images'])) continue;
      $price = ($i['status'] ?? '') === 'sold' ? 'Продано'
        : (!empty($i['priceNum']) ? $money($i['priceNum']) . ' ₽' . (!empty($i['usd']) ? ' / ' . $i['usd'] . '$' : '') : 'Цена по запросу');
      $it = ['name' => $i['name'], 'price' => $price, 'desc' => '', 'img' => $i['images'][0]];
    }
  }
}
if (!$it) { echo $html; exit; }

$attr = fn($s) => str_replace(['&', '"', '<'], ['&amp;', '&quot;', '&lt;'], (string)$s);
$host = origin();
$img = preg_match('#^https://#', $it['img']) ? $it['img'] : $host . '/' . ltrim($it['img'], '/');
$title = $it['name'] . ' — accinthecloud';
$desc = implode(' · ', array_filter([$it['price'], $it['desc']]));
$set = function ($re, $val) use (&$html, $attr) { $html = preg_replace_callback($re, fn($m) => $m[1] . $attr($val) . $m[2], $html, 1); };
$set('#(<title>)[^<]*(</title>)#', $title);
if ($desc !== '') {
  $set('#(<meta name="description" content=")[^"]*(")#', $desc);
  $set('#(<meta property="og:description" content=")[^"]*(")#', $desc);
}
$set('#(<meta property="og:title" content=")[^"]*(")#', $title);
$set('#(<meta property="og:url" content=")[^"]*(")#', $host . $_SERVER['REQUEST_URI']);
$set('#(<meta property="og:image" content=")[^"]*(")#', $img);
$html = preg_replace('#\s*<meta property="og:image:(width|height)"[^>]*>#', '', $html);
echo $html;
