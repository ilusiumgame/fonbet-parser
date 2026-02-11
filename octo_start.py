"""
Скрипт для запуска профиля Octo Browser с портом отладки для Chrome DevTools MCP
"""
import os
import requests
import sys
from dotenv import load_dotenv

load_dotenv()

# Конфигурация из .env или переменных окружения
API_TOKEN = os.environ.get("OCTO_API_TOKEN", "")
PROFILE_UUID = os.environ.get("OCTO_PROFILE_UUID", "")
DEBUG_PORT = int(os.environ.get("OCTO_DEBUG_PORT", "9222"))

if not API_TOKEN or not PROFILE_UUID:
    print("Ошибка: задайте OCTO_API_TOKEN и OCTO_PROFILE_UUID в .env или переменных окружения")
    sys.exit(1)

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
