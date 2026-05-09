#!/bin/bash
set -e

APP="docker-compose.prod.yml"
DIR="/opt/centricore"

echo ""
echo "=== ДЕПЛОЙ $(date '+%d.%m.%Y %H:%M:%S') ==="
echo ""

# 1. Получить обновления
echo "▶ Получаю обновления из git..."
cd "$DIR"
git pull
echo ""

# 2. Сборка
echo "▶ Собираю образы..."
docker compose -f "$APP" build app frontend
echo ""

# 3. Запуск
echo "▶ Запускаю контейнеры..."
docker compose -f "$APP" up -d app frontend
echo ""

# 4. Проверка
echo "▶ Проверяю статус..."
sleep 3
docker compose -f "$APP" ps app frontend

echo ""
# Ищем ошибки в логах за последние 10 строк
LOGS=$(docker compose -f "$APP" logs app --tail=10 2>&1)
if echo "$LOGS" | grep -qi "error\|failed\|exception"; then
    echo "⚠ Найдены ошибки в логах бэкенда:"
    echo "$LOGS"
    exit 1
else
    echo "✓ Деплой завершён успешно"
fi

echo ""
