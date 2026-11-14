#!/bin/bash
# Выкладка сайта на хостинг Timeweb (вместо vercel --prod).
# Берёт только файлы из git (черновики, аудиты, .env и node_modules туда не попадают) + серверную часть из php/.
# Загруженное из админки (media/, refs/) и данные (_data/) не трогает.
# Запуск из папки сайта:  bash tools/deploy-host.sh
set -e
cd "$(dirname "$0")/.."
HOST=ct084307@vh480.timeweb.ru
# одно соединение на все команды: хостинг притормаживает частые входы по SSH
SSH="ssh -o ControlMaster=auto -o ControlPath=/tmp/acc-%C -o ControlPersist=5m -o ConnectTimeout=60"
DEST=public_html
LIST=$(mktemp)
git ls-files -z | grep -z -v -E '^(api/|php/|tools/|middleware\.js$|vercel\.json$|package(-lock)?\.json$|\.gitignore$|\.vercelignore$|LogoPolyacc\.MOV$)|(^|/)\.DS_Store$' > "$LIST"
rsync -az -e "$SSH" --from0 --files-from="$LIST" ./ "$HOST:$DEST/"
rm -f "$LIST"
rsync -az -e "$SSH" php/ "$HOST:$DEST/"
$SSH "$HOST" "mkdir -p $DEST/_data/site $DEST/_data/leads && rm -f $DEST/index.htm"
echo "Выложено: https://ct084307.tw1.ru"
