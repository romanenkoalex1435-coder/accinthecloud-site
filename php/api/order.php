<?php
// Отправка заказа ботом в Telegram не используется: заказы сохраняются в админке (api/lead), клиент пишет сам.
header('Content-Type: application/json');
http_response_code($_SERVER['REQUEST_METHOD'] === 'POST' ? 503 : 405);
echo '{"ok":false,"error":"not_configured"}';
