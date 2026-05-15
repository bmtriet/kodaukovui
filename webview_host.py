import json
import os
import sys
import urllib.parse

import webview
from dotenv import set_key

from app_paths import get_resource_path, get_user_data_path
from platform_adapter import create_platform_adapter
from settings_store import (
    load_settings_snapshot,
    save_settings,
    save_smart_actions,
    validate_settings_payload,
    validate_smart_actions_payload,
)


def emit_and_exit(payload, exit_code=0):
    print(json.dumps(payload), flush=True)
    if len(webview.windows) > 0:
        webview.windows[0].destroy()
    sys.exit(exit_code)


class Api:
    def submitAsk(self, prompt):
        emit_and_exit({"prompt": str(prompt or "").strip()})

    def cancelAsk(self):
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(1)

    def submitPopup(self, action_id):
        emit_and_exit({"type": "popup_action", "action_id": action_id})

    def cancelPopup(self):
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(1)

    def openSettings(self):
        emit_and_exit({"type": "open_settings"})

    def setUiLanguage(self, lang):
        try:
            set_key(env_file, "UI_LANGUAGE", lang)
            return True
        except Exception as e:
            print(f"Error saving language: {e}", flush=True)
            return False

    def getSettingsSnapshot(self):
        return load_settings_snapshot(env_file, actions_file)

    def saveSettingsSnapshot(self, payload):
        try:
            data = json.loads(payload) if isinstance(payload, str) else payload
            settings_payload = data.get("settings", {})
            actions_payload = data.get("smart_actions", [])
            normalized_settings = validate_settings_payload(settings_payload)
            normalized_actions = validate_smart_actions_payload(actions_payload)
            save_settings(env_file, normalized_settings)
            save_smart_actions(actions_file, normalized_actions)
            return {
                "ok": True,
                "settings": normalized_settings,
                "smart_actions": normalized_actions,
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def closeSettings(self, saved=False):
        if saved:
            emit_and_exit({"type": "settings_saved"})
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(1)


env_file = str(get_user_data_path(".env"))
actions_file = str(get_user_data_path("smart_actions.json"))


def run_webview_host(page="ask", ui_lang="en", payload=None):
    api = Api()
    platform_adapter = create_platform_adapter(controller=None)

    if os.name != "nt":
        os.environ.setdefault("PYWEBVIEW_GUI", "qt")

    html_path = get_resource_path("webui", "dist", "index.html").resolve()
    query = {"page": page, "uilang": ui_lang}
    if payload:
        query["payload"] = json.dumps(payload, ensure_ascii=False)
    url = f"file://{html_path}?{urllib.parse.urlencode(query)}"

    if page == "ask":
        width, height, title = 620, 320, "KoDauKoVui"
    elif page == "settings":
        width, height, title = 980, 780, "KoDauKoVui Settings"
    else:
        width, height, title = 420, 520, "Chọn chức năng"

    active_screen = None
    mouse_pos = platform_adapter.get_mouse_position()
    if mouse_pos:
        mx, my = mouse_pos
        for s in webview.screens:
            if s.x <= mx < (s.x + s.width) and s.y <= my < (s.y + s.height):
                active_screen = s
                break

    window_options = {
        "width": width,
        "height": height,
        "resizable": False,
        "screen": active_screen,
    }

    if page == "ask":
        window_options.update(
            {
                "frameless": False,
                "transparent": False,
                "easy_drag": True,
            }
        )
    else:
        window_options.update(
            {
                "frameless": True,
                "transparent": True,
                "easy_drag": False,
            }
        )

    if active_screen:
        webview.create_window(title, url, js_api=api, **window_options)
    else:
        window_options.pop("screen", None)
        webview.create_window(title, url, js_api=api, **window_options)

    webview.start()


if __name__ == "__main__":
    page = "ask"
    ui_lang = "en"
    payload = None
    if len(sys.argv) > 1:
        page = sys.argv[1]
    if len(sys.argv) > 2:
        ui_lang = sys.argv[2]
    if len(sys.argv) > 3:
        try:
            payload = json.loads(sys.argv[3])
        except json.JSONDecodeError:
            payload = None
    run_webview_host(page=page, ui_lang=ui_lang, payload=payload)
