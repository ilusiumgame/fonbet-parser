# Fonbet & Pari & BetBoom Collector

Tampermonkey скрипт для сбора истории операций с fon.bet, pari.ru и betboom.ru. Работает на странице `/account/history/operations` (сбор ставок) и `/bonuses` (сбор фрибетов) для Fonbet/Pari, а также `/lobby/betshistory` и `/lobby/paymentshistory` для BetBoom. Автоопределение сайта, перехват XHR/fetch, сбор операций через API, группировка по marker, автоматическая загрузка деталей ставок, экспорт в JSON v2.1, инкрементальная синхронизация с GitHub, сбор фрибетов.

**Версия:** v2.4.0 — BetBoom support: сбор ставок и платежей, экспорт, GitHub sync

---

## Метрики

```
Файл:    universal_collector.user.js
Строки:  ~4709
Версия:  2.4.0
```

---

## Структура кода (v2.4.0)

```
1-22:          Tampermonkey Metadata (@run-at document-start, @match fon.bet + pari.ru
               /operations + /bonuses + betboom.ru /lobby/betshistory + /lobby/paymentshistory,
               @grant GM_xmlhttpRequest, @connect api.github.com +
               raw.githubusercontent.com)
26:            Constants (VERSION, DEBUG_MODE)
30-48:         logger
50-53:         URL_PATTERNS (LAST/PREV_OPERATIONS)
56-129:        SiteDetector (автоопределение сайта: Fonbet, Pari, BetBoom)
131-176:       SegmentMapper (загрузка segment_mappings.json из GitHub Raw)
178-308:       FreebetCollector (sessionParams из localStorage, auto-fetch, UI на /bonuses)
310-568:       BetBoomCollector (REST API, cursor pagination, bets + payments)
570-1135:      OperationsCollector (динамические URL через SiteDetector)
1137-1325:     BetsDetailsFetcher (динамический coupon/info URL)
1327-1431:     SettingsManager
1433-1436:     LIMITS (UI_UPDATE_INTERVAL_MS)
1437-1453:     AppState (isInterceptorRunning, isCollectionCompleted, config)
1454-1472:     getCurrentPageType()
1474-1692:     XHRInterceptor (LAST/PREV_OPERATIONS)
1693-3376:     UIPanel (Operations + Freebets + BetBoom панели, настройки, прогресс)
3377-3585:     ExportModule (_buildExportData + exportOperations, segments в _formatBetGroup)
3587-4466:     GitHubSync (API, merge, sync, syncBetBoom, syncFreebets, setup dialog, changeAlias)
4468-4606:     init() (_initCalled + _fcInitialized guards, BetBoom/FreebetCollector на соотв. страницах)
4608-4672:     earlyInit() (XHR/fetch патч для operations)
4674-4684:     Bootstrap
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

## Внешние зависимости

- **GitHub API:** `https://api.github.com` (для GitHubSync, через GM_xmlhttpRequest)
- **GitHub Raw:** `https://raw.githubusercontent.com` (для SegmentMapper, через GM_xmlhttpRequest)

---

## Документация

- `CONTEXT.md` — общий контекст проекта (этот файл)
- `TODO.md` — план разработки и история фаз

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
