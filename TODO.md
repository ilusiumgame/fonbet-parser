# TODO: Fonbet & Pari Collector v2.2.2

Мультисайтовый сбор данных с fon.bet и pari.ru. Страницы: `/operations` (история операций), `/bonuses` (фрибеты).

---

## Статус проекта

| Фаза | Статус | Описание |
|------|--------|----------|
| Фаза 1 | ✅ ВЫПОЛНЕНО | Исправление BetsDetailsFetcher |
| Фаза 2 | ✅ ВЫПОЛНЕНО | Автоматизация процесса |
| Фаза 3 | ✅ ЧАСТИЧНО | Оптимизация (exponential backoff) |
| Фаза 4 | ✅ ВЫПОЛНЕНО | Чистка кода |
| Фаза 4.5 | ✅ ВЫПОЛНЕНО | Дополнительная оптимизация |
| Фаза 5 | ✅ ВЫПОЛНЕНО | Обновление экспорта |
| Фаза 6 | ✅ ВЫПОЛНЕНО | UI улучшения и панель настроек |
| Фаза 6.1 | ✅ ВЫПОЛНЕНО | Баг-фиксы и чистка кода |
| Фаза 6.2 | ✅ ВЫПОЛНЕНО | Критический баг-фикс |
| Фаза 6.3 | ✅ ВЫПОЛНЕНО | Исправление endpoint для пагинации |
| Фаза 6.4 | ✅ ВЫПОЛНЕНО | Исправление обработки пустых финальных ответов |
| Фаза 7 | ✅ ВЫПОЛНЕНО | Мультисайтовая поддержка (v2.0.0) |
| Фаза 8 | ✅ ВЫПОЛНЕНО | Cleanup мёртвого кода (v2.0.1) |
| Фаза 9 | ✅ ВЫПОЛНЕНО | GitHub Sync — синхронизация с GitHub (v2.1.0) |
| Фаза 10 | ✅ ВЫПОЛНЕНО | Cleanup и рефакторинг (v2.1.1) |
| Фаза 11 | ✅ ВЫПОЛНЕНО | UI-фиксы панели настроек + баг-фиксы |
| Фаза 12 | ✅ ВЫПОЛНЕНО | Фикс: nextOperations ломал сбор операций |
| Фаза 13 | ✅ ВЫПОЛНЕНО | Фикс: Git Blob API для файлов > 1MB в sync |
| Фаза 14 | ✅ ВЫПОЛНЕНО | SegmentMapper: подстановка названий лиг по segmentId |
| Фаза 15 | ✅ ВЫПОЛНЕНО | Баг-фиксы: повторный старт, "готово к sync", UI настроек |
| Фаза 16 | ✅ ВЫПОЛНЕНО | FreebetCollector: сбор фрибетов с /bonuses (v2.2.0) |
| Фаза 16.1 | ✅ ВЫПОЛНЕНО | Баг-фиксы FreebetCollector (v2.2.1–v2.2.2) |

---

## Ключевое открытие

**При клике на строку операции на `/operations` происходит запрос `coupon/info`!**

```
URL: https://clientsapi-lb52-w.bk6bba-resources.ru/coupon/info
Body: {"regId": <marker>, "lang": "ru", "betTypeName": "sport", "fsid": "...", ...}
```

**Важно:** `marker` операции = `regId` для запроса деталей!

---

## Фазы 1–8: Ранняя разработка (v1.15.x → v2.0.1) ✅

<details>
<summary>Краткое описание завершённых фаз (нажмите чтобы развернуть)</summary>

- **Фаза 1:** Исправление BetsDetailsFetcher — marker вместо regId, 271 ставка, 100% success
- **Фаза 2:** Автоматизация — автозапуск сбора и загрузки деталей
- **Фаза 3:** Оптимизация — exponential backoff (500ms→8s, multiplier 2)
- **Фаза 4:** Чистка — удалён AutoOpener, ProfileManager, SettingsModal, Mode slider (~1822 строки, -36%)
- **Фаза 4.5:** Доп. чистка — удалены retry/click логика XHR, mode UI (~711 строк, -22%)
- **Фаза 5:** Экспорт JSON v2.1 — detailsLoaded/Failed/Skipped
- **Фаза 6:** UI — панель настроек, toggle-переключатели, прогресс-бар, SettingsManager
- **Фаза 6.1–6.4:** Баг-фиксы — счётчики UI, критический баг initializeModeSlider, endpoint пагинации (.com→.ru), пустые финальные ответы
- **Фаза 7:** Мультисайт v2.0.0 — SiteDetector, fon.bet + pari.ru, единые eventId
- **Фаза 8:** Cleanup v2.0.1 — удалён мёртвый код (~277 строк, -8.8%)

</details>

---

## Известные ограничения

1. **Быстрые ставки (760, 764)** — детали недоступны через coupon/info

---

## Проверенные факты

| Факт | Значение |
|------|----------|
| Операции содержат regId? | ❌ НЕТ |
| Операции содержат marker? | ✅ ДА |
| marker = regId для coupon/info? | ✅ ДА |
| Клик на строку /operations вызывает coupon/info? | ✅ ДА |
| Можно делать прямой fetch coupon/info? | ✅ ДА |
| AutoOpener нужен? | ❌ НЕТ (удалён) |
| ProfileManager нужен? | ❌ НЕТ (удалён) |
| SettingsModal нужен? | ❌ НЕТ (удалён) |
| Mode slider нужен? | ❌ НЕТ (удалён) |
| XHR retry логика нужна? | ❌ НЕТ (удалён) |

---

## Фаза 9: GitHub Sync ✅ ВЫПОЛНЕНО (v2.1.0)

Модуль инкрементальной синхронизации данных с GitHub.

### Реализовано:
- [x] Модуль GitHubSync (~560 строк): API, merge, sync, setup dialog, changeAlias
- [x] Обёртка GM_xmlhttpRequest для CORS-free GitHub API запросов
- [x] Merge-логика по ключу `marker` (local overwrites remote)
- [x] SHA-конфликт retry при параллельном sync
- [x] Диалог настройки с тестированием подключения
- [x] changeAlias() с безопасным переименованием файла в GitHub
- [x] Рефакторинг ExportModule: _buildExportData() — общий метод для экспорта и sync
- [x] UI: кнопка Sync, статус синхронизации, настройки sync в панели
- [x] Консольные команды: collector.sync(), collector.changeAlias()

---

## Фаза 10: Cleanup и рефакторинг ✅ ВЫПОЛНЕНО (v2.1.1)

- [x] Удалён мёртвый код: EventBus, SegmentMapper, onCollectionComplete, setActiveGroups, fetchAllBetsDetails, UIPanel.destroy, Notification.requestPermission
- [x] Объединены дублированные ветки завершения сбора
- [x] Hardcoded `'2.1.0'` → `VERSION` константа
- [x] Исправлены устаревшие комментарии
- Итого: 3549 → ~3387 строк (-162 строки, -4.6%)

---

## Фаза 11: UI-фиксы панели настроек + баг-фиксы ✅ ВЫПОЛНЕНО

- [x] Solid фон header/footer настроек (rgba → #1a1a2e)
- [x] Цвет заголовка "Настройки" → белый
- [x] Toggle-переключатели вместо чекбоксов
- [x] Исправлена кодировка Unicode в alert GitHubSync
- [x] Фикс: initial lastOperations с completed:true → проверочный prevOperations
- [x] Фикс: _getFile() корректно декодирует base64 с UTF-8 (Cyrillic)

---

## Фаза 12: Фикс nextOperations ✅ ВЫПОЛНЕНО (v2.1.1-hotfix)

### Проблема:
- [x] **Сбор операций останавливался на 200 вместо полной истории (~8000+)**
  - Страница fon.bet поллит `nextOperations` для real-time обновлений
  - Кэшированные ответы (`completed:true`) убивали коллектор до завершения пагинации

### Исправление:
- [x] Удалён перехват `nextOperations` из всех интерсепторов (5 мест)
- **Результат:** 8282 операции вместо 200. Коммит: `8fed10b`

---

## Фаза 13: Git Blob API для файлов > 1MB ✅ ВЫПОЛНЕНО (v2.1.1-hotfix)

### Проблема:
- [x] **Sync п��дал с SHA_CONFLICT на файлах > 1 MB**
  - GitHub Contents API не возвращает content для файлов > 1 MB

### Исправление:
- [x] `_getFile()`: fallback на Git Blob API (`/git/blobs/{sha}`) для файлов > 1 MB
- **Результат:** sync работает для файлов до 100 MB. Коммит: `314e17c`

---

## Фаза 14: SegmentMapper ✅ ВЫПОЛНЕНО

### Реализовано:
- [x] Модуль SegmentMapper — загрузка `segment_mappings.json` из GitHub Raw через GM_xmlhttpRequest
- [x] Добавлен `@connect raw.githubusercontent.com` в metadata
- [x] Поле `segments` в `_formatBetGroup` — массив `{segmentId, segmentName}` для каждого события в ставке
- [x] Консольный доступ: `collector.segmentMapper`
- [x] Инициализация при старте скрипта (асинхронная загрузка, кеш в памяти)

---

## Фаза 15: Баг-фиксы ✅ ВЫПОЛНЕНО

### 15.1. Stop → Start загружает мало операций
- [x] **Причина:** `start()` вызывает `reset()`, очищая все данные, но страница не повторяет запрос `lastOperations`
- [x] **Исправление:** при повторном Start (если уже были собраны данные) выполняется `location.reload()` — earlyInit ловит свежие запросы

### 15.2. Преждевременная надпись "готово к sync"
- [x] **Причина:** `getSyncStatus()` возвращал "Готов к Sync" при `isConfigured()`, не проверяя завершение сбора
- [x] **Исправление:** добавлена проверка `AppState.isCollectionCompleted` — показывает "Ожидание сбора данных..." до завершения

### 15.3. UI: кнопки настроек экспорта не видны
- [x] **Причина:** `.fc-settings-checkbox-field` не имел явного `color`, текст наследовал чёрный цвет от страницы
- [x] **Исправление:** добавлен `color: rgba(255, 255, 255, 0.9)` для светлого текста на тёмном фоне

---

## Фаза 16: FreebetCollector ✅ ВЫПОЛНЕНО (v2.2.0)

### Реализовано:
- [x] Модуль FreebetCollector (~130 строк): сбор фрибетов на странице `/bonuses`
- [x] Автозагрузка фрибетов через API `POST /client/getFreebets` при инициализации
- [x] Чтение sessionParams из `unsafeWindow.localStorage` (ключи: `red.fsid`, `red.clientId`, `red.deviceID`, `red.lastSysId`)
- [x] UI панель Freebets Collector: кол-во активных фрибетов, сумма, кнопка «Обновить», кнопка «Sync Freebets»
- [x] Защита от дублирования панели (`document.getElementById` guard в `UIPanel.create()`)
- [x] Защита от повторной инициализации (`unsafeWindow._fcInitialized` guard в `init()`)
- [x] Удалён перехват getFreebets из earlyInit (fetch + XHR блоки, ~66 строк)
- [x] Удалён `GET_FREEBETS` из `URL_PATTERNS`
- [x] `@match` добавлены: `https://fon.bet/bonuses`, `https://pari.ru/bonuses`

### Ключевые решения:
- **Отказ от earlyInit interception:** страница кеширует ссылку на `fetch` до того, как Tampermonkey патчит — перехват `getFreebets` не работал
- **localStorage вместо request body:** sessionParams читаются из `unsafeWindow.localStorage` (sandbox Tampermonkey требует `unsafeWindow`)
- **CDI не нужен:** API `getFreebets` работает без параметра CDI
- **Tampermonkey auto-update:** скрипт обновляется через GitHub push + version bump → Tampermonkey подтягивает автоматически

---

## Фаза 16.1: Баг-фиксы FreebetCollector ✅ ВЫПОЛНЕНО (v2.2.1–v2.2.2)

### v2.2.1:
- [x] **Фикс: crash showProgress на /bonuses** — `progressDetails` не существует на bonuses-панели, добавлен null-check
- [x] **Фикс: вечное "Ожидание сбора данных..." на /bonuses** — `getSyncStatus()` теперь проверяет `FreebetCollector.isLoaded` вместо `AppState.isCollectionCompleted`
- [x] **Фикс: lastSyncResult для freebets** — отображает "N фрибетов" вместо "+undefined"

### v2.2.2:
- [x] **Визуальная обратная связь кнопки «Обновить»** — показывает "⏳ Загрузка...", затем "✅ Обновлено!" / "❌ Ошибка" (1.5 сек), кнопка disabled во время запроса
