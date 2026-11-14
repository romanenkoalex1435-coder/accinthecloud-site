<?php
// Хранилище сайта на хостинге (вместо Vercel Blob).
// Данные, заявки и пароль — в public_html/_data, закрытой для браузера (_data/.htaccess: Require all denied).
// Вне public_html хостинг не даёт PHP сайта ни читать, ни писать.
// Фото из админки — public_html/media (+ уменьшенные в media/sm), референсы клиентов — public_html/refs.
// Каждое сохранение — новый файл site/<время>.json, последний и есть текущий; старые — история (30 штук).

if (!defined('ACC')) { http_response_code(404); exit; }

define('WEB', dirname(__DIR__, 2));                  // public_html
define('DATA', WEB . '/_data');
define('SITE_DIR', DATA . '/site');
define('LEADS_DIR', DATA . '/leads');
define('KEEP', 30);
define('LEAD_DAYS', 90);

function cfg($k) {
  static $c = null;
  if ($c === null) { $f = DATA . '/config.php'; $c = is_file($f) ? (include $f) : []; }
  return $c[$k] ?? null;
}

function json_out($code, $data) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function body_raw($max) {
  $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
  if ($len > $max) json_out(413, ['ok' => false, 'error' => 'too_big']);
  $s = file_get_contents('php://input', false, null, 0, $max + 1);
  if (strlen($s) > $max) json_out(413, ['ok' => false, 'error' => 'too_big']);
  return $s;
}
function body_json($max = 1048576) {
  $d = json_decode(body_raw($max) ?: '{}', true);
  return is_array($d) ? $d : [];
}

function write_atomic($path, $data) {
  if (!is_dir(dirname($path))) mkdir(dirname($path), 0755, true);
  $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
  if (file_put_contents($tmp, $data) === false) throw new Exception('write');
  rename($tmp, $path);
}

// данные читаем объектами, а не массивами: так пустые {} остаются {} (админка дописывает в них поля)
function seed() { return json_decode(file_get_contents(WEB . '/data/seed.json')); }

// версии от новых к старым: [['version' => 'site/000….json', 'file' => путь, 'at' => ISO], …]
function versions() {
  $out = [];
  foreach (glob(SITE_DIR . '/*.json') ?: [] as $f) $out[] = ['version' => 'site/' . basename($f), 'file' => $f, 'at' => gmdate('c', filemtime($f))];
  usort($out, fn($a, $b) => strcmp($b['version'], $a['version']));
  return $out;
}

function load() {
  $v = versions();
  if (!$v) return ['data' => seed(), 'version' => null];
  $d = json_decode(file_get_contents($v[0]['file']));
  if (!is_object($d)) throw new Exception('data');
  // версии без лукбука его не содержат — берём исходный
  if (empty($d->lookbook)) $d->lookbook = seed()->lookbook;
  return ['data' => $d, 'version' => $v[0]['version']];
}

function save($data) {
  $name = str_pad((string)floor(microtime(true) * 1000), 15, '0', STR_PAD_LEFT) . '.json';
  write_atomic(SITE_DIR . '/' . $name, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
  foreach (array_slice(versions(), KEEP) as $old) @unlink($old['file']);
  return 'site/' . $name;
}

// Фото и видео из админки: media/<ключ>.<расш>, уменьшенная копия — media/sm/<ключ>.<расш>.
// Ссылка относительная (media/…), чтобы не зависеть от домена.
const EXT = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/avif' => 'avif',
  'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov'];

function media_path($key, $type, $small) { return 'media/' . ($small ? 'sm/' : '') . $key . '.' . (EXT[$type] ?? 'bin'); }

// тело запроса пишем в файл потоком — большое видео не держим в памяти
function upload_stream($key, $type, $small, $max) {
  $rel = media_path($key, $type, $small);
  $path = WEB . '/' . $rel;
  if (!is_dir(dirname($path))) mkdir(dirname($path), 0755, true);
  $tmp = $path . '.part';
  $in = fopen('php://input', 'rb'); $out = fopen($tmp, 'wb'); $size = 0;
  while (!feof($in)) {
    $chunk = fread($in, 1 << 20);
    if ($chunk === false) break;
    $size += strlen($chunk);
    if ($size > $max) { fclose($out); @unlink($tmp); json_out(413, ['ok' => false, 'error' => 'too_big']); }
    fwrite($out, $chunk);
  }
  fclose($in); fclose($out);
  if (!$size) { @unlink($tmp); json_out(400, ['ok' => false, 'error' => 'empty']); }
  rename($tmp, $path);
  return $rel;
}

// Заявки: leads/<id>.json, id — 128 случайных бит от браузера. Живут 90 дней.
function save_lead($id, $lead) { write_atomic(LEADS_DIR . "/$id.json", json_encode($lead, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); }
function lead_file($id) { return LEADS_DIR . "/$id.json"; }

function list_leads() {
  $out = [];
  foreach (glob(LEADS_DIR . '/*.json') ?: [] as $f) {
    if (time() - filemtime($f) > LEAD_DAYS * 86400) { @unlink($f); continue; }
    $l = json_decode(file_get_contents($f), true);
    if (is_array($l)) { $l['id'] = basename($f, '.json'); $out[] = $l; }
  }
  drop_old_refs();
  usort($out, fn($a, $b) => ($b['updatedAt'] ?? 0) <=> ($a['updatedAt'] ?? 0));
  return $out;
}

// Фото-референсы индивидуального заказа: refs/<месяц>/ref-<хвост>.jpg, живут как заявки
function save_ref($buf) {
  $rel = 'refs/' . gmdate('Y-m') . '/ref-' . bin2hex(random_bytes(12)) . '.jpg';
  write_atomic(WEB . '/' . $rel, $buf);
  return $rel;
}
function drop_old_refs() {
  foreach (glob(WEB . '/refs/*/*.jpg') ?: [] as $f) if (time() - filemtime($f) > LEAD_DAYS * 86400) @unlink($f);
}

function origin() { return 'https://' . preg_replace('/[^a-z0-9.-]/i', '', $_SERVER['HTTP_HOST'] ?? ''); }
