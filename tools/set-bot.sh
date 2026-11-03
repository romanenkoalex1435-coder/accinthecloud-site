#!/bin/bash
# Подключает Telegram-бота для заявок с сайта. Токен не попадает в код — только в Vercel.
# Запуск из папки сайта:  bash tools/set-bot.sh
set -e
cd "$(dirname "$0")/.."
echo "1) Создай бота: в Telegram открой @BotFather → /newbot → имя любое. Он пришлёт токен."
read -r -s -p "Вставь токен бота и нажми Enter: " TOKEN; echo
NAME=$(curl -s "https://api.telegram.org/bot$TOKEN/getMe" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["result"]["username"] if d.get("ok") else "")')
[ -z "$NAME" ] && { echo "Токен не подошёл — проверь и запусти снова."; exit 1; }
echo "2) С того аккаунта, куда должны приходить заявки, открой @$NAME и нажми «Start»."
read -r -p "Нажал? Тогда Enter: " _
CHAT=$(curl -s "https://api.telegram.org/bot$TOKEN/getUpdates" | python3 -c 'import sys,json;r=json.load(sys.stdin).get("result",[]);print(r[-1]["message"]["chat"]["id"] if r and "message" in r[-1] else "")')
[ -z "$CHAT" ] && { echo "Бот не видит «Start» — нажми ещё раз и запусти скрипт снова."; exit 1; }
vercel env rm TELEGRAM_BOT_TOKEN production -y >/dev/null 2>&1 || true
vercel env rm TELEGRAM_CHAT_ID production -y >/dev/null 2>&1 || true
printf %s "$TOKEN" | vercel env add TELEGRAM_BOT_TOKEN production >/dev/null
printf %s "$CHAT" | vercel env add TELEGRAM_CHAT_ID production >/dev/null
curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" -d chat_id="$CHAT" --data-urlencode text="Готово: сюда будут приходить заявки с сайта accinthecloud." >/dev/null
echo "3) Выкладываю сайт с ботом…"
vercel --prod --yes >/dev/null && echo "Готово. Заявки будут приходить от @$NAME."
