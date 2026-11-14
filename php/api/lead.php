<?php
// Заказы из корзины: «Оформить заказ» (stage: draft) и «Написать в Telegram» (stage: sent).
// Смотреть — в админке, вкладка «Заявки».
define('ACC', 1);
require __DIR__ . '/_lib/store.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); json_out(405, ['ok' => false]); }
try {
  $raw = body_json(64 * 1024);
  $s = fn($v, $n) => mb_substr(trim(is_scalar($v) ? (string)$v : ''), 0, $n);
  $id = $s($raw['id'] ?? '', 32); $telegram = $s($raw['telegram'] ?? '', 80); $name = $s($raw['name'] ?? '', 80);
  $tg = '/^(@[A-Za-z0-9_]{5,32}|\+?[0-9 ()-]{7,20}|https:\/\/t\.me\/[A-Za-z0-9_+]{3,64})$/';
  if (!preg_match('/^[a-f0-9]{32}$/', $id) || !preg_match($tg, $telegram) || $name === '' || ($raw['consent'] ?? null) !== true)
    json_out(400, ['ok' => false, 'error' => 'bad']);
  // ссылки на фото-референсы — только наши, из api/ref
  $ref = '#^' . preg_quote(origin(), '#') . '/refs/\d{4}-\d{2}/ref-[a-f0-9]{24}\.jpg$#';
  $items = [];
  foreach (array_slice(is_array($raw['items'] ?? null) ? $raw['items'] : [], 0, 30) as $i) {
    if (!is_array($i)) continue;
    $refs = array_values(array_slice(array_filter(is_array($i['refs'] ?? null) ? $i['refs'] : [], fn($u) => is_string($u) && preg_match($ref, $u)), 0, 5));
    $items[] = ['name' => $s($i['name'] ?? '', 80), 'capsule' => $s($i['capsule'] ?? '', 40), 'size' => $s($i['size'] ?? '', 40),
      'color' => $s($i['color'] ?? '', 120), 'notes' => $s($i['notes'] ?? '', 1500), 'price' => $s($i['price'] ?? '', 40),
      'qty' => max(1, min(99, (int)round((float)($i['qty'] ?? 1)) ?: 1)), 'refs' => $refs];
  }
  if (!$items) json_out(400, ['ok' => false, 'error' => 'empty']);
  $now = (int)floor(microtime(true) * 1000);
  $created = (int)($raw['createdAt'] ?? 0) ?: $now;
  save_lead($id, ['stage' => ($raw['stage'] ?? '') === 'sent' ? 'sent' : 'draft', 'name' => $name, 'telegram' => $telegram,
    'comment' => $s($raw['comment'] ?? '', 1000), 'items' => $items, 'total' => $s($raw['total'] ?? '', 40),
    'lang' => ($raw['lang'] ?? '') === 'en' ? 'en' : 'ru',
    'createdAt' => min($now, max($now - 30 * 86400000, $created)), 'updatedAt' => $now]);
  json_out(200, ['ok' => true]);
} catch (Throwable $e) { json_out(500, ['ok' => false]); }
