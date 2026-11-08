#!/usr/bin/env bash
# FinLife/Centricore — бэкап прод-БД. Без шифрования (данные не секретные,
# цель — просто не потерять). Схема 3-2-1:
#   1) локальный сжатый дамп на сервере (быстрый откат);
#   2) копия на Яндекс.Диск по WebDAV (off-site);
#   3) твоя машина тянет копию к себе (scripts/pull_backups.ps1).
#
# Почему Я.Диск, а не Telegram: api.telegram.org с РФ-сервера доступен только
# через прокси, и файлы туда переставали доходить. Яндекс доступен напрямую.
# В Telegram остаётся только короткое уведомление о результате.
#
# Мягкая деградация: если Я.Диск не настроен или недоступен — локальный дамп
# всё равно делается, деплой не падает.
set -euo pipefail

PROJECT_DIR="/opt/centricore"
BACKUP_DIR="$PROJECT_DIR/backups"
KEEP=14            # сколько дампов держать на сервере

cd "$PROJECT_DIR"

# Конфиг из .env: BACKUP_TG_BOT_TOKEN, BACKUP_TG_CHAT_ID (+ общий TELEGRAM_PROXY).
# Достаём только нужные ключи (не сорсим весь .env).
_envget() { grep -E "^$1=" "$PROJECT_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
BACKUP_TG_BOT_TOKEN="${BACKUP_TG_BOT_TOKEN:-$(_envget BACKUP_TG_BOT_TOKEN)}"
BACKUP_TG_CHAT_ID="${BACKUP_TG_CHAT_ID:-$(_envget BACKUP_TG_CHAT_ID)}"
TELEGRAM_PROXY="${TELEGRAM_PROXY:-$(_envget TELEGRAM_PROXY)}"
# (опц.) зеркало в приватный git-репо: путь к локальному клону + ветка
BACKUP_GIT_DIR="${BACKUP_GIT_DIR:-$(_envget BACKUP_GIT_DIR)}"
BACKUP_GIT_BRANCH="${BACKUP_GIT_BRANCH:-$(_envget BACKUP_GIT_BRANCH)}"
# Яндекс.Диск по WebDAV — основной off-site канал. В отличие от Telegram
# доступен с РФ-сервера напрямую, без прокси. YADISK_TOKEN — это «пароль
# приложения» из id.yandex.ru, обычный пароль от аккаунта не подойдёт.
YADISK_USER="${YADISK_USER:-$(_envget YADISK_USER)}"
YADISK_TOKEN="${YADISK_TOKEN:-$(_envget YADISK_TOKEN)}"
YADISK_DIR="${YADISK_DIR:-$(_envget YADISK_DIR)}"
YADISK_DIR="${YADISK_DIR:-FinLife-backups}"
YADISK_BASE="https://webdav.yandex.ru"
# Класть ли .env в архив конфигурации (по умолчанию нет: там секреты).
BACKUP_INCLUDE_ENV="${BACKUP_INCLUDE_ENV:-$(_envget BACKUP_INCLUDE_ENV)}"

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


# ── Яндекс.Диск (WebDAV) ─────────────────────────────────────────────────────
# Все функции «мягкие»: при сбое возвращают 1, но не валят скрипт — локальный
# дамп важнее, и деплой из-за недоступного Диска падать не должен.

_ya_ok() { [ -n "${YADISK_USER:-}" ] && [ -n "${YADISK_TOKEN:-}" ]; }

_ya_curl() {  # общие параметры curl для WebDAV
  curl -sS --max-time 600 -u "${YADISK_USER}:${YADISK_TOKEN}" "$@"
}

ya_upload() {  # $1 = путь к файлу
  _ya_ok || return 1
  # MKCOL на существующей папке вернёт 405 — это нормально, игнорируем.
  _ya_curl -o /dev/null -X MKCOL "${YADISK_BASE}/${YADISK_DIR}/" >/dev/null 2>&1 || true
  local name code
  name="$(basename "$1")"
  code="$(_ya_curl -o /dev/null -w '%{http_code}' -T "$1" \
            "${YADISK_BASE}/${YADISK_DIR}/${name}" 2>/dev/null || echo 000)"
  case "$code" in
    201|204) return 0 ;;
    *) echo "!! Яндекс.Диск: загрузка вернула HTTP $code" >&2; return 1 ;;
  esac
}

ya_rotate() {  # $1 = регулярка имён; оставить на Диске только последние $KEEP
  _ya_ok || return 0
  local pattern="$1" listing names old
  listing="$(_ya_curl -X PROPFIND -H 'Depth: 1' \
               "${YADISK_BASE}/${YADISK_DIR}/" 2>/dev/null || true)"
  # Имена содержат метку времени YYYYmmdd-HHMMSS, поэтому лексикографический
  # порядок совпадает с хронологическим и достаточно sort.
  names="$(printf '%s' "$listing" | grep -oE "$pattern" | sort -u || true)"
  [ -n "$names" ] || return 0
  old="$(printf '%s\n' "$names" | sort -r | tail -n +"$((KEEP+1))")"
  [ -n "$old" ] || return 0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    _ya_curl -o /dev/null -X DELETE "${YADISK_BASE}/${YADISK_DIR}/${f}" >/dev/null 2>&1 || true
  done <<< "$old"
}

# Конфигурация сервера. База без неё восстанавливается, но поднимать сервер
# заново пришлось бы по памяти: Caddyfile живёт только на сервере (в публичный
# гит его нельзя — там хеш пароля и настройки прокси).
# .env по умолчанию НЕ включаем: там ключ Supabase, пароль базы и токены.
# Включить осознанно: BACKUP_INCLUDE_ENV=1 в .env.
ya_upload_config() {
  _ya_ok || return 1
  local tmp="/tmp/finlife-config-${TS}.tar.gz"
  local list=()
  [ -f "$PROJECT_DIR/Caddyfile" ]               && list+=("Caddyfile")
  [ -f "$PROJECT_DIR/docker-compose.prod.yml" ] && list+=("docker-compose.prod.yml")
  [ -f "$PROJECT_DIR/xray/config.json" ]        && list+=("xray/config.json")
  [ "${BACKUP_INCLUDE_ENV:-0}" = "1" ] && [ -f "$PROJECT_DIR/.env" ] && list+=(".env")
  [ ${#list[@]} -gt 0 ] || return 1

  # crontab — тоже часть конфигурации сервера
  crontab -l > "$PROJECT_DIR/crontab.snapshot" 2>/dev/null && list+=("crontab.snapshot") || true

  tar -czf "$tmp" -C "$PROJECT_DIR" "${list[@]}" 2>/dev/null || { rm -f "$tmp"; return 1; }
  rm -f "$PROJECT_DIR/crontab.snapshot"

  local code
  code="$(_ya_curl -o /dev/null -w '%{http_code}' -T "$tmp" \
            "${YADISK_BASE}/${YADISK_DIR}/config_${TS}.tar.gz" 2>/dev/null || echo 000)"
  rm -f "$tmp"
  case "$code" in
    201|204) return 0 ;;
    *) echo "!! Яндекс.Диск: конфиг вернул HTTP $code" >&2; return 1 ;;
  esac
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

# 2) off-site на Яндекс.Диск — основной канал. Доступен с РФ-сервера напрямую,
#    в отличие от Telegram, которому нужен прокси (из-за чего файлы туда и
#    перестали доходить).
SENT=0
CFG_SENT=0
if _ya_ok; then
  echo "==> Яндекс.Диск → /${YADISK_DIR}/$(basename "$GZ")"
  if ya_upload "$GZ"; then
    SENT=1
    ya_rotate 'prod_[0-9]{8}-[0-9]{6}\.sql\.gz'
  fi
  # Конфигурация сервера — вторым архивом
  if ya_upload_config; then
    CFG_SENT=1
    ya_rotate 'config_[0-9]{8}-[0-9]{6}\.tar\.gz'
  fi
else
  echo "==> Яндекс.Диск не настроен (нет YADISK_USER/YADISK_TOKEN) — только локальный дамп"
fi

# 3) ротация
ls -1t "$BACKUP_DIR"/prod_*.sql.gz 2>/dev/null | tail -n +"$((KEEP+1))" | xargs -r rm -f

trap - ERR

# 4) (опц.) зеркало в приватный git-репозиторий: только последние N дампов,
#    история сплющивается orphan-снапшотом → репозиторий не разрастается.
GIT_STATE=""
if [ -n "${BACKUP_GIT_DIR:-}" ] && [ -d "$BACKUP_GIT_DIR/.git" ]; then
  # Страховка: orphan-пуш ПЕРЕЗАПИСЫВАЕТ историю. Это должен быть ОТДЕЛЬНЫЙ
  # бэкап-репо. Если внутри есть что-то кроме бэкапов (код!) — не трогаем.
  if ls -A "$BACKUP_GIT_DIR" | grep -qvE '^(prod_[0-9-]+\.sql\.gz|\.git|\.gitignore|README\.md)$'; then
    GIT_STATE=" · git ПРОПУЩЕН (посторонние файлы)"
    tg_msg "⚠️ git-бэкап пропущен: в $BACKUP_GIT_DIR есть посторонние файлы. Нужен ОТДЕЛЬНЫЙ приватный репо только для бэкапов."
  elif (
        cd "$BACKUP_GIT_DIR"
        cp -f "$BACKUP_DIR"/prod_*.sql.gz ./ 2>/dev/null || true
        ls -1t prod_*.sql.gz 2>/dev/null | tail -n +"$((KEEP+1))" | xargs -r rm -f
        br="${BACKUP_GIT_BRANCH:-main}"
        git checkout -q --orphan _snap
        git add -A
        git commit -q -m "backup $TS" >/dev/null
        git branch -q -D "$br" 2>/dev/null || true
        git branch -q -m "$br"
        git push -qf origin "$br"
      ); then
    GIT_STATE=" · git ок"
  else
    GIT_STATE=" · git ПРОВАЛ"
    tg_msg "⚠️ git-бэкап не удался ($TS) — проверь доступ к репозиторию."
  fi
fi

# 5) состояние — в базу, чтобы приложение могло показать, если выгрузка
#    перестала уходить. Тихий сбой уже однажды прожил незамеченным месяцами:
#    скрипт писал sent_tg=0 в лог, куда никто не смотрел.
_off=$([ "$SENT" = 1 ] && echo true || echo false)
_cfg=$([ "$CFG_SENT" = 1 ] && echo true || echo false)
docker compose -f docker-compose.prod.yml exec -T db   psql -U finlife -d finlife -q -c   "INSERT INTO backup_status (id, last_run_at, size_text, offsite_ok, config_ok, error)
   VALUES (1, now(), '${SIZE}', ${_off}, ${_cfg}, NULL)
   ON CONFLICT (id) DO UPDATE SET
     last_run_at = EXCLUDED.last_run_at,
     size_text   = EXCLUDED.size_text,
     offsite_ok  = EXCLUDED.offsite_ok,
     config_ok   = EXCLUDED.config_ok,
     error       = EXCLUDED.error;" >/dev/null 2>&1 || true

echo "==> Done: $GZ (yadisk=$SENT, config=$CFG_SENT)$GIT_STATE"
tg_msg "✅ <b>Бэкап FinLife ок</b>
$(date '+%F %T') · ${SIZE}$([ "$SENT" = 1 ] && echo ' · на Я.Диск' || echo ' · на Я.Диск НЕ ушёл')$GIT_STATE"
