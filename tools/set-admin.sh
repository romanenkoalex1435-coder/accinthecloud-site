#!/bin/bash
# Ставит пароль админки (accinthecloud-site.vercel.app/admin.html). Пароль хранится только в Vercel.
# Запуск из папки сайта:  bash tools/set-admin.sh
set -e
cd "$(dirname "$0")/.."
read -r -s -p "Придумай пароль для админки (от 10 символов) и нажми Enter: " P1; echo
[ ${#P1} -lt 10 ] && { echo "Короче 10 символов — запусти снова."; exit 1; }
read -r -s -p "Повтори пароль: " P2; echo
[ "$P1" != "$P2" ] && { echo "Пароли не совпали — запусти снова."; exit 1; }
vercel env rm ADMIN_PASSWORD production -y >/dev/null 2>&1 || true
printf %s "$P1" | vercel env add ADMIN_PASSWORD production >/dev/null
echo "Выкладываю сайт с новым паролем…"
vercel --prod --yes >/dev/null && echo "Готово. Вход: https://accinthecloud-site.vercel.app/admin.html"
