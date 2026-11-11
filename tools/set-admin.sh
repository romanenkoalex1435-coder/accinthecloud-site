#!/bin/bash
# Ставит пароль админки (accinthecloud-site.vercel.app/admin.html). Пароль хранится только в Vercel.
# Запуск из папки сайта:  bash tools/set-admin.sh
set -e
cd "$(dirname "$0")/.."
# vercel поставлен через nvm — в bash его может не быть в PATH, ищем сами
if ! command -v vercel >/dev/null 2>&1; then
  V=$(ls -1 "$HOME"/.nvm/versions/node/*/bin/vercel 2>/dev/null | tail -1)
  [ -z "$V" ] && { echo "Не нашёл vercel. Установи: npm i -g vercel"; exit 1; }
  export PATH="$(dirname "$V"):$PATH"
fi
read -r -s -p "Придумай пароль для админки (от 10 символов) и нажми Enter: " P1; echo
[ ${#P1} -lt 10 ] && { echo "Короче 10 символов — запусти снова."; exit 1; }
read -r -s -p "Повтори пароль: " P2; echo
[ "$P1" != "$P2" ] && { echo "Пароли не совпали — запусти снова."; exit 1; }
vercel env rm ADMIN_PASSWORD production -y >/dev/null 2>&1 || true
if ! printf %s "$P1" | vercel env add ADMIN_PASSWORD production --yes --force >/dev/null; then
  echo "Не получилось сохранить пароль в Vercel (ошибка выше). Проверь вход: vercel whoami"; exit 1
fi
vercel env ls production 2>/dev/null | grep -q ADMIN_PASSWORD || { echo "Vercel не показывает ADMIN_PASSWORD — пароль не сохранился."; exit 1; }
echo "Пароль сохранён. Выкладываю сайт с новым паролем…"
vercel --prod --yes >/dev/null
sleep 5
CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://accinthecloud-site.vercel.app/api/admin?a=data")
if [ "$CODE" = "401" ]; then
  echo "Готово: админка закрыта паролем. Вход: https://accinthecloud-site.vercel.app/admin.html"
else
  echo "Внимание: админка ответила $CODE вместо 401 — пароль ещё не действует. Напиши Claude."
fi
