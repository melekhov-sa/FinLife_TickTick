# Telegram-прокси через VLESS (xray)

api.telegram.org недоступен с РФ-сервера напрямую. Этот сайдкар поднимает
VLESS-клиент, который отдаёт socks5-прокси **только внутри docker-сети**
(`socks5://xray:1080`). Бэкенд ходит через него только к Telegram
(переменная `TELEGRAM_PROXY`), весь остальной трафик сервера не трогается.

## Настройка (один раз)

1. Скопируй шаблон и заполни из своей vless://-ссылки:

   ```bash
   cd /opt/centricore
   cp xray/config.example.json xray/config.json
   nano xray/config.json
   ```

   Разбор ссылки `vless://UUID@HOST:PORT?type=tcp&security=reality&pbk=PBK&fp=chrome&sni=SNI&sid=SID&flow=xtls-rprx-vision#name`:

   | Из ссылки            | Куда в config.json                                  |
   |----------------------|-----------------------------------------------------|
   | `UUID` (до `@`)      | `outbounds[0].settings.vnext[0].users[0].id`        |
   | `HOST:PORT`          | `vnext[0].address` и `vnext[0].port`                |
   | `flow=`              | `users[0].flow` (нет параметра — оставь `""`)       |
   | `security=reality`   | уже стоит `"security": "reality"`                   |
   | `pbk=`               | `realitySettings.publicKey`                         |
   | `sni=`               | `realitySettings.serverName`                        |
   | `sid=`               | `realitySettings.shortId` (нет — пустая строка)     |
   | `fp=`                | `realitySettings.fingerprint`                       |

   Если у тебя `security=tls&type=ws` (WS+TLS, не Reality) — скажи, дам другой шаблон.

2. Включи профиль и прокси в `.env`:

   ```bash
   echo 'COMPOSE_PROFILES=proxy' >> .env
   echo 'TELEGRAM_PROXY=socks5://xray:1080' >> .env
   ```

3. Передеплой как обычно (`./deploy_prod.sh` или `docker compose -f docker-compose.prod.yml up -d --build`).

## Проверка

```bash
# прокси жив и выпускает наружу через VLESS:
docker exec centricore_app sh -lc "python -c \"import httpx; print(httpx.post('https://api.telegram.org', proxy='socks5://xray:1080', timeout=10).status_code)\""
# любой HTTP-ответ (404/302) = туннель работает; таймаут = проверь config.json
docker logs centricore_xray --tail 20
```
