<?php
// Текущие данные сайта для страниц: <script src="/api/site"></script> кладёт их в window.ACC_SITE_RAW.
define('ACC', 1);
require __DIR__ . '/_lib/store.php';
try { $data = load()['data']; $failed = false; } catch (Throwable $e) { $data = seed(); $failed = true; }
header('Content-Type: application/javascript; charset=utf-8');
// сохранение в админке видно сразу: браузер каждый раз спрашивает заново, ответ лёгкий
header('Cache-Control: no-cache');
echo 'window.ACC_SITE_RAW=' . str_replace('<', '<', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ';';
