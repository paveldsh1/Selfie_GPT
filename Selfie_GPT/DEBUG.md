# Руководство по отладке Selfie GPT

## Настройка отладчика

Проект настроен для отладки в VS Code/Cursor с несколькими конфигурациями.

## Способы запуска отладки

### 1. Отладка через VS Code/Cursor (Рекомендуется)

#### Открытие панели отладки:
- **Ctrl+Shift+D** (Windows/Linux)
- **Cmd+Shift+D** (Mac)
- Или нажмите на иконку "Run and Debug" в боковой панели

#### Доступные конфигурации:

1. **Next.js: debug server-side** - Отладка серверного кода
2. **Next.js: debug client-side** - Отладка клиентского кода в браузере
3. **Next.js: debug full stack** - Полная отладка (сервер + клиент)
4. **Debug Job Worker** - Отладка воркера генерации изображений
5. **Debug Face Worker** - Отладка воркера обнаружения лиц
6. **Debug Cleanup Job** - Отладка задачи очистки

### 2. Отладка через команды в терминале

```bash
# Запуск Next.js с отладкой (кроссплатформенно)
npm run dev:debug

# Альтернатива для Windows PowerShell
npm run dev:debug:win

# Отладка воркеров
npm run worker:debug
npm run face-worker:debug
npm run cleanup:debug
```

**Примечание для Windows:** Если команда `npm run dev:debug` не работает в PowerShell, используйте `npm run dev:debug:win`

## Пошаговая инструкция для начинающих

### Шаг 1: Установка точек останова (breakpoints)
1. Откройте файл, который хотите отладить
2. Кликните слева от номера строки, где хотите остановить выполнение
3. Появится красная точка - это breakpoint

### Шаг 2: Запуск отладки
1. Нажмите **Ctrl+Shift+D** для открытия панели отладки
2. Выберите нужную конфигурацию из выпадающего списка
3. Нажмите зеленую кнопку "Play" или **F5**

### Шаг 3: Использование отладчика
- **F5** - Продолжить выполнение
- **F10** - Шаг через (step over)
- **F11** - Шаг в функцию (step into)
- **Shift+F11** - Шаг из функции (step out)
- **Shift+F5** - Остановить отладку

### Панели отладчика:
- **Variables** - Переменные в текущем контексте
- **Watch** - Отслеживаемые выражения
- **Call Stack** - Стек вызовов
- **Breakpoints** - Управление точками останова

## Отладка различных частей приложения

### Отладка API роутов
1. Откройте файл `app/api/*/route.ts`
2. Поставьте breakpoint в нужной функции
3. Запустите "Next.js: debug server-side"
4. Сделайте запрос к API

### Отладка React компонентов
1. Поставьте breakpoint в компоненте
2. Запустите "Next.js: debug client-side"
3. Откройте страницу в браузере

### Отладка воркеров
1. Откройте файл в папке `jobs/`
2. Поставьте breakpoint
3. Запустите соответствующую конфигурацию Debug Worker

## Полезные советы

### Отладка асинхронного кода
- Используйте `await` для ожидания Promise
- Breakpoints работают внутри async/await функций

### Отладка ошибок
- Включите "Pause on exceptions" в панели отладки
- Используйте `try/catch` блоки с breakpoints

### Просмотр HTTP запросов
- Откройте DevTools браузера (F12)
- Вкладка Network для мониторинга запросов

### Логирование
```typescript
// Вместо console.log используйте logger
import { logger } from '@/lib/logger';

logger.info('Debug info', { data });
logger.error('Error occurred', error);
```

## Устранение проблем

### Если отладчик не останавливается на breakpoints:
1. Убедитесь, что код компилируется без ошибок
2. Проверьте, что source maps включены
3. Перезапустите отладчик

### Если не видно переменных:
1. Убедитесь, что находитесь в правильном scope
2. Проверьте Call Stack
3. Возможно, переменная оптимизирована компилятором

### Проблемы с TypeScript:
1. Убедитесь, что `sourceMap: true` в tsconfig.json
2. Проверьте, что типы корректны
3. Используйте `tsx` для запуска TypeScript файлов

## Дополнительные ресурсы

- [VS Code Debugging Guide](https://code.visualstudio.com/docs/editor/debugging)
- [Next.js Debugging](https://nextjs.org/docs/app/building-your-application/debugging)
- [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)
