#!/usr/bin/env bash
# FinLife/Centricore — бэкап прод-БД с шифрованием и off-site копией в Telegram.
#
# Слои защиты (3-2-1):
#   1) локальный дамп на сервере (быстрый откат «на вчера») — как было;
#   2) зашифрованная копия .sql.gz.age (шифруем ПУБЛИЧНЫМ ключом age — на сервере
#      только «замок», расшифровать может лишь твой приватный ключ на твоей машине);
#   3) отправка зашифрованной копии в приватный Telegram-канал (off-site).
#   Твоя машина отдельно тянет .age к себе (см. scripts/pull_backups.ps1).
#
# Мягкая деградация: если age/ключей ещё нет — делаем только локальный дамп
# (текущее поведение), ничего не ломаем. Настройка — см. BACKUP.md.
set -euo pipefail

PROJECT_DIR="/opt/centricore"
BACKUP_DIR="$PROJECT_DIR/backups"
AGE_RECIPIENTS="$PROJECT_DIR/backup_recipients.txt"   # публичные ключи age (по одному в строке)
KEEP_ENC=14        # сколько зашифрованных копий держать на сервере
KEEP_PLAIN=3       # сколько незашифрованных .sql (быстрый откат)
TG_LIMIT=49000000  # лимит Bot API sendDocument (~50 МБ)

cd "$PROJECT_DIR"

# Конфиг из .env: BACKUP_TG_BOT_TOKEN, BACKUP_TG_CHAT_ID (+ общий TELEGRAM_PROXY).
# Достаём только нужные ключи (не сорсим весь .env — там могут быть строки,
# которые под set -e уронят скрипт).
_envget() { grep -E "^$1=" "$PROJECT_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
BACKUP_TG_BOT_TOKEN="${BACKUP_TG_BOT_TOKEN:-$(_envget BACKUP_TG_BOT_TOKEN)}"
BACKUP_TG_CHAT_ID="${BACKUP_TG_CHAT_ID:-$(_envget BACKUP_TG_CHAT_ID)}"
TELEGRAM_PROXY="${TELEGRAM_PROXY:-$(_envget TELEGRAM_PROXY)}"

TS="$(date +%Y%m%d-%H%M%S)"
PLAIN="$BACKUP_DIR/prod_${TS}.sql"
ENC="$BACKUP_DIR/prod_${TS}.sql.gz.age"
mkdir -p "$BACKUP_DIR"

# socks5 → socks5h, чтобы DNS резолвился через прокси (api.telegram.org в РФ блочат)
_proxy_arg() {
  [ -n "${TELEGRAM_PROXY:-}" ] || return 0
  printf -- '--proxy\n%s\n' "${TELEGRAM_PROXY/socks5:/socks5h:}"
}

tg_msg() {  # $1 = текст (можно с переносами строк)
  [ -n "${BACKUP_TG_BOT_TOKEN:-}" ] && [ -n "${BACKUP_TG_CHAT_ID:-}" ] || return 0
  mapfile -t P < <(_proxy_arg)
  curl -sS --max-time 30 "${P[@]}" \
    -d chat_id="$BACKUP_TG_CHAT_ID" -d parse_mode=HTML \
    --data-urlencode text="$1" \
    "https://api.telegram.org/bot${BACKUP_TG_BOT_TOKEN}/sendMessage" >/dev/null || true
}

tg_file() {  # $1 = путь, $2 = подпись
  [ -n "${BACKUP_TG_BOT_TOKEN:-}" ] && [ -n "${BACKUP_TG_CHAT_ID:-}" ] || return 1
  mapfile -t P < <(_proxy_arg)
  curl -sS --max-time 600 "${P[@]}" \
    -F chat_id="$BACKUP_TG_CHAT_ID" -F document=@"$1" -F caption="$2" \
    "https://api.telegram.org/bot${BACKUP_TG_BOT_TOKEN}/sendDocument" >/dev/null
}

on_err() {
  local line="$1"
  echo "!! Backup failed at line $line" >&2
  tg_msg "❌ <b>Бэкап FinLife не удался</b>
$(date '+%F %T') · строка $line
Проверь сервер и логи бэкапа."
}
trap 'on_err "$LINENO"' ERR

# 1) дамп → локальный .sql (как было)
echo "==> pg_dump → $PLAIN"
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U finlife -d finlife --no-owner --no-privileges > "$PLAIN"
SIZE_PLAIN="$(du -h "$PLAIN" | cut -f1)"

# 2) шифрование → off-site копия (если настроено)
ENCRYPTED=0
if command -v age >/dev/null 2>&1 && [ -s "$AGE_RECIPIENTS" ]; then
  echo "==> encrypt → $ENC"
  gzip -c "$PLAIN" | age -R "$AGE_RECIPIENTS" -o "$ENC"
  ENCRYPTED=1
  SIZE_ENC="$(du -h "$ENC" | cut -f1)"
else
  echo "!! age/recipients не настроены — только локальный дамп (см. BACKUP.md)"
fi

# 3) off-site в Telegram (если есть шифрованная копия и влезает в лимит)
SENT=0
if [ "$ENCRYPTED" = 1 ]; then
  BYTES="$(stat -c%s "$ENC")"
  if [ "$BYTES" -lt "$TG_LIMIT" ]; then
    if tg_file "$ENC" "🗄 FinLife backup ${TS} (${SIZE_ENC})"; then SENT=1; fi
  else
    tg_msg "⚠️ Бэкап ${TS} = ${SIZE_ENC} — больше лимита Telegram. Есть локально и в пуле, но не в канале."
  fi
fi

# 4) ротация
ls -1t "$BACKUP_DIR"/prod_*.sql.gz.age 2>/dev/null | tail -n +"$((KEEP_ENC+1))"   | xargs -r rm -f
ls -1t "$BACKUP_DIR"/prod_*.sql        2>/dev/null | tail -n +"$((KEEP_PLAIN+1))" | xargs -r rm -f

trap - ERR
echo "==> Done. plain=$SIZE_PLAIN encrypted=${ENCRYPTED} sent_tg=${SENT}"
if [ "$ENCRYPTED" = 1 ]; then
  tg_msg "✅ <b>Бэкап FinLife ок</b>
$(date '+%F %T')
дамп ${SIZE_PLAIN} → шифр ${SIZE_ENC}$([ "$SENT" = 1 ] && echo ' · отправлен в канал' || echo ' · в канал НЕ отправлен')"
fi
