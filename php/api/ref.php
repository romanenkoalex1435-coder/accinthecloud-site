<?php
// Фото-референс индивидуального заказа: order.html уменьшает снимок до JPEG и присылает сюда.
// Возвращаем публичную ссылку — она попадает в корзину, в текст заказа для Telegram и в заявку в админке.
define('ACC', 1);
require __DIR__ . '/_lib/store.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); json_out(405, ['ok' => false]); }
if (!preg_match('#^image/jpeg\b#', $_SERVER['CONTENT_TYPE'] ?? '')) json_out(415, ['ok' => false]);
$buf = body_raw(2 * 1024 * 1024);
// только настоящий JPEG: FF D8 FF в начале
if (strlen($buf) < 100 || substr($buf, 0, 3) !== "\xFF\xD8\xFF") json_out(400, ['ok' => false, 'error' => 'bad']);
try { json_out(200, ['ok' => true, 'url' => origin() . '/' . save_ref($buf)]); }
catch (Throwable $e) { json_out(500, ['ok' => false]); }
