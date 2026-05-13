import sys
import json
import webview
import os

page = "qa"
if len(sys.argv) > 1:
    page = sys.argv[1]

html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "webui", "dist", "index.html"))
url = f"file://{html_path}?page={page}"

class Api:
    def submitQa(self, prompt, lang):
        print(json.dumps({"prompt": prompt, "lang": lang}), flush=True)
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(0)

    def cancelQa(self):
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(1)

    def submitPopup(self, action):
        print(action, flush=True)
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(0)

    def cancelPopup(self):
        if len(webview.windows) > 0:
            webview.windows[0].destroy()
        sys.exit(1)

if __name__ == '__main__':
    api = Api()
    
    width = 600 if page == "qa" else 350
    height = 250 if page == "qa" else 450
    title = "KoDauKoVui" if page == "qa" else "Chọn chức năng"

    window = webview.create_window(title, url, js_api=api, width=width, height=height, resizable=False, frameless=True, transparent=True)
    webview.start()
