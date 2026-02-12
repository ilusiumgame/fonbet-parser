// ==UserScript==
// @name         Fonbet & Pari Collector
// @namespace    http://tampermonkey.net/
// @version      2.4.0
// @description  Сбор истории ставок и операций с fon.bet и pari.ru с синхронизацией в GitHub
// @author       ilusiumgame
// @match        https://fon.bet/account/history/operations
// @match        https://pari.ru/account/history/operations
// @match        https://fon.bet/bonuses*
// @match        https://pari.ru/bonuses*
// @match        https://betboom.ru/lobby/betshistory*
// @match        https://betboom.ru/lobby/paymentshistory*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/ilusiumgame/fonbet-parser/main/universal_collector.user.js
// @downloadURL  https://raw.githubusercontent.com/ilusiumgame/fonbet-parser/main/universal_collector.user.js
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    // 1. CONSTANTS & CONFIG

    const VERSION = '2.4.0';

    const DEBUG_MODE = false; // Установить в true для отладки

    // Logger wrapper для управления выводом логов
    const logger = {
        log: (...args) => {
            if (DEBUG_MODE) console.log(...args);
        },
        warn: (...args) => {
            if (DEBUG_MODE) console.warn(...args);
        },
        error: (...args) => {
            console.error(...args); // Ошибки всегда показываем
        },
        debug: (...args) => {
            if (DEBUG_MODE) console.log('[DEBUG]', ...args);
        },
        info: (...args) => {
            console.log(...args); // Важная информация всегда
        }
    };

    // URL паттерны для перехвата
    const URL_PATTERNS = {
        LAST_OPERATIONS: /\/session\/client\/lastOperations$/,
        PREV_OPERATIONS: /\/session\/client\/prevOperations$/
    };

    // Site Detector Module
    const SiteDetector = {
        SITES: {
            FONBET: {
                id: 'fonbet',
                name: 'Fonbet',
                hostname: 'fon.bet',
                apiPattern: /bk6bba-resources/,
                fallbackApiBase: 'https://clientsapi-lb52-w.bk6bba-resources.ru',
                couponInfoBase: 'https://clientsapi-lb52-w.bk6bba-resources.ru'
            },
            PARI: {
                id: 'pari',
                name: 'Pari',
                hostname: 'pari.ru',
                apiPattern: /pb06e2-resources/,
                fallbackApiBase: 'https://clientsapi-lb01-w.pb06e2-resources.com',
                couponInfoBase: 'https://clientsapi-lb01-w.pb06e2-resources.com'
            },
            BETBOOM: {
                id: 'betboom',
                name: 'BetBoom',
                hostname: 'betboom.ru',
                apiPattern: /betboom\.ru\/api\/access/,
                fallbackApiBase: null,
                couponInfoBase: null
            }
        },

        currentSite: null,

        detect() {
            const hostname = window.location.hostname;
            for (const site of Object.values(this.SITES)) {
                if (hostname === site.hostname || hostname.endsWith('.' + site.hostname)) {
                    this.currentSite = site;
                    console.log(`[SiteDetector] Определён сайт: ${site.name}`);
                    return site;
                }
            }
            console.warn('[SiteDetector] Неизвестный сайт:', hostname);
            // fallback на fonbet
            this.currentSite = this.SITES.FONBET;
            return this.currentSite;
        },

        // Определить сайт по URL API запроса
        detectFromApiUrl(url) {
            for (const site of Object.values(this.SITES)) {
                if (site.apiPattern.test(url)) {
                    this.currentSite = site;
                    return site;
                }
            }
            return this.currentSite;
        },

        getSiteName() {
            return this.currentSite?.name || 'Unknown';
        },

        getFallbackApiBase() {
            return this.currentSite?.fallbackApiBase || this.SITES.FONBET.fallbackApiBase;
        },

        getCouponInfoUrl() {
            return (this.currentSite?.couponInfoBase || this.SITES.FONBET.couponInfoBase) + '/coupon/info';
        },

        isBetBoom() {
            return this.currentSite?.id === 'betboom';
        }
    };

    // Segment Mapper Module
    const SegmentMapper = {
        mappings: {},
        loaded: false,
        loading: false,
        GITHUB_RAW_URL: 'https://raw.githubusercontent.com/ilusiumgame/fonbet-parser/main/segment_mappings.json',

        init() {
            this.load();
        },

        load() {
            if (this.loaded || this.loading) return;
            this.loading = true;
            logger.log('[SegmentMapper] Загрузка маппингов...');

            GM_xmlhttpRequest({
                method: 'GET',
                url: this.GITHUB_RAW_URL,
                onload: (response) => {
                    try {
                        if (response.status === 200) {
                            this.mappings = JSON.parse(response.responseText);
                            this.loaded = true;
                            const count = Object.keys(this.mappings).length;
                            logger.info(`[SegmentMapper] Загружено ${count} сегментов`);
                        } else {
                            logger.error(`[SegmentMapper] Ошибка загрузки: HTTP ${response.status}`);
                        }
                    } catch (e) {
                        logger.error('[SegmentMapper] Ошибка парсинга:', e);
                    }
                    this.loading = false;
                },
                onerror: (error) => {
                    logger.error('[SegmentMapper] Ошибка сети:', error);
                    this.loading = false;
                }
            });
        },

        getName(segmentId) {
            if (!segmentId) return null;
            return this.mappings[String(segmentId)] || null;
        }
    };

    // FreebetCollector Module
    const FreebetCollector = {
        freebets: [],
        sessionParams: null,
        isLoaded: false,

        init() {
            // Читаем sessionParams из localStorage (надёжнее перехвата fetch)
            this._loadSessionParamsFromStorage();
            // Автоматически загружаем фрибеты
            if (this.sessionParams) {
                this.fetchFreebets();
            } else {
                console.error('❌ [FreebetCollector] Не удалось получить sessionParams из localStorage');
            }
        },

        _loadSessionParamsFromStorage() {
            try {
                const ls = unsafeWindow.localStorage;
                const prefix = SiteDetector.currentSite?.id === 'pari' ? 'pb' : 'red';
                const fsid = ls.getItem(`${prefix}.fsid`);
                const clientId = ls.getItem(`${prefix}.clientId`);
                const deviceId = ls.getItem(`${prefix}.deviceID`);
                const sysId = ls.getItem(`${prefix}.lastSysId`);
                if (fsid && clientId) {
                    this.sessionParams = {
                        fsid,
                        clientId: parseInt(clientId, 10),
                        deviceId: deviceId || undefined,
                        sysId: sysId ? parseInt(sysId, 10) : undefined
                    };
                    console.log('✅ [FreebetCollector] sessionParams загружены из localStorage');
                }
            } catch (e) {
                console.error('❌ [FreebetCollector] Ошибка чтения localStorage:', e);
            }
        },

        handleResponse(data) {
            if (!data || data.result !== 'freebets' || !Array.isArray(data.list)) return;

            this.freebets = data.list;
            this.isLoaded = true;
            console.log(`✅ [FreebetCollector] Загружено ${data.list.length} фрибетов (${this.getActiveFreebets().length} активных)`);
        },

        getActiveFreebets() {
            return this.freebets.filter(fb => fb.state === 'active');
        },

        getStats() {
            const active = this.getActiveFreebets();
            const totalValue = active.reduce((sum, fb) => sum + (fb.value || 0), 0);
            return {
                total: this.freebets.length,
                active: active.length,
                used: this.freebets.filter(fb => fb.state === 'used').length,
                totalValue,
                totalValueFormatted: `${(totalValue / 100).toLocaleString('ru-RU')} \u20BD`,
                isLoaded: this.isLoaded
            };
        },

        _buildSyncData() {
            const active = this.getActiveFreebets();
            const totalValue = active.reduce((sum, fb) => sum + (fb.value || 0), 0);

            return {
                version: VERSION,
                account: {
                    siteId: SiteDetector.currentSite?.id || 'unknown',
                    siteName: SiteDetector.getSiteName(),
                    clientId: this.sessionParams?.clientId || 'unknown',
                    alias: GitHubSync.accountAlias || 'unknown'
                },
                lastSync: new Date().toISOString(),
                totalActive: active.length,
                totalValue,
                totalValueFormatted: `${(totalValue / 100).toLocaleString('ru-RU')} \u20BD`,
                activeFreebets: active.map(fb => ({
                    id: fb.id,
                    value: fb.value,
                    valueFormatted: `${(fb.value / 100).toLocaleString('ru-RU')} \u20BD`,
                    state: fb.state,
                    kind: fb.kind,
                    promoId: fb.promoId || '',
                    restriction: fb.restriction,
                    restrictionDescription: fb.restrictionDescription,
                    createdTime: fb.createdTime,
                    expireTime: fb.expireTime
                }))
            };
        },

        async fetchFreebets() {
            if (!this.sessionParams) {
                console.error('❌ [FreebetCollector] Нет sessionParams для запроса');
                return false;
            }

            const apiBase = SiteDetector.getFallbackApiBase();
            if (!apiBase) {
                console.error('❌ [FreebetCollector] API base не определён');
                return false;
            }

            try {
                const body = {
                    lang: 'ru',
                    includeInactive: false,
                    ...this.sessionParams
                };
                // Удаляем undefined значения
                Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

                const response = await fetch(`${apiBase}/client/getFreebets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                    body: JSON.stringify(body)
                });

                const data = await response.json();
                this.handleResponse(data);
                return true;
            } catch (error) {
                console.error('❌ [FreebetCollector] Ошибка запроса:', error);
                return false;
            }
        }
    };

    // BetBoom Collector Module
    const BetBoomCollector = {
        // === State ===
        gamblerId: null,
        gamblerName: null,
        bets: [],
        payments: [],
        isCollecting: false,
        isCompleted: false,
        error: null,
        period: null,

        // === Constants ===
        BET_STATUS_GROUPS: [
            'BET_STATUS_GROUPS_WIN',
            'BET_STATUS_GROUPS_LOSE',
            'BET_STATUS_GROUPS_RETURN',
            'BET_STATUS_GROUPS_IN_PROGRESS'
        ],
        BETS_PAGE_LIMIT: 30,
        DELAY_BETWEEN_PAGES: 200,

        // === Init ===
        async init() {
            logger.info('[BetBoomCollector] Инициализация...');
            this._loadPeriodSettings();
            await this.start();
        },

        _loadPeriodSettings() {
            const saved = GM_getValue('betboom_period', null);
            if (saved) {
                try {
                    this.period = JSON.parse(saved);
                } catch (e) {
                    this.period = null;
                }
            }
            if (!this.period) {
                const to = new Date();
                to.setDate(to.getDate() + 1);
                const from = new Date();
                from.setFullYear(from.getFullYear() - 1);
                this.period = {
                    from: from.toISOString(),
                    to: to.toISOString()
                };
            }
        },

        savePeriodSettings(fromDate, toDate) {
            this.period = { from: fromDate, to: toDate };
            GM_setValue('betboom_period', JSON.stringify(this.period));
            logger.info(`[BetBoomCollector] Период сохранён: ${fromDate} — ${toDate}`);
        },

        // === API ===
        async _apiFetch(endpoint, body = {}) {
            const resp = await fetch(`/api/access/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'include'
            });
            if (!resp.ok) {
                throw new Error(`HTTP_${resp.status}`);
            }
            return resp.json();
        },

        async _fetchUserInfo() {
            const data = await this._apiFetch('user/me');
            this.gamblerId = data.gambler_id;
            this.gamblerName = data.personal_data?.full_name || '';
            logger.info(`[BetBoomCollector] User: ${this.gamblerId} (${this.gamblerName})`);
        },

        async _fetchAllBets() {
            let allBets = [];
            let cursor = '';
            let page = 0;

            while (true) {
                page++;
                const body = {
                    bet_status_groups: this.BET_STATUS_GROUPS,
                    before: cursor,
                    limit: this.BETS_PAGE_LIMIT,
                    period: {
                        from: this.period.from,
                        to: this.period.to
                    }
                };

                const data = await this._apiFetch('bets_history/get', body);
                const bets = data.bets || [];
                allBets = allBets.concat(bets);

                if (typeof UIPanel !== 'undefined' && UIPanel.elements?.progressStage) {
                    UIPanel.showProgress(`Загрузка ставок (стр. ${page}, всего ${allBets.length})...`);
                }

                logger.log(`[BetBoomCollector] Стр. ${page}: +${bets.length} (всего: ${allBets.length})`);

                if (data.is_last_page || bets.length === 0) break;

                cursor = bets[bets.length - 1].create_dttm;
                await new Promise(r => setTimeout(r, this.DELAY_BETWEEN_PAGES));
            }

            this.bets = allBets;
            logger.info(`[BetBoomCollector] Всего ставок: ${allBets.length}`);
        },

        async _fetchPayments() {
            if (typeof UIPanel !== 'undefined' && UIPanel.elements?.progressStage) {
                UIPanel.showProgress('Загрузка платежей...');
            }
            const data = await this._apiFetch('payments/get_history', );
            this.payments = data.payments || data || [];
            if (!Array.isArray(this.payments)) this.payments = [];
            logger.info(`[BetBoomCollector] Платежей: ${this.payments.length}`);
        },

        // === Main flow ===
        async start() {
            if (this.isCollecting) return;
            this.isCollecting = true;
            this.isCompleted = false;
            this.error = null;
            this.bets = [];
            this.payments = [];

            try {
                // Step 1: User info
                if (typeof UIPanel !== 'undefined' && UIPanel.elements?.progressStage) {
                    UIPanel.showProgress('Получение данных пользователя...');
                }
                await this._fetchUserInfo();

                // Step 2: Bets
                await this._fetchAllBets();

                // Step 3: Payments
                await this._fetchPayments();

                // Done
                this.isCompleted = true;
                AppState.isCollectionCompleted = true;
                AppState.completionStats = {
                    totalBets: this.bets.length,
                    totalPayments: this.payments.length
                };

                const stats = this.getStats();
                logger.info(`[BetBoomCollector] Сбор завершён: ${stats.totalBets} ставок, ${stats.totalPayments} платежей, профит: ${stats.profit} ₽`);

                if (typeof UIPanel !== 'undefined') {
                    UIPanel.showProgress(`Готово: ${stats.totalBets} ставок, ${stats.totalPayments} платежей`);
                    UIPanel.update();
                }

                // Auto-sync
                if (typeof SettingsManager !== 'undefined') {
                    const settings = SettingsManager.getSettings();
                    if (settings.sync?.autoSync && typeof GitHubSync !== 'undefined' && GitHubSync.isConfigured()) {
                        try {
                            logger.info('[BetBoomCollector] Auto-sync...');
                            await GitHubSync.syncBetBoom();
                        } catch (e) {
                            console.warn('[BetBoomCollector] Auto-sync ошибка:', e.message);
                        }
                    }
                }

            } catch (error) {
                this.error = error.message;
                logger.error(`[BetBoomCollector] Ошибка: ${error.message}`);
                if (typeof UIPanel !== 'undefined' && UIPanel.elements?.progressStage) {
                    UIPanel.showProgress(`Ошибка: ${error.message}`);
                }
            } finally {
                this.isCollecting = false;
            }
        },

        // === Stats ===
        getStats() {
            const wins = this.bets.filter(b => b.bet_status?.type === 'BET_STATUS_TYPES_WIN').length;
            const losses = this.bets.filter(b => b.bet_status?.type === 'BET_STATUS_TYPES_LOSS').length;
            const returns = this.bets.filter(b =>
                b.bet_status?.type === 'BET_STATUS_TYPES_RETURN' ||
                b.bet_status?.type === 'BET_STATUS_TYPES_PARTIAL_RETURN'
            ).length;
            const inProgress = this.bets.filter(b =>
                b.bet_status?.type === 'BET_STATUS_TYPES_IN_PROGRESS'
            ).length;
            const sold = this.bets.filter(b => b.bet_status?.type === 'BET_STATUS_TYPES_SOLD').length;

            const deposits = this.payments.filter(p => !p.is_payout);
            const withdrawals = this.payments.filter(p => p.is_payout);

            const totalStaked = this.bets.reduce((s, b) => s + (b.bet_sum || 0), 0);
            const totalWon = this.bets.reduce((s, b) => s + (b.bet_win || 0), 0);

            return {
                totalBets: this.bets.length,
                wins, losses, returns, inProgress, sold,
                totalPayments: this.payments.length,
                deposits: deposits.length,
                withdrawals: withdrawals.length,
                depositsSum: deposits.reduce((s, p) => s + (p.amount || 0), 0),
                withdrawalsSum: withdrawals.reduce((s, p) => s + (p.amount || 0), 0),
                totalStaked,
                totalWon,
                profit: totalWon - totalStaked,
                isCollecting: this.isCollecting,
                isCompleted: this.isCompleted
            };
        },

        // === Export ===
        buildExportData() {
            if (this.bets.length === 0 && this.payments.length === 0) return null;

            const stats = this.getStats();
            return {
                version: VERSION,
                site: 'BetBoom',
                exportDate: new Date().toISOString(),
                account: {
                    siteId: 'betboom',
                    siteName: 'BetBoom',
                    gamblerId: this.gamblerId,
                    gamblerName: this.gamblerName,
                    alias: (typeof GitHubSync !== 'undefined' ? GitHubSync.accountAlias : '') || ''
                },
                period: this.period,
                summary: {
                    totalBets: stats.totalBets,
                    wins: stats.wins,
                    losses: stats.losses,
                    returns: stats.returns,
                    inProgress: stats.inProgress,
                    sold: stats.sold,
                    totalPayments: stats.totalPayments,
                    deposits: stats.deposits,
                    withdrawals: stats.withdrawals,
                    depositsSum: stats.depositsSum,
                    withdrawalsSum: stats.withdrawalsSum,
                    totalStaked: stats.totalStaked,
                    totalWon: stats.totalWon,
                    profit: stats.profit
                },
                bets: this.bets,
                payments: this.payments
            };
        }
    };

    // Operations Collector Module
    const OperationsCollector = {
        collectedOperations: [],
        isCollecting: false,
        lastSaldoId: null,
        lastTransId: null,
        completed: false,

        // Параметры сессии для запросов
        sessionParams: null,

        // Настройки фильтрации (какие группы операций собирать)
        activeGroups: ['ALL'],  // По умолчанию собираем всё

        // Сгруппированные данные по marker
        groupedByMarker: {},

        // Флаг автозагрузки деталей
        autoLoadDetails: true,

        // Типы операций
        OPERATION_TYPES: {
            // Обычные ставки (требуют coupon/info для деталей)
            BET_PLACED: 1,           // Сделана ставка → Прогноз принят
            BET_WON: 2,              // Рассчитана ставка → Выигрыш
            BET_RECALCULATED: 3,     // Перерассчитана ставка
            BET_LOST: 4,             // Ставка проиграна → Проигрыш
            BET_CANCELLED: 5,        // Отмена расчета
            BET_SOLD: 7,             // Продана ставка → Продажа

            // Быстрые ставки (БЕЗ деталей через coupon/info)
            FAST_BET_PLACED: 760,    // Ставка сделана
            FAST_BET_SETTLED: 764,   // Ставка рассчитана

            // Фрибеты
            FREEBET_PLACED: 441,     // Сделан фрибет
            FREEBET_WON: 442,        // Рассчитан фрибет
            FREEBET_RECALCULATED: 443, // Перерассчитан фрибет
            FREEBET_LOST: 444,       // Фрибет проигран
            FREEBET_CANCELLED: 445,  // Отмена расчета фрибета
            FREEBET_REFUND: 446,     // Компенсация суммы фрибета

            // Финансовые операции
            DEPOSIT: 69,             // Интерактивная ставка → Ввод (депозит)
            WITHDRAWAL: 90,          // Выигрыш интерактивной ставки → Вывод
            WITHDRAWAL_HOLD: 460,    // Холдирование выплаты
            WITHDRAWAL_UNHOLD: 461,  // Отмена холдирования

            // Бонусы
            BONUS_GAME: 17           // Бонус игровой
        },

        // Группы операций для фильтрации
        OPERATION_GROUPS: {
            REGULAR_BETS: [1, 2, 3, 4, 5, 7],
            FAST_BETS: [760, 764],
            FREEBETS: [441, 442, 443, 444, 445, 446],
            FINANCE: [69, 90, 460, 461],
            BONUS: [17],
            // Все операции связанные со ставками
            ALL_BETS: [1, 2, 3, 4, 5, 7, 760, 764, 441, 442, 443, 444, 445, 446],
            // Все типы операций
            ALL: [1, 2, 3, 4, 5, 7, 760, 764, 441, 442, 443, 444, 445, 446, 69, 90, 460, 461, 17]
        },

        // Названия операций для UI и экспорта
        OPERATION_NAMES: {
            // Обычные ставки
            1: 'Прогноз принят',
            2: 'Выигрыш',
            3: 'Перерассчитано',
            4: 'Проигрыш',
            5: 'Отмена расчета',
            7: 'Продажа',

            // Быстрые ставки
            760: 'Быстрая ставка',
            764: 'Быстрая ставка рассчитана',

            // Фрибеты
            441: 'Поставлен фрибет',
            442: 'Рассчитан фрибет',
            443: 'Перерассчитан фрибет',
            444: 'Фрибет проигран',
            445: 'Отмена фрибета',
            446: 'Компенсация фрибета',

            // Финансовые
            69: 'Ввод',
            90: 'Вывод',
            460: 'Холдирование вывода',
            461: 'Отмена холдирования',

            // Бонусы
            17: 'Бонус игровой'
        },

        init() {
            logger.log('🔧 [OperationsCollector] Инициализация...');
            this.reset();
            logger.info('✅ [OperationsCollector] Готов к работе');
        },

        reset() {
            this.collectedOperations = [];
            this.groupedByMarker = {};
            this.lastSaldoId = null;
            this.lastTransId = null;
            this.completed = false;
            this.baseApiUrl = null; // Базовый URL API (определяется из первого запроса)
            logger.log('🔄 [OperationsCollector] Сброс данных');
        },

        start() {
            if (this.isCollecting) {
                console.log('⚠️ [OperationsCollector] Уже запущен');
                return;
            }

            console.log('▶️ [OperationsCollector] Запуск сбора операций...');
            this.reset();
            this.isCollecting = true;

            // Сбрасываем статус завершения
            AppState.isCollectionCompleted = false;
            AppState.completionStats = null;

            // Обрабатываем кэшированные данные, если они есть
            if (window._collectorCachedOperations && window._collectorCachedOperations.length > 0) {
                console.log(`📦 [OperationsCollector] Найдено ${window._collectorCachedOperations.length} кэшированных запросов`);
                for (const cached of window._collectorCachedOperations) {
                    this.handleOperationsResponse(cached.data, cached.isLastOperations, cached.requestBody, cached.requestUrl);
                }
                window._collectorCachedOperations = [];
            }

            logger.info('✅ [OperationsCollector] Сбор активен (автоматическая подгрузка)');
        },

        stop() {
            if (!this.isCollecting) {
                console.log('⚠️ [OperationsCollector] Уже остановлен');
                return;
            }

            console.log('⏹️ [OperationsCollector] Остановка сбора...');
            this.isCollecting = false;
            logger.info('✅ [OperationsCollector] Сбор остановлен');
        },

        handleOperationsResponse(data, isInitial = false, requestBody = null, requestUrl = null) {
            if (!this.isCollecting) return;

            try {
                if (!data || !data.operations) {
                    console.error('❌ [OperationsCollector] Невалидные данные:', data);
                    return;
                }

                // Сохраняем базовый URL API из первого запроса
                if (!this.baseApiUrl && requestUrl) {
                    // Извлекаем базовый URL (до /lastOperations или /prevOperations)
                    const match = requestUrl.match(/(https?:\/\/[^\/]+\/session\/client)\//);
                    if (match) {
                        this.baseApiUrl = match[1];
                        SiteDetector.detectFromApiUrl(requestUrl);
                        console.log('✅ [OperationsCollector] Базовый URL API сохранён:', this.baseApiUrl);
                    }
                }

                // Сохраняем параметры сессии из первого запроса
                if (!this.sessionParams && requestBody) {
                    try {
                        const params = JSON.parse(requestBody);
                        this.sessionParams = {
                            fsid: params.fsid,
                            sysId: params.sysId,
                            clientId: params.clientId,
                            CDI: params.CDI,
                            deviceId: params.deviceId
                        };
                        console.log('✅ [OperationsCollector] Параметры сессии сохранены');
                    } catch (e) {
                        console.error('❌ [OperationsCollector] Ошибка парсинга параметров:', e);
                    }
                }

                const operations = data.operations;
                let addedCount = 0;

                // DEBUG: Вывод всех operationId для анализа
                if (operations.length > 0) {
                    const operationIds = [...new Set(operations.map(op => op.operationId))];
                    console.log(`🔍 [DEBUG] Найдено уникальных типов операций: ${operationIds.join(', ')}`);

                    // Проверка на неизвестные типы операций
                    const knownIds = this.OPERATION_GROUPS.ALL;
                    const unknownIds = operationIds.filter(id => !knownIds.includes(id));
                    if (unknownIds.length > 0) {
                        console.warn(`⚠️ [UNKNOWN OPERATIONS] Обнаружены неизвестные типы операций: ${unknownIds.join(', ')}`);
                        console.warn(`⚠️ [UNKNOWN OPERATIONS] Пожалуйста, сообщите об этом разработчику!`);
                    }
                }

                // Фильтруем операции по активным группам
                const filteredOperations = this._filterOperations(operations);

                // Добавляем отфильтрованные операции
                for (const op of filteredOperations) {
                    // Проверка на дубликаты
                    const isDuplicate = this.collectedOperations.some(existing =>
                        existing.saldoId === op.saldoId && existing.Id === op.Id
                    );

                    if (!isDuplicate) {
                        this.collectedOperations.push(op);
                        addedCount++;
                    }
                }

                // Группируем операции по marker
                this._groupByMarker(filteredOperations);

                if (addedCount > 0) {
                    console.log(`✅ [OperationsCollector] Добавлено ${addedCount} операций (всего: ${this.collectedOperations.length})`);
                }

                // Сохраняем последние позиции для пагинации ТОЛЬКО если есть операции
                if (operations.length > 0) {
                    const lastOp = operations[operations.length - 1];
                    this.lastSaldoId = lastOp.saldoId;
                    this.lastTransId = lastOp.Id;
                    console.log(`📍 [OperationsCollector] Обновлены параметры пагинации: saldoId=${this.lastSaldoId}, transId=${this.lastTransId}`);
                }

                // Проверяем, есть ли еще данные
                if (data.completed === true) {
                    // Если это начальный lastOperations и есть операции + параметры для пагинации,
                    // всегда проверяем prevOperations — страница может использовать малый batch size,
                    // и completed:true в lastOperations не означает "вся история загружена"
                    if (isInitial && operations.length > 0 && this.sessionParams && this.lastSaldoId) {
                        console.log('🔄 [OperationsCollector] Initial lastOperations completed, проверяем prevOperations...');
                        this._requestNextOperations();
                    } else {
                        this.completed = true;
                        if (operations.length > 0) {
                            console.log('🎉 [OperationsCollector] Все операции собраны!');
                        } else {
                            console.log('✅ [OperationsCollector] Сбор завершен (пустой финальный ответ)');
                        }
                        this.stop();

                        // Автоматический запуск загрузки деталей
                        if (this.autoLoadDetails) {
                            this._autoLoadBetsDetails();
                        }
                    }
                } else if (data.completed === false && operations.length > 0) {
                    // Автоматически запрашиваем следующую порцию
                    console.log('🔄 [OperationsCollector] Запрос следующей порции...');
                    this._requestNextOperations();
                } else if (operations.length === 0) {
                    // Пустой ответ без флага completed - игнорируем
                    console.log('⚠️ [OperationsCollector] Получен пустой ответ (не финальный), игнорируем');
                }

            } catch (error) {
                console.error('❌ [OperationsCollector] Ошибка обработки:', error);
            }
        },

        _requestNextOperations() {
            if (!this.sessionParams) {
                console.error('❌ [OperationsCollector] Нет параметров сессии для запроса');
                return;
            }

            if (!this.lastSaldoId || this.lastTransId === null) {
                console.error('❌ [OperationsCollector] Нет данных о последней операции');
                return;
            }

            // Формируем тело запроса
            const requestBody = {
                saldoId: this.lastSaldoId,
                transId: this.lastTransId,
                maxCount: 1000,
                ...this.sessionParams
            };

            // Используем динамически определённый базовый URL или fallback
            const baseUrl = this.baseApiUrl || SiteDetector.getFallbackApiBase() + '/session/client';
            const endpoint = `${baseUrl}/prevOperations`;

            console.log(`🔄 [OperationsCollector] Запрос prevOperations (saldoId: ${this.lastSaldoId}, transId: ${this.lastTransId})`);
            console.log(`📡 [OperationsCollector] Endpoint: ${endpoint}`);

            // Делаем fetch запрос
            fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=UTF-8'
                },
                body: JSON.stringify(requestBody)
            })
            .then(response => response.json())
            .then(data => {
                console.log('✅ [OperationsCollector] Получен ответ prevOperations');
                this.handleOperationsResponse(data, false);
            })
            .catch(error => {
                console.error('❌ [OperationsCollector] Ошибка запроса prevOperations:', error);
                this.stop();
            });
        },

        getStats() {
            const ops = this.collectedOperations;
            const groups = this.groupedByMarker;
            const groupValues = Object.values(groups);

            return {
                totalOperations: ops.length,
                totalGroups: groupValues.length,

                // По категориям
                byCategory: {
                    regularBets: groupValues.filter(g => g.category === 'regular_bet').length,
                    fastBets: groupValues.filter(g => g.category === 'fast_bet').length,
                    freebets: groupValues.filter(g => g.category === 'freebet').length,
                    finance: groupValues.filter(g => g.category === 'finance').length,
                    bonus: groupValues.filter(g => g.category === 'bonus').length
                },

                // Финансовые операции (для обратной совместимости)
                deposits: ops.filter(op => op.operationId === this.OPERATION_TYPES.DEPOSIT).length,
                withdrawals: ops.filter(op => op.operationId === this.OPERATION_TYPES.WITHDRAWAL).length,

                isCollecting: this.isCollecting,
                completed: this.completed
            };
        },

        getOperations() {
            return this.collectedOperations;
        },

        // Получить сгруппированные операции
        getGroupedOperations() {
            return this.groupedByMarker;
        },

        // Фильтрация операций по группам
        _filterOperations(operations, groups = null) {
            const activeGroups = groups || this.activeGroups;

            // Если ALL - возвращаем все операции
            if (activeGroups.includes('ALL')) {
                return operations;
            }

            // Собираем все разрешённые operationId из выбранных групп
            const allowedIds = activeGroups.flatMap(g => this.OPERATION_GROUPS[g] || []);

            return operations.filter(op => allowedIds.includes(op.operationId));
        },

        // Группировка операций по marker
        _groupByMarker(operations) {
            operations.forEach(op => {
                const marker = op.marker || op.markerId || `saldo_${op.saldoId}`;
                if (!marker) return;

                const markerKey = String(marker);

                if (!this.groupedByMarker[markerKey]) {
                    this.groupedByMarker[markerKey] = {
                        marker: markerKey,
                        operations: [],
                        finalStatus: null,
                        regId: null,
                        category: null  // regular_bet, fast_bet, freebet, finance, bonus
                    };
                }

                // Проверка на дубликаты внутри группы
                const isDuplicate = this.groupedByMarker[markerKey].operations.some(existing =>
                    existing.saldoId === op.saldoId && existing.Id === op.Id
                );

                if (!isDuplicate) {
                    this.groupedByMarker[markerKey].operations.push(op);
                }
            });

            // Обновляем статусы и категории для всех групп
            Object.values(this.groupedByMarker).forEach(group => {
                group.finalStatus = this._determineFinalStatus(group.operations);
                group.regId = this._extractRegId(group.operations);
                group.category = this._determineCategory(group.operations);
            });
        },

        // Определение финального статуса группы операций
        _determineFinalStatus(operations) {
            const opIds = operations.map(op => op.operationId);

            // Обычные ставки
            if (opIds.includes(2)) return 'won';
            if (opIds.includes(4)) return 'lost';
            if (opIds.includes(7)) return 'sold';
            if (opIds.includes(5)) return 'cancelled';
            if (opIds.includes(3)) return 'recalculated';
            if (opIds.includes(1)) return 'pending';

            // Фрибеты
            if (opIds.includes(442)) return 'won';
            if (opIds.includes(444)) return 'lost';
            if (opIds.includes(446)) return 'refunded';
            if (opIds.includes(445)) return 'cancelled';
            if (opIds.includes(443)) return 'recalculated';
            if (opIds.includes(441)) return 'pending';

            // Быстрые ставки
            if (opIds.includes(764)) return 'settled';
            if (opIds.includes(760)) return 'pending';

            // Финансовые
            if (opIds.includes(69)) return 'deposit';
            if (opIds.includes(90)) return 'withdrawal';
            if (opIds.includes(460)) return 'hold';
            if (opIds.includes(461)) return 'unhold';

            // Бонусы
            if (opIds.includes(17)) return 'bonus';

            return 'unknown';
        },

        // Определение категории группы
        _determineCategory(operations) {
            const opIds = operations.map(op => op.operationId);

            if (opIds.some(id => this.OPERATION_GROUPS.REGULAR_BETS.includes(id))) {
                return 'regular_bet';
            }
            if (opIds.some(id => this.OPERATION_GROUPS.FAST_BETS.includes(id))) {
                return 'fast_bet';
            }
            if (opIds.some(id => this.OPERATION_GROUPS.FREEBETS.includes(id))) {
                return 'freebet';
            }
            if (opIds.some(id => this.OPERATION_GROUPS.FINANCE.includes(id))) {
                return 'finance';
            }
            if (opIds.some(id => this.OPERATION_GROUPS.BONUS.includes(id))) {
                return 'bonus';
            }

            return 'unknown';
        },

        // Извлечение regId из операций (для запроса деталей ставки)
        _extractRegId(operations) {
            // regId обычно есть в операциях типа 1 (ставка сделана)
            const betPlacedOp = operations.find(op =>
                op.operationId === 1 || op.operationId === 441
            );
            return betPlacedOp?.regId || null;
        },

        // Получить уникальные marker для обычных ставок (требующих деталей)
        // ВАЖНО: marker = regId для API coupon/info
        getMarkersForDetails() {
            const markers = [];
            Object.values(this.groupedByMarker).forEach(group => {
                // Только обычные ставки и фрибеты имеют детали через coupon/info
                if (group.category === 'regular_bet' || group.category === 'freebet') {
                    if (group.marker) {
                        markers.push(group.marker);
                    }
                }
            });
            return [...new Set(markers)]; // Уникальные
        },

        // Автоматическая загрузка деталей с прогресс-баром
        async _autoLoadBetsDetails() {
            const markers = this.getMarkersForDetails();
            if (markers.length === 0) {
                console.log('⚠️ [OperationsCollector] Нет ставок для автозагрузки деталей');
                UIPanel.hideProgress();
                return;
            }

            console.log(`🚀 [OperationsCollector] Автозагрузка деталей для ${markers.length} ставок...`);

            // Показываем прогресс-бар
            UIPanel.showProgress('Этап 2: Загрузка деталей', 0, 0, markers.length);

            // Сбрасываем BetsDetailsFetcher
            BetsDetailsFetcher.reset();
            BetsDetailsFetcher.sessionParams = this.sessionParams;

            // Запускаем загрузку с обновлением прогресса
            BetsDetailsFetcher.queue = [...markers];
            BetsDetailsFetcher.isProcessing = true;

            let batchNum = 0;
            let totalLoaded = 0;

            while (BetsDetailsFetcher.queue.length > 0 && BetsDetailsFetcher.isProcessing) {
                const batch = BetsDetailsFetcher.queue.splice(0, BetsDetailsFetcher.BATCH_SIZE);
                batchNum++;

                console.log(`📦 [BetsDetailsFetcher] Batch ${batchNum}: ${batch.length} запросов`);
                await BetsDetailsFetcher._processBatch(batch);

                totalLoaded = BetsDetailsFetcher.results.size + BetsDetailsFetcher.errors.size;
                const percent = (totalLoaded / markers.length) * 100;

                UIPanel.showProgress('Этап 2: Загрузка деталей', percent, totalLoaded, markers.length);

                if (BetsDetailsFetcher.queue.length > 0) {
                    await BetsDetailsFetcher._delay(BetsDetailsFetcher.DELAY_BETWEEN_BATCHES);
                }
            }

            BetsDetailsFetcher.isProcessing = false;

            // Привязываем детали к группам
            Object.values(this.groupedByMarker).forEach(group => {
                if (group.marker && BetsDetailsFetcher.results.has(group.marker)) {
                    group.details = BetsDetailsFetcher.results.get(group.marker);
                }
            });

            const stats = BetsDetailsFetcher.getStats();
            const opsStats = this.getStats();
            console.log(`✅ [OperationsCollector] Автозагрузка завершена: ${stats.loaded} загружено, ${stats.errors} ошибок`);

            // Сохраняем статистику завершения
            AppState.isCollectionCompleted = true;
            AppState.completionStats = {
                totalOperations: opsStats.totalOperations,
                totalGroups: opsStats.totalGroups,
                detailsLoaded: stats.loaded,
                detailsErrors: stats.errors
            };

            // Показываем завершение (прогресс остаётся видимым)
            UIPanel.showProgress('✅ Готово к экспорту!', 100, stats.loaded, markers.length);

            // Auto-sync если настроен
            const syncSettings = SettingsManager.getSettings().sync;
            if (syncSettings?.autoSync && GitHubSync.isConfigured()) {
                logger.log('🔄 [OperationsCollector] Запуск автоматической синхронизации...');
                UIPanel.showProgress('🔄 Синхронизация с GitHub...', 100, stats.loaded, markers.length);
                try {
                    await GitHubSync.sync();
                } catch (e) {
                    console.error('❌ [OperationsCollector] Ошибка auto-sync:', e);
                }
            }
        }
    };

    // Модуль для получения деталей ставок через coupon/info API
    const BetsDetailsFetcher = {
        queue: [],
        isProcessing: false,
        results: new Map(),
        errors: new Map(),

        // Лог ошибок для анализа
        failedMarkers: [],

        // Настройки
        BATCH_SIZE: 5,
        DELAY_BETWEEN_BATCHES: 500,
        MAX_RETRIES: 3,

        // Exponential backoff настройки
        INITIAL_RETRY_DELAY: 500,    // Начальная задержка 500ms
        MAX_RETRY_DELAY: 8000,       // Максимальная задержка 8s
        BACKOFF_MULTIPLIER: 2,       // Множитель для каждой попытки

        // Параметры сессии (копируются из OperationsCollector)
        sessionParams: null,

        init() {
            this.reset();
            logger.info('✅ [BetsDetailsFetcher] Готов к работе');
        },

        reset() {
            this.queue = [];
            this.isProcessing = false;
            this.results = new Map();
            this.errors = new Map();
            this.failedMarkers = [];
        },

        // Основной метод для получения деталей
        // markers - массив marker'ов (marker = regId для API)
        async fetchDetails(markers) {
            if (!markers || markers.length === 0) {
                console.log('⚠️ [BetsDetailsFetcher] Нет markers для загрузки');
                return this.results;
            }

            // Копируем параметры сессии
            this.sessionParams = OperationsCollector.sessionParams;
            if (!this.sessionParams) {
                console.error('❌ [BetsDetailsFetcher] Нет параметров сессии');
                return this.results;
            }

            this.queue = [...markers];
            this.isProcessing = true;

            console.log(`▶️ [BetsDetailsFetcher] Начинаем загрузку ${markers.length} ставок...`);

            let batchNum = 0;
            while (this.queue.length > 0 && this.isProcessing) {
                const batch = this.queue.splice(0, this.BATCH_SIZE);
                batchNum++;

                console.log(`📦 [BetsDetailsFetcher] Batch ${batchNum}: ${batch.length} запросов`);
                await this._processBatch(batch);

                if (this.queue.length > 0) {
                    await this._delay(this.DELAY_BETWEEN_BATCHES);
                }
            }

            this.isProcessing = false;
            console.log(`✅ [BetsDetailsFetcher] Загружено ${this.results.size} ставок, ошибок: ${this.errors.size}`);

            return this.results;
        },

        stop() {
            this.isProcessing = false;
            console.log('⏹️ [BetsDetailsFetcher] Остановлен');
        },

        async _processBatch(markers) {
            const promises = markers.map(marker => this._fetchSingle(marker));
            await Promise.all(promises);
        },

        // Загрузка деталей для одной ставки по marker
        // marker используется как regId в API запросе
        async _fetchSingle(marker, retryCount = 0) {
            try {
                const couponUrl = OperationsCollector.baseApiUrl
                    ? OperationsCollector.baseApiUrl.replace('/session/client', '/coupon/info')
                    : SiteDetector.getCouponInfoUrl();

                const response = await fetch(
                    couponUrl,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                        body: JSON.stringify({
                            regId: parseInt(marker),
                            lang: 'ru',
                            betTypeName: 'sport',
                            fsid: this.sessionParams.fsid,
                            sysId: this.sessionParams.sysId || 21,
                            clientId: this.sessionParams.clientId
                        })
                    }
                );

                if (!response.ok) {
                    // Специфичная обработка HTTP ошибок
                    if (response.status === 429) {
                        throw new Error('RATE_LIMIT');
                    } else if (response.status === 401 || response.status === 403) {
                        throw new Error('SESSION_EXPIRED');
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                // Проверяем успешность ответа
                if (data.result === 'couponInfo') {
                    this.results.set(marker, data);
                } else if (data.errorMessage) {
                    // Обработка API ошибок
                    if (data.errorMessage.includes('session') || data.errorMessage.includes('Session')) {
                        throw new Error('SESSION_EXPIRED');
                    }
                    throw new Error(data.errorMessage);
                } else {
                    this.results.set(marker, data);
                }

            } catch (e) {
                // Exponential backoff для retry
                if (retryCount < this.MAX_RETRIES) {
                    // Вычисляем задержк��: INITIAL * MULTIPLIER^retryCount
                    const delay = Math.min(
                        this.INITIAL_RETRY_DELAY * Math.pow(this.BACKOFF_MULTIPLIER, retryCount),
                        this.MAX_RETRY_DELAY
                    );

                    // Для rate limit увеличиваем задержку
                    const actualDelay = e.message === 'RATE_LIMIT' ? delay * 2 : delay;

                    console.warn(`⚠️ [BetsDetailsFetcher] Retry ${retryCount + 1}/${this.MAX_RETRIES} для ${marker} через ${actualDelay}ms (${e.message})`);
                    await this._delay(actualDelay);
                    return this._fetchSingle(marker, retryCount + 1);
                }

                // Логируем failed marker для анализа
                const errorInfo = {
                    marker: marker,
                    error: e.message,
                    timestamp: Date.now(),
                    retries: retryCount
                };
                this.failedMarkers.push(errorInfo);

                console.error(`❌ [BetsDetailsFetcher] Ошибка ${marker} после ${retryCount} попыток:`, e.message);
                this.errors.set(marker, e.message);

                // Критическая ошибка сессии - останавливаем весь процесс
                if (e.message === 'SESSION_EXPIRED') {
                    console.error('🔴 [BetsDetailsFetcher] Сессия истекла! Останавливаем загрузку.');
                    this.isProcessing = false;
                }
            }
        },

        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        getStats() {
            return {
                loaded: this.results.size,
                errors: this.errors.size,
                pending: this.queue.length,
                isProcessing: this.isProcessing,
                failedMarkers: this.failedMarkers
            };
        },

        getFailedMarkers() {
            return this.failedMarkers;
        }
    };

    // SETTINGS MANAGER MODULE

    const SettingsManager = {
        // Настройки по умолчанию
        DEFAULT_SETTINGS: {
            export: {
                useCustomPrefix: false,
                customPrefix: 'fonbet_history',
                includeTimestamp: true
            },
            fetcher: {
                batchSize: 5,
                delayBetweenBatches: 500,
                maxRetries: 3,
                initialRetryDelay: 500,
                maxRetryDelay: 8000
            },
            sync: {
                autoSync: false
            }
        },

        init() {
            logger.log('🔧 [SettingsManager] Инициализация...');
            // Загружаем сохранённые настройки
            this.loadSettings();
            logger.info('✅ [SettingsManager] Настройки загружены');
        },

        /**
         * Загрузить настройки из GM_getValue
         */
        loadSettings() {
            try {
                const saved = GM_getValue('fonbet_settings', null);
                if (saved) {
                    const settings = JSON.parse(saved);
                    // Применяем настройки
                    this.applySettings(settings);
                    logger.log('📥 [SettingsManager] Настройки загружены из хранилища');
                } else {
                    // Используем настройки по умолчанию
                    this.applySettings(this.DEFAULT_SETTINGS);
                    logger.log('📥 [SettingsManager] Используются настройки по умолчанию');
                }
            } catch (error) {
                console.error('❌ [SettingsManager] Ошибка загрузки настроек:', error);
                this.applySettings(this.DEFAULT_SETTINGS);
            }
        },

        /**
         * Сохранить настройки в GM_setValue
         */
        saveSettings(settings) {
            try {
                GM_setValue('fonbet_settings', JSON.stringify(settings));
                this.applySettings(settings);
                logger.log('💾 [SettingsManager] Настройки сохранены');
                return true;
            } catch (error) {
                console.error('❌ [SettingsManager] Ошибка сохранения настроек:', error);
                return false;
            }
        },

        /**
         * Применить настройки к модулям
         */
        applySettings(settings) {
            // Применяем настройки экспорта
            if (settings.export) {
                AppState.config.export.USE_CUSTOM_PREFIX = settings.export.useCustomPrefix;
                AppState.config.export.CUSTOM_PREFIX = settings.export.customPrefix;
                AppState.config.export.INCLUDE_TIMESTAMP = settings.export.includeTimestamp;
            }

            // Применяем настройки BetsDetailsFetcher
            if (settings.fetcher) {
                BetsDetailsFetcher.BATCH_SIZE = settings.fetcher.batchSize;
                BetsDetailsFetcher.DELAY_BETWEEN_BATCHES = settings.fetcher.delayBetweenBatches;
                BetsDetailsFetcher.MAX_RETRIES = settings.fetcher.maxRetries;
                BetsDetailsFetcher.INITIAL_RETRY_DELAY = settings.fetcher.initialRetryDelay;
                BetsDetailsFetcher.MAX_RETRY_DELAY = settings.fetcher.maxRetryDelay;
            }

            // Сохраняем настройки в AppState для доступа из других модулей
            AppState.settings = settings;
        },

        /**
         * Получить текущие настройки
         */
        getSettings() {
            return AppState.settings || this.DEFAULT_SETTINGS;
        },

        /**
         * Сбросить настройки к значениям по умолчанию
         */
        resetToDefaults() {
            this.saveSettings(this.DEFAULT_SETTINGS);
            logger.log('🔄 [SettingsManager] Настройки сброшены к значениям по умолчанию');
        }
    };

    const LIMITS = {
        // UI
        UI_UPDATE_INTERVAL_MS: 100           // Интервал обновления UI панели
    };
    // 2. APP STATE (Центральное хранилище)

    const AppState = {
        // === Статус ===
        isInterceptorRunning: false,    // XHR перехватчик активен?
        isCollectionCompleted: false,   // Сбор завершён?
        completionStats: null,          // Статистика завершения

        // === Конфигурация ===
        config: {
            export: {
                USE_CUSTOM_PREFIX: false,
                CUSTOM_PREFIX: 'fonbet_history',
                INCLUDE_TIMESTAMP: true
            }
        }
    };
    // 3. UTILITY FUNCTIONS

    /**
     * Определить тип текущей страницы
     * @returns {string} - 'operations', 'bonuses' или 'unknown'
     */
    function getCurrentPageType() {
        const url = window.location.href;
        if (url.includes('/account/history/operations')) {
            return 'operations';
        }
        if (url.includes('/bonuses')) {
            return 'bonuses';
        }
        if (url.includes('/lobby/betshistory') || url.includes('/lobby/paymentshistory')) {
            return 'betboom';
        }
        return 'unknown';
    }

    // 4. XHR INTERCEPTOR MODULE (упрощённый)

    const XHRInterceptor = {
        appState: null,
        originalXHROpen: null,
        originalXHRSend: null,
        originalFetch: null,
        isPatched: false,
        isFetchPatched: false,

        /**
         * Инициализация модуля
         */
        init(appState) {
            logger.log('🔧 [XHRInterceptor] Инициализация...');
            this.appState = appState;

            // Оригинальные методы уже сохранены в earlyInit()
            // Просто проверяем, что они есть
            if (!this.originalXHROpen || !this.originalXHRSend || !this.originalFetch) {
                console.warn('⚠️ [XHRInterceptor] EarlyInit не выполнен, сохраняем оригиналы сейчас');
                this.originalXHROpen = XMLHttpRequest.prototype.open;
                this.originalXHRSend = XMLHttpRequest.prototype.send;
                this.originalFetch = unsafeWindow.fetch;
            }

            logger.info('✅ [XHRInterceptor] Готов к работе');
        },

        /**
         * Запуск перехвата XHR
         */
        start() {
            if (this.appState.isInterceptorRunning) {
                console.log('⚠️ [XHRInterceptor] Уже запущен');
                return;
            }

            console.log('▶️ [XHRInterceptor] Запуск перехвата...');

            // XHR и fetch уже пропатчены в earlyInit() для операций
            // Проверяем на всякий случай
            if (!this.isPatched) {
                console.warn('⚠️ [XHRInterceptor] XHR не был пропатчен в earlyInit, патчим сейчас');
                this._patchXHR();
            }

            if (!this.isFetchPatched) {
                console.warn('⚠️ [XHRInterceptor] fetch не был пропатчен в earlyInit, патчим сейчас');
                this._patchFetch();
            }

            this.appState.isInterceptorRunning = true;
            logger.info('✅ [XHRInterceptor] Перехват активен (XHR + Fetch уже работают с earlyInit)');
        },

        /**
         * Остановка перехвата XHR
         */
        stop() {
            if (!this.appState.isInterceptorRunning) {
                console.log('⚠️ [XHRInterceptor] Уже остановлен');
                return;
            }

            console.log('⏹️ [XHRInterceptor] Остановка перехвата...');

            this._unpatchXHR();
            this._unpatchFetch();
            this.appState.isInterceptorRunning = false;
            logger.info('✅ [XHRInterceptor] Перехват остановлен');
        },

        /**
         * Проверка статуса
         */
        isRunning() {
            return this.appState.isInterceptorRunning;
        },

        /**
         * Патчинг XMLHttpRequest для перехвата запросов
         */
        _patchXHR() {
            if (this.isPatched) return;

            const self = this;

            // Патчим open() - сохраняем URL и метод
            XMLHttpRequest.prototype.open = function(method, url, ...args) {
                this._fc_url = url;
                this._fc_method = method;
                return self.originalXHROpen.apply(this, [method, url, ...args]);
            };

            // Патчим send() - добавляем слушатели
            XMLHttpRequest.prototype.send = function(...args) {
                // Перехват операций
                if (this._fc_url && (URL_PATTERNS.LAST_OPERATIONS.test(this._fc_url) || URL_PATTERNS.PREV_OPERATIONS.test(this._fc_url))) {
                    const isLastOperations = URL_PATTERNS.LAST_OPERATIONS.test(this._fc_url);
                    logger.debug('💰 [XHRInterceptor] Перехвачен запрос операций:', this._fc_url);

                    // Сохраняем requestBody
                    this._fc_requestBody = args[0];

                    // Слушатель успешного ответа для операций
                    this.addEventListener('load', function() {
                        self._handleOperationsLoad(this, isLastOperations, this._fc_requestBody);
                    });
                }

                return self.originalXHRSend.apply(this, args);
            };

            this.isPatched = true;
            console.log('🔗 [XHRInterceptor] XMLHttpRequest пропатчен');
        },

        /**
         * Восстановление оригинальных методов XMLHttpRequest
         */
        _unpatchXHR() {
            if (!this.isPatched) return;

            XMLHttpRequest.prototype.open = this.originalXHROpen;
            XMLHttpRequest.prototype.send = this.originalXHRSend;

            this.isPatched = false;
            console.log('🔓 [XHRInterceptor] XMLHttpRequest восстановлен');
        },

        /**
         * Патчинг fetch API для перехвата запросов операций
         */
        _patchFetch() {
            if (this.isFetchPatched) return;

            const self = this;

            unsafeWindow.fetch = async function(url, options = {}) {
                const urlString = typeof url === 'string' ? url : url.url;

                // Перехват операций
                if (urlString && (URL_PATTERNS.LAST_OPERATIONS.test(urlString) || URL_PATTERNS.PREV_OPERATIONS.test(urlString))) {
                    const isLastOperations = URL_PATTERNS.LAST_OPERATIONS.test(urlString);
                    logger.debug('💰 [XHRInterceptor/Fetch] Перехвачен запрос операций:', urlString);

                    try {
                        const response = await self.originalFetch.apply(this, arguments);
                        const clone = response.clone();

                        // Читаем и обрабатываем ответ
                        clone.json().then(data => {
                            // Передаём данные в OperationsCollector
                            if (OperationsCollector.isCollecting) {
                                const requestBody = options.body;
                                OperationsCollector.handleOperationsResponse(data, isLastOperations, requestBody, urlString);
                            }
                        }).catch(error => {
                            console.error('❌ [XHRInterceptor/Fetch] JSON parse error:', error);
                        });

                        return response;
                    } catch (error) {
                        console.error('❌ [XHRInterceptor/Fetch] Ошибка перехвата:', error);
                        throw error;
                    }
                }

                // Для всех остальных запросов - обычный fetch
                return self.originalFetch.apply(this, arguments);
            };

            this.isFetchPatched = true;
            console.log('🔗 [XHRInterceptor] fetch API пропатчен');
        },

        /**
         * Восстановление оригинального fetch API
         */
        _unpatchFetch() {
            if (!this.isFetchPatched) return;

            unsafeWindow.fetch = this.originalFetch;

            this.isFetchPatched = false;
            console.log('🔓 [XHRInterceptor] fetch API восстановлен');
        },

        /**
         * Обработчик успешной загрузки операций
         */
        _handleOperationsLoad(xhr, isInitial, requestBody) {
            try {
                // Проверяем HTTP статус
                if (xhr.status < 200 || xhr.status >= 300) {
                    console.error(`❌ [XHRInterceptor] Operations HTTP ${xhr.status}: ${xhr.statusText}`);
                    return;
                }

                // Парсим JSON
                let data;
                try {
                    data = JSON.parse(xhr.responseText);
                } catch (e) {
                    console.error('❌ [XHRInterceptor] Operations JSON parse error:', e);
                    return;
                }

                // Передаём данные в OperationsCollector
                if (OperationsCollector.isCollecting) {
                    OperationsCollector.handleOperationsResponse(data, isInitial, requestBody, xhr._fc_url);
                }

            } catch (error) {
                console.error('❌ [XHRInterceptor] Ошибка обработки операций:', error);
            }
        }
    };
    // UI PANEL MODULE

    const UIPanel = {
        appState: null,
        elements: {},
        updateInterval: null,
        isMinimized: false,

        /**
         * Инициализация модуля
         */
        init(appState) {
            logger.log('🔧 [UIPanel] Инициализация...');
            this.appState = appState;
            this.pageType = getCurrentPageType();
            logger.info('✅ [UIPanel] Готов к работе');
        },

        /**
         * Создание панели
         */
        create() {
            // Защита от дублирования панели
            if (document.getElementById('fonbet-collector-panel')) {
                console.warn('⚠️ [UIPanel] Панель уже существует, пропускаем создание');
                return;
            }
            console.log('🎨 [UIPanel] Создание панели...');

            // Создаём контейнер панели
            const panel = document.createElement('div');
            panel.id = 'fonbet-collector-panel';
            panel.innerHTML = this._getHTML();
            document.body.appendChild(panel);

            // Добавляем стили
            this._injectStyles();

            // Сохраняем ссылки на элементы
            this._cacheElements();

            // Добавляем обработчики событий
            this._attachEventListeners();

            // Запускаем автообновление статистики
            this._startAutoUpdate();

            logger.info('✅ [UIPanel] Панель создана');
        },

        /**
         * Обновление статистики
         */
        update() {
            if (!this.elements.panel) return;

            if (this.pageType === 'bonuses') {
                this._updateFreebetsStats();
                return;
            }

            if (this.pageType === 'betboom') {
                this._updateBetBoomStats();
                return;
            }

            const stats = OperationsCollector.getStats();

            // Обновляем счётчики (показываем количество собранных операций)
            if (this.elements.xhrCount) this.elements.xhrCount.textContent = stats.totalOperations || 0;

            // Обновляем статус
            this._updateStatus();

            // Обновляем состояние кнопок
            this._updateButtons();

            // Обновляем статистику операций
            this._updateOpsStats();
        },

        // ПРИВАТНЫЕ МЕТОДЫ

        /**
         * HTML структура панели
         */
        _getHTML() {
            if (this.pageType === 'bonuses') return this._getFreebetsHTML();
            if (this.pageType === 'betboom') return this._getBetBoomHTML();
            return this._getOperationsHTML();
        },

        _getFreebetsHTML() {
            return `
                <div class="fc-header">
                    <span class="fc-title"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAABL1BMVEXIDAAAAAD/////7e3/4+P46en03dnyxMTz1dXppaLjlpPlm5j6+vrijor9/f3hh4PeeXXZX1zaYln+/v7TRUHURj7ROzXQNi79+Pj+/v7OKybOJhzRPzrNJh/LIRrNIBfLGhL////MGA3////trajLGg/JFg3IEAnIDAHBAADJDgHICgDICwH//////Pz++Pj98/L77Oz65OP43t7219b20tH0ysfywsDvt7TurajqoZ3pnJfmkIzmjonjjo/lioXkiIPifnjhenTgdnHfcm/da2TcamrcZl/bX1naWlPYUUnXS0LWRjzUPTPTNy3OIhbNGg/LEwnKDgLJDQDIDQDIDADICgDGCgPICADHBADEBQHGAQDEAADDAADBAADAAAC/AAC+AAC9AAC3AACzAABtw1coAAAALXRSTlPyAAMHCREWJypHSVVoaHV0h5OdrrS7vMjP0tPX3N3c4eHl5u/u8PDw8fHy8/yesYKyAAACSUlEQVR42pXW7VrTMBiA4VQEPyYCfjBlMnFTmWJlczAGihtsKmMMtjWJ7ZqmTfT8j0FKr8V0vpHy/O79423SpMhKur+yWtxExirF/ErOSkJWXG6Nh5xRTA0R6vOQry8qcms15C4m14Qpj/ILCZnLCwCAKCouXJFV6QACzBHrMckJl2SOyqVL8pLj7AQHH26je9wlN4iKRfQowjchOHyK8pzM5DIeRWKmYEySWAFt+ETPYSIcDXrfOkfp+hOS5JfQe6oDX/48adbsf2vL6TAVtIU1wXm3boOdhdNhthBKiaYNVx2z6VNII04wadiGmtyFiCv3bVNHEgPEEWdGEY8CEC+oG8X2iAEEi75tbDd0AULFZ1vV+NrWa/UnGCC+W1OiKaRIxR0CkEgb/kI4BE4nWLaV2OUeyUA8vqfIQUSzEDaqKnIsSRbCz23VIMxCsDhRoj7zvlwHJERblZ3v3Y7W8XACEp/t2KZGDCT8wij2uAcQNQrUoSAAUaNAnUYg8YKGSXwcBiBh46qJNAIPJOHANvVFEohg0TGSnsQQccP9v9u4fZhKLaQiV0cf0z6v3m+RynfSIj76aHpPnnOaCtiW8TEuutBZAueV4suCigPoncKxQnwl6QvZktdfSbnQZcNtYHvAOWIJWW94dApsDzjM/HlkLQrZyjwKlcvxr0LhV0Pb6fh/woneWjGZf/FJkR+CmMM03Lwbk0vzLMvhggmLNu6on6uH5UTUXGaYwWM8QstzliLW/IPHz1+Vy6/fVVRIr1Jae7K0kDz7B0O2kFNj+nSDAAAAAElFTkSuQmCC" class="fc-logo" alt="Fonbet"> Collector v${VERSION} (${SiteDetector.getSiteName()})</span>
                    <div class="fc-header-buttons">
                        <button class="fc-btn-icon fc-btn-settings" title="Настройки">⚙️</button>
                        <button class="fc-btn-icon fc-btn-minimize" title="Свернуть">−</button>
                        <button class="fc-btn-icon fc-btn-help" title="Справка">?</button>
                    </div>
                </div>

                <div class="fc-body">
                    <div class="fc-mode-indicator">
                        <span class="fc-mode-emoji">🎁</span>
                        <span class="fc-mode-name">Freebets Collector</span>
                    </div>

                    <div class="fc-divider"></div>

                    <div class="fc-stats">
                        <div class="fc-stat">
                            <span class="fc-stat-label">Активных фрибетов:</span>
                            <span class="fc-stat-value" id="fc-fb-active-count">—</span>
                        </div>
                        <div class="fc-stat">
                            <span class="fc-stat-label">На сумму:</span>
                            <span class="fc-stat-value" id="fc-fb-total-value">—</span>
                        </div>
                        <div class="fc-stat">
                            <span class="fc-stat-label">Всего фрибетов:</span>
                            <span class="fc-stat-value" id="fc-fb-total-count">—</span>
                        </div>
                    </div>

                    <div class="fc-divider"></div>

                    <div class="fc-controls">
                        <button class="fc-btn fc-btn-primary" id="fc-btn-refresh-fb">🔄 Обновить</button>
                        <button class="fc-btn fc-btn-sync" id="fc-btn-sync-fb">📤 Sync Freebets</button>
                    </div>

                    <div class="fc-sync-status" id="fc-sync-status"></div>

                    <!-- ПРОГРЕСС-БАР -->
                    <div class="fc-progress-section" id="fc-progress-section" style="display: none;">
                        <div class="fc-progress-header">
                            <span class="fc-progress-stage" id="fc-progress-stage"></span>
                            <span class="fc-progress-percent" id="fc-progress-percent">0%</span>
                        </div>
                        <div class="fc-progress-bar">
                            <div class="fc-progress-fill" id="fc-progress-fill" style="width: 0%"></div>
                        </div>
                    </div>

                    <div class="fc-status" id="fc-status"></div>
                </div>
            `;
        },

        _getBetBoomHTML() {
            const periodFrom = BetBoomCollector.period ? new Date(BetBoomCollector.period.from).toLocaleDateString('ru-RU') : '—';
            const periodTo = BetBoomCollector.period ? new Date(BetBoomCollector.period.to).toLocaleDateString('ru-RU') : '—';
            return `
                <div class="fc-header">
                    <span class="fc-title">🎯 BetBoom Collector v${VERSION}</span>
                    <div class="fc-header-buttons">
                        <button class="fc-btn-icon fc-btn-settings" title="Настройки">⚙️</button>
                        <button class="fc-btn-icon fc-btn-minimize" title="Свернуть">−</button>
                        <button class="fc-btn-icon fc-btn-help" title="Справка">?</button>
                    </div>
                </div>

                <div class="fc-body">
                    <div class="fc-mode-indicator">
                        <span class="fc-mode-emoji">🎯</span>
                        <span class="fc-mode-name">BetBoom Collector</span>
                    </div>

                    <div class="fc-divider"></div>

                    <div class="fc-stats">
                        <div class="fc-stat">
                            <span class="fc-stat-label">Период:</span>
                            <span class="fc-stat-value" id="fc-bb-period">${periodFrom} — ${periodTo}</span>
                        </div>
                        <div class="fc-stat">
                            <span class="fc-stat-label">Пользователь:</span>
                            <span class="fc-stat-value" id="fc-bb-user">—</span>
                        </div>
                    </div>

                    <div class="fc-divider"></div>

                    <div class="fc-ops-stats" id="fc-bb-stats">
                        <div class="fc-ops-header">Ставки</div>
                        <div class="fc-ops-grid">
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">🎯</span>
                                <span class="fc-ops-label">Всего:</span>
                                <span class="fc-ops-value" id="fc-bb-total">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">✅</span>
                                <span class="fc-ops-label">Выигрыш:</span>
                                <span class="fc-ops-value" id="fc-bb-wins">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">❌</span>
                                <span class="fc-ops-label">Проигрыш:</span>
                                <span class="fc-ops-value" id="fc-bb-losses">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">↩️</span>
                                <span class="fc-ops-label">Возврат:</span>
                                <span class="fc-ops-value" id="fc-bb-returns">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">⏳</span>
                                <span class="fc-ops-label">В игре:</span>
                                <span class="fc-ops-value" id="fc-bb-progress">0</span>
                            </div>
                        </div>
                        <div class="fc-ops-header" style="margin-top: 8px;">Финансы</div>
                        <div class="fc-ops-grid">
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">💵</span>
                                <span class="fc-ops-label">Депозиты:</span>
                                <span class="fc-ops-value" id="fc-bb-deposits">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">💸</span>
                                <span class="fc-ops-label">Выводы:</span>
                                <span class="fc-ops-value" id="fc-bb-withdrawals">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">📈</span>
                                <span class="fc-ops-label">Профит:</span>
                                <span class="fc-ops-value" id="fc-bb-profit">0 ₽</span>
                            </div>
                        </div>
                    </div>

                    <div class="fc-divider"></div>

                    <div class="fc-controls">
                        <button class="fc-btn fc-btn-primary" id="fc-btn-bb-restart">🔄 Перезапуск</button>
                        <button class="fc-btn fc-btn-export-ops" id="fc-btn-bb-export">💰 Экспорт</button>
                        <button class="fc-btn fc-btn-sync" id="fc-btn-bb-sync">📤 Sync</button>
                    </div>

                    <div class="fc-sync-status" id="fc-sync-status"></div>

                    <!-- ПРОГРЕСС-БАР -->
                    <div class="fc-progress-section" id="fc-progress-section" style="display: none;">
                        <div class="fc-progress-header">
                            <span class="fc-progress-stage" id="fc-progress-stage"></span>
                            <span class="fc-progress-percent" id="fc-progress-percent">0%</span>
                        </div>
                        <div class="fc-progress-bar">
                            <div class="fc-progress-fill" id="fc-progress-fill" style="width: 0%"></div>
                        </div>
                    </div>

                    <div class="fc-status" id="fc-status"></div>
                </div>
            `;
        },

        _getOperationsHTML() {
            return `
                <div class="fc-header">
                    <span class="fc-title"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAABL1BMVEXIDAAAAAD/////7e3/4+P46en03dnyxMTz1dXppaLjlpPlm5j6+vrijor9/f3hh4PeeXXZX1zaYln+/v7TRUHURj7ROzXQNi79+Pj+/v7OKybOJhzRPzrNJh/LIRrNIBfLGhL////MGA3////trajLGg/JFg3IEAnIDAHBAADJDgHICgDICwH//////Pz++Pj98/L77Oz65OP43t7219b20tH0ysfywsDvt7TurajqoZ3pnJfmkIzmjonjjo/lioXkiIPifnjhenTgdnHfcm/da2TcamrcZl/bX1naWlPYUUnXS0LWRjzUPTPTNy3OIhbNGg/LEwnKDgLJDQDIDQDIDADICgDGCgPICADHBADEBQHGAQDEAADDAADBAADAAAC/AAC+AAC9AAC3AACzAABtw1coAAAALXRSTlPyAAMHCREWJypHSVVoaHV0h5OdrrS7vMjP0tPX3N3c4eHl5u/u8PDw8fHy8/yesYKyAAACSUlEQVR42pXW7VrTMBiA4VQEPyYCfjBlMnFTmWJlczAGihtsKmMMtjWJ7ZqmTfT8j0FKr8V0vpHy/O79423SpMhKur+yWtxExirF/ErOSkJWXG6Nh5xRTA0R6vOQry8qcms15C4m14Qpj/ILCZnLCwCAKCouXJFV6QACzBHrMckJl2SOyqVL8pLj7AQHH26je9wlN4iKRfQowjchOHyK8pzM5DIeRWKmYEySWAFt+ETPYSIcDXrfOkfp+hOS5JfQe6oDX/48adbsf2vL6TAVtIU1wXm3boOdhdNhthBKiaYNVx2z6VNII04wadiGmtyFiCv3bVNHEgPEEWdGEY8CEC+oG8X2iAEEi75tbDd0AULFZ1vV+NrWa/UnGCC+W1OiKaRIxR0CkEgb/kI4BE4nWLaV2OUeyUA8vqfIQUSzEDaqKnIsSRbCz23VIMxCsDhRoj7zvlwHJERblZ3v3Y7W8XACEp/t2KZGDCT8wij2uAcQNQrUoSAAUaNAnUYg8YKGSXwcBiBh46qJNAIPJOHANvVFEohg0TGSnsQQccP9v9u4fZhKLaQiV0cf0z6v3m+RynfSIj76aHpPnnOaCtiW8TEuutBZAueV4suCigPoncKxQnwl6QvZktdfSbnQZcNtYHvAOWIJWW94dApsDzjM/HlkLQrZyjwKlcvxr0LhV0Pb6fh/woneWjGZf/FJkR+CmMM03Lwbk0vzLMvhggmLNu6on6uH5UTUXGaYwWM8QstzliLW/IPHz1+Vy6/fVVRIr1Jae7K0kDz7B0O2kFNj+nSDAAAAAElFTkSuQmCC" class="fc-logo" alt="Fonbet"> Collector v${VERSION} (${SiteDetector.getSiteName()})</span>
                    <div class="fc-header-buttons">
                        <button class="fc-btn-icon fc-btn-settings" title="Настройки">⚙️</button>
                        <button class="fc-btn-icon fc-btn-minimize" title="Свернуть">−</button>
                        <button class="fc-btn-icon fc-btn-help" title="Справка">?</button>
                    </div>
                </div>

                <div class="fc-body">
                    <!-- ИНДИКАТОР РЕЖИМА -->
                    <div class="fc-mode-indicator">
                        <span class="fc-mode-emoji">📊</span>
                        <span class="fc-mode-name">Operations Collector</span>
                    </div>

                    <div class="fc-divider"></div>

                    <div class="fc-controls">
                        <button class="fc-btn fc-btn-primary" id="fc-btn-start-all">Start All</button>
                        <button class="fc-btn fc-btn-secondary" id="fc-btn-stop-all">Stop All</button>
                        <button class="fc-btn fc-btn-export-ops" id="fc-btn-export-ops">💰 Экспорт данных</button>
                        <button class="fc-btn fc-btn-sync" id="fc-btn-sync">🔄 Sync</button>
                    </div>

                    <div class="fc-sync-status" id="fc-sync-status"></div>

                    <div class="fc-divider"></div>

                    <div class="fc-stats">
                        <div class="fc-stat">
                            <span class="fc-stat-label">Операций собрано:</span>
                            <span class="fc-stat-value" id="fc-stat-xhr">0</span>
                        </div>
                    </div>

                    <div class="fc-divider"></div>

                    <!-- СТАТИСТИКА ОПЕРАЦИЙ -->
                    <div class="fc-ops-stats" id="fc-ops-stats">
                        <div class="fc-ops-header">📊 Операции</div>
                        <div class="fc-ops-grid">
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">🎯</span>
                                <span class="fc-ops-label">Ставки:</span>
                                <span class="fc-ops-value" id="fc-ops-bets">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">⚡</span>
                                <span class="fc-ops-label">Быстрые:</span>
                                <span class="fc-ops-value" id="fc-ops-fast">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">🎁</span>
                                <span class="fc-ops-label">Фрибеты:</span>
                                <span class="fc-ops-value" id="fc-ops-free">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">💵</span>
                                <span class="fc-ops-label">Депозиты:</span>
                                <span class="fc-ops-value" id="fc-ops-deposits">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">💸</span>
                                <span class="fc-ops-label">Выводы:</span>
                                <span class="fc-ops-value" id="fc-ops-withdrawals">0</span>
                            </div>
                            <div class="fc-ops-item">
                                <span class="fc-ops-icon">🎰</span>
                                <span class="fc-ops-label">Бонусы:</span>
                                <span class="fc-ops-value" id="fc-ops-bonus">0</span>
                            </div>
                        </div>
                    </div>

                    <!-- ПРОГРЕСС-БАР ЗАГРУЗКИ -->
                    <div class="fc-progress-section" id="fc-progress-section" style="display: none;">
                        <div class="fc-progress-header">
                            <span class="fc-progress-stage" id="fc-progress-stage">Этап 1: Сбор операций</span>
                            <span class="fc-progress-percent" id="fc-progress-percent">0%</span>
                        </div>
                        <div class="fc-progress-bar">
                            <div class="fc-progress-fill" id="fc-progress-fill" style="width: 0%"></div>
                        </div>
                        <div class="fc-progress-details" id="fc-progress-details">
                            Загрузка деталей: <span id="fc-details-loaded">0</span> / <span id="fc-details-total">0</span>
                        </div>
                    </div>

                    <div class="fc-divider"></div>

                    <div class="fc-status" id="fc-status">
                        <span class="fc-status-icon">⏸️</span>
                        <span class="fc-status-text">Ожидание запуска...</span>
                    </div>
                </div>
            `;
        },

        /**
         * Внедрение CSS стилей
         */
        _injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
                #fonbet-collector-panel {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 320px;
                    background: rgba(20, 20, 30, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    color: #ffffff;
                    z-index: 999999;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }

                #fonbet-collector-panel.minimized {
                    height: 48px;
                }

                #fonbet-collector-panel.minimized .fc-body {
                    display: none;
                }

                .fc-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    cursor: move;
                }

                .fc-title {
                    font-size: 13px;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .fc-logo {
                    width: 18px;
                    height: 18px;
                    object-fit: contain;
                }

                .fc-header-buttons {
                    display: flex;
                    gap: 6px;
                }

                .fc-btn-icon {
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .fc-btn-icon:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: scale(1.1);
                }

                .fc-body {
                    padding: 16px;
                }

                .fc-controls {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .fc-btn {
                    padding: 10px 16px;
                    border: none;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .fc-btn-primary {
                    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                    color: white;
                }

                .fc-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
                }

                .fc-btn-secondary {
                    background: linear-gradient(135deg, #f44336 0%, #da190b 100%);
                    color: white;
                }

                .fc-btn-secondary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4);
                }

                .fc-btn-settings {
                    background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%);
                    color: white;
                }

                .fc-btn-settings:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(156, 39, 176, 0.4);
                }

                .fc-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none !important;
                }

                .fc-btn-sync {
                    background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
                    color: white;
                }

                .fc-btn-sync:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
                }

                .fc-btn-sync.syncing {
                    opacity: 0.7;
                    cursor: wait;
                    animation: pulse 1.5s ease-in-out infinite;
                }

                .fc-sync-status {
                    font-size: 11px;
                    padding: 4px 8px;
                    color: rgba(255, 255, 255, 0.6);
                    min-height: 16px;
                }

                .fc-sync-status.success { color: #4CAF50; }
                .fc-sync-status.error { color: #f44336; }
                .fc-sync-status.syncing { color: #FFD54F; }

                .fc-divider {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.1);
                    margin: 16px 0;
                }

                .fc-stats {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .fc-stat {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                }

                .fc-stat-label {
                    color: rgba(255, 255, 255, 0.7);
                }

                .fc-stat-value {
                    color: #4CAF50;
                    font-weight: 600;
                    font-size: 14px;
                }

                /* Статистика операций */
                .fc-ops-stats {
                    padding: 8px 0;
                }

                .fc-ops-header {
                    font-size: 12px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.9);
                    margin-bottom: 8px;
                    padding-left: 4px;
                }

                .fc-ops-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }

                .fc-ops-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 11px;
                    padding: 4px 6px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 4px;
                }

                .fc-ops-icon {
                    font-size: 12px;
                }

                .fc-ops-label {
                    color: rgba(255, 255, 255, 0.6);
                    flex: 1;
                }

                .fc-ops-value {
                    color: #64B5F6;
                    font-weight: 600;
                }

                /* ПРОГРЕСС-БАР */
                .fc-progress-section {
                    padding: 10px 12px;
                    background: rgba(76, 175, 80, 0.1);
                    border-radius: 8px;
                    margin: 8px 0;
                }

                .fc-progress-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                    font-size: 12px;
                }

                .fc-progress-stage {
                    color: #81C784;
                    font-weight: 600;
                }

                .fc-progress-percent {
                    color: #4CAF50;
                    font-weight: 700;
                }

                .fc-progress-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    overflow: hidden;
                }

                .fc-progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #4CAF50, #81C784);
                    border-radius: 3px;
                    transition: width 0.3s ease;
                }

                .fc-progress-details {
                    margin-top: 6px;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .fc-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    font-size: 12px;
                }

                .fc-status-icon {
                    font-size: 16px;
                }

                .fc-status-text {
                    flex: 1;
                }

                .fc-status.running .fc-status-icon {
                    animation: pulse 2s ease-in-out infinite;
                }

                .fc-status.completed .fc-status-icon {
                    color: #4CAF50;
                }

                .fc-status.completed .fc-status-text {
                    color: #4CAF50;
                    font-weight: 600;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                /* РЕЖИМ РАБОТЫ - ИНДИКАТОР */
                .fc-mode-indicator {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    margin-bottom: 8px;
                }

                .fc-mode-emoji {
                    font-size: 18px;
                    line-height: 1;
                }

                .fc-mode-name {
                    font-size: 13px;
                    font-weight: 500;
                    color: rgba(255, 255, 255, 0.9);
                }

                /* БОКОВАЯ ПАНЕЛЬ НАСТРОЕК */
                .fc-settings-panel {
                    position: fixed;
                    top: 0;
                    right: -400px;
                    width: 400px;
                    height: 100%;
                    background: rgba(20, 20, 30, 0.98);
                    backdrop-filter: blur(15px);
                    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.5);
                    z-index: 1000000;
                    transition: right 0.3s ease;
                    overflow-y: auto;
                }

                .fc-settings-panel.open {
                    right: 0;
                }

                .fc-settings-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    background: #1a1a2e;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }

                .fc-settings-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #ffffff;
                }

                .fc-settings-close {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .fc-settings-close:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: scale(1.1);
                }

                .fc-settings-body {
                    padding: 20px;
                }

                .fc-settings-section {
                    margin-bottom: 30px;
                }

                .fc-settings-section-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #4CAF50;
                    margin-bottom: 16px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .fc-settings-field {
                    margin-bottom: 16px;
                }

                .fc-settings-label {
                    display: block;
                    font-size: 13px;
                    margin-bottom: 8px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .fc-settings-input,
                .fc-settings-select {
                    width: 100%;
                    padding: 10px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: #ffffff;
                    font-size: 13px;
                    font-family: inherit;
                    transition: all 0.2s;
                }

                .fc-settings-input:focus,
                .fc-settings-select:focus {
                    outline: none;
                    border-color: #4CAF50;
                    background: rgba(255, 255, 255, 0.08);
                }

                .fc-settings-checkbox-field {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: rgba(255, 255, 255, 0.9);
                }

                .fc-settings-checkbox-field:hover {
                    background: rgba(255, 255, 255, 0.06);
                    border-color: rgba(255, 255, 255, 0.15);
                }

                .fc-settings-checkbox-field.checked {
                    background: rgba(76, 175, 80, 0.1);
                    border-color: rgba(76, 175, 80, 0.3);
                }

                .fc-settings-checkbox {
                    display: none;
                }

                .fc-toggle {
                    position: relative;
                    width: 44px;
                    min-width: 44px;
                    height: 24px;
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 12px;
                    transition: all 0.3s;
                }

                .fc-toggle::after {
                    content: '';
                    position: absolute;
                    width: 20px;
                    height: 20px;
                    background: #ffffff;
                    border-radius: 50%;
                    top: 2px;
                    left: 2px;
                    transition: all 0.3s;
                }

                .fc-settings-checkbox:checked + .fc-toggle {
                    background: #4CAF50;
                }

                .fc-settings-checkbox:checked + .fc-toggle::after {
                    left: 22px;
                }

                .fc-settings-help {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-top: 4px;
                }

                .fc-settings-actions {
                    display: flex;
                    gap: 12px;
                    padding: 20px;
                    background: #1a1a2e;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    position: sticky;
                    bottom: 0;
                }

                .fc-settings-btn {
                    flex: 1;
                    padding: 12px;
                    border: none;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .fc-settings-btn-save {
                    background: #4CAF50;
                    color: #ffffff;
                }

                .fc-settings-btn-save:hover {
                    background: #45a049;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
                }

                .fc-settings-btn-reset {
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                }

                .fc-settings-btn-reset:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .fc-settings-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 999999;
                    display: none;
                    backdrop-filter: blur(2px);
                }

                .fc-settings-overlay.open {
                    display: block;
                }
            `;
            document.head.appendChild(style);
        },

        /**
         * Кэширование ссылок на элементы
         */
        _cacheElements() {
            this.elements = {
                panel: document.getElementById('fonbet-collector-panel'),

                // Общие кнопки
                btnSettings: document.querySelector('.fc-btn-settings'),
                btnMinimize: document.querySelector('.fc-btn-minimize'),
                btnHelp: document.querySelector('.fc-btn-help'),

                // Прогресс-бар
                progressSection: document.getElementById('fc-progress-section'),
                progressStage: document.getElementById('fc-progress-stage'),
                progressPercent: document.getElementById('fc-progress-percent'),
                progressFill: document.getElementById('fc-progress-fill'),

                // Статус
                status: document.getElementById('fc-status'),

                // Sync
                syncStatus: document.getElementById('fc-sync-status')
            };

            if (this.pageType === 'bonuses') {
                // Freebets-specific elements
                this.elements.fbActiveCount = document.getElementById('fc-fb-active-count');
                this.elements.fbTotalValue = document.getElementById('fc-fb-total-value');
                this.elements.fbTotalCount = document.getElementById('fc-fb-total-count');
                this.elements.btnRefreshFb = document.getElementById('fc-btn-refresh-fb');
                this.elements.btnSyncFb = document.getElementById('fc-btn-sync-fb');
            } else if (this.pageType === 'betboom') {
                // BetBoom-specific elements
                this.elements.bbTotal = document.getElementById('fc-bb-total');
                this.elements.bbWins = document.getElementById('fc-bb-wins');
                this.elements.bbLosses = document.getElementById('fc-bb-losses');
                this.elements.bbReturns = document.getElementById('fc-bb-returns');
                this.elements.bbProgress = document.getElementById('fc-bb-progress');
                this.elements.bbDeposits = document.getElementById('fc-bb-deposits');
                this.elements.bbWithdrawals = document.getElementById('fc-bb-withdrawals');
                this.elements.bbProfit = document.getElementById('fc-bb-profit');
                this.elements.bbPeriod = document.getElementById('fc-bb-period');
                this.elements.bbUser = document.getElementById('fc-bb-user');
                this.elements.btnBbRestart = document.getElementById('fc-btn-bb-restart');
                this.elements.btnBbExport = document.getElementById('fc-btn-bb-export');
                this.elements.btnBbSync = document.getElementById('fc-btn-bb-sync');
            } else {
                // Operations-specific elements
                this.elements.btnStartAll = document.getElementById('fc-btn-start-all');
                this.elements.btnStopAll = document.getElementById('fc-btn-stop-all');
                this.elements.btnExportOps = document.getElementById('fc-btn-export-ops');
                this.elements.btnSync = document.getElementById('fc-btn-sync');
                this.elements.xhrCount = document.getElementById('fc-stat-xhr');
                this.elements.opsBets = document.getElementById('fc-ops-bets');
                this.elements.opsFast = document.getElementById('fc-ops-fast');
                this.elements.opsFree = document.getElementById('fc-ops-free');
                this.elements.opsDeposits = document.getElementById('fc-ops-deposits');
                this.elements.opsWithdrawals = document.getElementById('fc-ops-withdrawals');
                this.elements.opsBonus = document.getElementById('fc-ops-bonus');
                this.elements.progressDetails = document.getElementById('fc-progress-details');
                this.elements.detailsLoaded = document.getElementById('fc-details-loaded');
                this.elements.detailsTotal = document.getElementById('fc-details-total');
            }
        },

        /**
         * Добавление обработчиков событий
         */
        _attachEventListeners() {
            if (this.pageType === 'bonuses') {
                // Refresh Freebets
                this.elements.btnRefreshFb.addEventListener('click', () => {
                    const btn = this.elements.btnRefreshFb;
                    const originalText = btn.textContent;
                    btn.textContent = '⏳ Загрузка...';
                    btn.disabled = true;
                    FreebetCollector.fetchFreebets().then(success => {
                        if (success) {
                            this.update();
                            btn.textContent = '✅ Обновлено!';
                        } else {
                            btn.textContent = '❌ Ошибка';
                        }
                        setTimeout(() => {
                            btn.textContent = originalText;
                            btn.disabled = false;
                        }, 1500);
                    });
                });

                // Sync Freebets
                this.elements.btnSyncFb.addEventListener('click', () => {
                    GitHubSync.syncFreebets();
                });
            } else if (this.pageType === 'betboom') {
                // BetBoom: Restart
                this.elements.btnBbRestart.addEventListener('click', () => {
                    BetBoomCollector.bets = [];
                    BetBoomCollector.payments = [];
                    BetBoomCollector.isCompleted = false;
                    BetBoomCollector.isCollecting = false;
                    AppState.isCollectionCompleted = false;
                    BetBoomCollector.start();
                });

                // BetBoom: Export
                this.elements.btnBbExport.addEventListener('click', () => {
                    this._exportBetBoom();
                });

                // BetBoom: Sync
                this.elements.btnBbSync.addEventListener('click', () => {
                    GitHubSync.syncBetBoom();
                });
            } else {
                // Start All
                this.elements.btnStartAll.addEventListener('click', () => {
                    this._handleStartAll();
                });

                // Stop All
                this.elements.btnStopAll.addEventListener('click', () => {
                    this._handleStopAll();
                });

                // Export Operations
                this.elements.btnExportOps.addEventListener('click', () => {
                    ExportModule.exportOperations();
                });

                // Sync
                this.elements.btnSync.addEventListener('click', () => {
                    GitHubSync.sync();
                });
            }

            // Settings
            this.elements.btnSettings.addEventListener('click', () => {
                this._openSettings();
            });

            // Minimize
            this.elements.btnMinimize.addEventListener('click', () => {
                this._toggleMinimize();
            });

            // Help
            this.elements.btnHelp.addEventListener('click', () => {
                this._showHelp();
            });
        },

        /**
         * Получить hash состояния для сравнения
         * @returns {string}
         */
        _getStateHash() {
            if (this.pageType === 'bonuses') {
                const stats = FreebetCollector.getStats();
                return `fb:${stats.total}:${stats.active}:${stats.totalValue}:${GitHubSync.isSyncing}:${GitHubSync.lastSyncResult?.date || ''}`;
            }

            if (this.pageType === 'betboom') {
                const stats = BetBoomCollector.getStats();
                return `bb:${stats.totalBets}:${stats.totalPayments}:${stats.isCollecting}:${stats.isCompleted}:${GitHubSync.isSyncing}:${GitHubSync.lastSyncResult?.date || ''}`;
            }

            const s = this.appState;
            const stats = OperationsCollector.getStats();

            // Включаем статистику операций и статус завершения для автоматического обновления UI
            return `${s.isInterceptorRunning}:${stats.totalOperations || 0}:${stats.totalGroups || 0}:${s.isCollectionCompleted}:${GitHubSync.isSyncing}:${GitHubSync.lastSyncResult?.date || ''}`;
        },

                /**
         * Запуск автообновления
         */
        _startAutoUpdate() {
            let lastStateHash = '';

            this.updateInterval = setInterval(() => {
                const currentHash = this._getStateHash();

                // Обновляем только если состояние изменилось
                if (currentHash !== lastStateHash) {
                    this.update();
                    lastStateHash = currentHash;
                }
            }, LIMITS.UI_UPDATE_INTERVAL_MS);
        },

        /**
         * Обновление статуса
         */
        _updateStatus() {
            const state = this.appState;
            const status = this.elements.status;
            const isRunning = state.isInterceptorRunning;

            const states = {
                'completed': { cls: 'fc-status completed', icon: '✅', text: '' },
                'running': { cls: 'fc-status running', icon: '📡', text: 'Работает (collector)' },
                'stopped': { cls: 'fc-status', icon: '⏸️', text: 'Ожидание запуска...' }
            };

            let s;
            if (state.isCollectionCompleted && state.completionStats) {
                s = states.completed;
                s.text = `Сбор завершён: ${state.completionStats.totalOperations} операций, ${state.completionStats.totalGroups} групп`;
            } else {
                s = isRunning ? states.running : states.stopped;
            }

            status.className = s.cls;
            status.innerHTML = `<span class="fc-status-icon">${s.icon}</span><span class="fc-status-text">${s.text}</span>`;
        },

        /**
         * Обновление состояния кнопок
         */
        _updateButtons() {
            const state = this.appState;
            const isRunning = state.isInterceptorRunning;

            this.elements.btnStartAll.disabled = isRunning;
            this.elements.btnStopAll.disabled = !isRunning;

            // Sync кнопка
            if (this.elements.btnSync) {
                const canSync = OperationsCollector.completed && !BetsDetailsFetcher.isProcessing && !GitHubSync.isSyncing;
                this.elements.btnSync.disabled = !canSync;

                if (GitHubSync.isSyncing) {
                    this.elements.btnSync.classList.add('syncing');
                    this.elements.btnSync.textContent = '⏳ Syncing...';
                } else {
                    this.elements.btnSync.classList.remove('syncing');
                    this.elements.btnSync.textContent = '🔄 Sync';
                }
            }

            // Sync статус
            if (this.elements.syncStatus) {
                const syncStatus = GitHubSync.getSyncStatus();
                this.elements.syncStatus.textContent = syncStatus.text;
                this.elements.syncStatus.className = `fc-sync-status ${syncStatus.state}`;
            }
        },

        /**
         * Обновление статистики операций
         */
        _updateOpsStats() {
            const stats = OperationsCollector.getStats();

            if (this.elements.opsBets) {
                this.elements.opsBets.textContent = stats.byCategory?.regularBets || 0;
            }
            if (this.elements.opsFast) {
                this.elements.opsFast.textContent = stats.byCategory?.fastBets || 0;
            }
            if (this.elements.opsFree) {
                this.elements.opsFree.textContent = stats.byCategory?.freebets || 0;
            }
            if (this.elements.opsDeposits) {
                this.elements.opsDeposits.textContent = stats.deposits || 0;
            }
            if (this.elements.opsWithdrawals) {
                this.elements.opsWithdrawals.textContent = stats.withdrawals || 0;
            }
            if (this.elements.opsBonus) {
                this.elements.opsBonus.textContent = stats.byCategory?.bonus || 0;
            }
        },

        _updateFreebetsStats() {
            const stats = FreebetCollector.getStats();
            if (this.elements.fbActiveCount) this.elements.fbActiveCount.textContent = stats.active;
            if (this.elements.fbTotalValue) this.elements.fbTotalValue.textContent = stats.totalValueFormatted;
            if (this.elements.fbTotalCount) this.elements.fbTotalCount.textContent = stats.total;

            // Обновляем sync status
            if (this.elements.syncStatus) {
                const syncStatus = GitHubSync.getSyncStatus();
                this.elements.syncStatus.textContent = syncStatus.text;
            }
        },

        _updateBetBoomStats() {
            const stats = BetBoomCollector.getStats();
            if (this.elements.bbTotal) this.elements.bbTotal.textContent = stats.totalBets;
            if (this.elements.bbWins) this.elements.bbWins.textContent = stats.wins;
            if (this.elements.bbLosses) this.elements.bbLosses.textContent = stats.losses;
            if (this.elements.bbReturns) this.elements.bbReturns.textContent = stats.returns;
            if (this.elements.bbProgress) this.elements.bbProgress.textContent = stats.inProgress;
            if (this.elements.bbDeposits) this.elements.bbDeposits.textContent = stats.deposits;
            if (this.elements.bbWithdrawals) this.elements.bbWithdrawals.textContent = stats.withdrawals;
            if (this.elements.bbProfit) this.elements.bbProfit.textContent = `${stats.profit.toLocaleString('ru-RU')} ₽`;
            if (this.elements.bbUser && BetBoomCollector.gamblerId) {
                this.elements.bbUser.textContent = BetBoomCollector.gamblerId;
            }

            // Обновляем sync status
            if (this.elements.syncStatus) {
                const syncStatus = GitHubSync.getSyncStatus();
                this.elements.syncStatus.textContent = syncStatus.text;
            }

            // Обновляем состояние кнопок
            if (this.elements.btnBbExport) {
                this.elements.btnBbExport.disabled = !stats.isCompleted;
            }
            if (this.elements.btnBbSync) {
                this.elements.btnBbSync.disabled = !stats.isCompleted || !GitHubSync.isConfigured();
            }
            if (this.elements.btnBbRestart) {
                this.elements.btnBbRestart.disabled = stats.isCollecting;
            }
        },

        _exportBetBoom() {
            const data = BetBoomCollector.buildExportData();
            if (!data) {
                alert('Нет данных для экспорта');
                return;
            }

            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.href = url;
            a.download = `betboom_${BetBoomCollector.gamblerId}_${timestamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            logger.info(`[UIPanel] Экспорт BetBoom: ${data.bets.length} ставок, ${data.payments.length} платежей`);
        },

        /**
         * Показать прогресс-бар
         */
        showProgress(stage, percent = 0, loaded = 0, total = 0) {
            if (!this.elements.progressSection) return;

            this.elements.progressSection.style.display = 'block';
            this.elements.progressStage.textContent = stage;
            this.elements.progressPercent.textContent = `${Math.round(percent)}%`;
            this.elements.progressFill.style.width = `${percent}%`;

            if (this.elements.progressDetails) {
                if (total > 0) {
                    this.elements.progressDetails.style.display = 'block';
                    this.elements.detailsLoaded.textContent = loaded;
                    this.elements.detailsTotal.textContent = total;
                } else {
                    this.elements.progressDetails.style.display = 'none';
                }
            }
        },

        /**
         * Скрыть прогресс-бар
         */
        hideProgress() {
            if (this.elements.progressSection) {
                this.elements.progressSection.style.display = 'none';
            }
        },

        /**
         * Обработчик Start All
         */
        _handleStartAll() {
            logger.log('[UIPanel] Start нажата');

            const pageType = getCurrentPageType();

            if (pageType === 'operations') {
                // Если уже был сбор — перезагружаем страницу для свежих данных
                if (OperationsCollector.completed || OperationsCollector.collectedOperations.length > 0) {
                    console.log('[UIPanel] Повторный старт — перезагрузка страницы...');
                    location.reload();
                    return;
                }

                console.log('[UIPanel] Страница операций - запуск сбора операций');
                XHRInterceptor.start();
                OperationsCollector.start();
            } else {
                alert('Скрипт работает только на странице /account/history/operations');
            }
        },

        /**
         * Обработчик Stop All
         */
        _handleStopAll() {
            console.log('⏹️ [UIPanel] Stop нажата');

            if (XHRInterceptor.isRunning()) {
                XHRInterceptor.stop();
            }

            if (OperationsCollector.isCollecting) {
                OperationsCollector.stop();
            }
        },

        /**
         * Переключение минимизации
         */
        _toggleMinimize() {
            this.isMinimized = !this.isMinimized;

            if (this.isMinimized) {
                this.elements.panel.classList.add('minimized');
                this.elements.btnMinimize.textContent = '+';
            } else {
                this.elements.panel.classList.remove('minimized');
                this.elements.btnMinimize.textContent = '−';
            }
        },

        /**
         * Открыть панель настроек
         */
        _openSettings() {
            // Создаём панель настроек если её ещё нет
            if (!document.getElementById('fc-settings-panel')) {
                this._createSettingsPanel();
            }

            // Загружаем текущие настройки
            const settings = SettingsManager.getSettings();
            this._fillSettingsForm(settings);

            // Показываем панель
            const overlay = document.getElementById('fc-settings-overlay');
            const panel = document.getElementById('fc-settings-panel');
            overlay.classList.add('open');
            panel.classList.add('open');
        },

        /**
         * Закрыть панель настроек
         */
        _closeSettings() {
            const overlay = document.getElementById('fc-settings-overlay');
            const panel = document.getElementById('fc-settings-panel');
            overlay.classList.remove('open');
            panel.classList.remove('open');
        },

        /**
         * Создать HTML панели настроек
         */
        _createSettingsPanel() {
            // Создаём overlay
            const overlay = document.createElement('div');
            overlay.id = 'fc-settings-overlay';
            overlay.className = 'fc-settings-overlay';
            overlay.addEventListener('click', () => this._closeSettings());
            document.body.appendChild(overlay);

            // Создаём панель
            const panel = document.createElement('div');
            panel.id = 'fc-settings-panel';
            panel.className = 'fc-settings-panel';
            panel.innerHTML = `
                <div class="fc-settings-header">
                    <div class="fc-settings-title">⚙️ Настройки</div>
                    <button class="fc-settings-close" id="fc-settings-close">✕</button>
                </div>

                <div class="fc-settings-body">
                    <!-- ЭКСПОРТ -->
                    <div class="fc-settings-section">
                        <div class="fc-settings-section-title">📤 Экспорт</div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-checkbox-field">
                                <input type="checkbox" class="fc-settings-checkbox" id="setting-use-custom-prefix">
                                <span class="fc-toggle"></span>
                                <span>Использовать пользовательский префикс файла</span>
                            </label>
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Префикс имени файла</label>
                            <input type="text" class="fc-settings-input" id="setting-custom-prefix" placeholder="fonbet_history">
                            <div class="fc-settings-help">Используется при экспорте данных</div>
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-checkbox-field">
                                <input type="checkbox" class="fc-settings-checkbox" id="setting-include-timestamp">
                                <span class="fc-toggle"></span>
                                <span>Включать временную метку в имя файла</span>
                            </label>
                        </div>
                    </div>

                    <!-- ЗАГРУЗКА ДЕТАЛЕЙ -->
                    <div class="fc-settings-section">
                        <div class="fc-settings-section-title">🔄 Загрузка деталей ставок</div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Размер пакета (batch size)</label>
                            <input type="number" class="fc-settings-input" id="setting-batch-size" min="1" max="20" value="5">
                            <div class="fc-settings-help">Количество одновременных запросов (1-20)</div>
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Задержка между пакетами (мс)</label>
                            <input type="number" class="fc-settings-input" id="setting-delay-batches" min="0" max="5000" step="100" value="500">
                            <div class="fc-settings-help">Пауза между пакетами запросов</div>
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Максимум повторов при ошибке</label>
                            <input type="number" class="fc-settings-input" id="setting-max-retries" min="0" max="10" value="3">
                            <div class="fc-settings-help">Количество попыток при неудачной загрузке</div>
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Начальная задержка повтора (мс)</label>
                            <input type="number" class="fc-settings-input" id="setting-initial-retry" min="100" max="5000" step="100" value="500">
                            <div class="fc-settings-help">Задержка перед первым повтором</div>
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Максимальная задержка повтора (мс)</label>
                            <input type="number" class="fc-settings-input" id="setting-max-retry" min="1000" max="30000" step="1000" value="8000">
                            <div class="fc-settings-help">Максимальная задержка при exponential backoff</div>
                        </div>
                    </div>

                    <!-- СИНХРОНИЗАЦИЯ -->
                    <div class="fc-settings-section">
                        <div class="fc-settings-section-title">🔄 Синхронизация с GitHub</div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-checkbox-field">
                                <input type="checkbox" class="fc-settings-checkbox" id="setting-auto-sync">
                                <span class="fc-toggle"></span>
                                <span>Автоматический sync после завершения сбора</span>
                            </label>
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Personal Access Token</label>
                            <input type="password" class="fc-settings-input" id="setting-sync-token"
                                   placeholder="ghp_... или github_pat_...">
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Repository Owner</label>
                            <input type="text" class="fc-settings-input" id="setting-sync-owner"
                                   placeholder="username">
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Repository Name</label>
                            <input type="text" class="fc-settings-input" id="setting-sync-repo"
                                   placeholder="betting-data">
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Alias (имя аккаунта)</label>
                            <input type="text" class="fc-settings-input" id="setting-sync-alias"
                                   placeholder="Vlad, Sergey...">
                            <div class="fc-settings-help">Латиница, цифры, подчёркивание</div>
                        </div>
                    </div>

                    <!-- BETBOOM ПЕРИОД -->
                    <div class="fc-settings-section" id="fc-settings-betboom-section" style="display: none;">
                        <div class="fc-settings-section-title">🎯 BetBoom</div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Период с</label>
                            <input type="date" class="fc-settings-input" id="setting-bb-period-from">
                        </div>

                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Период по</label>
                            <input type="date" class="fc-settings-input" id="setting-bb-period-to">
                        </div>

                        <div class="fc-settings-help">Диапазон дат для загрузки истории ставок BetBoom</div>
                    </div>
                </div>

                <div class="fc-settings-actions">
                    <button class="fc-settings-btn fc-settings-btn-reset" id="fc-settings-reset">Сбросить</button>
                    <button class="fc-settings-btn fc-settings-btn-save" id="fc-settings-save">Сохранить</button>
                </div>
            `;
            document.body.appendChild(panel);

            // Добавляем обработчики
            document.getElementById('fc-settings-close').addEventListener('click', () => this._closeSettings());
            document.getElementById('fc-settings-save').addEventListener('click', () => this._saveSettings());
            document.getElementById('fc-settings-reset').addEventListener('click', () => this._resetSettings());

            // Toggle-переключатели: обновление класса checked на label
            panel.querySelectorAll('.fc-settings-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    cb.closest('.fc-settings-checkbox-field').classList.toggle('checked', cb.checked);
                });
            });
        },

        /**
         * Заполнить форму текущими настройками
         */
        _fillSettingsForm(settings) {
            // Экспорт
            const prefixCb = document.getElementById('setting-use-custom-prefix');
            const timestampCb = document.getElementById('setting-include-timestamp');
            prefixCb.checked = settings.export.useCustomPrefix;
            prefixCb.closest('.fc-settings-checkbox-field').classList.toggle('checked', prefixCb.checked);
            document.getElementById('setting-custom-prefix').value = settings.export.customPrefix;
            timestampCb.checked = settings.export.includeTimestamp;
            timestampCb.closest('.fc-settings-checkbox-field').classList.toggle('checked', timestampCb.checked);

            // Загрузка деталей
            document.getElementById('setting-batch-size').value = settings.fetcher.batchSize;
            document.getElementById('setting-delay-batches').value = settings.fetcher.delayBetweenBatches;
            document.getElementById('setting-max-retries').value = settings.fetcher.maxRetries;
            document.getElementById('setting-initial-retry').value = settings.fetcher.initialRetryDelay;
            document.getElementById('setting-max-retry').value = settings.fetcher.maxRetryDelay;

            // Sync
            const autoSyncCb = document.getElementById('setting-auto-sync');
            autoSyncCb.checked = settings.sync?.autoSync || false;
            autoSyncCb.closest('.fc-settings-checkbox-field').classList.toggle('checked', autoSyncCb.checked);
            document.getElementById('setting-sync-token').value = GitHubSync.token || '';
            document.getElementById('setting-sync-owner').value = GitHubSync.repoOwner || '';
            document.getElementById('setting-sync-repo').value = GitHubSync.repoName || '';
            document.getElementById('setting-sync-alias').value = GitHubSync.accountAlias || '';

            // BetBoom period
            const bbSection = document.getElementById('fc-settings-betboom-section');
            if (bbSection) {
                if (this.pageType === 'betboom') {
                    bbSection.style.display = '';
                    if (BetBoomCollector.period) {
                        const fromInput = document.getElementById('setting-bb-period-from');
                        const toInput = document.getElementById('setting-bb-period-to');
                        if (fromInput) fromInput.value = BetBoomCollector.period.from.slice(0, 10);
                        if (toInput) toInput.value = BetBoomCollector.period.to.slice(0, 10);
                    }
                } else {
                    bbSection.style.display = 'none';
                }
            }
        },

        /**
         * Сохранить настройки
         */
        _saveSettings() {
            const settings = {
                export: {
                    useCustomPrefix: document.getElementById('setting-use-custom-prefix').checked,
                    customPrefix: document.getElementById('setting-custom-prefix').value,
                    includeTimestamp: document.getElementById('setting-include-timestamp').checked
                },
                fetcher: {
                    batchSize: parseInt(document.getElementById('setting-batch-size').value),
                    delayBetweenBatches: parseInt(document.getElementById('setting-delay-batches').value),
                    maxRetries: parseInt(document.getElementById('setting-max-retries').value),
                    initialRetryDelay: parseInt(document.getElementById('setting-initial-retry').value),
                    maxRetryDelay: parseInt(document.getElementById('setting-max-retry').value)
                },
                sync: {
                    autoSync: document.getElementById('setting-auto-sync').checked
                }
            };

            // Сохраняем sync-настройки отдельно через GitHubSync
            const syncToken = document.getElementById('setting-sync-token').value.trim();
            const syncOwner = document.getElementById('setting-sync-owner').value.trim();
            const syncRepo = document.getElementById('setting-sync-repo').value.trim();
            const syncAlias = document.getElementById('setting-sync-alias').value.trim();

            GitHubSync.saveConfig({
                token: syncToken || null,
                repoOwner: syncOwner || null,
                repoName: syncRepo || null,
                accountAlias: syncAlias || null
            });

            // BetBoom period
            if (this.pageType === 'betboom') {
                const bbFrom = document.getElementById('setting-bb-period-from')?.value;
                const bbTo = document.getElementById('setting-bb-period-to')?.value;
                if (bbFrom && bbTo) {
                    BetBoomCollector.savePeriodSettings(
                        new Date(bbFrom).toISOString(),
                        new Date(bbTo + 'T23:59:59').toISOString()
                    );
                }
            }

            if (SettingsManager.saveSettings(settings)) {
                alert('✅ Настройки сохранены!');
                this._closeSettings();
            } else {
                alert('❌ Ошибка сохранения настроек');
            }
        },

        /**
         * Сбросить настройки к значениям по умолчанию
         */
        _resetSettings() {
            if (confirm('Вы уверены, что хотите сбросить все настройки к значениям по умолчанию?')) {
                SettingsManager.resetToDefaults();
                this._fillSettingsForm(SettingsManager.getSettings());
                alert('✅ Настройки сброшены к значениям по умолчанию');
            }
        },

        /**
         * Показать справку
         */
        _showHelp() {
            const helpText = `
🎰 Collector v${VERSION} (${SiteDetector.getSiteName()})

Сбор истории операций с fon.bet и pari.ru

ИСПОЛЬЗОВАНИЕ:
1. Откройте страницу /account/history/operations
2. Нажмите "Start All" для запуска сбора
3. Дождитесь завершения сбора всех операций
4. Используйте "Экспорт данных" для скачивания JSON
5. Используйте "Sync" для синхронизации с GitHub

КОНСОЛЬ: window.collector
• collector.sync() — синхронизация с GitHub
• collector.changeAlias('name') — сменить alias
• collector.exportOperations() — экспорт в файл

v${VERSION}: Мультисайтовая поддержка + GitHub Sync
            `;

            alert(helpText);
        }
    };
    // EXPORT MODULE

    const ExportModule = {
        appState: null,

        /**
         * Инициализация модуля
         */
        init(appState) {
            logger.log('🔧 [ExportModule] Инициализация...');
            this.appState = appState;
            logger.info('✅ [ExportModule] Готов к работе');
        },

        /**
         * Формирование данных экспорта (без скачивания файла)
         * Используется как в exportOperations(), так и в GitHubSync
         * @returns {object|null} — объект данных или null если нет данных
         */
        _buildExportData() {
            const operations = OperationsCollector.getOperations();
            const grouped = OperationsCollector.getGroupedOperations();
            const stats = OperationsCollector.getStats();
            const detailsStats = BetsDetailsFetcher.getStats();

            if (operations.length === 0) return null;

            const groupValues = Object.values(grouped);

            // Разделяем по категориям
            const bets = groupValues.filter(g => g.category === 'regular_bet');
            const fastBets = groupValues.filter(g => g.category === 'fast_bet');
            const freebets = groupValues.filter(g => g.category === 'freebet');
            const finance = groupValues.filter(g => g.category === 'finance');
            const bonus = groupValues.filter(g => g.category === 'bonus');

            return {
                version: VERSION,
                exportDate: new Date().toISOString(),
                site: SiteDetector.getSiteName(),
                account: {
                    siteId: SiteDetector.currentSite?.id,
                    siteName: SiteDetector.getSiteName(),
                    clientId: OperationsCollector.sessionParams?.clientId,
                    alias: GitHubSync.accountAlias || ''
                },

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
                },

                bets: bets.map(g => this._formatBetGroup(g)),
                fastBets: fastBets.map(g => this._formatFastBet(g)),
                freebets: freebets.map(g => this._formatBetGroup(g)),
                finance: {
                    deposits: finance
                        .filter(g => g.operations.some(op => op.operationId === 69))
                        .map(g => this._formatFinanceOp(g)),
                    withdrawals: finance
                        .filter(g => g.operations.some(op => op.operationId === 90))
                        .map(g => this._formatFinanceOp(g)),
                    holds: finance
                        .filter(g => g.operations.some(op => op.operationId === 460 || op.operationId === 461))
                        .map(g => this._formatFinanceOp(g))
                },
                bonus: bonus.map(g => this._formatBonusOp(g))
            };
        },

        /**
         * Экспорт операций в JSON файл
         */
        exportOperations() {
            logger.debug('💰 [ExportModule] Начало экспорта операций v2.1...');

            const exportData = this._buildExportData();

            if (!exportData) {
                const stats = OperationsCollector.getStats();
                const pageType = getCurrentPageType();
                let message = '⚠️ Нет данных для экспорта!\n\n';

                if (pageType !== 'operations') {
                    message += '❌ Вы не на странице операций!\nПерейдите на: /account/history/operations';
                } else if (!stats.isCollecting && !stats.completed) {
                    message += '▶️ Сбор не запущен!\nНажмите кнопку "Start All" для начала сбора операций.';
                } else if (stats.isCollecting) {
                    message += '⏳ Сбор в процессе...\nПодождите завершения сбора операций.';
                } else if (stats.completed) {
                    message += '✅ Сбор завершен, но операций не найдено.';
                }

                alert(message);
                return;
            }

            const cfg = this.appState.config.export;

            // Конвертируем в JSON строку
            const jsonString = JSON.stringify(exportData, null, 2);

            // Генерируем имя файла
            const timestamp = new Date().toISOString()
                .replace(/T/, '_')
                .replace(/:/g, '-')
                .split('.')[0];

            const prefix = cfg.USE_CUSTOM_PREFIX ? cfg.CUSTOM_PREFIX : 'fonbet_data';
            const filename = cfg.INCLUDE_TIMESTAMP
                ? `${prefix}_${timestamp}.json`
                : `${prefix}.json`;

            // Создаём Blob и скачиваем
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();

            URL.revokeObjectURL(url);

            const s = exportData.summary;
            console.log(`✅ [ExportModule] Файл создан: ${filename}`);
            console.log(`📊 Ставок: ${s.regularBets}, Быстрых: ${s.fastBets}, Фрибетов: ${s.freebets}`);
            console.log(`💵 Депозитов: ${s.deposits}, Выводов: ${s.withdrawals}`);
            console.log(`📋 Деталей загружено: ${s.detailsLoaded}, ошибок: ${s.detailsFailed}, пропущено: ${s.detailsSkipped}`);

            alert(`✅ Данные экспортированы (v2.1)!\n\nФайл: ${filename}\nСтавок: ${s.regularBets}\nБыстрых: ${s.fastBets}\nФрибетов: ${s.freebets}\nДепозитов: ${s.deposits}\nВыводов: ${s.withdrawals}\n\nДеталей: ${s.detailsLoaded} загружено, ${s.detailsFailed} ошибок`);
        },

        // Форматирование группы ставок
        _formatBetGroup(group) {
            const firstOp = group.operations[0];
            const bets = group.details?.body?.bets || [];
            return {
                marker: group.marker,
                regId: group.regId || group.details?.header?.regId || group.marker,
                status: group.finalStatus,
                time: firstOp?.time,
                timeFormatted: firstOp ? new Date(firstOp.time * 1000).toISOString() : null,
                segments: bets.map(b => ({
                    segmentId: b.segmentId,
                    segmentName: SegmentMapper.getName(b.segmentId)
                })),
                operations: group.operations.map(op => ({
                    operationId: op.operationId,
                    operationType: OperationsCollector.OPERATION_NAMES[op.operationId],
                    sum: op.sum,
                    time: op.time
                })),
                details: group.details || null
            };
        },

        // Форматирование быстрой ставки
        _formatFastBet(group) {
            const firstOp = group.operations[0];
            return {
                marker: group.marker,
                status: group.finalStatus,
                time: firstOp?.time,
                timeFormatted: firstOp ? new Date(firstOp.time * 1000).toISOString() : null,
                sum: firstOp?.sum,
                operations: group.operations.map(op => ({
                    operationId: op.operationId,
                    operationType: OperationsCollector.OPERATION_NAMES[op.operationId],
                    sum: op.sum
                }))
            };
        },

        // Форматирование финансовой операции
        _formatFinanceOp(group) {
            const firstOp = group.operations[0];
            return {
                marker: group.marker,
                type: group.finalStatus,
                time: firstOp?.time,
                timeFormatted: firstOp ? new Date(firstOp.time * 1000).toISOString() : null,
                sum: firstOp?.sum,
                bonusSum: firstOp?.bonusSum,
                holdSum: firstOp?.holdSum
            };
        },

        // Форматирование бонуса
        _formatBonusOp(group) {
            const firstOp = group.operations[0];
            return {
                marker: group.marker,
                time: firstOp?.time,
                timeFormatted: firstOp ? new Date(firstOp.time * 1000).toISOString() : null,
                sum: firstOp?.sum,
                bonusSum: firstOp?.bonusSum
            };
        }
    };

    // GITHUB SYNC MODULE

    const GitHubSync = {
        // === Конфигурация ===
        API_BASE: 'https://api.github.com',

        // === Состояние ===
        token: null,
        repoOwner: null,
        repoName: null,
        accountAlias: null,
        isSyncing: false,
        lastSyncResult: null,

        // === Инициализация ===
        init() {
            this.loadConfig();
            logger.info('✅ [GitHubSync] Инициализация завершена');
        },

        // === Настройки ===
        isConfigured() {
            return !!(this.token && this.repoOwner && this.repoName && this.accountAlias);
        },

        loadConfig() {
            this.token = GM_getValue('sync_github_token', null);
            this.repoOwner = GM_getValue('sync_repo_owner', null);
            this.repoName = GM_getValue('sync_repo_name', null);
            this.accountAlias = GM_getValue('sync_account_alias', null);
        },

        saveConfig(config) {
            if (config.token !== undefined) {
                this.token = config.token;
                GM_setValue('sync_github_token', config.token);
            }
            if (config.repoOwner !== undefined) {
                this.repoOwner = config.repoOwner;
                GM_setValue('sync_repo_owner', config.repoOwner);
            }
            if (config.repoName !== undefined) {
                this.repoName = config.repoName;
                GM_setValue('sync_repo_name', config.repoName);
            }
            if (config.accountAlias !== undefined) {
                this.accountAlias = config.accountAlias;
                GM_setValue('sync_account_alias', config.accountAlias);
            }
        },

        // === GitHub API ===
        _apiRequest(method, path, body = null) {
            return new Promise((resolve, reject) => {
                const url = `${this.API_BASE}${path}`;
                const headers = {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                };
                if (body) headers['Content-Type'] = 'application/json';

                GM_xmlhttpRequest({
                    method,
                    url,
                    headers,
                    data: body ? JSON.stringify(body) : null,
                    onload(response) {
                        if (response.status === 401) {
                            reject(new Error('INVALID_TOKEN'));
                        } else if (response.status === 403 && response.responseText.includes('rate limit')) {
                            reject(new Error('RATE_LIMIT'));
                        } else if (response.status === 404) {
                            resolve({ status: 404, data: null });
                        } else if (response.status === 409 || response.status === 422) {
                            reject(new Error('SHA_CONFLICT'));
                        } else if (response.status >= 200 && response.status < 300) {
                            try {
                                resolve({ status: response.status, data: JSON.parse(response.responseText) });
                            } catch (e) {
                                resolve({ status: response.status, data: null });
                            }
                        } else {
                            reject(new Error(`HTTP_${response.status}`));
                        }
                    },
                    onerror(error) {
                        reject(new Error('NETWORK_ERROR'));
                    },
                    ontimeout() {
                        reject(new Error('TIMEOUT'));
                    }
                });
            });
        },

        async _getFile(path) {
            const result = await this._apiRequest('GET', `/repos/${this.repoOwner}/${this.repoName}/contents/${path}`);
            if (result.status === 404 || !result.data) return null;

            let base64Content = result.data.content;
            const sha = result.data.sha;

            // Файл > 1MB: Contents API не возвращает content, используем Git Blob API
            if (!base64Content && sha) {
                console.log('📦 [GitHubSync] Файл > 1MB, загрузка через Git Blob API...');
                const blobResult = await this._apiRequest('GET', `/repos/${this.repoOwner}/${this.repoName}/git/blobs/${sha}`);
                if (!blobResult.data || !blobResult.data.content) {
                    console.error('❌ [GitHubSync] Git Blob API не вернул content');
                    return null;
                }
                base64Content = blobResult.data.content;
            }

            if (!base64Content) {
                console.error('❌ [GitHubSync] Файл не содержит content');
                return null;
            }

            try {
                // GitHub API возвращает base64 с переносами строк — убираем их
                const cleanBase64 = base64Content.replace(/\s/g, '');
                // Обратное преобразование к btoa(unescape(encodeURIComponent(...)))
                const binaryString = atob(cleanBase64);
                const decodedString = decodeURIComponent(escape(binaryString));
                const content = JSON.parse(decodedString);
                return { content, sha };
            } catch (e) {
                console.error('❌ [GitHubSync] Ошибка декодирования файла:', e.message);
                return null;
            }
        },

        async _putFile(path, content, sha, message) {
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
            const body = { message, content: encoded };
            if (sha) body.sha = sha;

            return await this._apiRequest('PUT', `/repos/${this.repoOwner}/${this.repoName}/contents/${path}`, body);
        },

        async _deleteFile(path, sha, message) {
            return await this._apiRequest('DELETE', `/repos/${this.repoOwner}/${this.repoName}/contents/${path}`, {
                message,
                sha
            });
        },

        async _listDirectory(path) {
            const result = await this._apiRequest('GET', `/repos/${this.repoOwner}/${this.repoName}/contents/${path}`);
            if (result.status === 404 || !result.data) return [];
            return Array.isArray(result.data) ? result.data : [];
        },

        // === Поиск файла аккаунта ===
        async _findExistingFile() {
            const siteId = SiteDetector.currentSite?.id;
            const clientId = OperationsCollector.sessionParams?.clientId;
            if (!siteId || !clientId) return null;

            const files = await this._listDirectory(siteId);
            const pattern = `${clientId}_`;
            const found = files.find(f => f.name.startsWith(pattern) && f.name.endsWith('.json'));

            if (found) {
                return { name: found.name, path: found.path, sha: found.sha };
            }
            return null;
        },

        _buildFilePath(existingFile = null) {
            const siteId = SiteDetector.currentSite?.id || 'unknown';
            const clientId = OperationsCollector.sessionParams?.clientId || 'unknown';

            if (existingFile) return existingFile.path;
            return `${siteId}/${clientId}_${this.accountAlias}.json`;
        },

        // === Merge логика ===
        _mergeArray(remoteArr, localArr, key = 'marker') {
            const map = new Map();
            let added = 0, updated = 0;

            // Сначала добавляем все remote
            (remoteArr || []).forEach(item => {
                const k = item[key];
                if (k) map.set(k, item);
            });

            const remoteSize = map.size;

            // Затем local — перезапись при совпадении key
            (localArr || []).forEach(item => {
                const k = item[key];
                if (k) {
                    if (map.has(k)) {
                        updated++;
                    } else {
                        added++;
                    }
                    map.set(k, item);
                }
            });

            // Сортировка по времени (новые первые)
            const merged = [...map.values()].sort((a, b) => {
                const timeA = typeof a.time === 'number' ? a.time :
                    (a.create_dttm ? new Date(a.create_dttm).getTime() / 1000 : 0);
                const timeB = typeof b.time === 'number' ? b.time :
                    (b.create_dttm ? new Date(b.create_dttm).getTime() / 1000 : 0);
                return timeB - timeA;
            });
            return { merged, added, updated };
        },

        _mergeData(remote, local) {
            const stats = { added: 0, updated: 0, unchanged: 0 };

            // Merge bets
            const betsResult = this._mergeArray(remote?.bets, local.bets);
            const fastResult = this._mergeArray(remote?.fastBets, local.fastBets);
            const freeResult = this._mergeArray(remote?.freebets, local.freebets);
            const bonusResult = this._mergeArray(remote?.bonus, local.bonus);

            // Merge finance подкатегории
            const depositsResult = this._mergeArray(remote?.finance?.deposits, local.finance?.deposits);
            const withdrawalsResult = this._mergeArray(remote?.finance?.withdrawals, local.finance?.withdrawals);
            const holdsResult = this._mergeArray(remote?.finance?.holds, local.finance?.holds);

            stats.added = betsResult.added + fastResult.added + freeResult.added +
                          bonusResult.added + depositsResult.added + withdrawalsResult.added + holdsResult.added;
            stats.updated = betsResult.updated + fastResult.updated + freeResult.updated +
                            bonusResult.updated + depositsResult.updated + withdrawalsResult.updated + holdsResult.updated;

            // Подсчёт всех операций в merged результате
            const totalGroups = betsResult.merged.length + fastResult.merged.length +
                                freeResult.merged.length + bonusResult.merged.length +
                                depositsResult.merged.length + withdrawalsResult.merged.length + holdsResult.merged.length;

            // Подсчёт totalOperations — сумма operations во всех группах
            const countOps = arr => arr.reduce((sum, item) => sum + (item.operations?.length || 1), 0);
            const totalOperations = countOps(betsResult.merged) + countOps(fastResult.merged) +
                                    countOps(freeResult.merged) + countOps(bonusResult.merged) +
                                    countOps(depositsResult.merged) + countOps(withdrawalsResult.merged) +
                                    countOps(holdsResult.merged);

            const merged = {
                version: VERSION,
                account: {
                    siteId: SiteDetector.currentSite?.id,
                    siteName: SiteDetector.getSiteName(),
                    clientId: OperationsCollector.sessionParams?.clientId,
                    alias: this.accountAlias || ''
                },
                lastSync: new Date().toISOString(),
                syncHistory: [
                    ...(remote?.syncHistory || []),
                    {
                        date: new Date().toISOString(),
                        operationsAdded: stats.added,
                        operationsUpdated: stats.updated,
                        totalAfterSync: totalGroups
                    }
                ],
                summary: {
                    totalOperations,
                    totalGroups,
                    regularBets: betsResult.merged.length,
                    fastBets: fastResult.merged.length,
                    freebets: freeResult.merged.length,
                    deposits: depositsResult.merged.length,
                    withdrawals: withdrawalsResult.merged.length,
                    bonus: bonusResult.merged.length,
                    detailsLoaded: local.summary?.detailsLoaded || 0,
                    detailsFailed: local.summary?.detailsFailed || 0,
                    detailsSkipped: local.summary?.detailsSkipped || 0
                },
                bets: betsResult.merged,
                fastBets: fastResult.merged,
                freebets: freeResult.merged,
                finance: {
                    deposits: depositsResult.merged,
                    withdrawals: withdrawalsResult.merged,
                    holds: holdsResult.merged
                },
                bonus: bonusResult.merged
            };

            return { merged, stats };
        },

        _mergeDataBetBoom(remote, local) {
            const stats = { added: 0, updated: 0 };

            const betsResult = this._mergeArray(remote?.bets, local.bets, 'bet_uid');
            const paymentsResult = this._mergeArray(remote?.payments, local.payments, 'id');

            stats.added = betsResult.added + paymentsResult.added;
            stats.updated = betsResult.updated + paymentsResult.updated;

            const betsStats = BetBoomCollector.getStats();
            const merged = {
                version: VERSION,
                account: {
                    siteId: 'betboom',
                    siteName: 'BetBoom',
                    gamblerId: BetBoomCollector.gamblerId,
                    gamblerName: BetBoomCollector.gamblerName,
                    alias: this.accountAlias || ''
                },
                lastSync: new Date().toISOString(),
                syncHistory: [
                    ...(remote?.syncHistory || []),
                    {
                        date: new Date().toISOString(),
                        betsAdded: betsResult.added,
                        betsUpdated: betsResult.updated,
                        paymentsAdded: paymentsResult.added,
                        totalBets: betsResult.merged.length,
                        totalPayments: paymentsResult.merged.length
                    }
                ],
                period: local.period,
                summary: {
                    totalBets: betsResult.merged.length,
                    wins: betsStats.wins,
                    losses: betsStats.losses,
                    returns: betsStats.returns,
                    inProgress: betsStats.inProgress,
                    totalPayments: paymentsResult.merged.length,
                    deposits: betsStats.deposits,
                    withdrawals: betsStats.withdrawals
                },
                bets: betsResult.merged,
                payments: paymentsResult.merged
            };

            return { merged, stats };
        },

        _buildFilePathBetBoom() {
            const gamblerId = BetBoomCollector.gamblerId || 'unknown';
            return `betboom/${gamblerId}_${this.accountAlias}.json`;
        },

        // === Основной метод sync ===
        async sync() {
            if (this.isSyncing) {
                console.warn('⚠️ [GitHubSync] Синхронизация уже в процессе');
                return;
            }

            if (!this.isConfigured()) {
                this.showSetupDialog();
                return;
            }

            if (!OperationsCollector.completed) {
                alert('⚠️ Дождитесь завершения сбора операций перед синхронизацией.');
                return;
            }

            if (BetsDetailsFetcher.isProcessing) {
                alert('⚠️ Дождитесь завершения загрузки деталей ставок.');
                return;
            }

            this.isSyncing = true;
            console.log('🔄 [GitHubSync] Начинаем синхронизацию...');

            try {
                // Этап 1: Подготовка данных
                UIPanel.showProgress('Sync 1/4: Подготовка данных...', 25);
                const localData = ExportModule._buildExportData();
                if (!localData) {
                    throw new Error('NO_DATA');
                }

                // Этап 2: Загрузка из GitHub
                UIPanel.showProgress('Sync 2/4: Загрузка из GitHub...', 50);
                const existingFile = await this._findExistingFile();
                let remoteData = null;
                let sha = null;

                if (existingFile) {
                    const file = await this._getFile(existingFile.path);
                    if (file) {
                        remoteData = file.content;
                        sha = file.sha;
                    }
                }

                // Этап 3: Объединение данных
                UIPanel.showProgress('Sync 3/4: Объединение данных...', 75);
                const { merged, stats: mergeStats } = this._mergeData(remoteData, localData);

                // Этап 4: Сохранение в GitHub
                UIPanel.showProgress('Sync 4/4: Сохранение в GitHub...', 90);
                const filePath = this._buildFilePath(existingFile);
                const commitMessage = existingFile
                    ? `Update ${this.accountAlias}: +${mergeStats.added} new, ${mergeStats.updated} updated`
                    : `Add ${this.accountAlias}: ${merged.summary.totalGroups} operations`;

                try {
                    await this._putFile(filePath, merged, sha, commitMessage);
                } catch (e) {
                    if (e.message === 'SHA_CONFLICT') {
                        // Retry: повторный GET + merge + PUT
                        console.warn('⚠️ [GitHubSync] SHA conflict, retry...');
                        const freshFile = await this._getFile(filePath);
                        if (freshFile) {
                            const { merged: retryMerged } = this._mergeData(freshFile.content, localData);
                            await this._putFile(filePath, retryMerged, freshFile.sha, commitMessage);
                        } else {
                            await this._putFile(filePath, merged, null, commitMessage);
                        }
                    } else {
                        throw e;
                    }
                }

                // Успех
                this.lastSyncResult = {
                    success: true,
                    date: new Date().toISOString(),
                    added: mergeStats.added,
                    updated: mergeStats.updated,
                    total: merged.summary.totalGroups
                };

                UIPanel.showProgress(`✅ Sync: +${mergeStats.added} новых, ${mergeStats.updated} обновлено`, 100);
                console.log(`✅ [GitHubSync] Синхронизация завершена: +${mergeStats.added} новых, ${mergeStats.updated} обновлено, всего ${merged.summary.totalGroups} групп`);

                // Sync freebets вместе с основным sync
                try {
                    FreebetCollector._loadSessionParamsFromStorage();
                    if (FreebetCollector.sessionParams) {
                        UIPanel.showProgress('🎫 Загрузка фрибетов...', 100);
                        const fbOk = await FreebetCollector.fetchFreebets();
                        if (fbOk && FreebetCollector.isLoaded) {
                            await this._syncFreebetsInternal();
                        }
                    }
                } catch (fbError) {
                    console.warn('⚠️ [GitHubSync] Ошибка sync freebets:', fbError.message);
                }

            } catch (error) {
                this.lastSyncResult = { success: false, date: new Date().toISOString(), error: error.message };

                const messages = {
                    'INVALID_TOKEN': 'Невалидный GitHub токен. Проверьте настройки.',
                    'RATE_LIMIT': 'Превышен лимит GitHub API. Повторите через несколько минут.',
                    'NETWORK_ERROR': 'Ошибка сети. Проверьте подключение.',
                    'TIMEOUT': 'Таймаут запроса. Повторите попытку.',
                    'NO_DATA': 'Нет данных для синхронизации.'
                };

                const msg = messages[error.message] || `Ошибка: ${error.message}`;
                console.error(`❌ [GitHubSync] ${msg}`);
                UIPanel.showProgress(`❌ Sync: ${msg}`, 0);
                alert(`❌ Ошибка синхронизации\n\n${msg}`);
            } finally {
                this.isSyncing = false;
            }
        },

        // === Sync Freebets ===
        async syncFreebets() {
            if (this.isSyncing) {
                console.warn('⚠️ [GitHubSync] Синхронизация уже в процессе');
                return;
            }

            if (!this.isConfigured()) {
                this.showSetupDialog();
                return;
            }

            if (!FreebetCollector.isLoaded) {
                alert('\u26A0\uFE0F \u0414\u043E\u0436\u0434\u0438\u0442\u0435\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0434\u0430\u043D\u043D\u044B\u0445 \u043E \u0444\u0440\u0438\u0431\u0435\u0442\u0430\u0445.');
                return;
            }

            this.isSyncing = true;
            try {
                await this._syncFreebetsInternal();
            } catch (error) {
                this.lastSyncResult = { success: false, date: new Date().toISOString(), type: 'freebets', error: error.message };

                const messages = {
                    'INVALID_TOKEN': '\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0439 GitHub \u0442\u043E\u043A\u0435\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438.',
                    'RATE_LIMIT': '\u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D \u043B\u0438\u043C\u0438\u0442 GitHub API. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043C\u0438\u043D\u0443\u0442.',
                    'NETWORK_ERROR': '\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0442\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435.',
                    'TIMEOUT': '\u0422\u0430\u0439\u043C\u0430\u0443\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.'
                };

                const msg = messages[error.message] || `\u041E\u0448\u0438\u0431\u043A\u0430: ${error.message}`;
                console.error(`❌ [GitHubSync] ${msg}`);
                UIPanel.showProgress(`\u274C Sync: ${msg}`, 0);
                alert(`\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438\n\n${msg}`);
            } finally {
                this.isSyncing = false;
            }
        },

        async _syncFreebetsInternal() {
            console.log('🔄 [GitHubSync] Синхронизация фрибетов...');

            // Этап 1: Подготовка данных
            UIPanel.showProgress('Sync freebets 1/3: Подготовка данных...', 33);
            const syncData = FreebetCollector._buildSyncData();

            // Этап 2: Проверка существующего файла
            UIPanel.showProgress('Sync freebets 2/3: Загрузка из GitHub...', 66);
            const siteId = SiteDetector.currentSite?.id || 'unknown';
            const clientId = FreebetCollector.sessionParams?.clientId || 'unknown';
            const filePath = `freebets/${siteId}/${clientId}_${this.accountAlias}.json`;

            let sha = null;
            try {
                const existingFile = await this._getFile(filePath);
                if (existingFile) {
                    sha = existingFile.sha;
                }
            } catch (e) {
                // Файл не существует — создаём новый
            }

            // Этап 3: Сохранение в GitHub (перезапись)
            UIPanel.showProgress('Sync freebets 3/3: Сохранение в GitHub...', 90);
            const stats = FreebetCollector.getStats();
            const commitMessage = `Freebets ${this.accountAlias}: ${stats.active} active, ${stats.totalValueFormatted}`;

            try {
                await this._putFile(filePath, syncData, sha, commitMessage);
            } catch (e) {
                if (e.message === 'SHA_CONFLICT') {
                    console.warn('⚠️ [GitHubSync] SHA conflict, retry...');
                    const freshFile = await this._getFile(filePath);
                    await this._putFile(filePath, syncData, freshFile?.sha || null, commitMessage);
                } else {
                    throw e;
                }
            }

            // Успех
            this.lastSyncResult = {
                success: true,
                date: new Date().toISOString(),
                type: 'freebets',
                activeFreebets: stats.active,
                totalValue: stats.totalValueFormatted
            };

            UIPanel.showProgress(`\u2705 Sync: ${stats.active} \u0444\u0440\u0438\u0431\u0435\u0442\u043E\u0432 \u043D\u0430 ${stats.totalValueFormatted}`, 100);
            console.log(`✅ [GitHubSync] Фрибеты синхронизированы: ${stats.active} активных на ${stats.totalValueFormatted}`);
        },

        // === Sync BetBoom ===
        async syncBetBoom() {
            if (this.isSyncing) {
                console.warn('⚠️ [GitHubSync] Синхронизация уже в процессе');
                return;
            }

            if (!this.isConfigured()) {
                this.showSetupDialog();
                return;
            }

            if (!BetBoomCollector.isCompleted) {
                alert('⚠️ Дождитесь завершения сбора данных BetBoom.');
                return;
            }

            this.isSyncing = true;
            console.log('🔄 [GitHubSync] Начинаем синхронизацию BetBoom...');

            try {
                // Этап 1: Подготовка данных
                UIPanel.showProgress('Sync 1/4: Подготовка данных...', 25);
                const localData = BetBoomCollector.buildExportData();
                if (!localData) {
                    throw new Error('NO_DATA');
                }

                // Этап 2: Загрузка из GitHub
                UIPanel.showProgress('Sync 2/4: Загрузка из GitHub...', 50);
                const filePath = this._buildFilePathBetBoom();
                let remoteData = null;
                let sha = null;

                const file = await this._getFile(filePath);
                if (file) {
                    remoteData = file.content;
                    sha = file.sha;
                }

                // Этап 3: Объединение данных
                UIPanel.showProgress('Sync 3/4: Объединение данных...', 75);
                const { merged, stats: mergeStats } = this._mergeDataBetBoom(remoteData, localData);

                // Этап 4: Сохранение в GitHub
                UIPanel.showProgress('Sync 4/4: Сохранение в GitHub...', 90);
                const commitMessage = sha
                    ? `Update BetBoom ${this.accountAlias}: +${mergeStats.added} new, ${mergeStats.updated} updated`
                    : `Add BetBoom ${this.accountAlias}: ${merged.summary.totalBets} bets, ${merged.summary.totalPayments} payments`;

                try {
                    await this._putFile(filePath, merged, sha, commitMessage);
                } catch (e) {
                    if (e.message === 'SHA_CONFLICT') {
                        console.warn('⚠️ [GitHubSync] SHA conflict, retry...');
                        const freshFile = await this._getFile(filePath);
                        if (freshFile) {
                            const { merged: retryMerged } = this._mergeDataBetBoom(freshFile.content, localData);
                            await this._putFile(filePath, retryMerged, freshFile.sha, commitMessage);
                        } else {
                            await this._putFile(filePath, merged, null, commitMessage);
                        }
                    } else {
                        throw e;
                    }
                }

                // Успех
                this.lastSyncResult = {
                    success: true,
                    date: new Date().toISOString(),
                    type: 'betboom',
                    added: mergeStats.added,
                    updated: mergeStats.updated,
                    totalBets: merged.summary.totalBets,
                    totalPayments: merged.summary.totalPayments
                };

                UIPanel.showProgress(`✅ Sync: +${mergeStats.added} новых, ${mergeStats.updated} обновлено`, 100);
                console.log(`✅ [GitHubSync] BetBoom синхронизация завершена: +${mergeStats.added} новых, ${mergeStats.updated} обновлено`);

            } catch (error) {
                this.lastSyncResult = { success: false, date: new Date().toISOString(), type: 'betboom', error: error.message };

                const messages = {
                    'INVALID_TOKEN': 'Невалидный GitHub токен. Проверьте настройки.',
                    'RATE_LIMIT': 'Превышен лимит GitHub API. Повторите через несколько минут.',
                    'NETWORK_ERROR': 'Ошибка сети. Проверьте подключение.',
                    'TIMEOUT': 'Таймаут запроса. Повторите попытку.',
                    'NO_DATA': 'Нет данных для синхронизации.'
                };

                const msg = messages[error.message] || `Ошибка: ${error.message}`;
                console.error(`❌ [GitHubSync] ${msg}`);
                UIPanel.showProgress(`❌ Sync: ${msg}`, 0);
                alert(`❌ Ошибка синхронизации BetBoom\n\n${msg}`);
            } finally {
                this.isSyncing = false;
            }
        },

        // === Изменение alias ===
        async changeAlias(newAlias) {
            if (!newAlias || !/^[a-zA-Z0-9_]+$/.test(newAlias)) {
                alert('❌ Невалидный alias. Допустимы: латиница, цифры, подчёркивание.');
                return false;
            }

            const oldAlias = this.accountAlias;
            if (newAlias === oldAlias) return true;

            try {
                const existingFile = await this._findExistingFile();

                if (existingFile) {
                    // Скачать, создать новый, удалить старый
                    const file = await this._getFile(existingFile.path);
                    if (!file) throw new Error('Не удалось скачать текущий файл');

                    const updatedContent = { ...file.content, account: { ...file.content.account, alias: newAlias } };
                    const newPath = this._buildFilePath(null).replace(oldAlias, newAlias);

                    // Создаём новый файл
                    await this._putFile(newPath, updatedContent, null, `Rename: ${oldAlias} → ${newAlias}`);

                    // Удаляем старый
                    try {
                        await this._deleteFile(existingFile.path, file.sha, `Rename: ${oldAlias} → ${newAlias} (delete old)`);
                    } catch (delErr) {
                        console.warn('⚠️ [GitHubSync] Не удалось удалить старый файл:', delErr.message);
                    }
                }

                // Обновляем alias локально
                this.saveConfig({ accountAlias: newAlias });
                console.log(`✅ [GitHubSync] Alias изменён: ${oldAlias} → ${newAlias}`);
                return true;
            } catch (error) {
                console.error('❌ [GitHubSync] Ошибка смены alias:', error.message);
                alert(`❌ Ошибка смены alias: ${error.message}`);
                return false;
            }
        },

        // === Тест подключения ===
        async testConnection() {
            try {
                const result = await this._apiRequest('GET', `/repos/${this.repoOwner}/${this.repoName}`);
                if (result.status === 404) return { ok: false, error: 'Репозиторий не найден' };
                return { ok: true, repoName: result.data.full_name, private: result.data.private };
            } catch (e) {
                const messages = {
                    'INVALID_TOKEN': 'Невалидный токен',
                    'NETWORK_ERROR': 'Ошибка сети',
                    'RATE_LIMIT': 'Превышен лимит API'
                };
                return { ok: false, error: messages[e.message] || e.message };
            }
        },

        // === Setup Dialog ===
        showSetupDialog() {
            if (document.getElementById('fc-sync-setup-overlay')) return;

            const overlay = document.createElement('div');
            overlay.id = 'fc-sync-setup-overlay';
            overlay.className = 'fc-settings-overlay open';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeSetupDialog(); });

            const panel = document.createElement('div');
            panel.id = 'fc-sync-setup-panel';
            panel.className = 'fc-settings-panel open';
            panel.innerHTML = `
                <div class="fc-settings-header">
                    <div class="fc-settings-title">🔄 Настройка синхронизации</div>
                    <button class="fc-settings-close" id="fc-sync-setup-close">✕</button>
                </div>
                <div class="fc-settings-body">
                    <div class="fc-settings-section">
                        <div class="fc-settings-section-title">GitHub</div>
                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Personal Access Token</label>
                            <input type="password" class="fc-settings-input" id="sync-token"
                                   placeholder="ghp_... или github_pat_..."
                                   value="${this.token || ''}">
                            <div class="fc-settings-help">Fine-grained PAT с правами Contents: Read and write</div>
                        </div>
                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Repository Owner (username)</label>
                            <input type="text" class="fc-settings-input" id="sync-owner"
                                   placeholder="username"
                                   value="${this.repoOwner || ''}">
                        </div>
                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Repository Name</label>
                            <input type="text" class="fc-settings-input" id="sync-repo"
                                   placeholder="betting-data"
                                   value="${this.repoName || 'betting-data'}">
                        </div>
                    </div>
                    <div class="fc-settings-section">
                        <div class="fc-settings-section-title">Аккаунт</div>
                        <div class="fc-settings-field">
                            <label class="fc-settings-label">Alias (имя аккаунта)</label>
                            <input type="text" class="fc-settings-input" id="sync-alias"
                                   placeholder="Vlad, Sergey..."
                                   value="${this.accountAlias || ''}">
                            <div class="fc-settings-help">Латиница, цифры, подчёркивание. Используется в имени файла.</div>
                        </div>
                    </div>
                    <div class="fc-settings-field">
                        <button class="fc-btn fc-btn-primary" id="fc-sync-test" style="width:100%;margin-bottom:8px;">Проверить подключение</button>
                        <div id="fc-sync-test-result" style="font-size:12px;padding:4px 0;"></div>
                    </div>
                </div>
                <div class="fc-settings-actions">
                    <button class="fc-settings-btn fc-settings-btn-reset" id="fc-sync-cancel">Отмена</button>
                    <button class="fc-settings-btn fc-settings-btn-save" id="fc-sync-save">Сохранить</button>
                </div>
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(panel);

            // Обработчики
            document.getElementById('fc-sync-setup-close').addEventListener('click', () => this._closeSetupDialog());
            document.getElementById('fc-sync-cancel').addEventListener('click', () => this._closeSetupDialog());
            document.getElementById('fc-sync-save').addEventListener('click', () => this._saveSetupDialog());
            document.getElementById('fc-sync-test').addEventListener('click', () => this._testSetupConnection());
        },

        _closeSetupDialog() {
            const overlay = document.getElementById('fc-sync-setup-overlay');
            const panel = document.getElementById('fc-sync-setup-panel');
            if (overlay) overlay.remove();
            if (panel) panel.remove();
        },

        _saveSetupDialog() {
            const token = document.getElementById('sync-token').value.trim();
            const owner = document.getElementById('sync-owner').value.trim();
            const repo = document.getElementById('sync-repo').value.trim();
            const alias = document.getElementById('sync-alias').value.trim();

            // Валидация
            if (!token) { alert('❌ Введите GitHub Token'); return; }
            if (!owner || !/^[a-zA-Z0-9-]+$/.test(owner)) { alert('❌ Невалидный owner'); return; }
            if (!repo || !/^[a-zA-Z0-9_-]+$/.test(repo)) { alert('❌ Невалидное имя репозитория'); return; }
            if (!alias || !/^[a-zA-Z0-9_]+$/.test(alias)) { alert('❌ Невалидный alias (только буквы, цифры, подчёркивание)'); return; }

            this.saveConfig({ token, repoOwner: owner, repoName: repo, accountAlias: alias });
            this._closeSetupDialog();
            alert('✅ Настройки синхронизации сохранены!');
        },

        async _testSetupConnection() {
            const resultDiv = document.getElementById('fc-sync-test-result');
            const token = document.getElementById('sync-token').value.trim();
            const owner = document.getElementById('sync-owner').value.trim();
            const repo = document.getElementById('sync-repo').value.trim();

            if (!token || !owner || !repo) {
                resultDiv.innerHTML = '<span style="color:#f44336;">❌ Заполните Token, Owner и Repo</span>';
                return;
            }

            resultDiv.innerHTML = '<span style="color:#FFD54F;">⏳ Проверка...</span>';

            // Временно устанавливаем значения для теста
            const savedToken = this.token;
            const savedOwner = this.repoOwner;
            const savedName = this.repoName;

            this.token = token;
            this.repoOwner = owner;
            this.repoName = repo;

            const result = await this.testConnection();

            // Восстанавливаем
            this.token = savedToken;
            this.repoOwner = savedOwner;
            this.repoName = savedName;

            if (result.ok) {
                resultDiv.innerHTML = `<span style="color:#4CAF50;">✅ Подключено: ${result.repoName} (${result.private ? 'приватный' : 'публичный'})</span>`;
            } else {
                resultDiv.innerHTML = `<span style="color:#f44336;">❌ ${result.error}</span>`;
            }
        },

        // === Статус для UI ===
        getSyncStatus() {
            if (this.isSyncing) return { state: 'syncing', text: 'Синхронизация...' };
            if (!this.isConfigured()) return { state: 'not_configured', text: 'Sync не настроен' };
            if (this.lastSyncResult) {
                if (this.lastSyncResult.success) {
                    const date = new Date(this.lastSyncResult.date);
                    const formatted = `${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0, 5)}`;
                    if (this.lastSyncResult.type === 'freebets') {
                        return { state: 'success', text: `Sync: ${formatted} (${this.lastSyncResult.activeFreebets} фрибетов)` };
                    }
                    if (this.lastSyncResult.type === 'betboom') {
                        return { state: 'success', text: `Sync: ${formatted} (+${this.lastSyncResult.added}, ${this.lastSyncResult.totalBets} ставок)` };
                    }
                    return { state: 'success', text: `Sync: ${formatted} (+${this.lastSyncResult.added})` };
                }
                return { state: 'error', text: `Ошибка: ${this.lastSyncResult.error}` };
            }
            if (!AppState.isCollectionCompleted) {
                const pageType = getCurrentPageType();
                if (pageType === 'bonuses') {
                    if (FreebetCollector.isLoaded) {
                        return { state: 'ready', text: 'Готов к Sync' };
                    }
                    return { state: 'waiting', text: 'Загрузка фрибетов...' };
                }
                return { state: 'waiting', text: 'Ожидание сбора данных...' };
            }
            return { state: 'ready', text: 'Готов к Sync' };
        }
    };

    // ИНИЦИАЛИЗАЦИЯ

    let _initCalled = false;
    function init() {
        if (_initCalled) return;
        _initCalled = true;
        // Защита от повторного запуска (Tampermonkey может инжектить скрипт дважды)
        const gw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (gw._fcInitialized) return;
        gw._fcInitialized = true;
        console.log(`\n${'='.repeat(60)}`);
        logger.info(`🎰 Collector v${VERSION}`);
        logger.info(`${'='.repeat(60)}\n`);

        SiteDetector.detect();

        const pageType = getCurrentPageType();

        UIPanel.init(AppState);
        SettingsManager.init();
        GitHubSync.init();

        if (pageType === 'bonuses') {
            // Страница фрибетов: инициализируем FreebetCollector
            FreebetCollector.init();

            // Создаём UI панель
            UIPanel.create();

            // Экспорт в unsafeWindow для консольного доступа
            const exportTarget = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            exportTarget.collector = {
                version: VERSION,
                site: SiteDetector.getSiteName(),
                siteDetector: SiteDetector,
                state: AppState,
                freebetCollector: FreebetCollector,
                settingsManager: SettingsManager,
                githubSync: GitHubSync,
                syncFreebets: () => GitHubSync.syncFreebets(),
                changeAlias: (alias) => GitHubSync.changeAlias(alias),
                uiPanel: UIPanel,
                URL_PATTERNS: URL_PATTERNS
            };

            logger.info('✅ Collector инициализирован (Freebets mode)');
            console.log('📝 Доступ из консоли: window.collector');
            console.log('📝 Синхронизация: collector.syncFreebets()\n');

        } else if (pageType === 'betboom') {
            // Страница BetBoom: инициализируем BetBoomCollector
            UIPanel.create();
            BetBoomCollector.init();

            // Экспорт в unsafeWindow для консольного доступа
            const exportTarget = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            exportTarget.collector = {
                version: VERSION,
                site: SiteDetector.getSiteName(),
                siteDetector: SiteDetector,
                state: AppState,
                betBoomCollector: BetBoomCollector,
                settingsManager: SettingsManager,
                githubSync: GitHubSync,
                sync: () => GitHubSync.syncBetBoom(),
                changeAlias: (alias) => GitHubSync.changeAlias(alias),
                exportData: () => UIPanel._exportBetBoom(),
                uiPanel: UIPanel
            };

            logger.info('✅ Collector инициализирован (BetBoom mode)');
            console.log('📝 Доступ из консоли: window.collector');
            console.log('📝 Синхронизация: collector.sync()\n');

        } else {
            // Страница операций: инициализируем все модули
            XHRInterceptor.init(AppState);
            ExportModule.init(AppState);
            OperationsCollector.init();
            BetsDetailsFetcher.init();
            SegmentMapper.init();

            // Создаём UI панель
            UIPanel.create();

            // Экспорт в unsafeWindow для консольного доступа
            const exportTarget = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            exportTarget.collector = {
                version: VERSION,
                site: SiteDetector.getSiteName(),
                siteDetector: SiteDetector,
                state: AppState,
                interceptor: XHRInterceptor,
                operationsCollector: OperationsCollector,
                betsDetailsFetcher: BetsDetailsFetcher,
                settingsManager: SettingsManager,
                githubSync: GitHubSync,
                segmentMapper: SegmentMapper,
                exportOperations: () => ExportModule.exportOperations(),
                fetchBetsDetails: () => OperationsCollector._autoLoadBetsDetails(),
                sync: () => GitHubSync.sync(),
                changeAlias: (alias) => GitHubSync.changeAlias(alias),
                uiPanel: UIPanel,
                URL_PATTERNS: URL_PATTERNS
            };

            // Экспорт данных через DOM для DevTools доступа
            const panel = document.getElementById('fonbet-collector-panel');
            if (panel) {
                const updatePanelData = () => {
                    const stats = OperationsCollector.getStats();
                    const detailsStats = BetsDetailsFetcher.getStats();
                    panel.setAttribute('data-fc-version', VERSION);
                    panel.setAttribute('data-fc-stats', JSON.stringify({
                        ...stats,
                        details: detailsStats
                    }));
                };

                // Обновляем данные сразу и каждые 500мс
                updatePanelData();
                setInterval(updatePanelData, 500);
            }

            logger.info('✅ Collector инициализирован');
            console.log('📝 Доступ из консоли: window.collector\n');

            // Автозапуск сбора операций на странице операций
            if (pageType === 'operations') {
                console.log('🚀 [AutoStart] Страница операций обнаружена - автозапуск сбора...');
                setTimeout(() => {
                    XHRInterceptor.start();
                    OperationsCollector.start();
                    UIPanel.showProgress('Этап 1: Сбор операций...', 0);
                    console.log('✅ [AutoStart] Сбор операций запущен автоматически');
                }, 1000);
            }
        }

        logger.info(`${'='.repeat(60)}\n`);
    }

    // РАННЯЯ инициализация: патчим fetch/XHR сразу (до загрузки страницы)
    function earlyInit() {
        console.log('🚀 [EarlyInit] Патчинг API перед загрузкой страницы...');

        // Сохраняем оригиналы
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        const originalFetch = unsafeWindow.fetch;

        XHRInterceptor.originalXHROpen = originalXHROpen;
        XHRInterceptor.originalXHRSend = originalXHRSend;
        XHRInterceptor.originalFetch = originalFetch;

        // Патчим fetch API сразу
        unsafeWindow.fetch = async function(url, options = {}) {
            const urlString = typeof url === 'string' ? url : url.url;

            if (urlString && (URL_PATTERNS.LAST_OPERATIONS.test(urlString) || URL_PATTERNS.PREV_OPERATIONS.test(urlString))) {
                const isLastOperations = URL_PATTERNS.LAST_OPERATIONS.test(urlString);

                try {
                    const response = await originalFetch.apply(this, arguments);
                    const clone = response.clone();

                    clone.json().then(data => {
                        if (OperationsCollector.isCollecting) {
                            OperationsCollector.handleOperationsResponse(data, isLastOperations, options.body, urlString);
                        } else {
                            if (!window._collectorCachedOperations) window._collectorCachedOperations = [];
                            window._collectorCachedOperations.push({ data, isLastOperations, requestBody: options.body, requestUrl: urlString });
                        }
                    }).catch(error => {
                        console.error('❌ [EarlyInit/Fetch] JSON parse error:', error);
                    });

                    return response;
                } catch (error) {
                    console.error('❌ [EarlyInit/Fetch] Ошибка перехвата:', error);
                    throw error;
                }
            }

            return originalFetch.apply(this, arguments);
        };

        // Патчим XHR тоже для операций
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._fc_url = url;
            this._fc_method = method;
            return originalXHROpen.apply(this, [method, url, ...args]);
        };

        XMLHttpRequest.prototype.send = function(...args) {
            if (this._fc_url && (URL_PATTERNS.LAST_OPERATIONS.test(this._fc_url) || URL_PATTERNS.PREV_OPERATIONS.test(this._fc_url))) {
                const isLastOperations = URL_PATTERNS.LAST_OPERATIONS.test(this._fc_url);
                this._fc_requestBody = args[0];

                this.addEventListener('load', function() {
                    try {
                        if (this.status >= 200 && this.status < 300) {
                            const data = JSON.parse(this.responseText);
                            if (OperationsCollector.isCollecting) {
                                OperationsCollector.handleOperationsResponse(data, isLastOperations, this._fc_requestBody, this._fc_url);
                            } else {
                                if (!window._collectorCachedOperations) window._collectorCachedOperations = [];
                                window._collectorCachedOperations.push({ data, isLastOperations, requestBody: this._fc_requestBody, requestUrl: this._fc_url });
                            }
                        }
                    } catch (error) {
                        console.error('❌ [EarlyInit/XHR] Ошибка обработки:', error);
                    }
                });
            }

            return originalXHRSend.apply(this, args);
        };

        XHRInterceptor.isFetchPatched = true;
        XHRInterceptor.isPatched = true;

        console.log('✅ [EarlyInit] XHR + fetch API пропатчены до загрузки страницы');
    }

    // Запускаем раннюю инициализацию немедленно
    earlyInit();

    // Запуск полной инициализации при загрузке DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
