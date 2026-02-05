# Selfie GPT WA Bot

Production‑oriented WhatsApp bot for selfie editing via Green‑API and OpenAI Images.
Receives WhatsApp webhooks, validates faces, manages a stateful dialog, and runs async image jobs.

## Demo
![Demo](docs/demo.gif)

---

## English

### Features
- WhatsApp webhook integration via Green‑API (receive + send)
- Stateful menu flow with reminders and persistence
- Face detection gate via BullMQ worker + TensorFlow/Blazeface
- OpenAI moderation, prompt summarization, and image edits
- Async image pipeline with Redis/BullMQ workers
- Postgres/Prisma metadata + file storage with TTL cleanup

### Architecture
```mermaid
flowchart LR
  User["WhatsApp User"]
  GA["Green-API (WhatsApp gateway)"]
  Webhook["Next.js API /api/webhooks/greenapi"]
  DB["Postgres (Prisma)"]
  Storage["File storage /storage"]
  Redis["Redis"]
  FaceQ["BullMQ: face-detect"]
  ImgQ["BullMQ: image-generate"]
  RemQ["BullMQ: reminders"]
  FaceW["Worker: jobs/face-detect.ts"]
  ImgW["Worker: jobs/image-generate.ts"]
  RemW["Worker: jobs/reminder.ts"]
  OpenAI["OpenAI (Moderation + Images)"]

  User --> GA --> Webhook
  Webhook --> DB
  Webhook --> Storage
  Webhook --> FaceQ
  Webhook --> ImgQ
  Webhook --> RemQ
  FaceQ --> FaceW
  FaceW -- result --> Webhook
  ImgQ --> ImgW --> OpenAI
  ImgW --> Storage
  ImgW --> DB
  ImgW --> GA
  RemQ --> RemW --> GA
```

### Backend Architecture & Modules
- `app/api/webhooks/greenapi/route.ts` + `app/api/health/route.ts` — webhook entrypoint and health check
- `lib/db.ts` — data access layer for users, sessions, photos, variants, prompt logs
- `lib/greenapi.ts` + `lib/openai.ts` — external API adapters (WhatsApp + OpenAI)
- `lib/storage.ts` + `lib/face-policy.ts` — file storage and face‑preservation policy
- `jobs/image-generate.ts` + `jobs/face-detect.ts` + `jobs/reminder.ts` — background workers
- `prompts/*` + `lib/prompt.ts` + `lib/messages.ts` — prompt templates and UI texts

### Data & API Flow
- `Green-API → /api/webhooks/greenapi` — inbound WhatsApp events
- Image message: download → face detect → save original → create `Photo` + update `Session`
- Text message: command parsing → moderation + summarization → enqueue image job
- Image job: OpenAI edit → save `Variant` → send result via Green‑API → set `RESULT_MENU`
- Reminder jobs re-send menus when the user becomes idle
- Cleanup job removes old files based on `prompts/config.json` retention

### Sequence: Image Generation
```mermaid
sequenceDiagram
  participant U as WhatsApp User
  participant GA as Green-API
  participant S as Webhook (Next.js)
  participant FQ as Face Queue
  participant FW as Face Worker
  participant DB as Postgres
  participant IQ as Image Queue
  participant IW as Image Worker
  participant O as OpenAI

  U->>GA: Send selfie
  GA->>S: POST /api/webhooks/greenapi
  S->>FQ: enqueue face-detect
  FQ->>FW: detect face
  FW-->>S: hasFace
  S->>DB: upsert User/Session + record Photo
  S->>O: moderation + summarize
  S->>IQ: enqueue image job
  IQ->>IW: generate edit
  IW->>O: images.edit
  IW->>DB: record Variant
  IW->>GA: send result
```

### Design Patterns & Practices
- State machine for dialogue (`Session.state` transitions)
- Adapter/Gateway for external APIs (`lib/greenapi`, `lib/openai`)
- Data‑access layer via Prisma helpers (`lib/db`)
- Producer–Consumer queues with BullMQ workers
- Policy enforcement for face identity (`lib/face-policy`)
- Template rendering for prompts (`prompts/*.md`, `lib/prompt.ts`)

### Data Model (Prisma)
- `User` — WhatsApp phone id
- `Session` — state, submenu, pagination, last activity
- `Photo` — original selfie metadata
- `Variant` — generated results
- `PromptLog` — input and summarized prompt

### Tech Stack
- Runtime & language — Node.js 20, TypeScript 5 (ESM)
- Web framework — Next.js 14 (App Router), React 18
- Data layer — PostgreSQL, Prisma
- Queues & workers — Redis, BullMQ, `tsx`
- AI & vision — OpenAI Images + Moderation, TensorFlow.js + Blazeface
- Media processing — Sharp, jpeg-js, mime-types
- Integrations — Green‑API (WhatsApp), axios, form-data
- Config & logging — dotenv, zod, pino
- Infra — Docker, Docker Compose

### Run (local)
1. `npm i`
2. `docker compose up -d`
3. `npm run prisma:generate`
4. `npm run db:push`
5. Create `.env`
6. `npm run dev`
7. `npm run worker`
8. `npm run face-worker`

### Environment variables
```bash
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_SIZE=1024x1024
IMAGE_FIT=contain
GREEN_API_BASE_URL=https://api.green-api.com
GREEN_API_ID_INSTANCE=110001
GREEN_API_API_TOKEN=...
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/selfie_gpt
REDIS_URL=redis://localhost:6379
PUBLIC_WEBHOOK_URL=https://<your-domain>/api/webhooks/greenapi
FACE_DETECT_MODEL=ssd
```

### Project Structure
```
app/            Next.js App Router + API routes
jobs/           BullMQ workers (image, face, reminders, cleanup)
lib/            integrations, storage, policies, helpers
prisma/         schema and migrations
prompts/        prompt templates
docs/           assets (demo)
```

---

## Русский

### Возможности
- Интеграция WhatsApp через Green‑API (webhook и отправка ответов)
- Состояния диалога, меню и напоминания с сохранением в БД
- Проверка лица в фоне (BullMQ worker + TensorFlow/Blazeface)
- OpenAI: модерация, суммаризация запроса, генерация изображений
- Асинхронный пайплайн обработки через Redis/BullMQ
- Postgres/Prisma + файловое хранилище с TTL‑очисткой

### Архитектура
```mermaid
flowchart LR
  User["Пользователь WhatsApp"]
  GA["Green-API (WhatsApp gateway)"]
  Webhook["Next.js API /api/webhooks/greenapi"]
  DB["Postgres (Prisma)"]
  Storage["Файловое хранилище /storage"]
  Redis["Redis"]
  FaceQ["BullMQ: face-detect"]
  ImgQ["BullMQ: image-generate"]
  RemQ["BullMQ: reminders"]
  FaceW["Worker: jobs/face-detect.ts"]
  ImgW["Worker: jobs/image-generate.ts"]
  RemW["Worker: jobs/reminder.ts"]
  OpenAI["OpenAI (Moderation + Images)"]

  User --> GA --> Webhook
  Webhook --> DB
  Webhook --> Storage
  Webhook --> FaceQ
  Webhook --> ImgQ
  Webhook --> RemQ
  FaceQ --> FaceW
  FaceW -- result --> Webhook
  ImgQ --> ImgW --> OpenAI
  ImgW --> Storage
  ImgW --> DB
  ImgW --> GA
  RemQ --> RemW --> GA
```

### Архитектура и модули
- `app/api/webhooks/greenapi/route.ts` + `app/api/health/route.ts` — webhook и health check
- `lib/db.ts` — слой данных для пользователей, сессий, фото, вариантов, логов
- `lib/greenapi.ts` + `lib/openai.ts` — адаптеры внешних API (WhatsApp + OpenAI)
- `lib/storage.ts` + `lib/face-policy.ts` — файловое хранилище и политика сохранения лица
- `jobs/image-generate.ts` + `jobs/face-detect.ts` + `jobs/reminder.ts` — фоновые воркеры
- `prompts/*` + `lib/prompt.ts` + `lib/messages.ts` — шаблоны промптов и тексты UI

### Поток данных и API
- `Green-API → /api/webhooks/greenapi` — входящие события WhatsApp
- Фото: загрузка → проверка лица → сохранение оригинала → `Photo` + обновление `Session`
- Текст: парсинг команд → модерация + суммаризация → постановка image‑job
- Image job: OpenAI edit → сохранение `Variant` → отправка результата → `RESULT_MENU`
- Напоминания переотправляют меню при простое пользователя
- Очистка удаляет старые файлы по `prompts/config.json`

### Последовательность: генерация изображения
```mermaid
sequenceDiagram
  participant U as WhatsApp User
  participant GA as Green-API
  participant S as Webhook (Next.js)
  participant FQ as Face Queue
  participant FW as Face Worker
  participant DB as Postgres
  participant IQ as Image Queue
  participant IW as Image Worker
  participant O as OpenAI

  U->>GA: Send selfie
  GA->>S: POST /api/webhooks/greenapi
  S->>FQ: enqueue face-detect
  FQ->>FW: detect face
  FW-->>S: hasFace
  S->>DB: upsert User/Session + record Photo
  S->>O: moderation + summarize
  S->>IQ: enqueue image job
  IQ->>IW: generate edit
  IW->>O: images.edit
  IW->>DB: record Variant
  IW->>GA: send result
```

### Паттерны и практики
- Машина состояний диалога (`Session.state`)
- Adapter/Gateway для внешних API (`lib/greenapi`, `lib/openai`)
- Слой доступа к данным через Prisma helpers (`lib/db`)
- Producer–Consumer очереди с BullMQ воркерами
- Policy pattern для защиты идентичности лица (`lib/face-policy`)
- Шаблоны промптов (`prompts/*.md`, `lib/prompt.ts`)

### Модели данных (Prisma)
- `User` — phone id WhatsApp
- `Session` — состояние, submenu, пагинация, активность
- `Photo` — метаданные исходного селфи
- `Variant` — сгенерированные результаты
- `PromptLog` — исходный текст и итоговый prompt

### Технологии
- Среда и язык — Node.js 20, TypeScript 5 (ESM)
- Веб‑фреймворк — Next.js 14 (App Router), React 18
- Данные — PostgreSQL, Prisma
- Очереди и воркеры — Redis, BullMQ, `tsx`
- AI и CV — OpenAI Images + Moderation, TensorFlow.js + Blazeface
- Обработка медиа — Sharp, jpeg-js, mime-types
- Интеграции — Green‑API (WhatsApp), axios, form-data
- Конфигурация и логирование — dotenv, zod, pino
- Инфраструктура — Docker, Docker Compose

### Запуск (локально)
1. `npm i`
2. `docker compose up -d`
3. `npm run prisma:generate`
4. `npm run db:push`
5. Создайте `.env`
6. `npm run dev`
7. `npm run worker`
8. `npm run face-worker`

### Переменные окружения
```bash
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_SIZE=1024x1024
IMAGE_FIT=contain
GREEN_API_BASE_URL=https://api.green-api.com
GREEN_API_ID_INSTANCE=110001
GREEN_API_API_TOKEN=...
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/selfie_gpt
REDIS_URL=redis://localhost:6379
PUBLIC_WEBHOOK_URL=https://<your-domain>/api/webhooks/greenapi
FACE_DETECT_MODEL=ssd
```

### Структура проекта
```
app/            Next.js App Router + API routes
jobs/           BullMQ workers (image, face, reminders, cleanup)
lib/            интеграции, хранилище, политики, helpers
prisma/         схема и миграции
prompts/        шаблоны промптов
docs/           ассеты (demo)
```

