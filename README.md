# FinLife_TickTick
Соединение 1С:Деньги и TickTick, только удобнее!

## Admin Panel

### Назначить себя админом

```sql
UPDATE users SET is_admin = true WHERE email = 'your@email.com';
```

### Миграция (добавляет is_admin и last_seen_at)

```bash
# Локально
DATABASE_URL="postgresql://finlife:password@localhost:5432/finlife" alembic upgrade head

# Docker
docker exec -it finlife-app alembic upgrade head
```

### Доступ

- `/admin/overview` — сводка: пользователи, DAU/WAU/MAU, retention, топ активных
- `/admin/users` — таблица пользователей с метриками активности
- `/admin/users/new` — создание пользователя (email + пароль + is_admin)
- `/admin/users/{id}` — карточка пользователя, лента последних 50 событий

Доступ только для `is_admin = true`. Все остальные получают HTTP 403.

### События для статистики активности

Источник данных — таблица `event_log`. Типы событий, учитываемые как "активность":

| Тип события | Описание |
|---|---|
| `user_logged_in` | Вход в систему |
| `transaction_created` | Создана финансовая операция |
| `task_created` | Создана задача |
| `task_completed` | Задача выполнена |
| `task_occurrence_completed` | Повторяющаяся задача выполнена |
| `habit_occurrence_completed` | Привычка выполнена |
| `calendar_event_created` | Создано событие |
| `wallet_created` | Создан кошелёк |
| `category_created` | Создана категория |
| `wish_created` | Создана хотелка |
| `goal_created` | Создана цель |
| `budget_month_created` | Создан бюджет |

### Метрики

- **DAU**: уникальные пользователи с активностью за сегодня
- **WAU**: за последние 7 дней
- **MAU**: за последние 30 дней
- **Retention 14d**: пользователи, активные в 2+ разных дня за последние 14 дней
- **Топ-10 активных**: по количеству событий за 30 дней
