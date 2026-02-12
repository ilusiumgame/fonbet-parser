# TODO: Fonbet & Pari & BetBoom Collector v2.4.0

Мультисайтовый сбор данных с fon.bet, pari.ru и betboom.ru. Страницы: `/operations` (история операций), `/bonuses` (фрибеты), `/lobby/betshistory` и `/lobby/paymentshistory` (BetBoom).

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
| Фаза 17 | ✅ ВЫПОЛНЕНО | Pari-совместимость: FreebetCollector + бонусы без marker (v2.2.3) |
| Фаза 18 | ✅ ВЫПОЛНЕНО | Auto-sync + объединённый sync freebets (v2.3.0) |
| Фаза 19 | ✅ ВЫПОЛНЕНО | BetBoom support: сбор ставок и платежей, экспорт, GitHub sync (v2.4.0) |

---

## Следующие задачи

### F-6.1: Тестирование BetBoom (v2.4.0)

Тестирование через Octo Browser (UUID: `1bb8497860e3436c96196480fcccf422`, gambler_id: `1881653360`).

**Чеклист:**
- [ ] Открыть `betboom.ru/lobby/betshistory` — UI панель появляется
- [ ] Автосбор ставок и платежей запускается, прогресс отображается
- [ ] `window.collector.betBoomCollector.getStats()` — корректные данные
- [ ] Кнопка "Экспорт" — скачивается JSON с нативным форматом BetBoom
- [ ] Кнопка "Sync" — данные загружаются в `betboom/{gamblerId}_{alias}.json`
- [ ] Кнопка "Перезапуск" — повторный сбор работает
- [ ] Настройки периода сохраняются и применяются
- [ ] Auto-sync после завершения сбора (если включён)
- [ ] Регрессия: Fonbet `/operations` работает как раньше
- [ ] Регрессия: Pari `/bonuses` работает как раньше

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
- [x] **Sync падал с SHA_CONFLICT на файлах > 1 MB**
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

---

## Фаза 17: Pari-совместимость ✅ ВЫПОЛНЕНО (v2.2.3)

### Проблемы (обнаружены при тестировании pari.ru, профиль 37):

### 17.1. FreebetCollector не работает на pari.ru
- [x] **Причина:** `_loadSessionParamsFromStorage()` захардкожен на префикс `red.*`, а pari.ru использует `pb.*` в localStorage
- [x] **Исправление:** определение префикса через `SiteDetector.currentSite.id` — `pari` → `pb`, иначе → `red`

### 17.2. Бонусные операции (operationId: 17) не группируются
- [x] **Причина:** `_groupByMarker()` пропускает операции без `marker` (`if (!marker) return`), а бонусные операции не имеют поля `marker`
- [x] **Исправление:** fallback на `saldo_{saldoId}` — `const marker = op.marker || op.markerId || \`saldo_${op.saldoId}\``

### Результаты тестирования (pari.ru):
- Операций: 6365, Групп: 3252, Осиротевших: 0 (было 2)
- Бонусных групп: 2 (было 0)
- FreebetCollector: 1 активный фрибет, 10 000 ₽
- Все тесты пройдены

---

## Фаза 18: Auto-sync + объединённый sync freebets ✅ ВЫПОЛНЕНО (v2.3.0)

### F-2. Auto-sync после завершения сбора
- [x] Настройка `sync.autoSync` в SettingsManager (default: false)
- [x] Toggle в панели настроек (секция «Синхронизация с GitHub»)
- [x] После `_autoLoadBetsDetails()` — проверка `autoSync` + `isConfigured()` → `GitHubSync.sync()`
- [x] Ошибка auto-sync не блокирует основной процесс

### F-3. Объединённый sync freebets
- [x] Подтверждено: API `getFreebets` работает со страницы `/operations` (sessionParams из localStorage)
- [x] Основной `sync()` после успешной синхронизации операций загружает фрибеты и синхронизирует в отдельный файл
- [x] Выделен `_syncFreebetsInternal()` — переиспользуется из `sync()` и `syncFreebets()`
- [x] Кнопка «Sync Freebets» на `/bonuses` работает как раньше

---

## Следующие шаги

### Технический долг

#### TD-1. Проверить бонусы без marker на fonbet
**Приоритет:** Низкий
**Статус:** ⬜ Ожидание

Фикс v2.2.3 (`saldo_{saldoId}` fallback) подтверждён на pari.ru (2 бонусные группы). На fonbet проверено 12 аккаунтов — `bonus: 0` на всех. Проверить при появлении бонусов на аккаунте fonbet.

---

#### TD-2. Унифицировать `getStats()` — поле `total` vs `totalOperations`
**Приоритет:** Низкий
**Статус:** ✅ Выполнено

Тесты в TEST.md обновлены: `stats.total` → `stats.totalOperations` (7 вхождений).

---

### Улучшения существующих модулей

#### F-1. SegmentMapper: автодополнение маппингов из coupon/info
**Приоритет:** Средний
**Статус:** ⬜ Исследование

Сейчас 60% разрешение (3049 из ~5000 segmentId).

**Проблема:** `coupon/info` содержит только `sportName` ("Футбол") и `eventName` ("Ньюкасл – Брентфорд"), но **не содержит названия лиги** ("Англия. Премьер-лига"). Автодополнение из `coupon/info` даст только `sportName` как fallback, что не решает проблему 40% неразрешённых сегментов.

**Варианты:**
- [ ] Исследовать Fonbet API — есть ли endpoint для получения информации о сегменте по `segmentId`
- [ ] Парсинг страницы события — извлекать название лиги из DOM (медленно, сложно)
- [ ] Внешний API спортивных данных (требует зависимостей)

**Зависимости:** BetsDetailsFetcher, SegmentMapper
**Ожидаемый результат:** 90%+ разрешение сегментов

---

#### F-2. GitHubSync: автоматический sync после завершения сбора
**Приоритет:** Средний
**Статус:** ✅ Выполнено (v2.3.0)

- [x] Добавлена опция `autoSync` в SettingsManager (toggle в панели настроек, секция Sync)
- [x] После завершения `_autoLoadBetsDetails()` — проверка `autoSync` + `isConfigured()`, вызов `GitHubSync.sync()`
- [x] Ошибка auto-sync не блокирует основной процесс (отдельный try/catch)

---

#### F-3. GitHubSync: объединить sync freebets с основным sync
**Приоритет:** Низкий
**Статус:** ✅ Выполнено (v2.3.0)

- [x] При основном `sync()` — автоматически загружаются фрибеты через API `getFreebets` и синхронизируются в отдельный файл `freebets/{siteId}/{clientId}_{alias}.json`
- [x] Подтверждено тестированием: API `getFreebets` работает со страницы `/operations` (sessionParams из localStorage)
- [x] Выделен `_syncFreebetsInternal()` — внутренняя логика без guard-проверок
- [x] `syncFreebets()` — обёртка для кнопки на `/bonuses` (isSyncing + isConfigured guards)
- [x] Ошибка freebets sync не ломает основной sync (отдельный try/catch)

---

#### F-4. Быстрые ставки (760, 764): извлечение доступных данных
**Приоритет:** Низкий
**Статус:** ⬜ Не начато

Детали быстрых ставок недоступны через `coupon/info`. Но сами операции содержат:
- `sum` — сумма ставки / выигрыш
- `time` — время
- `marker` — идентификатор

**Варианты исследования:**
- [ ] Проверить, есть ли альтернативные endpoints для быстрых ставок
- [ ] Проверить, содержит ли страница `/account/history` дополнительные данные при клике на быструю ставку
- [ ] Как минимум: корректно форматировать имеющиеся данные в экспорте (сейчас `_formatFastBet` уже есть)

**Известное ограничение:** На тестовых аккаунтах fastBets: 0, тестирование затруднено.

---

### Новые функции

#### F-5. Уве��омления о завершении сбора
**Приоритет:** Средний
**Статус:** ⬜ Не начато

При 3000+ ставках загрузка деталей занимает ~5 минут. Пользователь может переключиться на другую вкладку.

**План:**
- [ ] `Notification.requestPermission()` при первом запуске
- [ ] `new Notification()` при завершении `_autoLoadBetsDetails()`
- [ ] Текст: «Сбор завершён: N операций, M деталей загружено»
- [ ] Опционально: звук уведомления

**Файлы:** `OperationsCollector._autoLoadBetsDetails` (после завершения)

**Примечание:** `Notification.requestPermission()` был удалён в v2.1.1 как мёртвый код. Теперь есть реальный use case.

---

#### F-6. BetBoom — третий сайт
**Приоритет:** Средний
**Статус:** ✅ Исследование завершено, планирование

#### Результаты исследования (2026-02-12)

**Главный вывод: BetBoom использует ПОЛНОСТЬЮ ДРУГОЙ бэкенд. API несовместим с Fonbet/Pari.**

Исследование проведено:
- [x] Использует ли BetBoom тот же бэкенд? → **НЕТ**, своя архитектура
- [x] Совместим ли формат API? → **НЕТ**, REST API вместо `clientsapi-*`
- [x] Какой домен API? → `betboom.ru/api/access/*` (same-origin)
- [x] Какой префикс localStorage? → **Нет session-ключей**, auth через JWT в cookie `session`
- [x] Есть ли endpoint `getFreebets`? → `/api/access/marketing_accruals/get_available_bonuses_list`

#### Сравнение API

| Аспект | Fonbet / Pari | BetBoom |
|--------|---------------|---------|
| API домен | `clientsapi-lb*-w.{domain}` | `betboom.ru/api/access/*` |
| Модель данных | Операции (placed/won/lost по `marker`) | Ставки (self-contained с ��еталями) |
| Детали ставки | Отдельный запрос `coupon/info` | **Уже включены** в ответе (`bet_stakes[]`) |
| Авторизация | `fsid/clientId/sysId` в body | JWT в cookie `session` (автоматически) |
| Пагинация | `lastOperations` → `prevOperations` chain | Cursor `before` + `limit` + `is_last_page` |
| ID пользователя | `clientId` (из params) | `gambler_id` (из JWT / `/user/me`) |
| Статусы | `operationId` коды (1,2,4,7...) | `BET_STATUS_TYPES_WIN/LOSS/...` |
| Платежи | В потоке операций (69, 90) | Отдельный API `/payments/get_history` |
| Бонусы | `/client/getFreebets` | `/marketing_accruals/get_available_bonuses_list` |
| localStorage | `red.*/pb.*` с session params | Нет session-ключей |
| ID событий | `segmentId`, `eventId` (единые) | `tournament_id`, `match_id` (свои) |
| Единицы сумм | Копейки (÷100) | Рубли |
| Сбор данных | XHR перехват | Прямые fetch-запросы |

#### Структура данных BetBoom

**Ставка:**
```json
{
  "bet_id": 730120945,
  "bet_uid": "e388942f-f350-48b6-ab98-1b63fcf110cb",
  "bet_status": { "name": "Проигрыш", "type": "BET_STATUS_TYPES_LOSS" },
  "create_dttm": "2025-12-22T17:23:38.441Z",
  "result_dttm": "2025-12-22T17:38:23.948Z",
  "bet_sum": 30000, "possible_win": 57000, "bet_win": 0,
  "other": {
    "bet_type": "BET_TYPES_SINGLE", "coeff": 1.9,
    "bet_stakes": [{
      "sport_name": "Киберспорт", "category_name": "Dota 2",
      "tournament_name": "Dota 2. CIS Battle 4",
      "match_id": 3528285,
      "home_team_name": "AVULUS", "away_team_name": "Peru Rejects",
      "market_name": "Тотал убийств на карте", "outcome_name": "Больше 49.5",
      "coeff": 1.9, "is_live": true, "score": "1:0",
      "stake_status": { "type": "BET_STAKE_STATUS_TYPES_LOSS" },
      "result": { "period_scores": [...], "scores": [...] }
    }]
  }
}
```

**Платёж:**
```json
{
  "id": 421794076, "amount": 346400, "status": "accepted",
  "is_payout": true,
  "dttm_begin": "2026-01-05T19:39:47.862Z",
  "service_name": "Кошелек ЦУПИС"
}
```

**Запрос ставок:**
```json
POST /api/access/bets_history/get
{
  "bet_status_groups": ["BET_STATUS_GROUPS_WIN", "BET_STATUS_GROUPS_LOSE"],
  "before": "",
  "limit": 30,
  "period": { "from": "2025-02-12T...", "to": "2026-02-13T..." }
}
```

**Запрос платежей:**
```json
POST /api/access/payments/get_history
{}
```

**Информация о пользователе:**
```json
POST /api/access/user/me → { "gambler_id": 1881653360, "personal_data": { "full_name": "..." } }
```

#### Тестовый аккаунт BetBoom
- **gambler_id:** `1881653360`
- **ФИО:** Соломатин Михаил Валентинович
- **Страницы:** `/lobby/betshistory` (ставки), `/lobby/paymentshistory` (платежи)
- **Octo UUID:** `1bb8497860e3436c96196480fcccf422`

#### Плюсы BetBoom API
- Детали **уже включены** — не нужен BetsDetailsFetcher
- Простая cursor-пагинация (`before` + `is_last_page`)
- Auth через cookies — не нужны sessionParams
- Данные богаче: `tournament_name`, `sport_name`, `score`, `period_scores` (100% разрешение вместо 60% SegmentMapper)

#### Принятые решения

1. **Формат экспорта:** Нативный формат BetBoom с единой структурой верхнего уровня для GitHubSync
2. **Единицы сумм:** Рубли (не копейки как Fonbet/Pari)
3. **Scope:** Сбор ставок (`/lobby/betshistory`) + платежи (`/lobby/paymentshistory`)
4. **Ключ дедупликации:** `bet_uid` (вместо `marker`)
5. **Архитектура:** Отдельный модуль BetBoomCollector (не SiteDetector integration)

#### План реализации

- [ ] BetBoomCollector — прямые fetch к `/api/access/bets_history/get` с cursor-пагинацией
- [ ] Нормализация данных — преобразование в формат экспорта
- [ ] Сбор платежей — `/api/access/payments/get_history`
- [ ] UI интеграция — панель на `/lobby/betshistory`
- [ ] GitHubSync — сохранение в папку `betboom/`, merge по `bet_uid`
- [ ] `@match` для betboom.ru/lobby/betshistory и /lobby/paymentshistory

**Оценка сложности:** Значительно больше, чем pari.ru. Новый модуль ~400-600 строк, плюс адаптация UI/GitHubSync.
