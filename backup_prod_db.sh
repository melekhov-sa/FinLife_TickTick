#!/usr/bin/env bash
# FinLife/Centricore — бэкап прод-БД. Без шифрования (данные не секретные,
# цель — просто не потерять). Схема 3-2-1:
#   1) локальный сжатый дамп на сервере (быстрый откат);
#   2) копия в приватный Telegram-канал (off-site);
#   3) твоя машина тянет копию к себе (scripts/pull_backups.ps1).
#
# Мягкая деградация: если Telegram не настроен — просто делает локальный дамп.
set -euo pipefail

PROJECT_DIR="/opt/centricore"
BACKUP_DIR="$PROJECT_DIR/backups"
KEEP=14            # сколько дампов держать на сервере
TG_LIMIT=49000000  # лимит Bot API sendDocument (~50 МБ)

cd "$PROJECT_DIR"

# Конфиг из .env: BACKUP_TG_BOT_TOKEN, BACKUP_TG_CHAT_ID (+ общий TELEGRAM_PROXY).
# Достаём только нужные ключи (не сорсим весь .env).
_envget() { grep -E "^$1=" "$PROJECT_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
BACKUP_TG_BOT_TOKEN="${BACKUP_TG_BOT_TOKEN:-$(_envget BACKUP_TG_BOT_TOKEN)}"
BACKUP_TG_CHAT_ID="${BACKUP_TG_CHAT_ID:-$(_envget BACKUP_TG_CHAT_ID)}"
TELEGRAM_PROXY="${TELEGRAM_PROXY:-$(_envget TELEGRAM_PROXY)}"

TS="$(date +%Y%m%d-%H%M%S)"
GZ="$BACKUP_DIR/prod_${TS}.sql.gz"
mkdir -p "$BACKUP_DIR"

# socks5 → socks5h, чтобы DNS резолвился через прокси (api.telegram.org в РФ блочат)
_proxy_arg() {
  [ -n "${TELEGRAM_PROXY:-}" ] || return 0
  printf -- '--proxy\n%s\n' "${TELEGRAM_PROXY/socks5:/socks5h:}"
}

tg_msg() {  # $1 = текст
  [ -n "${BACKUP_TG_BOT_TOKEN:-}" ] && [ -n "${BACKUP_TG_CHAT_ID:-}" ] || return 0
  mapfile -t P < <(_proxy_arg)
  curl -sS --max-time 30 "${P[@]}" \
    -d chat_id="$BACKUP_TG_CHAT_ID" -d parse_mode=HTML --data-urlencode text="$1" \
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
  echo "!! backup failed at line $1" >&2
  tg_msg "❌ <b>Бэкап FinLife не удался</b>
$(date '+%F %T') · строка $1"
}
trap 'on_err "$LINENO"' ERR

# 1) дамп → gzip (pipefail поймает падение pg_dump)
echo "==> pg_dump → $GZ"
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U finlife -d finlife --no-owner --no-privileges | gzip -c > "$GZ"
SIZE="$(du -h "$GZ" | cut -f1)"

# 2) off-site в Telegram (если настроено и влезает в лимит)
SENT=0
BYTES="$(stat -c%s "$GZ")"
if [ "$BYTES" -lt "$TG_LIMIT" ]; then
  if tg_file "$GZ" "🗄 FinLife backup ${TS} (${SIZE})"; then SENT=1; fi
else
  tg_msg "⚠️ Бэкап ${TS} = ${SIZE} — больше лимита Telegram. Есть локально и в пуле."
fi

# 3) ротация
ls -1t "$BACKUP_DIR"/prod_*.sql.gz 2>/dev/null | tail -n +"$((KEEP+1))" | xargs -r rm -f

trap - ERR
echo "==> Done: $GZ (sent_tg=$SENT)"
tg_msg "✅ <b>Бэкап FinLife ок</b>
$(date '+%F %T') · ${SIZE}$([ "$SENT" = 1 ] && echo ' · отправлен в канал' || echo ' · в канал НЕ отправлен')"
