# Fonbet & Pari Collector

Tampermonkey скрипт для сбора истории операций с fon.bet и pari.ru. Работает на странице `/account/history/operations` (сбор ставок) и `/bonuses` (сбор фрибетов) обоих сайтов. Автоопределение сайта, перехват XHR/fetch, сбор операций через API, группировка по marker, автоматическая загрузка деталей ставок, экспорт в JSON v2.1, инкрементальная синхронизация с GitHub, сбор фрибетов.

**Версия:** v2.3.0 — Auto-sync после завершения сбора, объединённый sync freebets

---

## Метрики

```
Файл:    universal_collector.user.js
Строки:  ~3988
Версия:  2.3.0
```

---

## Структура кода (v2.2.3)

```
1-20:          Tampermonkey Metadata (@run-at document-start, @match fon.bet + pari.ru
               /operations + /bonuses, @grant GM_xmlhttpRequest, @connect api.github.com +
               raw.githubusercontent.com)
26:            Constants (VERSION, DEBUG_MODE)
30-48:         logger
50-53:         URL_PATTERNS (LAST/PREV_OPERATIONS)
56-115:        SiteDetector (автоопределение сайта)
118-162:       SegmentMapper (загрузка segment_mappings.json из GitHub Raw)
165-293:       FreebetCollector (sessionParams из localStorage, auto-fetch, UI на /bonuses)
296-848:       OperationsCollector (динамические URL через SiteDetector)
851-1038:      BetsDetailsFetcher (динамический coupon/info URL)
1042-1141:     SettingsManager
1143-1146:     LIMITS (UI_UPDATE_INTERVAL_MS)
1149-1163:     AppState (isInterceptorRunning, isCollectionCompleted, config)
1170-1179:     getCurrentPageType()
1183-1399:     XHRInterceptor (LAST/PREV_OPERATIONS)
1402-2806:     UIPanel (Freebets Collector панель на /bonuses, кнопка Sync, toggle, настройки)
2809-3015:     ExportModule (_buildExportData + exportOperations, segments в _formatBetGroup)
3019-3704:     GitHubSync (API, merge, sync, setup dialog, changeAlias)
3708-3821:     init() (_initCalled + _fcInitialized guards, FreebetCollector.init() на /bonuses)
3824-3904:     earlyInit() (XHR/fetch патч для operations)
3906-3916:     Bootstrap
```

---

## Справочник типов операций

**Всего:** 19 уникальных типов операций в 5 категориях.

### Обзор категорий

| Категория | Константа | operationId | Кол-во |
|-----------|-----------|-------------|--------|
| Обычные ставки | REGULAR_BETS | 1, 2, 3, 4, 5, 7 | 6 |
| Быстрые ставки | FAST_BETS | 760, 764 | 2 |
| Фрибеты | FREEBETS | 441, 442, 443, 444, 445, 446 | 6 |
| Финансовые | FINANCE | 69, 90, 460, 461 | 4 |
| Бонусы | BONUS | 17 | 1 |

### Обычные ставки (REGULAR_BETS)

Требуют `coupon/info` для получения деталей.

| ID | Константа | API название | UI название | Сумма |
|----|-----------|--------------|-------------|-------|
| 1 | BET_PLACED | Сделана ставка | Прогноз принят | Отрицательная |
| 2 | BET_WON | Рассчитана ставка | Выигрыш | Положительная |
| 3 | BET_RECALCULATED | Перерассчитана ставка | Перерассчитано | Зависит |
| 4 | BET_LOST | Ставка проиграна | Проигрыш | 0 |
| 5 | BET_CANCELLED | Отмена расчета | Отмена расчета | Зависит |
| 7 | BET_SOLD | Продана ставка | Продажа / Cash Out | Положительная |

### Быстрые ставки (FAST_BETS)

**Важно:** детали недоступны через `coupon/info`.

| ID | Константа | Описание |
|----|-----------|----------|
| 760 | FAST_BET_PLACED | Размещение быстрой ставки |
| 764 | FAST_BET_SETTLED | Расчёт быстрой ставки |

### Фрибеты (FREEBETS)

| ID | Константа | Описание | Частота |
|----|-----------|----------|---------|
| 441 | FREEBET_PLACED | Размещение фрибета | Редкий |
| 442 | FREEBET_WON | Фрибет выигран | Редкий |
| 443 | FREEBET_RECALCULATED | Перерасчёт фрибета | Очень редкий |
| 444 | FREEBET_LOST | Фрибет проигран | Редкий |
| 445 | FREEBET_CANCELLED | Отмена расчёта фрибета | Очень редкий |
| 446 | FREEBET_REFUND | Компенсация суммы фрибета | Очень редкий |

### Финансовые операции (FINANCE)

| ID | Константа | API название | UI название |
|----|-----------|--------------|-------------|
| 69 | DEPOSIT | Интерактивная ставка | Ввод / Депозит |
| 90 | WITHDRAWAL | Выигрыш интерактивной ставки | Вывод |
| 460 | WITHDRAWAL_HOLD | Холдирование выплаты | Холдирование вывода |
| 461 | WITHDRAWAL_UNHOLD | Отмена холдирования | Отмена холдирования |

### Бонусы (BONUS)

| ID | Константа | Описание |
|----|-----------|----------|
| 17 | BONUS_GAME | Начисление игрового бонуса |

---

## Жизненные циклы ставок

Операции связываются через поле `marker`:

```
Выигранная ставка:
marker: 12345678901
├── operationId: 1 (Прогноз принят) - сумма: -1000
└── operationId: 2 (Выигрыш) - сумма: +1850

Проигранная ставка:
marker: 12345678902
├── operationId: 1 (Прогноз принят) - сумма: -1000
└── operationId: 4 (Проигрыш) - сумма: 0

Проданная ставка (Cash Out):
marker: 12345678903
├── operationId: 1 (Прогноз принят) - сумма: -1000
└── operationId: 7 (Продажа) - сумма: +850

Ставка в игре:
marker: 12345678905
└── operationId: 1 (Прогноз принят) - сумма: -1000
```

---

## Ключевые модули

### FreebetCollector (v2.2.0)
```javascript
const FreebetCollector = {
    freebets: [],
    sessionParams: null,
    isLoaded: false,

    init(),                              // Читает sessionParams из localStorage, auto-fetch
    _loadSessionParamsFromStorage(),     // unsafeWindow.localStorage → sessionParams
    handleResponse(data),               // Обработка ответа getFreebets
    getActiveFreebets(),                // Фильтр: state === 'active'
    getStats(),                         // Статистика: active, total, totalAmount
    fetchFreebets(),                    // POST /client/getFreebets
    syncFreebets()                      // Синхронизация фрибетов в GitHub (overwrite)
};
// sessionParams: { fsid, clientId, deviceId, sysId }
// Ключи localStorage: red.fsid, red.clientId, red.deviceID, red.lastSysId
```

### SegmentMapper
```javascript
const SegmentMapper = {
    init(),                              // Загрузка маппингов при старте
    load(),                              // GM_xmlhttpRequest на GitHub Raw
    getName(segmentId)                   // segmentId → название лиги/турнира
};
// URL: https://raw.githubusercontent.com/ilusiumgame/fonbet-parser/main/segment_mappings.json
```

### OperationsCollector
```javascript
_filterOperations(operations, groups)  // Фильтрация по группам
_groupByMarker(operations)             // Группировка по marker
_determineFinalStatus(operations)      // Статус: won/lost/pending/...
_determineCategory(operations)         // Категория: regular_bet/fast_bet/...
getGroupedOperations()                 // Получить сгруппированные данные
getMarkersForDetails()                 // Получить markers для деталей
_autoLoadBetsDetails()                 // Автозагрузка деталей с прогресс-баром
```

### BetsDetailsFetcher
```javascript
const BetsDetailsFetcher = {
    BATCH_SIZE: 5,
    DELAY_BETWEEN_BATCHES: 500,
    MAX_RETRIES: 3,
    INITIAL_RETRY_DELAY: 500,     // Exponential backoff
    MAX_RETRY_DELAY: 8000,        // Максимум 8s
    BACKOFF_MULTIPLIER: 2,

    async fetchDetails(markers),
    stop(),
    getStats(),
    getFailedMarkers()
};
```

### XHRInterceptor
```javascript
const XHRInterceptor = {
    init(appState),
    start(),
    stop(),
    isRunning(),

    // Внутренние методы
    _patchXHR(),                    // operations (LAST/PREV)
    _patchFetch(),                  // operations (LAST/PREV)
    _handleOperationsLoad(xhr, isInitial, requestBody)
};
```

### ExportModule
```javascript
_buildExportData()      // Формирование объекта данных (shared с GitHubSync)
exportOperations()      // Экспорт в файл через _buildExportData() + скачивание
_formatBetGroup(group)  // Форматирование ставок
_formatFastBet(group)   // Форматирование быстрых ставок
_formatFinanceOp(group) // Форматирование финансовых операций
_formatBonusOp(group)   // Форматирование бонусов
```

### GitHubSync (v2.1.0)
```javascript
const GitHubSync = {
    // Конфигурация (GM_setValue)
    init(),                          // Загрузка конфигурации
    isConfigured(),                  // Проверка: token + repo + alias
    loadConfig(), saveConfig(cfg),   // GM_getValue / GM_setValue

    // GitHub API (через GM_xmlhttpRequest, обход CORS)
    _apiRequest(method, path, body), // Обёртка с обработкой ошибок
    _getFile(path),                  // GET + base64 decode → { content, sha }
    _putFile(path, content, sha, msg), // PUT + base64 encode
    _deleteFile(path, sha, msg),     // DELETE
    _listDirectory(path),            // GET directory listing

    // Поиск и путь файла
    _findExistingFile(),             // Поиск {clientId}_*.json в {siteId}/
    _buildFilePath(existingFile),    // {siteId}/{clientId}_{alias}.json

    // Merge логика
    _mergeArray(remote, local),      // Merge по marker, local перезаписывает
    _mergeData(remote, local),       // Полный merge всех категорий + syncHistory

    // Основной метод
    async sync(),                    // 4 этапа: подготовка → GET → merge → PUT
    async changeAlias(newAlias),     // Переименование файла в GitHub
    async testConnection(),          // Проверка подключения к репо

    // UI
    showSetupDialog(),               // Модальное окно первоначальной настройки
    getSyncStatus()                  // Статус для отображения в UI
};
```

### UIPanel
```javascript
const UIPanel = {
    init(appState),
    create(),                        // С guard от дублирования (#fonbet-collector-panel)
    update(),

    // На /operations: Start/Stop, Export Operations, Sync, статистика, прогресс-бар
    // На /bonuses: Freebets Collector — активных/сумма, кнопки «Обновить» и «Sync Freebets»
    // Заголовок: "{SiteName} Collector v{VERSION}"
    // Защита от дублирования: unsafeWindow._fcInitialized + DOM check
    // Панель настроек: Export, Fetcher, Sync (Token/Owner/Repo/Alias)
};
```

---

## Формат экспорта JSON v2.1

```javascript
{
    "version": "2.2.3",
    "site": "Fonbet",
    "exportDate": "...",
    "account": {
        "siteId": "fonbet",
        "siteName": "Fonbet",
        "clientId": 17158121,
        "alias": "Vlad"
    },
    "summary": {
        totalOperations, totalGroups,
        regularBets, fastBets, freebets,
        deposits, withdrawals, bonus,
        detailsLoaded, detailsFailed, detailsSkipped
    },
    "bets": [...],
    "fastBets": [...],
    "freebets": [...],
    "finance": {
        "deposits": [...],
        "withdrawals": [...],
        "holds": [...]
    },
    "bonus": [...]
}
```

### Формат элемента bets[] (после _formatBetGroup)

```javascript
{
    "marker": "3383629549",
    "regId": "3383629549",
    "status": "lost",
    "time": 1770488783,
    "timeFormatted": "2026-02-08T...",
    "segments": [
        { "segmentId": 11918, "segmentName": "Англия. Премьер-лига. Сезон 25/26" }
    ],
    "operations": [
        { "operationId": 1, "operationType": "Сделана ставка", "sum": -4010000, "time": 1770488783 },
        { "operationId": 4, "operationType": "Ставка проиграна", "sum": 0, "time": 1770491060 }
    ],
    "details": { /* coupon/info response */ }
}
```

**Поле `segments`:** Массив `{segmentId, segmentName}` — по одному элементу на каждый `bet` из `details.body.bets`. Имя подставляется из SegmentMapper; если маппинг не найден — `segmentName: null`.

### Формат файла в GitHub (sync)

```javascript
{
    "version": "2.2.3",
    "account": { siteId, siteName, clientId, alias },
    "lastSync": "2026-02-08T14:30:00.000Z",
    "syncHistory": [
        { date, operationsAdded, operationsUpdated, totalAfterSync }
    ],
    "summary": { ... },
    "bets": [...],
    "fastBets": [...],
    "freebets": [...],
    "finance": { deposits, withdrawals, holds },
    "bonus": [...]
}
```

### Структура файлов в GitHub-репозитории

```
betting-data/               (приватный репозиторий)
├── fonbet/
│   ├── 17158121_Vlad.json
│   └── 22345678_Sergey.json
└── pari/
    └── 12345678_Vlad.json
```

---

## Консольные команды

### Операции (страница /operations)
```javascript
collector.version
collector.site                                    // Имя текущего сайта
collector.operationsCollector.start()
collector.operationsCollector.stop()
collector.operationsCollector.getStats()
collector.operationsCollector.getGroupedOperations()
collector.fetchBetsDetails()
collector.exportOperations()

// Анализ ошибок
collector.betsDetailsFetcher.getFailedMarkers()

// SiteDetector
collector.siteDetector.currentSite
collector.siteDetector.getSiteName()

// SegmentMapper
collector.segmentMapper.loaded                    // Загружены ли маппинги
collector.segmentMapper.getName(segmentId)        // Получить название по ID
```

### Фрибеты (страница /bonuses, v2.2.0)
```javascript
collector.freebetCollector.isLoaded               // Загружены ли фрибеты
collector.freebetCollector.getStats()             // Статистика: active, total, totalAmount
collector.freebetCollector.getActiveFreebets()    // Список активных фрибетов
collector.freebetCollector.fetchFreebets()        // Перезагрузить фрибеты
collector.freebetCollector.syncFreebets()         // Синхронизировать в GitHub
collector.freebetCollector.sessionParams          // Текущие параметры сессии
```

### Синхронизация (v2.1.0)
```javascript
collector.sync()                                  // Синхронизировать с GitHub
collector.changeAlias('NewName')                  // Сменить alias (переименовать файл)
collector.githubSync.isConfigured()               // Проверить настройку
collector.githubSync.testConnection()             // Тест подключения
collector.githubSync.getSyncStatus()              // Текущий статус sync
collector.githubSync.showSetupDialog()            // Открыть диалог настройки
```

---

## Что НЕ трогать

- **XHRInterceptor** — перехват operations работает
- **earlyInit** — критичен для перехвата операций (getFreebets удалён в v2.2.0 — страница кешировала fetch)
- **OperationsCollector** — основной модуль сбора данных
- **BetsDetailsFetcher** — загрузка деталей с exponential backoff
- **FreebetCollector._loadSessionParamsFromStorage** — зависит от ключей `red.*` в localStorage

---

## Различия API: fon.bet vs pari.ru

API на 100% совместимы по формату. Различия только в доменах и параметрах сессии:

| Параметр | fon.bet | pari.ru |
|----------|---------|---------|
| API домен | `clientsapi-lb*-w.bk6bba-resources.ru` | `clientsapi-lb*-w.pb06e2-resources.com` |
| Доменная зона | `.ru` | `.com` |
| Балансировщики | `lb51`, `lb52` | `lb01`, `lb51` |
| Доп. параметры | — | `CDI`, `deviceId` (обязательны) |
| Endpoints | Идентичны | Идентичны |
| Формат операций | Идентичен | Идентичен |
| operationId коды | Идентичны | Идентичны |

Скрипт определяет `baseApiUrl` динамически из первого перехваченного запроса.
Параметры `CDI` и `deviceId` автоматически извлекаются из перехваченных запросов и включаются через spread-оператор.

### Единая система ID событий

Fonbet и Pari используют **единый бэкенд**. Все ID из одной системы нумерации:

| ID | Описание | Пример |
|----|----------|--------|
| `eventId` | ID конкретного матча | `62203346` (Радукану – Олейникова) |
| `segmentId` | ID турнира/лиги | `71593` (WTA теннис) |
| `sportId` | ID вида спорта | `1`=Футбол, `2`=Хоккей, `3`=Баскетбол, `4`=Теннис |
| `factorId` | ID типа ставки (маркет) | `921`=П1, `924`=П2, `930`=Тотал и т.д. |

**Подтверждено тестированием (2026-02-09):** `segmentId: 71593` присутствует на обоих сайтах — один и тот же турнир WTA. Один и тот же матч на обоих сайтах будет иметь **идентичный `eventId`**. Это позволяет сопоставлять ставки между аккаунтами по eventId.

---

## Ключевые находки

### marker = regId
Операции **НЕ содержат поле `regId`**, но содержат `marker`, который **равен `regId`** для запроса `coupon/info`.

### Рабочие endpoints и параметры

```javascript
// Fonbet
await fetch('https://clientsapi-lb52-w.bk6bba-resources.ru/coupon/info', { ... });

// Pari
await fetch('https://clientsapi-lb01-w.pb06e2-resources.com/coupon/info', { ... });

// Параметры (одинаковые для обоих сайтов):
body: JSON.stringify({
    regId: parseInt(marker),  // marker из операции!
    lang: 'ru',
    betTypeName: 'sport',
    fsid: sessionParams.fsid,
    sysId: sessionParams.sysId || 21,
    clientId: sessionParams.clientId
    // CDI и deviceId — автоматически для pari.ru
})
```

### Пример ответа coupon/info (идентичен для обоих сайтов)

```json
{
  "result": "couponInfo",
  "header": {
    "betTypeName": "sport",
    "regId": "3383629549",
    "state": "lose",
    "currency": "rub",
    "sum": 4010000,
    "couponK": 2.25,
    "regTime": 1770488783,
    "clientId": 17158121,
    "calcTime": 1770491060,
    "outcome": 0
  },
  "body": {
    "kind": "single",
    "bets": [{
      "factorValue": 2.25,
      "stakeName": "Брентфорд < 2.5",
      "result": "lose",
      "score": "7:1",
      "sportName": "Футбол",
      "segmentId": 11918,
      "eventName": "LIVE 7:1 угловые Ньюкасл – Брентфорд",
      "live": true
    }]
  }
}
```

### Как извлекаются sessionParams

**На странице /operations** (из перехваченных запросов):
```javascript
this.sessionParams = {
    fsid: params.fsid,
    sysId: params.sysId,
    clientId: params.clientId,
    CDI: params.CDI,        // Есть на pari.ru, undefined на fon.bet
    deviceId: params.deviceId  // Есть на pari.ru, undefined на fon.bet
};
```

**На странице /bonuses** (из `unsafeWindow.localStorage`, v2.2.3):
```javascript
// Tampermonkey sandbox требует unsafeWindow для доступа к localStorage страницы
const ls = unsafeWindow.localStorage;
const prefix = SiteDetector.currentSite?.id === 'pari' ? 'pb' : 'red';
this.sessionParams = {
    fsid: ls.getItem(`${prefix}.fsid`),
    clientId: parseInt(ls.getItem(`${prefix}.clientId`), 10),
    deviceId: ls.getItem(`${prefix}.deviceID`),       // Заглавная D!
    sysId: parseInt(ls.getItem(`${prefix}.lastSysId`), 10)
};
// Префиксы localStorage: fon.bet → red.*, pari.ru → pb.*
// CDI не нужен для getFreebets
```

### regId в экспорте
regId в `_formatBetGroup` заполняется через fallback-цепочку:
```javascript
regId: group.regId || group.details?.header?.regId || group.marker
```

---

## История версий

### v2.3.0 (текущая)
- **Auto-sync (Фаза 18, F-2):** автоматическая синхронизация после завершения сбора операций и загрузки деталей
  - Настройка `sync.autoSync` в SettingsManager (toggle в панели настроек, default: false)
  - Проверка `autoSync` + `isConfigured()` в конце `_autoLoadBetsDetails()`
  - Ошибка auto-sync не блокирует основной процесс
- **Объединённый sync freebets (Фаза 18, F-3):** основной `sync()` автоматически загружает и синхронизирует фрибеты
  - API `getFreebets` работает со страницы `/operations` (sessionParams из localStorage)
  - Выделен `_syncFreebetsInternal()` — переиспользуется из `sync()` и `syncFreebets()`
  - Файлы freebets хранятся отдельно: `freebets/{siteId}/{clientId}_{alias}.json`
  - Кнопка «Sync Freebets» на `/bonuses` работает как раньше

### v2.2.0
- **FreebetCollector (Фаза 16):** модуль сбора фрибетов с `/bonuses`
  - Автозагрузка через API `POST /client/getFreebets` при инициализации
  - SessionParams из `unsafeWindow.localStorage` (обход sandbox Tampermonkey)
  - CDI не требуется для API getFreebets
  - UI панель: кол-во активных фрибетов, сумма, кнопки «Обновить» и «Sync Freebets»
- Удалён перехват getFreebets из earlyInit (fetch + XHR, ~66 строк) — страница кешировала fetch до патча
- Удалён `GET_FREEBETS` из `URL_PATTERNS`
- Защита от дублирования панели (`document.getElementById` guard в `UIPanel.create()`)
- Защита от повторной инициализации (`unsafeWindow._fcInitialized` guard в `init()`)
- Добавлены `@match` для `/bonuses` (fon.bet + pari.ru)
- **v2.2.1:** Фикс crash `showProgress()` на /bonuses (null-check `progressDetails`); `getSyncStatus()` учитывает страницу `/bonuses`; корректное отображение `lastSyncResult` для freebets sync
- **v2.2.2:** Визуальная обратная связь кнопки «Обновить» (⏳→✅/❌, disabled во время запроса)
- **v2.2.3:** FreebetCollector на pari.ru — localStorage-префикс `pb.*` вместо `red.*` (определяется через SiteDetector); группировка операций без marker (бонусы) через fallback `saldo_{saldoId}`
- Итого: ~3520 → ~3942 строк (+422 строки)

### v2.1.1
- Cleanup: удалён мёртвый код (EventBus, onCollectionComplete, setActiveGroups, fetchAllBetsDetails, UIPanel.destroy, Notification.requestPermission)
  - **SegmentMapper возвращён в Фазе 14** — загрузка `segment_mappings.json` из GitHub Raw, поле `segments` в экспорте
- Объединены дублированные ветки завершения сбора (data.completed === true)
- Hardcoded version → VERSION константа
- Унифицирована валидация alias (убрана кириллица из changeAlias)
- Удалены redundant typeof OperationsCollector checks
- Исправлены устаревшие комментарии (v1.14.x, XHR→fetch, help text)
- UI: solid фон header/footer настроек, цвет заголовка, toggle-переключатели вместо чекбоксов
- Исправлена пагинация: initial lastOperations с completed:true теперь проверяет prevOperations
- Исправлен sync: _getFile() корректно декодирует base64 с UTF-8 (Cyrillic)
- Исправлена кодировка Unicode в alert GitHubSync
- **Фикс nextOperations:** удалён перехват `nextOperations` из всех интерсепторов (earlyInit, XHRInterceptor) — страница поллит этот endpoint для real-time обновлений, кэшированные ответы (`completed:true`) останавливали коллектор после 200 операций вместо полной пагинации через `prevOperations`. Результат: 8282 операции вместо 200.
- **Фикс Git Blob API:** `_getFile()` использует fallback на Git Blob API (`/git/blobs/{sha}`) для файлов > 1 MB, которые Contents API возвращает без content. Результат: sync работает для файлов до 100 MB.
- **SegmentMapper (Фаза 14):** модуль загрузки `segment_mappings.json` из GitHub Raw через GM_xmlhttpRequest. Поле `segments` в `_formatBetGroup` — массив `{segmentId, segmentName}` для каждого события в ставке. ~3049 сегментов, ~60% разрешение.
- **Баг-фиксы (Фаза 15):** повторный Start делает `location.reload()` вместо пустого reset; `getSyncStatus()` показывает "Ожидание сбора данных..." до завершения сбора; `.fc-settings-checkbox-field` с явным белым цветом текста.
- Обновлён @author
- Итого: 3549 → ~3520 строк

### v2.1.0
- Модуль GitHubSync: инкрементальная синхронизация с приватным GitHub-репозиторием
- Merge-логика: дедупликация по `marker`, local перезаписывает remote, syncHistory
- Структура файлов: `{siteId}/{clientId}_{alias}.json`
- Конфигурация через GM_setValue: token, repoOwner, repoName, accountAlias
- GitHub API через GM_xmlhttpRequest (обход CORS)
- Setup Dialog: модальное окно настройки с кнопкой «Проверить подключение»
- UI: кнопка Sync, статус-индикатор, настройки Sync в панели
- Рефакторинг ExportModule: выделен `_buildExportData()` (shared с GitHubSync)
- Поле `account` в экспорте: siteId, siteName, clientId, alias
- changeAlias: переименование файла в GitHub
- SHA conflict retry при параллельных sync
- Обработка ошибок: INVALID_TOKEN, RATE_LIMIT, NETWORK_ERROR, SHA_CONFLICT
- Консольные команды: `collector.sync()`, `collector.changeAlias()`
- Добавлено ~693 строки (2856 → 3549)

### v2.0.1
- Cleanup: удалено ~277 строк мёртвого legacy-кода
- Удалён мёртвый `exportJSON()`, мёртвые поля AppState, UI-элементы, функции, CSS

### v2.0.0
- Мультисайтовая поддержка: fon.bet + pari.ru
- Добавлен модуль SiteDetector для автоопределения сайта
- Динамические URL, глобальный объект `window.collector`

### v1.15.5
- Исправлена обработка пустых финальных ответов при пагинации

### v1.15.0 — v1.15.4
- Удалены AutoOpener, ProfileManager, SettingsModal, Mode slider
- Серия баг-фиксов UI и endpoint

---

## Внешние зависимости

- **GitHub API:** `https://api.github.com` (для GitHubSync, через GM_xmlhttpRequest)
- **GitHub Raw:** `https://raw.githubusercontent.com` (для SegmentMapper, через GM_xmlhttpRequest)

---

## Документация

- `CONTEXT.md` — общий контекст проекта (этот файл)
- `TODO.md` — план разработки и история фаз
- `TEST.md` — документация по тестированию

---

## Octo Browser + Chrome DevTools MCP

Chrome DevTools MCP подключается к Octo Browser через remote debugging на порту **9222**.

### Быстрый старт

```bash
# Запуск профиля с портом отладки
python octo_start.py

# Остановка профиля
python octo_start.py stop
```

Конфигурация (API Token, Profile UUID, Debug Port) загружается из `.env` файла.

### Альтернатива: обычный Chrome

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### MCP Server Config

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "chrome-devtools-mcp@latest",
        "--browserUrl=http://127.0.0.1:9222"
      ],
      "env": {}
    }
  }
}
```

### Переключение между профилями

1. В Octo Browser скопируйте UUID нужного профиля
2. Обновите `OCTO_PROFILE_UUID` в `.env`
3. Запустите `python octo_start.py`

**Один профиль за раз:** MCP подключается к порту 9222. При переключении сначала остановите текущий: `python octo_start.py stop`

### Решение проблем

```bash
# Порт 9222 занят
netstat -ano | grep 9222
powershell -Command "Stop-Process -Id <PID> -Force"

# Проверить MCP подключение
claude mcp list
```

---

## CI/CD

### GitHub Actions: Update Segments
**Файл:** `.github/workflows/update-segments.yml`

Автоматически обновляет `segment_mappings.json`:
- **Расписание:** ежедневно в 6:00 UTC
- **Ручной запуск:** GitHub UI → Actions → "Update Segments" → "Run workflow"
