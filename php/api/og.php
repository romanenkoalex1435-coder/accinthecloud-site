<?php
// Превью ссылки на вещь. Telegram, Instagram и мессенджеры не запускают JS страницы,
// поэтому для ссылок ?item= отдаём ту же страницу, но с названием, ценой и фото вещи в мета-тегах.
// Данные — js/og-items.json (собирает tools/og-items.py). Сюда направляет .htaccess.
$page = $_GET['p'] ?? '';
if (!in_array($page, ['collection-a1', 'collection-a2', 'collection-a3', 'lookbook'], true)) { http_response_code(404); exit; }
$web = dirname(__DIR__);
$html = file_get_contents("$web/$page.html");
header('Content-Type: text/html; charset=utf-8');
$items = json_decode(@file_get_contents("$web/js/og-items.json"), true) ?: [];
$it = $items[$page][$_GET['item'] ?? ''] ?? null;
if (!$it) { echo $html; exit; }
$attr = fn($s) => str_replace(['&', '"', '<'], ['&amp;', '&quot;', '&lt;'], (string)$s);
$host = 'https://' . preg_replace('/[^a-z0-9.-]/i', '', $_SERVER['HTTP_HOST'] ?? '');
$title = $it['name'] . ' — accinthecloud';
$desc = implode(' · ', array_filter([$it['price'] ?? '', $it['desc'] ?? '']));
$set = function ($re, $val) use (&$html, $attr) { $html = preg_replace_callback($re, fn($m) => $m[1] . $attr($val) . $m[2], $html, 1); };
$set('#(<title>)[^<]*(</title>)#', $title);
$set('#(<meta name="description" content=")[^"]*(")#', $desc);
$set('#(<meta property="og:title" content=")[^"]*(")#', $title);
$set('#(<meta property="og:description" content=")[^"]*(")#', $desc);
$set('#(<meta property="og:url" content=")[^"]*(")#', $host . $_SERVER['REQUEST_URI']);
$set('#(<meta property="og:image" content=")[^"]*(")#', $host . '/' . ltrim($it['img'], '/'));
$html = preg_replace('#\s*<meta property="og:image:(width|height)"[^>]*>#', '', $html);
echo $html;
