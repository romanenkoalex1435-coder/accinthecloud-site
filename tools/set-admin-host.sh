#!/bin/bash
# Ставит пароль админки на хостинге Timeweb. Пароль хранится только на хостинге (public_html/_data/config.php, закрыт для браузера).
# Запуск из папки сайта:  bash tools/set-admin-host.sh
set -e
HOST=ct084307@vh480.timeweb.ru
# одно соединение на все команды: хостинг притормаживает частые входы по SSH
SSH="ssh -o ControlMaster=auto -o ControlPath=/tmp/acc-%C -o ControlPersist=5m -o ConnectTimeout=60"
read -r -s -p "Придумай пароль для админки (от 10 символов) и нажми Enter: " P1; echo
[ ${#P1} -lt 10 ] && { echo "Короче 10 символов — запусти снова."; exit 1; }
read -r -s -p "Повтори пароль: " P2; echo
[ "$P1" != "$P2" ] && { echo "Пароли не совпали — запусти снова."; exit 1; }
# хостинг иногда не пускает по SSH с первого раза — открываем соединение с повторами
echo "Подключаюсь к хостингу…"
for i in 1 2 3 4 5 6 7 8; do
  $SSH -o ControlPersist=5m "$HOST" true 2>/dev/null && break
  [ $i = 8 ] && { echo "Хостинг не пускает по SSH. Подожди пару минут и запусти снова."; exit 1; }
  echo "Хостинг занят, жду 20 секунд (попытка $i из 8)…"; sleep 20
done
# пароль идёт через stdin, в командную строку и историю не попадает
printf %s "$P1" | $SSH "$HOST" 'mkdir -p public_html/_data && php -r '\''$p=stream_get_contents(STDIN); $f=getenv("HOME")."/public_html/_data/config.php"; file_put_contents($f, "<?php return [\"admin_password\" => ".var_export($p, true)."];\n"); chmod($f, 0640);'\'''
echo "Готово: пароль админки сохранён. Вход: /admin.html на сайте"
