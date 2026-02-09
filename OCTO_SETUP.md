# Octo Browser + Chrome DevTools MCP

Chrome DevTools MCP подключается к Octo Browser через remote debugging на порту **9222**.

---

## Быстрый старт

```bash
# Запуск профиля с портом отладки
python octo_start.py

# Остановка профиля
python octo_start.py stop
```

### Альтернатива: обычный Chrome

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### Проверка подключения

```bash
# Проверить что порт слушает
netstat -ano | grep 9222

# Проверить статус MCP серверов
claude mcp list
```

Должно показать: `chrome-devtools: Connected`

---

## Конфигурация

**Debug Port:** `9222`
**API Token:** `33818ecfe9e545fb88f3b7b8e679d44d`

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

`--browserUrl=http://127.0.0.1:9222` указывает MCP подключаться к существующему браузеру, а не создавать временный профиль.

---

## Как это работает

1. `octo_start.py` запускает профиль через Octo Browser Local API
2. Профиль запускается с портом отладки 9222
3. Chrome DevTools MCP автоматически подключается к порту 9222
4. Теперь можно использовать MCP инструменты для автоматизации браузера

---

## Переключение между профилями

### Шаг 1: Получить UUID нужного профиля

В Octo Browser:
1. Найдите профиль в списке
2. Нажмите ... (три точки) или ПКМ
3. Скопируйте UUID профиля

### Шаг 2: Обновить скрипт запуска

Откройте `octo_start.py` и измените:

```python
PROFILE_UUID = "ваш-новый-uuid-профиля"
```

### Шаг 3: Запустить профиль

```bash
python octo_start.py
```

### Важно

- **Один профиль за раз**: MCP подключается к порту 9222, одновременно может работать только один профиль
- **Перезапуск**: При переключении профилей сначала остановите текущий: `python octo_start.py stop`

---

## Доступные MCP инструменты

### Навигация
- `list_pages` - список открытых вкладок
- `select_page` - выбрать активную вкладку
- `new_page` / `close_page` - открыть/закрыть вкладку
- `navigate_page` - перейти по URL (или back/forward/reload)

### Отладка и анализ
- `take_snapshot` - текстовый снимок страницы (accessibility tree)
- `take_screenshot` - скриншот страницы или элемента
- `evaluate_script` - выполнить JavaScript на странице
- `list_console_messages` / `get_console_message` - логи консоли
- `list_network_requests` / `get_network_request` - сетевые запросы

### Взаимодействие с элементами
- `click`, `hover`, `drag` - клик, наведение, перетаскивание
- `fill`, `fill_form` - заполнение полей
- `press_key` - нажатие клавиш
- `upload_file` - загрузка файла

### Другое
- `emulate` - эмуляция устройства, сети, геолокации
- `resize_page` - изменить размер окна
- `handle_dialog` - обработать alert/confirm/prompt
- `wait_for` - ждать появления текста
- `performance_start_trace` / `performance_stop_trace` - трейсинг

---

## Решение проблем

### Порт 9222 уже занят
```bash
netstat -ano | grep 9222
powershell -Command "Stop-Process -Id <PID> -Force"
```

### Octo Browser не запускается из-за прокси
В `settings.json` добавить исключения:
```json
"NO_PROXY": "127.0.0.1,localhost",
"no_proxy": "127.0.0.1,localhost"
```

### MCP сервер не подключается
```bash
claude mcp list
# Если не работает - перезапустить Claude CLI
```
