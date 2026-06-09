# CLAUDE.md

Инструкции для Claude Code и любого ИИ-ассистента по этому репозиторию.
Цель файла — чтобы не приходилось каждый раз заново «угадывать» конвенции проекта.

## Что это за проект

Full-stack приложение «финансы + продуктивность» (внутреннее имя — Centricore / FinLife).

- **Backend**: FastAPI, SQLAlchemy 2.0 (`Mapped`/`mapped_column`), Alembic, PostgreSQL.
  Авторизация — **Supabase** (JWT). Python в `.venv`.
- **Frontend**: Next.js 16, React 19, Tailwind v4, TypeScript 5,
  `@tanstack/react-query` v5, Supabase JS, Tiptap, dnd-kit,
  react-hook-form + zod, recharts, lucide-react.

## Структура репозитория

```
app/                        # backend
  api/v1/                   # SSR HTML-страницы (Jinja) + legacy
  api/v2/                   # JSON API для фронта, префикс /api/v2
    __init__.py             # регистрация роутеров (include_router)
    deps.py                 # get_user_id — зависимость авторизации
  infrastructure/db/
    models.py               # SQLAlchemy-модели
    database.py             # get_db
  main.py                   # точка входа FastAPI
migrations/versions/        # Alembic
frontend/
  app/(app)/<page>/page.tsx # страницы приложения
  components/primitives/     # дизайн-система (PageHeader, EmptyState, Tabs, Heatmap, BottomSheet…)
  components/dashboard/      # виджеты дашборда
  components/layout/AppSidebar.tsx  # навигация (NAV_ITEMS)
  lib/api.ts                # API-клиент
  hooks/                    # react-query хуки
  types/api.ts              # ручные TS-типы
  schemas/api.generated.ts  # сгенерированные Zod-схемы (частично, только формы)
scripts/                    # утилиты: сидинг, codegen
tests/                      # pytest
```

## Команды

| Задача | Команда |
|---|---|
| Backend dev | `.\run.ps1` (uvicorn :8000, нужен `.venv`) |
| Frontend dev | `cd frontend; npm run dev` |
| **Проверка типов фронта** | `cd frontend; npx tsc --noEmit` |
| Lint фронта | `cd frontend; npm run lint` |
| Тесты backend | `pytest` (часть требует БД; маркеры `integration`/`unit`) |
| Codegen типов | `cd frontend; npm run gen:api` → `frontend/schemas/api.generated.ts` |
| Деплой (на сервере) | `cd /opt/centricore; ./deploy_prod.sh` |

Деплой: бэкап БД → `git pull` → `docker compose -f docker-compose.prod.yml up -d --build`
→ health-check `/ready`. **Миграции применяются автоматически** при старте контейнера
(`alembic upgrade head && uvicorn …`).

## Backend — конвенции

- **Авторизация v2**: скоуп по пользователю всегда через
  `account_id: int = Depends(get_user_id)` (импорт `from app.api.v2.deps import get_user_id`).
  ⚠️ НЕ выдумывать имена вроде `get_current_account_id` — их нет.
- **Таблицы `accounts` НЕТ** (auth в Supabase). Поле `account_id` — это обычный
  `Integer` с индексом, **без ForeignKey**:
  `account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)`.
  В миграции — колонка + `op.create_index`, без `ForeignKeyConstraint` на `accounts`.
  FK на собственные таблицы проекта (напр. `flashcards.id`) — можно.
- **Pydantic-схемы** определяются inline в файле роутера (`BaseModel`), у эндпоинтов — `response_model`.
- **Модели**: SQLAlchemy 2.0 (`Mapped`/`mapped_column`).
  В `models.py` импорт `from datetime import date as date_type, time as time_type` —
  использовать алиасы `date_type`/`time_type`. Таймстемпы — `TIMESTAMP(timezone=True)`.
- **Новый роутер** обязательно регистрировать в `app/api/v2/__init__.py` (импорт + `include_router`).
- **Миграции**:
  - revision ID — буквенно-цифровая строка; **всегда** grep'ом проверять уникальность перед созданием.
  - `down_revision` = текущая голова (одна голова в цепочке).
  - Каждая миграция в транзакции (DDL в Postgres транзакционный) — упавшая миграция откатывается целиком.

## Frontend — конвенции

- **API-клиент** (`lib/api.ts`):
  - `api.get<T>(path)` возвращает `T` **напрямую** (не AxiosResponse; никаких `.then(r => r.data)`).
  - `api.post<T>(path, bodyObj)` / `put` / `patch` — тело это объект, сериализуется в JSON автоматически.
    `delete`, `postForm` (для `FormData`).
  - **Нет опции `params`** — query-строку собирать вручную (`?q=${encodeURIComponent(...)}`).
  - 204 / пустой ответ → `undefined`. Auth-заголовок (Supabase Bearer) добавляется сам.
- **Данные**: `@tanstack/react-query` v5 (`useQuery`/`useMutation`, `queryKey`-массивы,
  `invalidateQueries` для обновления).
- **Типы**: основной паттерн — **ручные TS-интерфейсы** (в `types/api.ts` или inline).
  Codegen (`api.generated.ts`) частичный — только request-схемы для форм с zod-валидацией.
  `gen:api` запускать **по необходимости**, когда подключаешь форму к сгенерированной схеме.
- **Дизайн-система** в `components/primitives`. Важные API:
  - `PageHeader`: `title`, `subtitle`, `back={{ onClick }}` (НЕ `backHref`), `tabs`, `actions`, `divider`.
  - `EmptyState`: `action={{ label, onClick, icon? }}` — объект, не JSX.
  - `BottomSheet`: требует проп `open: boolean`.
  - `Tabs`: `items=[{id,label,count?}]`, `active`, `onChange`, `variant "underline"|"pills"`.
  - `Heatmap`: `cells=[{date,value,label?}]`.
- **Темизация** через CSS-переменные: `var(--t-primary)`, `var(--t-muted)`, `var(--t-faint)`,
  `var(--app-accent)`, `var(--app-accent-weak)`, `var(--app-card-bg)`, `var(--app-border)`.
  Использовать их, а не хардкод цветов (кроме осознанных акцентов).
- **Новая страница**: `app/(app)/<name>/page.tsx` + пункт в `components/layout/AppSidebar.tsx`
  (`NAV_ITEMS`) с иконкой из `lucide-react`.

## Definition of done

- После изменений фронта — `npx tsc --noEmit` в `frontend/` (должно быть 0 ошибок).
- Корректность бэка проверяется на деплое (alembic + старт). Перед коммитом сверять
  имена импортов/зависимостей с уже существующими роутерами (не выдумывать API).

## Как работать (поведение)

- **Общаться по-русски.**
- Перед предложением новых фич — **проверять существующие** страницы (`app/(app)/`)
  и `AppSidebar`. Не предлагать то, что уже реализовано.
- Когда юзер говорит «не загружается» / «сломалось» — **сначала просить логи**, не диагностировать вслепую.
- Коммитить/пушить — **только когда юзер попросит**.
- Заканчивать сообщения коммитов строкой:
  `Co-Authored-By: Claude <noreply@anthropic.com>`.

> Помимо этого файла у ассистента есть персональная файловая память
> (`~/.claude/projects/.../memory/`) — там факты и предпочтения вне репозитория.
> Этот `CLAUDE.md` — версионируемый компаньон с техническими конвенциями.
