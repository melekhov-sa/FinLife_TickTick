# Schema-Driven Forms

## Архитектура

```
Backend (Pydantic models)
    │
    ▼
scripts/gen_frontend_schemas.py    ← Python-скрипт, читает Pydantic-модели
    │
    ▼
frontend/schemas/api.generated.ts  ← Zod-схемы + TypeScript-типы (авто)
    │
    ▼
frontend/lib/formErrors.ts         ← validateWithSchema() + parseBackendErrors()
    │
    ▼
frontend/components/modals/*       ← Формы используют схемы для валидации
```

## Как обновить типы после изменений backend

```bash
# Из папки frontend:
pnpm gen:api

# Или из корня проекта:
.venv/Scripts/python.exe scripts/gen_frontend_schemas.py
```

## Как работает валидация в формах

Каждая форма использует двухслойную валидацию:

### Layer 1: Zod-схема (из backend-контракта)
```typescript
import { CreateTaskRequestSchema } from "@/schemas/api.generated";
import { validateWithSchema } from "@/lib/formErrors";

const zodErrs = validateWithSchema(CreateTaskRequestSchema, payload);
```
Ловит: неправильные типы, отсутствие обязательных полей.

### Layer 2: Бизнес-правила (контекстные)
```typescript
const custom: FieldErrors = {};
if (dueKind !== "NONE" && !dueDate) custom.due_date = "Укажите дату";
```
Ловит: условную обязательность, перекрёстные проверки.

### Объединение
```typescript
const merged = mergeErrors(zodErrs, custom);
```

### Backend-ошибки (422)
```typescript
const parsed = parseBackendErrors(res.status, data);
if (parsed.fieldErrors) setFieldErrors(parsed.fieldErrors);
```

## Как добавить новую форму

1. Добавить Pydantic-модель в backend (`app/api/v2/*.py`)
2. Добавить модель в реестр `MODELS` в `scripts/gen_frontend_schemas.py`
3. Запустить `pnpm gen:api`
4. В форме:
   ```typescript
   import { NewModelSchema } from "@/schemas/api.generated";
   import { validateWithSchema, mergeErrors } from "@/lib/formErrors";
   ```

## Файлы

| Файл | Что делает |
|------|-----------|
| `scripts/gen_frontend_schemas.py` | Генерирует Zod из Pydantic |
| `frontend/schemas/api.generated.ts` | Сгенерированные схемы (НЕ РЕДАКТИРОВАТЬ) |
| `frontend/lib/formErrors.ts` | validateWithSchema, parseBackendErrors, UI-хелперы |
| `frontend/components/modals/*` | Формы с двухслойной валидацией |
