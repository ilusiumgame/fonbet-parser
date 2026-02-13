# TODO: Fonbet & Pari & BetBoom Collector v2.9.0

Мультисайтовый сбор данных с fon.bet, pari.ru и betboom.ru.

---

## Активные задачи

### TD-2: Найти быстрые ставки для BetBoom
**Приоритет:** Средний

BetBoom не имеет явного поля "быстрые ставки" в API. Проверить:
- [ ] Поле `bet_type` в ответе `/api/access/bets_history/get`
- [ ] Документация BetBoom API
- [ ] Сравнение с Fonbet operationId 760, 764

---

### TD-1: Проверить бонусы без marker на fonbet
**Приоритет:** Низкий

Фикс v2.2.3 (`saldo_{saldoId}` fallback) подтверждён на pari.ru (2 бонусные группы). На fonbet проверено 12 аккаунтов — `bonus: 0` на всех. Проверить при появлении бонусов на аккаунте fonbet.

---

## Завершённые задачи

### F-6.3: BetBoom — оставшиеся пробелы относительно Fonbet/Pari

**Статус:** выполнено (1, 2, 3 готовы).

**1. Help-диалог + тултипы**
Приоритет: Высокий (быстро, заметно)

- [x] Help-модалка вместо alert() — контент зависит от pageType (operations/bonuses/betboom)
- [x] BetBoom-специфичный текст (автозапуск, /lobby/betshistory, /lobby/paymentshistory)
- [x] Консольные команды в help для всех сайтов
- [x] Тултипы на всех кнопках панели

**2. Кастомный префикс экспорта**
Приоритет: Средний

- [x] Использовать `settings.exportPrefix` в `ExportModule.exportBetBoom()` (как в Fonbet/Pari)

**3. Фрибет-баланс BetBoom**
Приоритет: Средний

- [x] Реализовать сбор фрибет-баланса через WebSocket `wss://ws.betboom.ru:444/api/accounting_ws/v1`
- [x] Перехват WebSocket в earlyInit (GIB антибот не проверяет WebSocket)
- [x] Отображение баланса в UI панели (3 stats: период, пользователь, фрибет-баланс)

---

## Будущие задачи

### F-1: SegmentMapper — автодополнение маппингов
**Приоритет:** Средний

Сейчас 60% разрешение (3049 из ~5000 segmentId). `coupon/info` содержит только `sportName` и `eventName`, но **не содержит названия лиги**.

**Варианты:**
- [ ] Исследовать Fonbet API — endpoint для информации о сегменте по `segmentId`
- [ ] Парсинг страницы события — извлечь название лиги из DOM
- [ ] Внешний API спортивных данных

---

### F-4: Быстрые ставки (760, 764)
**Приоритет:** Низкий

Детали недоступны через `coupon/info`. На тестовых аккаунтах fastBets: 0.

- [ ] Проверить альтернативные endpoints
- [ ] Проверить данные при клике на быструю ставку на странице

---

### F-5: Уведомления о завершении сбора
**Приоритет:** Средний

При 3000+ ставках загрузка деталей занимает ~5 минут.

- [ ] `Notification.requestPermission()` при первом запуске
- [ ] `new Notification()` при завершении `_autoLoadBetsDetails()`

---

## Известные ограничения

1. **Быстрые ставки (760, 764)** — детали недоступны через coupon/info

---

## Завершённые фазы

<details>
<summary>Фазы 1–25 (v1.15.x → v2.8.2) — нажмите чтобы развернуть</summary>

| Фаза | Версия | Описание |
|------|--------|----------|
| 1 | v1.15.x | Исправление BetsDetailsFetcher — marker вместо regId |
| 2 | v1.15.x | Автоматизация — автозапуск сбора и загрузки деталей |
| 3 | v1.15.x | Оптимизация — exponential backoff (500ms→8s) |
| 4–4.5 | v1.15.x | Чистка — удалены AutoOpener, ProfileManager, SettingsModal, Mode slider (-58%) |
| 5 | v1.15.x | Экспорт JSON v2.1 — detailsLoaded/Failed/Skipped |
| 6–6.4 | v1.15.x | UI, панель настроек, баг-фиксы, endpoint пагинации |
| 7 | v2.0.0 | Мультисайт — SiteDetector, fon.bet + pari.ru |
| 8 | v2.0.1 | Cleanup мёртвого кода (-277 строк) |
| 9 | v2.1.0 | GitHubSync — инкрементальная синхронизация с GitHub |
| 10 | v2.1.1 | Cleanup — EventBus, VERSION константа, устаревшие комментарии |
| 11 | v2.1.1 | UI-фиксы, base64 UTF-8 decode, пагинация initial completed:true |
| 12 | v2.1.1 | Фикс nextOperations — 8282 операции вместо 200 |
| 13 | v2.1.1 | Git Blob API fallback для файлов > 1MB |
| 14 | v2.1.1 | SegmentMapper — подстановка названий лиг по segmentId |
| 15 | v2.1.1 | Баг-фиксы: повторный старт, sync status, UI настроек |
| 16 | v2.2.0 | FreebetCollector — сбор фрибетов с /bonuses |
| 16.1 | v2.2.1–2 | Баг-фиксы FreebetCollector (showProgress, syncStatus, кнопка Обновить) |
| 17 | v2.2.3 | Pari-совместимость: localStorage `pb.*`, бонусы без marker |
| 18 | v2.3.0 | Auto-sync после сбора + объединённый sync freebets |
| 19 | v2.4.0 | BetBoom: сбор ставок и платежей, экспорт, GitHub sync |
| 20 | v2.5.0 | BetBoom parity: категоризация ставок, структурированный экспорт, обогащённый UI |
| 21 | v2.6.0 | Help-модалка, тултипы на кнопках, BetBoom export prefix |
| 22 | v2.7.0 | UI рефакторинг: единый шаблон, toggle-кнопка, advanced settings, ExportModule.exportBetBoom (-173 строки) |
| 23 | v2.8.0 | Визуальная унификация UI — toggle-кнопка для всех режимов, прогресс-бар для BetBoom, no auto-start |
| 24 | v2.8.1 | Табы Операции/Фрибеты на Fonbet/Pari, визуальная унификация layout (6-item grid для всех режимов) |
| 25 | v2.8.2 | BetBoom фрибет-баланс через WebSocket interception (wss://ws.betboom.ru:444/api/accounting_ws/v1) |
| 26 | v2.9.0 | Универсальная поддержка страниц (@match *) + табы для всех сайтов + унифицированные stats (4+3) |

</details>
