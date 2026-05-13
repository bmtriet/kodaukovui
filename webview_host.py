import sys
import json
import webview

from dotenv import set_key

from app_paths import get_resource_path, get_user_data_path
from platform_adapter import create_platform_adapter

class Api:
    def submitQa(self, prompt, lang, length="medium", append_question=False):
        print(json.dumps({"prompt": prompt, "lang": lang, "length": length, "append_question": append_question}), flush=True)
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(0)

    def cancelQa(self):
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(1)

    def submitPopup(self, action, targetLang=""):
        print(action, flush=True)
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(0)

    def cancelPopup(self):
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(1)

    def setUiLanguage(self, lang):
        try:
            set_key(env_file, "UI_LANGUAGE", lang)
            return True
        except Exception as e:
            print(f"Error saving language: {e}", flush=True)
            return False


env_file = str(get_user_data_path(".env"))


def run_webview_host(page="qa", ui_lang="en"):
    api = Api()
    platform_adapter = create_platform_adapter(controller=None)

    html_path = get_resource_path("webui", "dist", "index.html").resolve()
    url = f"file://{html_path}?page={page}&uilang={ui_lang}"

    width = 600 if page == "qa" else 350
    height = 250 if page == "qa" else 450
    title = "KoDauKoVui" if page == "qa" else "Chọn chức năng"

    active_screen = None
    mouse_pos = platform_adapter.get_mouse_position()
    if mouse_pos:
        mx, my = mouse_pos
        for s in webview.screens:
            if s.x <= mx < (s.x + s.width) and s.y <= my < (s.y + s.height):
                active_screen = s
                break

    if active_screen:
        webview.create_window(title, url, js_api=api, width=width, height=height, resizable=False, frameless=True, transparent=True, easy_drag=False, screen=active_screen)
    else:
        webview.create_window(title, url, js_api=api, width=width, height=height, resizable=False, frameless=True, transparent=True, easy_drag=False)

    webview.start()


if __name__ == '__main__':
    page = "qa"
    ui_lang = "en"
    if len(sys.argv) > 1:
        page = sys.argv[1]
    if len(sys.argv) > 2:
        ui_lang = sys.argv[2]
    run_webview_host(page=page, ui_lang=ui_lang)
