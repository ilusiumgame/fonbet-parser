"""
Скрипт для запуска профиля Octo Browser с портом отладки для Chrome DevTools MCP
"""
import requests
import sys

# Конфигурация
API_TOKEN = "33818ecfe9e545fb88f3b7b8e679d44d"
PROFILE_UUID = "99d99d59f2424cb8b424171bfd84a403"
DEBUG_PORT = 9222

def stop_profile():
    """Остановить профиль"""
    headers = {"X-API-Token": API_TOKEN}
    url = "http://localhost:58888/api/profiles/stop"
    payload = {"uuid": PROFILE_UUID}

    try:
        print("Остановка профиля...")
        requests.post(url, headers=headers, json=payload, timeout=15)
        print("✓ Профиль остановлен")
        return True
    except:
        return False

def start_profile():
    """Запустить профиль с портом отладки"""
    headers = {"X-API-Token": API_TOKEN}
    url = "http://localhost:58888/api/profiles/start"
    payload = {
        "uuid": PROFILE_UUID,
        "debug_port": DEBUG_PORT
    }

    try:
        print(f"Запуск профиля с портом отладки {DEBUG_PORT}...")
        response = requests.post(url, headers=headers, json=payload, timeout=15)

        if response.status_code == 200:
            data = response.json()
            print(f"\n✓ Профиль запущен!")
            print(f"  WebSocket: {data.get('ws_endpoint', 'N/A')}")
            print(f"  Debug Port: {data.get('debug_port', 'N/A')}")
            return True
        elif response.status_code == 400:
            print("Профиль уже запущен. Останавливаю и перезапускаю...")
            stop_profile()
            import time
            time.sleep(2)
            return start_profile()
        else:
            print(f"Ошибка: {response.text}")
            return False
    except Exception as e:
        print(f"Ошибка: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "stop":
        stop_profile()
    else:
        start_profile()
