# Selfie GPT WA Bot – Docs

## Быстрый старт

1. Установите зависимости и поднимите Postgres/Redis:
```bash
npm i
docker compose up -d
npm run prisma:generate
npm run db:push
```
2. Задайте переменные окружения (`.env`):
```bash
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_SIZE=1024x1024
IMAGE_FIT=contain
GREEN_API_BASE_URL=https://api.green-api.com
GREEN_API_ID_INSTANCE=110001
GREEN_API_API_TOKEN=1100010a1a1a1a1a1a1a1a1a1a1a1a
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/selfie_gpt
REDIS_URL=redis://localhost:6379
PUBLIC_WEBHOOK_URL=https://<your-domain>/api/webhooks/greenapi
FACE_DETECT_MODEL=ssd
```
3. Запустите приложение и воркеры:
```bash
npm run dev
npm run worker
npm run face-worker
```
4. Пропишите URL вебхука в Green-API: `PUBLIC_WEBHOOK_URL` → `/api/webhooks/greenapi`.

## Где хранятся промпты и как их менять
- Файлы: `prompts/realism.md`, `prompts/stylize.md`, `prompts/scene.md`
- Функция сборки: `lib/prompt.ts` (`buildPrompt`)
- Сводка от GPT формируется через `lib/openai.ts` → `summarizeEdit`

## Где лежит API ключ OpenAI
- Используется через `lib/openai.ts`, ключ берётся из `env.OPENAI_API_KEY` (см. `.env`).

## URL вебхука Green-API
- Роут: `app/api/webhooks/greenapi/route.ts`
- Укажите в кабинете Green-API: `https://<domain>/api/webhooks/greenapi`

## Логи и ошибки
- Логгер: `lib/logger.ts` (pino)
- Ошибки фиксируются в логах и в очередях BullMQ (`jobs/*`)

## Тексты сообщений
- Все тексты: `lib/messages.ts`

## Хранение изображений и авто-очистка
- Постоянное хранилище по номеру телефона: `storage/<phoneId>`
- Именование: исходники `0001.jpg`, варианты `0001_3.png`
- Управление хранилищем: `lib/storage.ts`
- Авто-очистка: `jobs/cleanup.ts`, период/TTL: `prompts/config.json` → `retentionDays`
- Запуск очистки вручную: `npm run cleanup`

## Какие сообщения хранятся на сервере
- В БД (Prisma):
  - `User` (id = телефон без `+`)
  - `Session` (state, submenu, paginationOffset)
  - `Photo` (indexNumber, originalPath)
  - `Variant` (mode, resultPath)
  - `PromptLog` (inputText, gptSummary)

## Меню и команды
- Стартовое меню ботов: команда `menu` → вывод `Selfie / YXO / Bot3`
- Основное меню Selfie: `What to do with a selfie?` → 1/2/3
- Список изображений: `list`, подгрузка: `+`, удаление: `-` / `delete` / `del`, выход: `end`
- Шаблон анкеты: `template` (приходит заполненный пример, пользователь может исправить и отправить)

## Эфемерное хранение
- Основные файлы – персистентные в `storage/`
- Эфемерные: временные `.normalized.png` в jobs
- Очистка по TTL через `jobs/cleanup.ts`

## Как работает выбор базы (ORIGINAL/RESULT)
- После генерации бот переводит сессию в `RESULT_MENU` и предлагает:
  1) Add another effect to the result
  2) Add an effect to the original photo
  3) Finish
- Пункт 1 использует последнюю `Variant` как основу; пункт 2 – исходник `000x.jpg`.

## Интеграция YXO/других ботов
- Верхнее меню (`ui.topMenu`) показывает слоты: `Selfie`, `YXO`, `Bot3`
- Текущая реализация в этом проекте обслуживает только Selfie, для YXO – выводится сообщение-редирект

