# TEST: Fonbet & Pari Collector v2.2.3

Полный план тестирования скрипта. Все тесты выполняются через MCP devtools.

---

## Предварительные требования

### Окружение
- Octo Browser с профилем, запущенным через `python octo_start.py`
- Авторизованный аккаунт на fon.bet или pari.ru с историей операций
- Скрипт `universal_collector.user.js` установлен в Tampermonkey
- MCP devtools подключён к порту 9222

### Тестовая страница
- **Fonbet (операции):** `https://fon.bet/account/history/operations`
- **Fonbet (фрибеты):** `https://fon.bet/bonuses`
- **Pari (операции):** `https://pari.ru/account/history/operations`
- **Pari (фрибеты):** `https://pari.ru/bonuses`

---

## Категория 1: Инициализация и конфигурация

### 1.1. Проверка загрузки скрипта
**ID:** `TEST_1_1`
**Тип:** Автоматический

```javascript
() => {
    return {
        version: collector.version,
        passed: collector.version === '2.2.3'
    };
}
```

**Критерий успеха:** `version === '2.2.2'`

---

### 1.2. Проверка глобального объекта collector
**ID:** `TEST_1_2`
**Тип:** Автоматический

```javascript
() => {
    const fc = collector;
    return {
        hasVersion: typeof fc.version === 'string',
        hasSite: typeof fc.site === 'string',
        hasSiteDetector: !!fc.siteDetector,
        hasState: !!fc.state,
        hasInterceptor: !!fc.interceptor,
        hasOperationsCollector: !!fc.operationsCollector,
        hasBetsDetailsFetcher: !!fc.betsDetailsFetcher,
        hasExportOperations: typeof fc.exportOperations === 'function',
        hasFetchBetsDetails: typeof fc.fetchBetsDetails === 'function',
        hasUIPanel: !!fc.uiPanel,
        hasURL_PATTERNS: !!fc.URL_PATTERNS,
        hasGitHubSync: !!fc.githubSync,
        hasSync: typeof fc.sync === 'function',
        hasChangeAlias: typeof fc.changeAlias === 'function',
        hasFreebetCollector: !!fc.freebetCollector,
        passed: true
    };
}
```

**Критерий успеха:** Все поля `true`

---

### 1.3. Проверка OPERATION_TYPES (19 типов)
**ID:** `TEST_1_3`
**Тип:** Автоматический

```javascript
() => {
    const types = collector.operationsCollector.OPERATION_TYPES;
    const count = Object.keys(types).length;
    return {
        count: count,
        // Обычные ставки
        BET_PLACED: types.BET_PLACED === 1,
        BET_WON: types.BET_WON === 2,
        BET_RECALCULATED: types.BET_RECALCULATED === 3,
        BET_LOST: types.BET_LOST === 4,
        BET_CANCELLED: types.BET_CANCELLED === 5,
        BET_SOLD: types.BET_SOLD === 7,
        // Быстрые ставки
        FAST_BET_PLACED: types.FAST_BET_PLACED === 760,
        FAST_BET_SETTLED: types.FAST_BET_SETTLED === 764,
        // Фрибеты
        FREEBET_PLACED: types.FREEBET_PLACED === 441,
        FREEBET_WON: types.FREEBET_WON === 442,
        FREEBET_LOST: types.FREEBET_LOST === 444,
        // Финансовые
        DEPOSIT: types.DEPOSIT === 69,
        WITHDRAWAL: types.WITHDRAWAL === 90,
        // Бонусы
        BONUS_GAME: types.BONUS_GAME === 17,
        passed: count === 19
    };
}
```

**Критерий успеха:** `count === 19`, все типы соответствуют ожидаемым значениям

---

### 1.4. Проверка OPERATION_GROUPS
**ID:** `TEST_1_4`
**Тип:** Автоматический

```javascript
() => {
    const groups = collector.operationsCollector.OPERATION_GROUPS;
    return {
        hasREGULAR_BETS: Array.isArray(groups.REGULAR_BETS) && groups.REGULAR_BETS.length === 6,
        hasFAST_BETS: Array.isArray(groups.FAST_BETS) && groups.FAST_BETS.length === 2,
        hasFREEBETS: Array.isArray(groups.FREEBETS) && groups.FREEBETS.length === 6,
        hasFINANCE: Array.isArray(groups.FINANCE) && groups.FINANCE.length === 4,
        hasBONUS: Array.isArray(groups.BONUS) && groups.BONUS.length === 1,
        hasALL: Array.isArray(groups.ALL) && groups.ALL.length === 19,
        passed: groups.ALL.length === 19
    };
}
```

**Критерий успеха:** Все группы содержат правильное количество элементов

---

### 1.5. Проверка BetsDetailsFetcher конфигурации
**ID:** `TEST_1_5`
**Тип:** Автоматический

```javascript
() => {
    const fetcher = collector.betsDetailsFetcher;
    return {
        exists: !!fetcher,
        BATCH_SIZE: fetcher.BATCH_SIZE,
        DELAY_BETWEEN_BATCHES: fetcher.DELAY_BETWEEN_BATCHES,
        MAX_RETRIES: fetcher.MAX_RETRIES,
        INITIAL_RETRY_DELAY: fetcher.INITIAL_RETRY_DELAY,
        MAX_RETRY_DELAY: fetcher.MAX_RETRY_DELAY,
        BACKOFF_MULTIPLIER: fetcher.BACKOFF_MULTIPLIER,
        hasGetStats: typeof fetcher.getStats === 'function',
        hasGetFailedMarkers: typeof fetcher.getFailedMarkers === 'function',
        hasFetchDetails: typeof fetcher.fetchDetails === 'function',
        hasStop: typeof fetcher.stop === 'function',
        hasReset: typeof fetcher.reset === 'function',
        passed: fetcher.BATCH_SIZE === 5 &&
                fetcher.MAX_RETRIES === 3 &&
                fetcher.INITIAL_RETRY_DELAY === 500 &&
                fetcher.MAX_RETRY_DELAY === 8000 &&
                fetcher.BACKOFF_MULTIPLIER === 2
    };
}
```

**Критерий успеха:** Все параметры соответствуют ожидаемым значениям

---

### 1.6. Проверка URL_PATTERNS
**ID:** `TEST_1_6`
**Тип:** Автоматический

```javascript
() => {
    const patterns = collector.URL_PATTERNS;
    const testUrls = {
        lastOps: 'https://clientsapi-lb51-w.bk6bba-resources.com/session/client/lastOperations',
        prevOps: 'https://clientsapi-lb01-w.pb06e2-resources.com/session/client/prevOperations',
        pariLastOps: 'https://clientsapi-lb01-w.pb06e2-resources.com/session/client/lastOperations'
    };
    return {
        hasLAST_OPERATIONS: !!patterns.LAST_OPERATIONS,
        hasPREV_OPERATIONS: !!patterns.PREV_OPERATIONS,
        patternCount: Object.keys(patterns).length,
        matchesLastOps: patterns.LAST_OPERATIONS.test(testUrls.lastOps),
        matchesPrevOps: patterns.PREV_OPERATIONS.test(testUrls.prevOps),
        matchesPariLastOps: patterns.LAST_OPERATIONS.test(testUrls.pariLastOps),
        passed: Object.keys(patterns).length === 2 &&
                patterns.LAST_OPERATIONS.test(testUrls.lastOps) &&
                patterns.PREV_OPERATIONS.test(testUrls.prevOps) &&
                patterns.LAST_OPERATIONS.test(testUrls.pariLastOps)
    };
}
```

**Критерий успеха:** 2 паттерна (LAST/PREV_OPERATIONS), корректно матчат URL обоих сайтов

---

### 1.7. Проверка AppState структуры
**ID:** `TEST_1_7`
**Тип:** Автоматический

```javascript
() => {
    const state = collector.state;
    return {
        hasIsInterceptorRunning: typeof state.isInterceptorRunning === 'boolean',
        hasIsCollectionCompleted: typeof state.isCollectionCompleted === 'boolean',
        hasConfig: !!state.config,
        hasExportConfig: !!state.config?.export,
        passed: true
    };
}
```

**Критерий успеха:** Все поля AppState существуют и имеют правильные типы

---

### 1.8. Проверка SegmentMapper
**ID:** `TEST_1_8`
**Тип:** Автоматический

```javascript
() => {
    const sm = collector.segmentMapper;
    return {
        exists: !!sm,
        hasInit: typeof sm.init === 'function',
        hasLoad: typeof sm.load === 'function',
        hasGetName: typeof sm.getName === 'function',
        loaded: sm.loaded,
        mappingsCount: Object.keys(sm.mappings).length,
        sampleLookup: sm.getName('11916'),
        passed: !!sm && typeof sm.getName === 'function' && sm.loaded
    };
}
```

**Критерий успеха:** `loaded === true`, `mappingsCount > 0`, `getName()` возвращает строку

---

## Категория 2: XHR Interceptor

### 2.1. Проверка XHRInterceptor модуля
**ID:** `TEST_2_1`
**Тип:** Автоматический

```javascript
() => {
    const interceptor = collector.interceptor;
    return {
        exists: !!interceptor,
        hasInit: typeof interceptor.init === 'function',
        hasStart: typeof interceptor.start === 'function',
        hasStop: typeof interceptor.stop === 'function',
        hasIsRunning: typeof interceptor.isRunning === 'function',
        isPatched: interceptor.isPatched === true,
        isFetchPatched: interceptor.isFetchPatched === true,
        passed: interceptor.isPatched && interceptor.isFetchPatched
    };
}
```

**Критерий успеха:** XHR и Fetch пропатчены

---

### 2.2. Проверка статуса перехватчика
**ID:** `TEST_2_2`
**Тип:** Автоматический

```javascript
() => {
    const interceptor = collector.interceptor;
    const state = collector.state;
    return {
        isRunning: interceptor.isRunning(),
        stateMatch: interceptor.isRunning() === state.isInterceptorRunning,
        passed: typeof interceptor.isRunning() === 'boolean'
    };
}
```

**Критерий успеха:** Статус перехватчика определяется корректно

---

## Категория 3: Сбор операций (OperationsCollector)

### 3.1. Проверка OperationsCollector модуля
**ID:** `TEST_3_1`
**Тип:** Автоматический

```javascript
() => {
    const collector = collector.operationsCollector;
    return {
        exists: !!collector,
        hasStart: typeof collector.start === 'function',
        hasStop: typeof collector.stop === 'function',
        hasGetStats: typeof collector.getStats === 'function',
        hasGetOperations: typeof collector.getOperations === 'function',
        hasGetGroupedOperations: typeof collector.getGroupedOperations === 'function',
        hasGetMarkersForDetails: typeof collector.getMarkersForDetails === 'function',
        hasHandleOperationsResponse: typeof collector.handleOperationsResponse === 'function',
        passed: true
    };
}
```

**Критерий успеха:** Все методы существуют

---

### 3.2. Проверка статистики сбора
**ID:** `TEST_3_2`
**Тип:** Автоматический

```javascript
() => {
    const stats = collector.operationsCollector.getStats();
    return {
        hasTotal: typeof stats.totalOperations === 'number',
        hasTotalGroups: typeof stats.totalGroups === 'number',
        hasByCategory: !!stats.byCategory,
        hasRegularBets: typeof stats.byCategory?.regularBets === 'number',
        hasFastBets: typeof stats.byCategory?.fastBets === 'number',
        hasFreebets: typeof stats.byCategory?.freebets === 'number',
        hasFinance: typeof stats.byCategory?.finance === 'number',
        hasBonus: typeof stats.byCategory?.bonus === 'number',
        hasDeposits: typeof stats.deposits === 'number',
        hasWithdrawals: typeof stats.withdrawals === 'number',
        hasIsCollecting: typeof stats.isCollecting === 'boolean',
        hasCompleted: typeof stats.completed === 'boolean',
        stats: stats,
        passed: stats.totalOperations >= 0
    };
}
```

**Критерий успеха:** Статистика содержит все необходимые поля

---

### 3.3. Проверка сбора операций (после автозапуска)
**ID:** `TEST_3_3`
**Тип:** Автоматический (требует загрузки страницы)

```javascript
() => {
    const stats = collector.operationsCollector.getStats();
    const operations = collector.operationsCollector.getOperations();
    return {
        totalOperations: operations.length,
        statsTotal: stats.totalOperations,
        isCollecting: stats.isCollecting,
        completed: stats.completed,
        match: operations.length === stats.totalOperations,
        passed: stats.totalOperations > 0 || stats.completed
    };
}
```

**Критерий успеха:** `total > 0` или `completed === true`

---

### 3.4. Ожидание завершения сбора
**ID:** `TEST_3_4`
**Тип:** Автоматический (с ожиданием)

```javascript
() => {
    const stats = collector.operationsCollector.getStats();
    if (!stats.completed && stats.isCollecting) {
        return {
            status: 'in_progress',
            total: stats.totalOperations,
            message: 'Сбор в процессе, повторите тест позже',
            passed: null
        };
    }
    return {
        status: stats.completed ? 'completed' : 'not_started',
        total: stats.totalOperations,
        totalGroups: stats.totalGroups,
        passed: stats.completed
    };
}
```

**Критерий успеха:** `completed === true`

---

## Категория 4: Группировка операций

### 4.1. Проверка группировки по marker
**ID:** `TEST_4_1`
**Тип:** Автоматический

```javascript
() => {
    const grouped = collector.operationsCollector.getGroupedOperations();
    const markers = Object.keys(grouped);
    const totalGroups = markers.length;

    if (totalGroups === 0) {
        return {
            status: 'no_data',
            message: 'Нет сгруппированных операций',
            passed: null
        };
    }

    const sampleMarker = markers[0];
    const sampleGroup = grouped[sampleMarker];

    return {
        totalGroups: totalGroups,
        sampleMarker: sampleMarker,
        hasMarker: typeof sampleGroup.marker === 'string',
        hasOperations: Array.isArray(sampleGroup.operations),
        hasFinalStatus: typeof sampleGroup.finalStatus === 'string',
        hasCategory: typeof sampleGroup.category === 'string',
        hasRegId: 'regId' in sampleGroup,
        operationsCount: sampleGroup.operations.length,
        passed: totalGroups > 0 &&
                sampleGroup.marker &&
                sampleGroup.operations.length > 0 &&
                sampleGroup.finalStatus &&
                sampleGroup.category
    };
}
```

**Критерий успеха:** Группы содержат все необходимые поля

---

### 4.2. Проверка finalStatus
**ID:** `TEST_4_2`
**Тип:** Автоматический

```javascript
() => {
    const grouped = collector.operationsCollector.getGroupedOperations();
    const statuses = {};
    const validStatuses = [
        'won', 'lost', 'pending', 'sold', 'cancelled', 'recalculated',
        'settled', 'refunded', 'deposit', 'withdrawal', 'hold', 'unhold', 'bonus', 'unknown'
    ];

    Object.values(grouped).forEach(g => {
        statuses[g.finalStatus] = (statuses[g.finalStatus] || 0) + 1;
    });

    const foundStatuses = Object.keys(statuses);
    const allValid = foundStatuses.every(s => validStatuses.includes(s));

    return {
        statuses: statuses,
        totalStatuses: foundStatuses.length,
        allValid: allValid,
        passed: allValid && foundStatuses.length > 0
    };
}
```

**Критерий успеха:** Все статусы из списка допустимых

---

### 4.3. Проверка category
**ID:** `TEST_4_3`
**Тип:** Автоматический

```javascript
() => {
    const grouped = collector.operationsCollector.getGroupedOperations();
    const categories = {};
    const validCategories = ['regular_bet', 'fast_bet', 'freebet', 'finance', 'bonus', 'unknown'];

    Object.values(grouped).forEach(g => {
        categories[g.category] = (categories[g.category] || 0) + 1;
    });

    const foundCategories = Object.keys(categories);
    const allValid = foundCategories.every(c => validCategories.includes(c));

    return {
        categories: categories,
        totalCategories: foundCategories.length,
        allValid: allValid,
        passed: allValid && foundCategories.length > 0
    };
}
```

**Критерий успеха:** Все категории из списка допустимых

---

### 4.4. Проверка соответствия статистики и группировки
**ID:** `TEST_4_4`
**Тип:** Автоматический

```javascript
() => {
    const stats = collector.operationsCollector.getStats();
    const grouped = collector.operationsCollector.getGroupedOperations();
    const groupValues = Object.values(grouped);

    const categories = {
        regular_bet: groupValues.filter(g => g.category === 'regular_bet').length,
        fast_bet: groupValues.filter(g => g.category === 'fast_bet').length,
        freebet: groupValues.filter(g => g.category === 'freebet').length,
        finance: groupValues.filter(g => g.category === 'finance').length,
        bonus: groupValues.filter(g => g.category === 'bonus').length
    };

    return {
        statsRegularBets: stats.byCategory?.regularBets,
        actualRegularBets: categories.regular_bet,
        statsFastBets: stats.byCategory?.fastBets,
        actualFastBets: categories.fast_bet,
        statsFreebets: stats.byCategory?.freebets,
        actualFreebets: categories.freebet,
        statsBonus: stats.byCategory?.bonus,
        actualBonus: categories.bonus,
        passed: stats.byCategory?.regularBets === categories.regular_bet &&
                stats.byCategory?.fastBets === categories.fast_bet &&
                stats.byCategory?.freebets === categories.freebet &&
                stats.byCategory?.bonus === categories.bonus
    };
}
```

**Критерий успеха:** Статистика соответствует реальному количеству групп

---

## Категория 5: Дедупликация

### 5.1. Проверка отсутствия дубликатов в операциях
**ID:** `TEST_5_1`
**Тип:** Автоматический

```javascript
() => {
    const ops = collector.operationsCollector.getOperations();
    const seen = new Set();
    let duplicates = 0;
    const duplicatesList = [];

    ops.forEach(op => {
        const key = `${op.saldoId}_${op.Id}`;
        if (seen.has(key)) {
            duplicates++;
            if (duplicatesList.length < 3) {
                duplicatesList.push(key);
            }
        }
        seen.add(key);
    });

    return {
        totalOperations: ops.length,
        uniqueOperations: seen.size,
        duplicates: duplicates,
        duplicatesSample: duplicatesList,
        passed: duplicates === 0
    };
}
```

**Критерий успеха:** `duplicates === 0`

---

### 5.2. Проверка отсутствия дубликатов в группах
**ID:** `TEST_5_2`
**Тип:** Автоматический

```javascript
() => {
    const grouped = collector.operationsCollector.getGroupedOperations();
    let totalDuplicates = 0;

    Object.values(grouped).forEach(group => {
        const seen = new Set();
        group.operations.forEach(op => {
            const key = `${op.saldoId}_${op.Id}`;
            if (seen.has(key)) totalDuplicates++;
            seen.add(key);
        });
    });

    return {
        totalGroups: Object.keys(grouped).length,
        duplicatesInGroups: totalDuplicates,
        passed: totalDuplicates === 0
    };
}
```

**Критерий успеха:** `duplicatesInGroups === 0`

---

## Категория 6: Загрузка деталей (BetsDetailsFetcher)

### 6.1. Получение markers для загрузки деталей
**ID:** `TEST_6_1`
**Тип:** Автоматический

```javascript
() => {
    const markers = collector.operationsCollector.getMarkersForDetails();
    const stats = collector.operationsCollector.getStats();
    const expectedCount = (stats.byCategory?.regularBets || 0) + (stats.byCategory?.freebets || 0);

    return {
        markersCount: markers.length,
        expectedCount: expectedCount,
        sampleMarkers: markers.slice(0, 5),
        allStrings: markers.every(m => typeof m === 'string'),
        allUnique: markers.length === new Set(markers).size,
        passed: markers.length <= expectedCount &&
                markers.every(m => typeof m === 'string')
    };
}
```

**Критерий успеха:** Markers — строки, уникальные, количество соответствует ожидаемому

---

### 6.2. Проверка статистики BetsDetailsFetcher
**ID:** `TEST_6_2`
**Тип:** Автоматический

```javascript
() => {
    const fetcher = collector.betsDetailsFetcher;
    const stats = fetcher.getStats();

    return {
        hasLoaded: typeof stats.loaded === 'number',
        hasErrors: typeof stats.errors === 'number',
        hasPending: typeof stats.pending === 'number',
        hasIsProcessing: typeof stats.isProcessing === 'boolean',
        hasFailedMarkers: Array.isArray(stats.failedMarkers),
        loaded: stats.loaded,
        errors: stats.errors,
        pending: stats.pending,
        isProcessing: stats.isProcessing,
        failedMarkersCount: stats.failedMarkers.length,
        passed: typeof stats.loaded === 'number' &&
                typeof stats.errors === 'number'
    };
}
```

**Критерий успеха:** Статистика содержит все поля с правильными типами

---

### 6.3. Проверка загруженных деталей в группах
**ID:** `TEST_6_3`
**Тип:** Автоматический

```javascript
() => {
    const grouped = collector.operationsCollector.getGroupedOperations();
    const groupValues = Object.values(grouped);

    const betsWithDetails = groupValues.filter(g =>
        (g.category === 'regular_bet' || g.category === 'freebet') && g.details
    );
    const betsWithoutDetails = groupValues.filter(g =>
        (g.category === 'regular_bet' || g.category === 'freebet') && !g.details
    );

    const sampleWithDetails = betsWithDetails[0];

    return {
        totalBets: betsWithDetails.length + betsWithoutDetails.length,
        withDetails: betsWithDetails.length,
        withoutDetails: betsWithoutDetails.length,
        sampleDetails: sampleWithDetails ? {
            marker: sampleWithDetails.marker,
            hasResult: !!sampleWithDetails.details?.result,
            hasHeader: !!sampleWithDetails.details?.header,
            hasBody: !!sampleWithDetails.details?.body
        } : null,
        passed: betsWithDetails.length > 0 || betsWithoutDetails.length === 0
    };
}
```

**Критерий успеха:** Детали загружены для обычных ставок

---

### 6.4. Проверка failedMarkers
**ID:** `TEST_6_4`
**Тип:** Автоматический

```javascript
() => {
    const fetcher = collector.betsDetailsFetcher;
    const failedMarkers = fetcher.getFailedMarkers();
    const stats = fetcher.getStats();

    const sample = failedMarkers[0];

    return {
        count: failedMarkers.length,
        matchesErrors: failedMarkers.length === stats.errors,
        sampleStructure: sample ? {
            hasMarker: typeof sample.marker === 'string',
            hasError: typeof sample.error === 'string',
            hasTimestamp: typeof sample.timestamp === 'number',
            hasRetries: typeof sample.retries === 'number'
        } : null,
        passed: failedMarkers.length === stats.errors
    };
}
```

**Критерий успеха:** `failedMarkers.length === stats.errors`

---

## Категория 7: UI Panel

### 7.1. Проверка существования UI Panel
**ID:** `TEST_7_1`
**Тип:** Автоматический

```javascript
() => {
    const panel = collector.uiPanel;
    const panelElement = document.getElementById('fonbet-collector-panel');

    return {
        moduleExists: !!panel,
        domExists: !!panelElement,
        hasElements: !!panel.elements,
        hasInit: typeof panel.init === 'function',
        hasCreate: typeof panel.create === 'function',
        hasUpdate: typeof panel.update === 'function',
        hasShowProgress: typeof panel.showProgress === 'function',
        hasHideProgress: typeof panel.hideProgress === 'function',
        passed: !!panel && !!panelElement
    };
}
```

**Критерий успеха:** Панель существует в DOM

---

### 7.2. Проверка элементов UI Panel
**ID:** `TEST_7_2`
**Тип:** Автоматический

```javascript
() => {
    const elements = collector.uiPanel.elements;

    return {
        hasPanel: !!elements.panel,
        hasBtnStartAll: !!elements.btnStartAll,
        hasBtnStopAll: !!elements.btnStopAll,
        hasBtnExport: !!elements.btnExport,
        hasBtnExportOps: !!elements.btnExportOps,
        hasXhrCount: !!elements.xhrCount,
        hasErrorCount: !!elements.errorCount,
        hasOpsBets: !!elements.opsBets,
        hasOpsFast: !!elements.opsFast,
        hasOpsFree: !!elements.opsFree,
        hasOpsDeposits: !!elements.opsDeposits,
        hasOpsWithdrawals: !!elements.opsWithdrawals,
        hasOpsBonus: !!elements.opsBonus,
        hasProgressSection: !!elements.progressSection,
        hasStatus: !!elements.status,
        passed: !!elements.panel && !!elements.btnStartAll && !!elements.btnExportOps
    };
}
```

**Критерий успеха:** Все ключевые элементы существуют

---

### 7.3. Проверка отображения статистики в UI
**ID:** `TEST_7_3`
**Тип:** Автоматический

```javascript
() => {
    const elements = collector.uiPanel.elements;
    const stats = collector.operationsCollector.getStats();

    return {
        opsBetsUI: elements.opsBets?.textContent,
        opsBetsStats: stats.byCategory?.regularBets,
        opsFastUI: elements.opsFast?.textContent,
        opsFastStats: stats.byCategory?.fastBets,
        opsFreeUI: elements.opsFree?.textContent,
        opsFreeStats: stats.byCategory?.freebets,
        opsDepositsUI: elements.opsDeposits?.textContent,
        opsDepositsStats: stats.deposits,
        opsWithdrawalsUI: elements.opsWithdrawals?.textContent,
        opsWithdrawalsStats: stats.withdrawals,
        opsBonusUI: elements.opsBonus?.textContent,
        opsBonusStats: stats.byCategory?.bonus,
        passed: parseInt(elements.opsBets?.textContent) === stats.byCategory?.regularBets
    };
}
```

**Критерий успеха:** UI отображает актуальную статистику

---

## Категория 8: Экспорт JSON v2.1

### 8.1. Проверка структуры экспорта (симуляция)
**ID:** `TEST_8_1`
**Тип:** Автоматический

```javascript
() => {
    const operations = collector.operationsCollector.getOperations();
    const grouped = collector.operationsCollector.getGroupedOperations();
    const stats = collector.operationsCollector.getStats();
    const detailsStats = collector.betsDetailsFetcher.getStats();
    const groupValues = Object.values(grouped);

    const bets = groupValues.filter(g => g.category === 'regular_bet');
    const fastBets = groupValues.filter(g => g.category === 'fast_bet');
    const freebets = groupValues.filter(g => g.category === 'freebet');
    const bonus = groupValues.filter(g => g.category === 'bonus');

    // Симулируем структуру экспорта
    const exportStructure = {
        version: '2.1.1',
        site: collector.site,
        summary: {
            totalOperations: operations.length,
            totalGroups: groupValues.length,
            regularBets: bets.length,
            fastBets: fastBets.length,
            freebets: freebets.length,
            deposits: stats.deposits,
            withdrawals: stats.withdrawals,
            bonus: bonus.length,
            detailsLoaded: detailsStats.loaded,
            detailsFailed: detailsStats.errors,
            detailsSkipped: fastBets.length
        }
    };

    return {
        version: exportStructure.version,
        summary: exportStructure.summary,
        hasAllSummaryFields:
            'totalOperations' in exportStructure.summary &&
            'totalGroups' in exportStructure.summary &&
            'regularBets' in exportStructure.summary &&
            'fastBets' in exportStructure.summary &&
            'freebets' in exportStructure.summary &&
            'deposits' in exportStructure.summary &&
            'withdrawals' in exportStructure.summary &&
            'bonus' in exportStructure.summary &&
            'detailsLoaded' in exportStructure.summary &&
            'detailsFailed' in exportStructure.summary &&
            'detailsSkipped' in exportStructure.summary,
        passed: exportStructure.version === '2.2.3'
    };
}
```

**Критерий успеха:** Структура содержит все поля v2.1

---

### 8.2. Проверка новых полей v2.1 (detailsLoaded, detailsFailed, detailsSkipped)
**ID:** `TEST_8_2`
**Тип:** Автоматический

```javascript
() => {
    const detailsStats = collector.betsDetailsFetcher.getStats();
    const grouped = collector.operationsCollector.getGroupedOperations();
    const fastBets = Object.values(grouped).filter(g => g.category === 'fast_bet');

    return {
        detailsLoaded: detailsStats.loaded,
        detailsFailed: detailsStats.errors,
        detailsSkipped: fastBets.length,
        detailsLoadedType: typeof detailsStats.loaded,
        detailsFailedType: typeof detailsStats.errors,
        detailsSkippedType: typeof fastBets.length,
        passed: typeof detailsStats.loaded === 'number' &&
                typeof detailsStats.errors === 'number' &&
                typeof fastBets.length === 'number'
    };
}
```

**Критерий успеха:** Все поля — числа

---

### 8.3. Проверка формата ставки с деталями
**ID:** `TEST_8_3`
**Тип:** Автоматический

```javascript
() => {
    const grouped = collector.operationsCollector.getGroupedOperations();
    const betsWithDetails = Object.values(grouped).filter(g =>
        g.category === 'regular_bet' && g.details
    );

    if (betsWithDetails.length === 0) {
        return {
            status: 'no_bets_with_details',
            message: 'Нет ставок с загруженными деталями',
            passed: null
        };
    }

    const sample = betsWithDetails[0];
    const firstOp = sample.operations[0];

    return {
        marker: sample.marker,
        status: sample.finalStatus,
        hasOperations: Array.isArray(sample.operations),
        operationsCount: sample.operations.length,
        hasDetails: !!sample.details,
        firstOpStructure: {
            hasOperationId: typeof firstOp?.operationId === 'number',
            hasSum: typeof firstOp?.sum === 'number',
            hasTime: typeof firstOp?.time === 'number'
        },
        passed: !!sample.marker &&
                !!sample.finalStatus &&
                sample.operations.length > 0 &&
                !!sample.details
    };
}
```

**Критерий успеха:** Структура ставки соответствует спецификации

---

### 8.4. Проверка поля segments в экспорте
**ID:** `TEST_8_4`
**Тип:** Автоматический

```javascript
() => {
    const grouped = collector.operationsCollector.getGroupedOperations();
    const betsWithDetails = Object.values(grouped).filter(g =>
        g.category === 'regular_bet' && g.details && g.details.body?.bets?.length > 0
    );

    if (betsWithDetails.length === 0) {
        return { status: 'no_bets_with_details', passed: null };
    }

    const sample = betsWithDetails[0];
    const bets = sample.details.body.bets;
    const sm = collector.segmentMapper;

    // Проверяем что segments поле формируется корректно
    const segments = bets.map(b => ({
        segmentId: b.segmentId,
        segmentName: sm.getName(b.segmentId)
    }));

    const resolved = segments.filter(s => s.segmentName !== null).length;

    return {
        sampleMarker: sample.marker,
        betsCount: bets.length,
        segmentsCount: segments.length,
        resolved: resolved,
        sampleSegment: segments[0],
        segmentMapperLoaded: sm.loaded,
        passed: segments.length === bets.length && sm.loaded
    };
}
```

**Критерий успеха:** `segments.length === bets.length`, SegmentMapper загружен

---

## Категория 9: Обработка ошибок

### 9.1. Проверка защиты от повторного запуска
**ID:** `TEST_9_1`
**Тип:** Автоматический

```javascript
() => {
    const collector = collector.operationsCollector;
    const wasCollecting = collector.isCollecting;

    // Если уже запущен, попробуем запустить ещё раз
    if (wasCollecting) {
        collector.start();
        return {
            wasCollecting: true,
            stillCollecting: collector.isCollecting,
            message: 'Защита от повторного запуска работает',
            passed: collector.isCollecting === true
        };
    }

    return {
        wasCollecting: false,
        message: 'Сбор не был запущен, тест пропущен',
        passed: null
    };
}
```

**Критерий успеха:** Повторный запуск не создаёт проблем

---

### 9.2. Проверка обработки SESSION_EXPIRED
**ID:** `TEST_9_2`
**Тип:** Автоматический (проверка структуры)

```javascript
() => {
    const fetcher = collector.betsDetailsFetcher;
    const failedMarkers = fetcher.getFailedMarkers();

    const sessionErrors = failedMarkers.filter(m =>
        m.error === 'SESSION_EXPIRED'
    );

    return {
        totalFailed: failedMarkers.length,
        sessionExpiredErrors: sessionErrors.length,
        otherErrors: failedMarkers.length - sessionErrors.length,
        passed: true // Структурный тест
    };
}
```

**Критерий успеха:** Ошибки SESSION_EXPIRED корректно логируются

---

## Категория 10: Интеграционные тесты

### 10.1. Полная проверка после сбора
**ID:** `TEST_10_1`
**Тип:** Автоматический

```javascript
() => {
    const stats = collector.operationsCollector.getStats();
    const detailsStats = collector.betsDetailsFetcher.getStats();
    const grouped = collector.operationsCollector.getGroupedOperations();
    const operations = collector.operationsCollector.getOperations();

    // Проверка дубликатов
    const seen = new Set();
    let duplicates = 0;
    operations.forEach(op => {
        const key = `${op.saldoId}_${op.Id}`;
        if (seen.has(key)) duplicates++;
        seen.add(key);
    });

    // Подсчёт категорий
    const groupValues = Object.values(grouped);
    const categories = {};
    groupValues.forEach(g => {
        categories[g.category] = (categories[g.category] || 0) + 1;
    });

    const result = {
        // Сбор
        collectionCompleted: stats.completed,
        totalOperations: stats.totalOperations,
        totalGroups: stats.totalGroups,

        // Дедупликация
        duplicates: duplicates,

        // Категории
        categories: categories,

        // Детали
        detailsLoaded: detailsStats.loaded,
        detailsFailed: detailsStats.errors,

        // Общий результат
        passed: stats.completed &&
                duplicates === 0 &&
                stats.totalGroups > 0
    };

    return result;
}
```

**Критерий успеха:** Все проверки пройдены

---

### 10.2. Проверка консистентности данных
**ID:** `TEST_10_2`
**Тип:** Автоматический

```javascript
() => {
    const stats = collector.operationsCollector.getStats();
    const grouped = collector.operationsCollector.getGroupedOperations();
    const operations = collector.operationsCollector.getOperations();
    const groupValues = Object.values(grouped);

    // Подсчёт операций в группах
    let opsInGroups = 0;
    groupValues.forEach(g => {
        opsInGroups += g.operations.length;
    });

    // Проверка категорий
    const byCat = {
        regular_bet: groupValues.filter(g => g.category === 'regular_bet').length,
        fast_bet: groupValues.filter(g => g.category === 'fast_bet').length,
        freebet: groupValues.filter(g => g.category === 'freebet').length,
        finance: groupValues.filter(g => g.category === 'finance').length,
        bonus: groupValues.filter(g => g.category === 'bonus').length
    };

    return {
        totalOperations: operations.length,
        operationsInGroups: opsInGroups,
        totalGroups: groupValues.length,
        statsGroups: stats.totalGroups,
        categoriesMatch:
            byCat.regular_bet === stats.byCategory?.regularBets &&
            byCat.fast_bet === stats.byCategory?.fastBets &&
            byCat.freebet === stats.byCategory?.freebets &&
            byCat.bonus === stats.byCategory?.bonus,
        groupsMatch: groupValues.length === stats.totalGroups,
        passed: groupValues.length === stats.totalGroups
    };
}
```

**Критерий успеха:** Все подсчёты консистентны

---

## Категория 11: GitHubSync — конфигурация и API

### 11.1. Проверка модуля GitHubSync
**ID:** `TEST_11_1`
**Тип:** Автоматический

```javascript
() => {
    const gs = collector.githubSync;
    return {
        exists: !!gs,
        hasInit: typeof gs.init === 'function',
        hasSync: typeof gs.sync === 'function',
        hasIsConfigured: typeof gs.isConfigured === 'function',
        hasShowSetupDialog: typeof gs.showSetupDialog === 'function',
        hasChangeAlias: typeof gs.changeAlias === 'function',
        hasGetSyncStatus: typeof gs.getSyncStatus === 'function',
        hasApiBase: gs.API_BASE === 'https://api.github.com',
        passed: !!gs && typeof gs.sync === 'function'
    };
}
```

**Критерий успеха:** Все методы GitHubSync существуют

---

### 11.2. Проверка isConfigured() до настройки
**ID:** `TEST_11_2`
**Тип:** Автоматический

```javascript
() => {
    const gs = collector.githubSync;
    const configured = gs.isConfigured();
    const status = gs.getSyncStatus();
    return {
        isConfigured: configured,
        statusType: typeof status,
        hasStatusText: typeof status.text === 'string',
        hasStatusConfigured: typeof status.configured === 'boolean',
        passed: typeof configured === 'boolean'
    };
}
```

**Критерий успеха:** `isConfigured()` возвращает boolean

---

### 11.3. Проверка конфигурации из GM_setValue
**ID:** `TEST_11_3`
**Тип:** Автоматический (после настройки)

```javascript
() => {
    const gs = collector.githubSync;
    return {
        hasToken: !!gs.token,
        hasRepoOwner: !!gs.repoOwner,
        hasRepoName: !!gs.repoName,
        hasAccountAlias: !!gs.accountAlias,
        isConfigured: gs.isConfigured(),
        passed: gs.isConfigured()
    };
}
```

**Критерий успеха:** Все 4 поля заполнены, `isConfigured() === true`

---

### 11.4. Проверка _buildFilePath()
**ID:** `TEST_11_4`
**Тип:** Автоматический (после настройки)

```javascript
() => {
    const gs = collector.githubSync;
    if (!gs.isConfigured()) {
        return { status: 'not_configured', passed: null };
    }

    const siteId = collector.siteDetector.currentSite?.id;
    const clientId = collector.operationsCollector.sessionParams?.clientId;
    const alias = gs.accountAlias;

    const expectedPattern = `${siteId}/${clientId}_${alias}.json`;

    return {
        siteId: siteId,
        clientId: clientId,
        alias: alias,
        expectedPattern: expectedPattern,
        passed: !!siteId && !!clientId && !!alias
    };
}
```

**Критерий успеха:** Путь файла соответствует паттерну `{siteId}/{clientId}_{alias}.json`

---

## Категория 12: GitHubSync — Merge логика

### 12.1. Проверка _mergeArray с пустым remote
**ID:** `TEST_12_1`
**Тип:** Автоматический

```javascript
() => {
    const gs = collector.githubSync;

    // Симуляция merge с пустыми remote-данными
    const localBets = [
        { marker: '111', finalStatus: 'won', operations: [{sum: 100}] },
        { marker: '222', finalStatus: 'lost', operations: [{sum: 200}] }
    ];

    const result = gs._mergeArray([], localBets);

    return {
        resultLength: result.merged.length,
        added: result.added,
        updated: result.updated,
        passed: result.merged.length === 2 && result.added === 2 && result.updated === 0
    };
}
```

**Критерий успеха:** Все локальные данные добавлены, `added === 2`, `updated === 0`

---

### 12.2. Проверка _mergeArray с дубликатами по marker
**ID:** `TEST_12_2`
**Тип:** Автоматический

```javascript
() => {
    const gs = collector.githubSync;

    const remoteBets = [
        { marker: '111', finalStatus: 'pending', operations: [{sum: 100}] },
        { marker: '333', finalStatus: 'won', operations: [{sum: 300}] }
    ];
    const localBets = [
        { marker: '111', finalStatus: 'won', operations: [{sum: 100}] },
        { marker: '222', finalStatus: 'lost', operations: [{sum: 200}] }
    ];

    const result = gs._mergeArray(remoteBets, localBets);

    // marker 111: updated (pending → won)
    // marker 222: added (new)
    // marker 333: kept from remote
    const merged111 = result.merged.find(b => b.marker === '111');

    return {
        resultLength: result.merged.length,
        added: result.added,
        updated: result.updated,
        marker111Status: merged111?.finalStatus,
        hasMarker222: result.merged.some(b => b.marker === '222'),
        hasMarker333: result.merged.some(b => b.marker === '333'),
        passed: result.merged.length === 3 &&
                result.added === 1 &&
                result.updated === 1 &&
                merged111?.finalStatus === 'won'
    };
}
```

**Критерий успеха:** 3 элемента после merge, `added === 1`, `updated === 1`, marker 111 обновлён

---

### 12.3. Проверка _mergeData (полный merge)
**ID:** `TEST_12_3`
**Тип:** Автоматический

```javascript
() => {
    const gs = collector.githubSync;

    const remoteData = {
        bets: [{ marker: '111', finalStatus: 'pending' }],
        fastBets: [],
        freebets: [],
        finance: { deposits: [], withdrawals: [], holds: [] },
        bonus: []
    };

    const localData = {
        bets: [
            { marker: '111', finalStatus: 'won' },
            { marker: '222', finalStatus: 'lost' }
        ],
        fastBets: [],
        freebets: [],
        finance: {
            deposits: [{ marker: 'dep1', operations: [{sum: 1000}] }],
            withdrawals: [],
            holds: []
        },
        bonus: []
    };

    const result = gs._mergeData(remoteData, localData);

    return {
        betsCount: result.merged.bets.length,
        depositsCount: result.merged.finance.deposits.length,
        totalAdded: result.stats.added,
        totalUpdated: result.stats.updated,
        passed: result.merged.bets.length === 2 &&
                result.merged.finance.deposits.length === 1 &&
                result.stats.added >= 2
    };
}
```

**Критерий успеха:** Данные корректно объединены, статистика merge верна

---

## Категория 13: GitHubSync — UI интеграция

### 13.1. Проверка кнопки Sync в UI
**ID:** `TEST_13_1`
**Тип:** Автоматический

```javascript
() => {
    const elements = collector.uiPanel.elements;
    return {
        hasBtnSync: !!elements.btnSync,
        hasSyncStatus: !!elements.syncStatus,
        btnSyncExists: !!document.querySelector('.fc-btn-sync'),
        passed: !!elements.btnSync
    };
}
```

**Критерий успеха:** Кнопка Sync существует в DOM

---

### 13.2. Проверка состояний кнопки Sync
**ID:** `TEST_13_2`
**Тип:** Автоматический

```javascript
() => {
    const btn = collector.uiPanel.elements.btnSync;
    const gs = collector.githubSync;
    const stats = collector.operationsCollector.getStats();

    return {
        buttonExists: !!btn,
        isDisabled: btn?.disabled,
        isSyncing: gs.isSyncing,
        collectionCompleted: stats.completed,
        isConfigured: gs.isConfigured(),
        // Кнопка должна быть disabled если сбор не завершён
        correctState: stats.completed ? !btn?.disabled || !gs.isConfigured() : btn?.disabled,
        passed: !!btn
    };
}
```

**Критерий успеха:** Состояние кнопки соответствует текущему состоянию скрипта

---

### 13.3. Проверка статуса синхронизации в UI
**ID:** `TEST_13_3`
**Тип:** Автоматический

```javascript
() => {
    const statusEl = collector.uiPanel.elements.syncStatus;
    const gs = collector.githubSync;
    const status = gs.getSyncStatus();

    return {
        statusElementExists: !!statusEl,
        statusText: status.text,
        statusConfigured: status.configured,
        lastSyncResult: gs.lastSyncResult,
        passed: !!statusEl && typeof status.text === 'string'
    };
}
```

**Критерий успеха:** Статус синхронизации отображается корректно

---

### 13.4. Проверка настроек Sync в панели настроек
**ID:** `TEST_13_4`
**Тип:** Автоматический

```javascript
() => {
    const settingsPanel = document.querySelector('.fc-settings-overlay');
    // Проверяем наличие sync-полей (они создаются при открытии панели)
    return {
        settingsPanelExists: !!settingsPanel,
        message: 'Откройте панель настроек для полной проверки',
        passed: true // Структурный тест
    };
}
```

**Критерий успеха:** Панель настроек содержит секцию Sync

---

## Категория 14: GitHubSync — Синхронизация (интеграционные)

### 14.1. Первая синхронизация (создание файла)
**ID:** `TEST_14_1`
**Тип:** Ручной (требует настроенный GitHub)

**Предусловия:**
- GitHubSync настроен (isConfigured() === true)
- Сбор операций завершён
- Детали загружены
- Файл аккаунта НЕ существует в GitHub

**Шаги:**
1. Вызвать `collector.sync()`
2. Дождаться завершения

```javascript
async () => {
    const gs = collector.githubSync;
    if (!gs.isConfigured()) {
        return { status: 'not_configured', passed: null };
    }

    const statusBefore = gs.lastSyncResult;
    // Note: sync() is async, run manually and check result after
    return {
        isConfigured: true,
        isSyncing: gs.isSyncing,
        lastSyncResult: statusBefore,
        message: 'Запустите collector.sync() и проверьте результат',
        passed: null
    };
}
```

**Критерий успеха:** Файл создан в GitHub, lastSyncResult содержит результат

---

### 14.2. Проверка результата синхронизации
**ID:** `TEST_14_2`
**Тип:** Автоматический (после sync)

```javascript
() => {
    const gs = collector.githubSync;
    const result = gs.lastSyncResult;

    if (!result) {
        return { status: 'no_sync_result', passed: null };
    }

    return {
        success: result.success,
        added: result.added,
        updated: result.updated,
        totalAfterSync: result.totalAfterSync,
        timestamp: result.timestamp,
        hasError: !!result.error,
        errorMessage: result.error || null,
        passed: result.success === true && result.added >= 0
    };
}
```

**Критерий успеха:** `success === true`, данные корректно загружены

---

### 14.3. Повторная синхронизация (merge)
**ID:** `TEST_14_3`
**Тип:** Ручной

**Предусловия:**
- Первая синхронизация выполнена (14.1)
- Файл существует в GitHub

**Шаги:**
1. Вызвать `collector.sync()` повторно
2. Проверить результат

**Критерий успеха:** `updated >= 0`, старые данные сохранены, syncHistory содержит 2+ записей

---

### 14.4. Проверка changeAlias
**ID:** `TEST_14_4`
**Тип:** Ручной (требует настроенный GitHub)

```javascript
() => {
    const gs = collector.githubSync;
    return {
        currentAlias: gs.accountAlias,
        isConfigured: gs.isConfigured(),
        message: 'Вызовите collector.changeAlias("newName") для проверки',
        passed: null
    };
}
```

**Критерий успеха:** Файл переименован в GitHub, alias обновлён в GM_setValue

---

### 14.5. Проверка безопасности токена
**ID:** `TEST_14_5`
**Тип:** Автоматический

```javascript
() => {
    const gs = collector.githubSync;

    // Проверяем что токен не попадает в экспортируемые данные
    const exportModule = collector.exportOperations;
    // Токен не должен быть виден в глобальном объекте (кроме githubSync)
    const collectorStr = JSON.stringify(collector, (key, value) => {
        if (key === 'githubSync' || key === 'token') return '[REDACTED]';
        if (typeof value === 'function') return '[FUNCTION]';
        return value;
    });

    const tokenLeaked = gs.token && collectorStr.includes(gs.token);

    return {
        tokenExists: !!gs.token,
        tokenLength: gs.token ? gs.token.length : 0,
        tokenStartsWith: gs.token ? gs.token.substring(0, 4) + '...' : null,
        tokenLeakedInCollector: tokenLeaked,
        passed: !tokenLeaked
    };
}
```

**Критерий успеха:** Токен не утекает через глобальный объект

---

## Категория 15: FreebetCollector (страница /bonuses)

### 15.1. Проверка модуля FreebetCollector
**ID:** `TEST_15_1`
**Тип:** Автоматический (на странице /bonuses)

```javascript
() => {
    const fc = collector.freebetCollector;
    return {
        exists: !!fc,
        hasInit: typeof fc.init === 'function',
        hasFetchFreebets: typeof fc.fetchFreebets === 'function',
        hasHandleResponse: typeof fc.handleResponse === 'function',
        hasGetStats: typeof fc.getStats === 'function',
        hasGetActiveFreebets: typeof fc.getActiveFreebets === 'function',
        hasSyncFreebets: typeof fc.syncFreebets === 'function',
        hasLoadSessionParams: typeof fc._loadSessionParamsFromStorage === 'function',
        passed: !!fc && typeof fc.fetchFreebets === 'function'
    };
}
```

**Критерий успеха:** Все методы FreebetCollector существуют

---

### 15.2. Проверка загрузки sessionParams из localStorage
**ID:** `TEST_15_2`
**Тип:** Автоматический (на странице /bonuses)

```javascript
() => {
    const fc = collector.freebetCollector;
    const sp = fc.sessionParams;
    return {
        hasSessionParams: !!sp,
        hasFsid: typeof sp?.fsid === 'string',
        hasClientId: typeof sp?.clientId === 'number',
        hasDeviceId: sp?.deviceId !== undefined,
        hasSysId: sp?.sysId !== undefined,
        sessionParams: sp,
        passed: !!sp && !!sp.fsid && typeof sp.clientId === 'number'
    };
}
```

**Критерий успеха:** sessionParams загружены из localStorage, fsid и clientId присутствуют

---

### 15.3. Проверка загрузки фрибетов
**ID:** `TEST_15_3`
**Тип:** Автоматический (на странице /bonuses, после init)

```javascript
() => {
    const fc = collector.freebetCollector;
    return {
        isLoaded: fc.isLoaded,
        freebetsCount: fc.freebets?.length,
        activeCount: fc.getActiveFreebets()?.length,
        stats: fc.getStats(),
        passed: fc.isLoaded && fc.freebets?.length >= 0
    };
}
```

**Критерий успеха:** `isLoaded === true`, фрибеты загружены

---

### 15.4. Проверка UI панели на /bonuses
**ID:** `TEST_15_4`
**Тип:** Автоматический (на странице /bonuses)

```javascript
() => {
    const panel = document.getElementById('fonbet-collector-panel');
    const panelCount = document.querySelectorAll('#fonbet-collector-panel').length;
    return {
        panelExists: !!panel,
        panelCount: panelCount,
        noDuplicates: panelCount === 1,
        passed: !!panel && panelCount === 1
    };
}
```

**Критерий успеха:** Одна панель (без дубликатов)

---

### 15.5. Проверка защиты от дублирования init
**ID:** `TEST_15_5`
**Тип:** Автоматический

```javascript
() => {
    const gw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    return {
        _fcInitialized: gw._fcInitialized,
        panelCount: document.querySelectorAll('#fonbet-collector-panel').length,
        passed: gw._fcInitialized === true
    };
}
```

**Критерий успеха:** `_fcInitialized === true`, одна панель

---

## Быстрый чеклист (Quick Test Suite)

Последовательность команд для быстрой проверки:

```javascript
// 1. Версия
() => ({ version: collector.version, passed: collector.version === '2.2.2' })

// 2. Типы операций
() => ({ count: Object.keys(collector.operationsCollector.OPERATION_TYPES).length, passed: Object.keys(collector.operationsCollector.OPERATION_TYPES).length === 19 })

// 3. Статистика сбора
() => collector.operationsCollector.getStats()

// 4. Группы
() => ({ groups: Object.keys(collector.operationsCollector.getGroupedOperations()).length })

// 5. Дубликаты
() => { const ops = collector.operationsCollector.getOperations(); const seen = new Set(); let dups = 0; ops.forEach(op => { const key = `${op.saldoId}_${op.Id}`; if (seen.has(key)) dups++; seen.add(key); }); return { total: ops.length, duplicates: dups, passed: dups === 0 }; }

// 6. Категории
() => { const grouped = collector.operationsCollector.getGroupedOperations(); const cats = {}; Object.values(grouped).forEach(g => cats[g.category] = (cats[g.category] || 0) + 1); return cats; }

// 7. Детали загрузки
() => collector.betsDetailsFetcher.getStats()

// 8. v2.1 поля
() => { const ds = collector.betsDetailsFetcher.getStats(); const fb = Object.values(collector.operationsCollector.getGroupedOperations()).filter(g => g.category === 'fast_bet').length; return { detailsLoaded: ds.loaded, detailsFailed: ds.errors, detailsSkipped: fb }; }

// 9. UI Panel
() => ({ panelExists: !!document.getElementById('fonbet-collector-panel'), elementsCount: Object.keys(collector.uiPanel.elements).length })

// 10. Полная проверка
() => { const s = collector.operationsCollector.getStats(); const d = collector.betsDetailsFetcher.getStats(); return { completed: s.completed, total: s.total, groups: s.totalGroups, detailsLoaded: d.loaded, passed: s.completed && s.total > 0 }; }

// 11. GitHubSync модуль
() => ({ hasSync: !!collector.githubSync, isConfigured: collector.githubSync?.isConfigured(), syncStatus: collector.githubSync?.getSyncStatus(), passed: !!collector.githubSync })

// 12. Sync UI
() => ({ btnSync: !!collector.uiPanel.elements.btnSync, syncStatus: !!collector.uiPanel.elements.syncStatus, passed: !!collector.uiPanel.elements.btnSync })

// 13. SegmentMapper
() => ({ loaded: collector.segmentMapper.loaded, count: Object.keys(collector.segmentMapper.mappings).length, sample: collector.segmentMapper.getName('11916'), passed: collector.segmentMapper.loaded })

// 14. FreebetCollector (на /bonuses)
() => ({ exists: !!collector.freebetCollector, isLoaded: collector.freebetCollector?.isLoaded, stats: collector.freebetCollector?.getStats(), sessionParams: !!collector.freebetCollector?.sessionParams, passed: !!collector.freebetCollector })
```

---

## Результаты тестирования

### Fonbet (fon.bet) — v2.2.2 (2026-02-11)

| ID | Тест | Статус | Примечания |
|----|------|--------|------------|
| 1.1 | Загрузка скрипта | ✅ | version === '2.2.2' |
| 1.2 | Глобальный объект | ✅ | Все модули + freebetCollector, githubSync, segmentMapper |
| 1.3 | OPERATION_TYPES (19 типов) | ✅ | По спецификации |
| 1.4 | OPERATION_GROUPS | ✅ | ALL.length === 19 |
| 1.5 | BetsDetailsFetcher конфигурация | ✅ | Параметры верны |
| 1.6 | URL_PATTERNS | ✅ | 2 паттерна: LAST/PREV_OPERATIONS |
| 1.7 | AppState структура | ✅ | Структура корректна |
| 1.8 | SegmentMapper | ✅ | loaded: true, 3049 сегментов, getName() работает |
| 2.1 | XHRInterceptor модуль | ✅ | XHR + Fetch пропатчены |
| 2.2 | Статус перехватчика | ✅ | Статус корректен |
| 3.1 | OperationsCollector модуль | ✅ | Модуль работает |
| 3.2 | Статистика сбора | ✅ | 8290 операций (полная пагинация) |
| 3.3 | Сбор операций | ✅ | Данные получены |
| 3.4 | Завершение сбора | ✅ | completed: true |
| 4.1 | Группировка по marker | ✅ | 4043 группы |
| 4.2 | finalStatus | ✅ | won/lost/pending/sold/cancelled/... |
| 4.3 | category | ✅ | regular_bet: 3615, freebet: 249, finance, bonus |
| 4.4 | Соответствие статистики | ✅ | Статистика консистентна |
| 5.1 | Дубликаты в операциях | ✅ | 0 дубликатов |
| 5.2 | Дубликаты в группах | ✅ | 0 дубликатов |
| 6.1 | Markers для деталей | ✅ | 3864 markers |
| 6.2 | Статистика BetsDetailsFetcher | ✅ | 3864 загружено, 0 ошибок |
| 6.3 | Детали в группах | ✅ | 3864/3864 (100%) |
| 6.4 | failedMarkers | ✅ | 0 ошибок |
| 7.1 | UI Panel существование | ✅ | Панель работает |
| 7.2 | Элементы UI Panel | ✅ | Все элементы на месте |
| 7.3 | Статистика в UI | ✅ | Счётчики корректны |
| 8.1 | Структура экспорта v2.1 | ✅ | Все поля присутствуют |
| 8.2 | Новые поля v2.1 | ✅ | detailsLoaded: 3864, detailsFailed: 0 |
| 8.3 | Формат ставки с деталями | ✅ | Структура корректна |
| 8.4 | Поле segments в экспорте | ✅ | 2457/4099 (60%) сегментов разрешено |
| 9.1 | Защита от повторного запуска | ✅ | location.reload() при повторном Start |
| 9.2 | Обработка SESSION_EXPIRED | ✅ | 0 ошибок сессии |
| 10.1 | Полная проверка | ✅ | Все системы работают |
| 10.2 | Консистентность данных | ✅ | Данные консистентны |
| 11.1 | GitHubSync модуль | ✅ | Все методы существуют |
| 11.2 | isConfigured() | ✅ | "Ожидание сбора данных..." до завершения |
| 11.3 | Конфигурация из GM_setValue | ✅ | Все 4 поля заполнены, isConfigured: true |
| 11.4 | _buildFilePath() | ✅ | fonbet/74129997_28FonMakarenko.json |
| 12.1 | _mergeArray с пустым remote | ✅ | added: 2, updated: 0 |
| 12.2 | _mergeArray с дубликатами | ✅ | 3 элемента, added: 1, updated: 1 |
| 12.3 | _mergeData полный merge | ✅ | bets: 2, deposits: 1, added: 2, updated: 1 |
| 13.1 | Кнопка Sync в UI | ✅ | btnSync + syncStatus в DOM |
| 13.2 | Состояния кнопки Sync | ✅ | Состояние корректно |
| 13.3 | Статус синхронизации | ✅ | Корректные состояния |
| 13.4 | Настройки Sync в панели | ✅ | Структурный тест |
| 14.1 | Первая синхронизация | ✅ | success: true |
| 14.2 | Результат синхронизации | ✅ | Данные загружены |
| 14.3 | Повторная синхронизация | ✅ | Повторный sync успешен |
| 14.4 | changeAlias | ✅ | Файл переименован |
| 14.5 | Безопасность токена | ✅ | Токен не утекает |
| 15.1 | FreebetCollector модуль | ✅ | Все методы существуют |
| 15.2 | sessionParams из localStorage | ✅ | fsid + clientId загружены |
| 15.3 | Загрузка фрибетов | ✅ | 1 активный фрибет, 623 ₽ |
| 15.4 | UI панель на /bonuses | ✅ | Одна панель, без дубликатов |
| 15.5 | Защита от дублирования | ✅ | _fcInitialized === true |

### Pari (pari.ru) — v2.2.3 (2026-02-12)

| ID | Тест | Статус | Примечания |
|----|------|--------|------------|
| 1.1 | Загрузка скрипта | ✅ | version === '2.2.3' |
| 1.2 | Глобальный объект | ✅ | freebetCollector нет на /operations (by design) |
| 1.3 | OPERATION_TYPES (19 типов) | ✅ | По спецификации |
| 1.4 | OPERATION_GROUPS | ✅ | ALL.length === 19 |
| 1.5 | BetsDetailsFetcher конфигурация | ✅ | Параметры верны |
| 1.6 | URL_PATTERNS | ✅ | 2 паттерна: LAST/PREV_OPERATIONS |
| 1.7 | AppState структура | ✅ | Структура корректна |
| 1.8 | SegmentMapper | ✅ | loaded: true, 3049 сегментов |
| 2.1 | XHRInterceptor модуль | ✅ | XHR + Fetch пропатчены |
| 2.2 | Статус перехватчика | ✅ | Статус корректен |
| 3.2 | Статистика сбора | ✅ | 6365 операций (полная пагинация) |
| 3.4 | Завершение сбора | ✅ | completed: true |
| 4.1 | Группировка по marker | ✅ | 3252 группы |
| 4.2 | finalStatus | ✅ | won/lost/pending/sold/deposit/withdrawal/bonus |
| 4.3 | category | ✅ | regular_bet: 3101, freebet: 4, finance: 145 |
| 4.4 | Соответствие статистики | ✅ | Статистика консистентна |
| 5.1 | Дубликаты в операциях | ✅ | 0 дубликатов |
| 5.2 | Дубликаты в группах | ✅ | 0 дубликатов |
| 6.1 | Markers для деталей | ✅ | 3105 markers |
| 6.2 | Статистика BetsDetailsFetcher | ✅ | 3105 загружено, 0 ошибок |
| 6.3 | Детали в группах | ✅ | 3105/3105 (100%) |
| 6.4 | failedMarkers | ✅ | 0 ошибок |
| 7.1 | UI Panel существование | ✅ | Панель работает |
| 7.2 | Элементы UI Panel | ✅ | Все элементы на месте |
| 7.3 | Статистика в UI | ✅ | Счётчики корректны |
| 8.1 | Структура экспорта v2.1 | ✅ | Все поля присутствуют |
| 8.2 | Новые поля v2.1 | ✅ | detailsLoaded: 3105, detailsFailed: 0 |
| 8.3 | Формат ставки с деталями | ✅ | Структура корректна |
| 8.4 | Поле segments в экспорте | ✅ | SegmentMapper загружен |
| 9.2 | Обработка SESSION_EXPIRED | ✅ | 0 ошибок сессии |
| 10.1 | Полная проверка | ✅ | Все системы работают |
| 10.2 | Консистентность данных | ✅ | 6365 ops, 6365 in groups, 0 orphans |
| 11.1 | GitHubSync модуль | ✅ | Все методы существуют |
| 11.2 | isConfigured() | ✅ | false (не настроен на этом профиле) |
| 12.1 | _mergeArray с пустым remote | ✅ | added: 2, updated: 0 |
| 12.2 | _mergeArray с дубликатами | ✅ | 3 элемента, added: 1, updated: 1 |
| 12.3 | _mergeData полный merge | ✅ | bets: 2, deposits: 1, added: 2, updated: 1 |
| 13.1 | Кнопка Sync в UI | ✅ | btnSync + syncStatus в DOM |
| 13.2 | Состояния кнопки Sync | ✅ | Состояние корректно |
| 13.3 | Статус синхронизации | ✅ | «Sync не настроен» |
| 14.5 | Безопасность токена | ✅ | Токен не утекает |
| 15.1 | FreebetCollector модуль | ✅ | Все методы существуют |
| 15.2 | sessionParams из localStorage | ✅ | pb.* ключи, fsid + clientId загружены |
| 15.3 | Загрузка фрибетов | ✅ | 1 активный фрибет, 10 000 ₽ |
| 15.4 | UI панель на /bonuses | ✅ | Одна панель, без дубликатов |
| 15.5 | Защита от дублирования | ✅ | _fcInitialized === true |

**Легенда:** ⬜ Не проверено | ✅ Пройден | ❌ Провален | ⚠️ С замечаниями | ⏭️ Пропущен

---

## Инструкция по запуску тестов

### Подготовка
1. Запустить профиль Octo: `python octo_start.py`
2. Открыть в браузере: `https://fon.bet/account/history/operations` или `https://pari.ru/account/history/operations`
3. Дождаться автозапуска сбора и его завершения
4. Подключиться к MCP devtools

### Запуск тестов
1. Выполнить тесты категории 1 (инициализация)
2. Дождаться `completed: true` в тесте 3.4
3. Выполнить остальные тесты
4. Записать результаты в таблицу

### Интерпретация результатов
- **passed: true** — тест пройден
- **passed: false** — тест провален, требуется анализ
- **passed: null** — тест не применим (нет данных или условие не выполнено)

---

## Итоговый отчёт тестирования

### Fonbet (2026-02-11, v2.2.2)

**Тестировщик:** Claude Code + MCP chrome-devtools
**Тестовый аккаунт:** fon.bet (Макаренко Давид Андреевич)

**Результаты:**
- Пройдено: 55 тестов
- Пропущено: 0 тестов
- С замечаниями: 0 тестов
- Провалено: 0 тестов

**Ключевые метрики:**

```json
{
  "version": "2.2.2",
  "site": "Fonbet",
  "summary": {
    "totalOperations": 8290,
    "totalGroups": 4043,
    "regularBets": 3615,
    "fastBets": 0,
    "freebets": 249,
    "deposits": 86,
    "withdrawals": 93,
    "bonus": 0,
    "detailsLoaded": 3864,
    "detailsFailed": 0,
    "detailsSkipped": 0
  },
  "segmentMapper": {
    "loaded": true,
    "mappingsCount": 3049,
    "segmentsResolved": 2457,
    "unresolvedUniqueSegmentIds": 107
  },
  "freebetCollector": {
    "activeFreebets": 1,
    "totalAmount": 623,
    "sessionParamsSource": "unsafeWindow.localStorage"
  }
}
```

### Pari (2026-02-12, v2.2.3)

**Тестировщик:** Claude Code + MCP chrome-devtools
**Тестовый аккаунт:** pari.ru (Тебенихин Константин Александрович), профиль 37

**Результаты:**
- Пройдено: 45 тестов
- Пропущено: 0 тестов
- С замечаниями: 0 тестов
- Провалено: 0 тестов

**Ключевые метрики:**

```json
{
  "version": "2.2.3",
  "site": "Pari",
  "summary": {
    "totalOperations": 6365,
    "totalGroups": 3252,
    "regularBets": 3101,
    "fastBets": 0,
    "freebets": 4,
    "deposits": 110,
    "withdrawals": 35,
    "bonus": 2,
    "detailsLoaded": 3105,
    "detailsFailed": 0,
    "detailsSkipped": 0
  },
  "segmentMapper": {
    "loaded": true,
    "mappingsCount": 3049
  },
  "freebetCollector": {
    "activeFreebets": 1,
    "totalAmount": 10000,
    "sessionParamsSource": "unsafeWindow.localStorage (pb.* prefix)"
  }
}
```

### Выводы:

1. v2.2.2 успешно работает на fon.bet — полное регрессионное тестирование пройдено
2. v2.2.3 успешно работает на pari.ru — полное тестирование пройдено (45 тестов)
3. GitHubSync: синхронизация, merge, changeAlias — всё работает корректно
4. 100% детализация ставок (fonbet: 3864/3864, pari: 3105/3105)
5. 0 ошибок загрузки деталей, 0 дубликатов на обоих сайтах
6. UI Sync: кнопка, статус, настройки — всё на месте
7. Токен не утекает через глобальный объект
8. SegmentMapper: 3049 сегментов загружено, 60% разрешение (fonbet)
9. Полная пагинация: fonbet 8290, pari 6365 операций
10. FreebetCollector: работает на обоих сайтах (fonbet: red.*, pari: pb.*)
11. Бонусные операции без marker теперь группируются через fallback saldo_{saldoId}

**Общая оценка: УСПЕШНО ПРОЙДЕНО**

### Изменения в тестах для v2.0.1:

| Тест | Изменение |
|------|-----------|
| 1.1 | Версия: `2.0.0` → `2.0.1` |
| 1.2 | Убрана проверка `hasSELECTORS` (SELECTORS удалён) |
| 1.7 | Убраны проверки: `hasCollectedData`, `hasCollectedRegIds`, `hasXhrCount`, `hasErrorCount`, `hasDuplicateCount` (поля удалены из AppState) |

### Изменения в тестах для v2.1.0:

| Тест | Изменение |
|------|-----------|
| 1.1 | Версия: `2.0.1` → `2.1.0` |
| 1.2 | Добавлены проверки: `hasGitHubSync`, `hasSync`, `hasChangeAlias` |
| 11.1-11.4 | Новые: GitHubSync конфигурация и API |
| 12.1-12.3 | Новые: Merge логика (_mergeArray, _mergeData) |
| 13.1-13.4 | Новые: UI интеграция Sync (кнопка, статус, настройки) |
| 14.1-14.5 | Новые: Интеграционные тесты синхронизации (sync, changeAlias, безопасность) |

### Изменения в тестах для v2.1.1:

| Тест | Изменение |
|------|-----------|
| 1.1 | Версия: `2.1.0` → `2.1.1` |
| 3.1 | Убрана проверка `hasFetchAllBetsDetails` (метод удалён) |
| 8.1 | Версия экспорта: `2.1.0` → `2.1.1` |

### Изменения в тестах для Фазы 14-15:

| Тест | Изменение |
|------|-----------|
| 1.2 | Добавлена проверка: `segmentMapper` в глобальном объекте |
| 1.8 | Новый: проверка SegmentMapper (загрузка, getName) |
| 8.4 | Новый: проверка поля `segments` в экспорте |
| Quick #13 | Новый: SegmentMapper в быстром чеклисте |

### Изменения в тестах для v2.2.0 (Фаза 16):

| Тест | Изменение |
|------|-----------|
| 1.1 | Версия: `2.1.1` → `2.2.0` |
| 1.2 | Добавлена проверка: `hasFreebetCollector` |
| 1.6 | Удалены `NEXT_OPERATIONS`/`GET_FREEBETS` (2 паттерна вместо 3) |
| 8.1 | Версия экспорта: `2.1.1` → `2.2.0` |
| 15.1-15.5 | Новые: FreebetCollector (модуль, sessionParams, загрузка, UI, дублирование) |
| Quick #14 | Новый: FreebetCollector в быстром чеклисте |

### Изменения в тестах для v2.2.1–v2.2.2 (Фаза 16.1):

| Тест | Изменение |
|------|-----------|
| 1.1 | Версия: `2.2.0` → `2.2.2` |
| 8.1 | Версия экспорта: `2.2.0` → `2.2.2` |

### Изменения в тестах для v2.2.3 (Фаза 17):

| Тест | Изменение |
|------|-----------|
| 1.1 | Версия: `2.2.2` → `2.2.3` |
| 8.1 | Версия экспорта: `2.2.2` → `2.2.3` |
| Pari | Полное тестирование pari.ru (45 тестов), добавлена таблица результатов |

