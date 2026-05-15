import base64
import json
import os
import queue
import shutil
import sys
import threading
import urllib.parse
from dataclasses import dataclass

import webview
from dotenv import set_key

from ai_runtime import (
    build_ai_prompt_first_turn,
    build_image_question_prompt,
    call_ai_chat_turn,
    initialize_ai_clients,
    load_brain_context,
)
from app_paths import get_app_dir, get_resource_path, get_user_data_path
from platform_adapter import create_platform_adapter
from settings_store import (
    load_settings,
    load_settings_snapshot,
    save_builtin_actions,
    save_settings,
    save_smart_actions,
    validate_builtin_actions_payload,
    validate_settings_payload,
    validate_smart_actions_payload,
)


POPUP_PAGE = "popup"
ASK_PAGE = "ask"
SETTINGS_PAGE = "settings"
CHAT_PAGE = "chat"


def emit_and_exit(payload, exit_code=0):
    print(json.dumps(payload), flush=True)
    if len(webview.windows) > 0:
        webview.windows[0].destroy()
    sys.exit(exit_code)


def deserialize_image_payload(payload):
    if not payload:
        return None
    image_base64 = payload.get("image_base64")
    if not image_base64:
        return None
    return {
        "source": payload.get("source", "roi_screenshot"),
        "mime_type": payload.get("mime_type", "image/png"),
        "image_bytes": base64.b64decode(image_base64),
        "size": payload.get("size"),
        "region": payload.get("region"),
    }


def serialize_session(session):
    if not session:
        return None
    public_session = {
        "kind": session["kind"],
        "title": session.get("title", ""),
        "messages": list(session.get("messages", [])),
        "latest_reply": session.get("latest_reply", ""),
        "context_hint": session.get("context_hint", ""),
    }
    if session.get("selected_text"):
        public_session["selected_text"] = session["selected_text"]
    if session.get("image_payload"):
        public_session["image_payload"] = {
            "source": session["image_payload"].get("source"),
            "mime_type": session["image_payload"].get("mime_type"),
            "size": session["image_payload"].get("size"),
            "region": session["image_payload"].get("region"),
        }
    return public_session


def configure_linux_input_method(debug: bool) -> None:
    os.environ.setdefault("PYWEBVIEW_GUI", "qt")

    qt_im = os.environ.get("QT_IM_MODULE", "").strip()
    gtk_im = os.environ.get("GTK_IM_MODULE", "").strip()
    xmods = os.environ.get("XMODIFIERS", "").strip()

    preferred_module = ""
    if qt_im:
        preferred_module = qt_im
    elif gtk_im:
        preferred_module = gtk_im
    elif shutil.which("fcitx5-remote") or shutil.which("fcitx-remote"):
        preferred_module = "fcitx"
    else:
        preferred_module = "ibus"

    os.environ.setdefault("QT_IM_MODULE", preferred_module)
    os.environ.setdefault("GTK_IM_MODULE", preferred_module)

    if not xmods:
        if preferred_module.startswith("fcitx"):
            os.environ["XMODIFIERS"] = "@im=fcitx"
        else:
            os.environ["XMODIFIERS"] = "@im=ibus"

    if debug:
        print(
            "[WEBVIEW IME] "
            f"QT_IM_MODULE={os.environ.get('QT_IM_MODULE', '')} "
            f"GTK_IM_MODULE={os.environ.get('GTK_IM_MODULE', '')} "
            f"XMODIFIERS={os.environ.get('XMODIFIERS', '')} "
            f"fcitx5={'yes' if shutil.which('fcitx5-remote') else 'no'} "
            f"fcitx={'yes' if shutil.which('fcitx-remote') else 'no'} "
            f"ibus={'yes' if shutil.which('ibus-daemon') else 'no'}",
            file=sys.stderr,
            flush=True,
        )


env_file = str(get_user_data_path(".env"))
actions_file = str(get_user_data_path("smart_actions.json"))


def load_current_settings():
    return load_settings(env_file)


def build_ui_url(page="ask", ui_lang="en", payload=None):
    html_path = get_resource_path("webui", "dist", "index.html").resolve()
    query = {"page": page, "uilang": ui_lang}
    if payload:
        query["payload"] = json.dumps(payload, ensure_ascii=False)
    return f"file://{html_path}?{urllib.parse.urlencode(query)}"


def resolve_window_config(page: str):
    if page == ASK_PAGE:
        return {"width": 720, "height": 430, "title": "KoDauKoVui", "resizable": False}
    if page == CHAT_PAGE:
        return {"width": 900, "height": 760, "title": "KoDauKoVui Chat", "resizable": True}
    if page == SETTINGS_PAGE:
        return {"width": 980, "height": 780, "title": "KoDauKoVui Settings", "resizable": False}
    return {"width": 420, "height": 560, "title": "Chọn chức năng", "resizable": False}


class PageApi:
    def __init__(self, page_name: str, platform_adapter):
        self.page_name = page_name
        self.platform_adapter = platform_adapter
        self.bundle_dir = get_resource_path()
        self.user_data_dir = get_app_dir()
        self.request_id = None
        self.payload = {}
        self.settings = load_current_settings()
        self.brain_ctx = load_brain_context(self.user_data_dir, self.bundle_dir)
        self.gemini_client, self.openai_client = initialize_ai_clients(self.settings)
        self.chat_session = None
        self.response_sink = None
        self.window = None

    def attach(self, window, response_sink):
        self.window = window
        self.response_sink = response_sink

    def begin_request(self, request_id: str, payload: dict | None):
        self.request_id = request_id
        self.payload = payload or {}
        self.settings = load_current_settings()
        self.brain_ctx = load_brain_context(self.user_data_dir, self.bundle_dir)
        self.gemini_client, self.openai_client = initialize_ai_clients(self.settings)
        if self.page_name == CHAT_PAGE:
            self.chat_session = self._build_chat_session(self.payload.get("session", {}))
        else:
            self.chat_session = None

    def _emit(self, payload):
        if not self.response_sink or not self.request_id:
            return
        self.response_sink(self.request_id, payload)

    def _hide_window(self):
        if self.window:
            try:
                self.window.hide()
            except Exception:
                pass

    def _build_chat_session(self, raw_session):
        kind = str(raw_session.get("kind", "") or "").strip()
        selected_text = str(raw_session.get("selected_text", "") or "").strip()
        image_payload = deserialize_image_payload(raw_session.get("image_payload"))
        context_hint = (
            "Using selected text as the discussion context."
            if kind == "ai_prompt"
            else "Using the captured image as the discussion context."
        )
        return {
            "kind": kind,
            "title": str(raw_session.get("title", "Chat") or "Chat"),
            "target_window_id": raw_session.get("target_window_id"),
            "selected_text": selected_text,
            "image_payload": image_payload,
            "initial_user_prompt": str(raw_session.get("initial_user_prompt", "") or "").strip(),
            "messages": list(raw_session.get("messages", [])),
            "latest_reply": str(raw_session.get("latest_reply", "") or "").strip(),
            "context_hint": context_hint,
        }

    def submitAsk(self, prompt, response_mode="paste"):
        self._emit(
            {
                "prompt": str(prompt or "").strip(),
                "response_mode": str(response_mode or "paste").strip().lower() or "paste",
            }
        )
        self._hide_window()

    def cancelAsk(self):
        self._emit({"type": "cancel"})
        self._hide_window()

    def submitPopup(self, action_id):
        self._emit({"type": "popup_action", "action_id": action_id})
        self._hide_window()

    def cancelPopup(self):
        self._emit({"type": "cancel"})
        self._hide_window()

    def openSettings(self):
        self._emit({"type": "open_settings"})
        self._hide_window()

    def setUiLanguage(self, lang):
        try:
            set_key(env_file, "UI_LANGUAGE", lang)
            return True
        except Exception as e:
            print(f"Error saving language: {e}", file=sys.stderr, flush=True)
            return False

    def getSettingsSnapshot(self):
        return load_settings_snapshot(env_file, actions_file)

    def saveSettingsSnapshot(self, payload):
        try:
            data = json.loads(payload) if isinstance(payload, str) else payload
            settings_payload = data.get("settings", {})
            actions_payload = data.get("smart_actions", [])
            builtin_payload = data.get("builtin_actions", [])
            normalized_settings = validate_settings_payload(settings_payload)
            normalized_builtins = validate_builtin_actions_payload(builtin_payload)
            normalized_actions = validate_smart_actions_payload(actions_payload, builtin_actions=normalized_builtins)
            save_settings(env_file, normalized_settings)
            save_builtin_actions(env_file, normalized_builtins)
            save_smart_actions(actions_file, normalized_actions, builtin_actions=normalized_builtins)
            return {
                "ok": True,
                "settings": normalized_settings,
                "builtin_actions": normalized_builtins,
                "smart_actions": normalized_actions,
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def closeSettings(self, saved=False):
        self._emit({"type": "settings_saved" if saved else "cancel"})
        self._hide_window()

    def getChatState(self):
        return {"ok": True, "session": serialize_session(self.chat_session)}

    def bootstrapChat(self):
        try:
            if not self.chat_session:
                return {"ok": False, "error": "Chat session is not available."}
            if self.chat_session["messages"]:
                return {"ok": True, "session": serialize_session(self.chat_session)}

            initial_prompt = self.chat_session["initial_user_prompt"].strip()
            if not initial_prompt:
                return {"ok": False, "error": "Initial prompt is empty."}

            if self.chat_session["kind"] == "ai_prompt":
                initial_prompt = build_ai_prompt_first_turn(
                    self.brain_ctx,
                    self.chat_session["selected_text"],
                    initial_prompt,
                )
            else:
                initial_prompt = build_image_question_prompt(self.brain_ctx, initial_prompt)

            self.chat_session["messages"].append({"role": "user", "content": initial_prompt})
            reply = call_ai_chat_turn(
                self.settings,
                self.gemini_client,
                self.openai_client,
                self.chat_session,
                "",
            )
            self.chat_session["messages"].append({"role": "assistant", "content": reply})
            self.chat_session["latest_reply"] = reply
            return {"ok": True, "session": serialize_session(self.chat_session)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sendChatMessage(self, prompt):
        try:
            if not self.chat_session:
                return {"ok": False, "error": "Chat session is not available."}
            text = str(prompt or "").strip()
            if not text:
                return {"ok": False, "error": "Message is empty."}

            self.chat_session["messages"].append({"role": "user", "content": text})
            reply = call_ai_chat_turn(
                self.settings,
                self.gemini_client,
                self.openai_client,
                self.chat_session,
                "",
            )
            self.chat_session["messages"].append({"role": "assistant", "content": reply})
            self.chat_session["latest_reply"] = reply
            return {"ok": True, "session": serialize_session(self.chat_session)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def insertLatestReply(self):
        try:
            if not self.chat_session or not self.chat_session.get("latest_reply"):
                return {"ok": False, "error": "No assistant reply to insert."}
            target_window_id = self.chat_session.get("target_window_id")
            if target_window_id:
                self.platform_adapter.restore_focus(target_window_id)
            error = self.platform_adapter.paste_processed_text(
                self.chat_session["latest_reply"],
                action_type="smart_action",
                target_window_id=target_window_id,
            )
            if error:
                return {"ok": False, "error": error}
            self._emit({"type": "chat_inserted"})
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def closeChat(self):
        self._emit({"type": "chat_closed"})
        self._hide_window()


@dataclass
class BrokerRequest:
    request_id: str
    page: str
    ui_lang: str
    payload: dict | None


class BrokerState:
    def __init__(self, debug: bool = False):
        self.debug = debug
        self.platform_adapter = create_platform_adapter(controller=None, debug=debug)
        self.requests: "queue.Queue[BrokerRequest]" = queue.Queue()
        self.windows: dict[str, webview.Window] = {}
        self.apis: dict[str, PageApi] = {}

    def emit_response(self, request_id: str, payload: dict):
        line = {"request_id": request_id, "payload": payload}
        print(json.dumps(line, ensure_ascii=False), flush=True)

    def attach_window(self, page: str, window: webview.Window, api: PageApi):
        self.windows[page] = window
        self.apis[page] = api
        api.attach(window, self.emit_response)
        window.events.closing += lambda _window=None, page_name=page: self.on_window_closing(page_name)

    def on_window_closing(self, page_name: str):
        api = self.apis.get(page_name)
        if not api:
            return False
        if page_name == POPUP_PAGE:
            api.cancelPopup()
        elif page_name == SETTINGS_PAGE:
            api.closeSettings(False)
        elif page_name == CHAT_PAGE:
            api.closeChat()
        else:
            api.cancelAsk()
        return False

    def run_command_loop(self):
        def reader():
            for raw in sys.stdin:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                request = BrokerRequest(
                    request_id=str(data["request_id"]),
                    page=str(data["page"]),
                    ui_lang=str(data.get("ui_lang", "en")),
                    payload=data.get("payload"),
                )
                self.requests.put(request)

        threading.Thread(target=reader, daemon=True).start()

        while True:
            request = self.requests.get()
            self.show_request(request)

    def _resolve_screen(self):
        mouse_pos = self.platform_adapter.get_mouse_position()
        if mouse_pos:
            mx, my = mouse_pos
            for screen in webview.screens:
                if screen.x <= mx < (screen.x + screen.width) and screen.y <= my < (screen.y + screen.height):
                    return screen
        return webview.screens[0] if webview.screens else None

    def _move_window(self, window: webview.Window, width: int, height: int):
        screen = self._resolve_screen()
        if not screen:
            return
        x = int(screen.x + max((screen.width - width) / 2, 0))
        y = int(screen.y + max((screen.height - height) / 2, 0))
        window.move(x, y)

    def show_request(self, request: BrokerRequest):
        page = request.page
        window = self.windows[page]
        api = self.apis[page]
        api.begin_request(request.request_id, request.payload)
        config = resolve_window_config(page)
        url = build_ui_url(page, request.ui_lang, request.payload)
        try:
            window.hide()
        except Exception:
            pass
        try:
            window.resize(config["width"], config["height"])
        except Exception:
            pass
        self._move_window(window, config["width"], config["height"])
        window.load_url(url)
        window.show()
        try:
            window.restore()
        except Exception:
            pass


def create_broker_windows(state: BrokerState):
    popup_api = PageApi(POPUP_PAGE, state.platform_adapter)
    ask_api = PageApi(ASK_PAGE, state.platform_adapter)
    settings_api = PageApi(SETTINGS_PAGE, state.platform_adapter)
    chat_api = PageApi(CHAT_PAGE, state.platform_adapter)

    popup = webview.create_window(
        "KoDauKoVui Popup",
        html="<html><body></body></html>",
        js_api=popup_api,
        width=420,
        height=560,
        hidden=True,
        frameless=True,
        transparent=True,
        easy_drag=False,
        resizable=False,
        on_top=True,
    )
    ask = webview.create_window(
        "KoDauKoVui Ask",
        html="<html><body></body></html>",
        js_api=ask_api,
        width=720,
        height=430,
        hidden=True,
        frameless=False,
        transparent=False,
        easy_drag=False,
        resizable=False,
    )
    settings = webview.create_window(
        "KoDauKoVui Settings",
        html="<html><body></body></html>",
        js_api=settings_api,
        width=980,
        height=780,
        hidden=True,
        frameless=False,
        transparent=False,
        easy_drag=False,
        resizable=False,
    )
    chat = webview.create_window(
        "KoDauKoVui Chat",
        html="<html><body></body></html>",
        js_api=chat_api,
        width=900,
        height=760,
        hidden=True,
        frameless=False,
        transparent=False,
        easy_drag=False,
        resizable=True,
    )

    state.attach_window(POPUP_PAGE, popup, popup_api)
    state.attach_window(ASK_PAGE, ask, ask_api)
    state.attach_window(SETTINGS_PAGE, settings, settings_api)
    state.attach_window(CHAT_PAGE, chat, chat_api)


def run_webview_broker():
    settings = load_current_settings()
    if os.name != "nt":
        configure_linux_input_method(settings.get("DEBUG", False))
    state = BrokerState(debug=settings.get("DEBUG", False))
    create_broker_windows(state)
    webview.start(func=state.run_command_loop, debug=settings.get("DEBUG", False))


def run_webview_host(page="ask", ui_lang="en", payload=None):
    settings = load_current_settings()
    if os.name != "nt":
        configure_linux_input_method(settings.get("DEBUG", False))

    platform_adapter = create_platform_adapter(controller=None, debug=settings.get("DEBUG", False))
    api = PageApi(page, platform_adapter)
    api.begin_request("oneshot", payload)
    url = build_ui_url(page, ui_lang, payload)
    config = resolve_window_config(page)

    active_screen = None
    mouse_pos = platform_adapter.get_mouse_position()
    if mouse_pos:
        mx, my = mouse_pos
        for s in webview.screens:
            if s.x <= mx < (s.x + s.width) and s.y <= my < (s.y + s.height):
                active_screen = s
                break

    window_options = {
        "width": config["width"],
        "height": config["height"],
        "resizable": config["resizable"],
        "screen": active_screen,
    }

    if page == POPUP_PAGE:
        window_options.update(
            {
                "frameless": True,
                "transparent": True,
                "easy_drag": False,
                "on_top": True,
            }
        )
    else:
        window_options.update(
            {
                "frameless": False,
                "transparent": False,
                "easy_drag": False,
            }
        )

    if active_screen:
        window = webview.create_window(config["title"], url, js_api=api, **window_options)
    else:
        window_options.pop("screen", None)
        window = webview.create_window(config["title"], url, js_api=api, **window_options)

    api.attach(window, lambda _request_id, payload: emit_and_exit(payload))
    webview.start(debug=settings.get("DEBUG", False))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--broker":
        run_webview_broker()
        sys.exit(0)

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
