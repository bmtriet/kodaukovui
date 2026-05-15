import base64
import json
import queue
import subprocess
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox
import uuid

from pynput import keyboard

from ai_runtime import (
    SOURCE_SEPARATOR,
    build_ai_prompt_first_turn,
    build_image_question_prompt,
    build_smart_action_prompt,
    call_ai_with_image,
    call_ai_with_text,
    initialize_ai_clients,
    load_brain_context,
)
from app_paths import get_app_dir, get_resource_path, get_user_data_path
from platform_adapter import create_platform_adapter
from settings_store import (
    AI_PROMPT_ID,
    IMAGE_ASK_ID,
    load_builtin_actions,
    load_settings,
    load_smart_actions,
)


BUNDLE_DIR = get_resource_path()
USER_DATA_DIR = get_app_dir()
ENV_FILE = Path(get_user_data_path(".env"))
SMART_ACTIONS_FILE = Path(get_user_data_path("smart_actions.json"))
HISTORY_FILE = Path(get_user_data_path("history.json"))
LEARNED_FILE = Path(get_user_data_path("learned.json"))
HISTORY_LIMIT = 1000

controller = keyboard.Controller()
PLATFORM = create_platform_adapter(controller=controller, debug=False)

gemini_client = None
openai_client = None
AI_PROVIDER = "gemini"
GEMINI_API_KEY = ""
GEMINI_MODEL = "gemini-2.5-flash-lite"
OPENAI_API_KEY = ""
OPENAI_MODEL = "gpt-4o-mini"
OPENAI_API_BASE = "https://api.openai.com/v1"
HOTKEY_POPUP = "<ctrl>+'"
UI_LANGUAGE = "en"
DEBUG = False
SMART_ACTIONS = []
BUILTIN_ACTIONS = []
RUNTIME_SETTINGS = {}
is_processing = False


class WebviewBrokerClient:
    def __init__(self):
        self.process = None
        self.lock = threading.Lock()
        self.responses: dict[str, queue.Queue] = {}
        self.stdout_thread = None
        self.stderr_thread = None

    def _build_broker_command(self):
        if getattr(sys, "frozen", False):
            return [sys.executable, "--webview-broker"]
        return [sys.executable, str(BUNDLE_DIR / "webview_host.py"), "--broker"]

    def _read_stdout(self):
        assert self.process and self.process.stdout
        for line in self.process.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            request_id = data.get("request_id")
            if not request_id:
                continue
            response_queue = self.responses.get(request_id)
            if response_queue:
                response_queue.put(data.get("payload"))

    def _read_stderr(self):
        assert self.process and self.process.stderr
        for line in self.process.stderr:
            line = line.rstrip()
            if line:
                print(f"[WEBVIEW BROKER] {line}")

    def start(self):
        with self.lock:
            if self.process and self.process.poll() is None:
                return True

            try:
                self.process = subprocess.Popen(
                    self._build_broker_command(),
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                )
            except Exception as exc:
                print(f"[WEBVIEW BROKER] Không khởi động được broker: {exc}")
                self.process = None
                return False

            self.stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
            self.stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
            self.stdout_thread.start()
            self.stderr_thread.start()
            return True

    def request(self, page: str, ui_lang: str, payload: dict | None = None, timeout: float = 300.0):
        if not self.start():
            return None

        request_id = uuid.uuid4().hex
        response_queue: queue.Queue = queue.Queue(maxsize=1)
        self.responses[request_id] = response_queue
        message = {
            "request_id": request_id,
            "page": page,
            "ui_lang": ui_lang,
            "payload": payload,
        }

        try:
            assert self.process and self.process.stdin
            self.process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
            self.process.stdin.flush()
        except Exception as exc:
            self.responses.pop(request_id, None)
            print(f"[WEBVIEW BROKER] Gửi request thất bại: {exc}")
            return None

        try:
            result = response_queue.get(timeout=timeout)
        except queue.Empty:
            print(f"[WEBVIEW BROKER] Timeout khi chờ response cho page '{page}'.")
            result = None
        finally:
            self.responses.pop(request_id, None)
        return result

    def stop(self):
        with self.lock:
            if not self.process:
                return
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            finally:
                self.process = None


WEBVIEW_BROKER = WebviewBrokerClient()


def load_history():
    if not HISTORY_FILE.exists():
        return []
    try:
        with HISTORY_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Lỗi đọc file history: {e}")
        return []


def load_learned():
    if not LEARNED_FILE.exists():
        return {}
    try:
        with LEARNED_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Lỗi đọc file learned: {e}")
        return {}


def save_history(original, result, user_edit=False):
    history = load_history()
    history.append({"original": original, "result": result, "user_edit": user_edit})

    if len(history) > HISTORY_LIMIT:
        history = history[-HISTORY_LIMIT:]

    with HISTORY_FILE.open("w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=4)


def run_learning_mode():
    print("\n--- Đang chạy Learning Mode ---")
    history = load_history()
    learned = load_learned()

    count = 0
    for item in history:
        if item.get("user_edit") is True:
            orig = item.get("original", "").strip()
            res = item.get("result", "").strip()
            if orig and res and (orig not in learned or learned[orig] != res):
                learned[orig] = res
                count += 1

    with LEARNED_FILE.open("w", encoding="utf-8") as f:
        json.dump(learned, f, ensure_ascii=False, indent=4)

    print(f"Hoàn tất! Đã cập nhật {count} mẫu mới từ người dùng vào {LEARNED_FILE}.\n")


def get_brain_context() -> str:
    return load_brain_context(USER_DATA_DIR, BUNDLE_DIR)


def build_aux_command(flag: str, *args: str):
    if getattr(sys, "frozen", False):
        return [sys.executable, flag, *args]
    script_path = BUNDLE_DIR / "roi_capture.py"
    return [sys.executable, str(script_path), *args]


def build_webview_command(page: str, ui_lang: str, payload: dict | None = None):
    command = [sys.executable, "--webview", page, ui_lang]
    if payload is not None:
        command.append(json.dumps(payload, ensure_ascii=False))
    if getattr(sys, "frozen", False):
        return command
    return [sys.executable, str(BUNDLE_DIR / "webview_host.py"), page, ui_lang] + command[4:]


def apply_runtime_settings(settings: dict, smart_actions: list[dict], builtin_actions: list[dict]):
    global RUNTIME_SETTINGS, AI_PROVIDER, GEMINI_API_KEY, GEMINI_MODEL, OPENAI_API_KEY
    global OPENAI_MODEL, OPENAI_API_BASE, HOTKEY_POPUP, UI_LANGUAGE, DEBUG, SMART_ACTIONS, BUILTIN_ACTIONS

    RUNTIME_SETTINGS = settings
    AI_PROVIDER = settings["AI_PROVIDER"]
    GEMINI_API_KEY = settings["GEMINI_API_KEY"]
    GEMINI_MODEL = settings["GEMINI_MODEL"]
    OPENAI_API_KEY = settings["OPENAI_API_KEY"]
    OPENAI_MODEL = settings["OPENAI_MODEL"]
    OPENAI_API_BASE = settings["OPENAI_API_BASE"]
    HOTKEY_POPUP = PLATFORM.normalize_hotkey(settings["HOTKEY_POPUP"])
    UI_LANGUAGE = settings["UI_LANGUAGE"]
    DEBUG = settings["DEBUG"]
    PLATFORM.debug = DEBUG
    SMART_ACTIONS = smart_actions
    BUILTIN_ACTIONS = builtin_actions


def initialize_runtime_clients(require_api_key: bool = False) -> bool:
    global gemini_client, openai_client
    gemini_client, openai_client = initialize_ai_clients(RUNTIME_SETTINGS)

    if gemini_client or openai_client:
        return True

    if require_api_key:
        print("[WARN] Chưa cấu hình API Key. Mở popup rồi bấm gear để vào Settings.")
    return False


def reload_runtime_settings(rebuild_listener: bool = False) -> None:
    settings = load_settings(ENV_FILE)
    builtin_actions = load_builtin_actions(ENV_FILE)
    smart_actions = load_smart_actions(SMART_ACTIONS_FILE, builtin_actions=builtin_actions)
    apply_runtime_settings(settings, smart_actions, builtin_actions)
    initialize_runtime_clients(require_api_key=False)
    if rebuild_listener:
        HOTKEY_MANAGER.rebuild()


def run_webview_page(page: str, ui_lang: str, payload: dict | None = None):
    started_at = time.perf_counter()
    broker_result = WEBVIEW_BROKER.request(page, ui_lang, payload)
    if broker_result is not None:
        if DEBUG:
            print(f"[DEBUG] Webview broker {page} latency: {time.perf_counter() - started_at:.3f}s")
        if isinstance(broker_result, dict) and broker_result.get("type") == "cancel":
            return None
        return broker_result

    result = subprocess.run(
        build_webview_command(page, ui_lang, payload),
        capture_output=True,
        text=True,
    )
    if result.stderr.strip():
        print(f"[WEBVIEW {page.upper()}] {result.stderr.strip()}")

    output = result.stdout.strip()
    if result.returncode != 0 or not output:
        return None

    if DEBUG:
        print(f"[DEBUG] Webview subprocess {page} latency: {time.perf_counter() - started_at:.3f}s")

    try:
        return json.loads(output)
    except json.JSONDecodeError:
        return output


def run_roi_capture():
    result = subprocess.run(
        build_aux_command("--roi-capture"),
        capture_output=True,
        text=True,
    )
    if result.stderr.strip():
        print(f"[ROI] {result.stderr.strip()}")
    if result.returncode != 0 or not result.stdout.strip():
        print(f"[ROI] ROI capture exited with code {result.returncode}.")
        return None
    try:
        data = json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        return None

    image_base64 = data.get("image_base64")
    if not image_base64:
        return None

    return {
        "source": data.get("source", "roi_screenshot"),
        "mime_type": data.get("mime_type", "image/png"),
        "image_bytes": base64.b64decode(image_base64),
        "size": data.get("size"),
        "region": data.get("region"),
    }


def get_builtin_action_by_id(action_id: str):
    for action in BUILTIN_ACTIONS:
        if action["id"] == action_id:
            return action
    return None


def find_action_by_id(action_id: str):
    for action in SMART_ACTIONS:
        if action["id"] == action_id:
            return action
    return None


def show_ask_window(title: str, placeholder: str, response_mode_enabled: bool = False):
    data = run_webview_page(
        "ask",
        UI_LANGUAGE,
        {
            "title": title,
            "placeholder": placeholder,
            "responseModeEnabled": response_mode_enabled,
            "defaultResponseMode": "paste",
        },
    )
    if isinstance(data, dict):
        return {
            "prompt": str(data.get("prompt", "") or "").strip(),
            "response_mode": str(data.get("response_mode", "paste") or "paste").strip().lower(),
        }
    return None


def call_text_once(prompt: str) -> str:
    return call_ai_with_text(RUNTIME_SETTINGS, gemini_client, openai_client, prompt)


def call_image_once(question_prompt: str, image_payload: dict) -> str:
    return call_ai_with_image(RUNTIME_SETTINGS, gemini_client, openai_client, question_prompt, image_payload)


def capture_image_context():
    clipboard_payload, clipboard_error = PLATFORM.get_clipboard_image()
    if clipboard_error:
        return None, clipboard_error

    if clipboard_payload:
        source_choice = choose_image_source()
        if source_choice == "clipboard":
            return clipboard_payload, None
        if source_choice == "roi":
            roi_payload = run_roi_capture()
            if roi_payload:
                return roi_payload, None
            return None, "[HỦY] Người dùng đã hủy ROI capture."
        return None, "[HỦY] Người dùng đã hủy chọn nguồn ảnh."

    roi_payload = run_roi_capture()
    if roi_payload:
        return roi_payload, None

    return None, "[HỦY] Không có ảnh clipboard và người dùng đã hủy ROI capture."


def choose_image_source():
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update_idletasks()
    result = messagebox.askyesnocancel(
        "Ask by Image",
        "Clipboard đang có ảnh.\n\nYes: dùng ảnh clipboard\nNo: vẽ ROI trên màn hình\nCancel: hủy",
        parent=root,
    )
    root.destroy()
    if result is True:
        return "clipboard"
    if result is False:
        return "roi"
    return None


def serialize_image_payload(image_payload: dict | None):
    if not image_payload:
        return None
    return {
        "source": image_payload.get("source", "roi_screenshot"),
        "mime_type": image_payload.get("mime_type", "image/png"),
        "image_base64": base64.b64encode(image_payload["image_bytes"]).decode("ascii"),
        "size": image_payload.get("size"),
        "region": image_payload.get("region"),
    }


def run_chat_window(session_payload: dict):
    result = run_webview_page("chat", UI_LANGUAGE, session_payload)
    if isinstance(result, dict) and result.get("type") == "chat_inserted":
        print("[CHAT] Đã chèn phản hồi mới nhất vào ứng dụng đích.")
    elif isinstance(result, dict) and result.get("type") == "chat_closed":
        print("[CHAT] Đã đóng cửa sổ chat.")


def on_text_action_activate(action_id, pre_selected_text=None, target_window_id=None):
    global is_processing
    if is_processing:
        return
    is_processing = True

    try:
        action = find_action_by_id(action_id)
        if not action:
            print(f"[LỖI] Không tìm thấy smart action: {action_id}")
            return

        print(f"\n[HOTKEY] Đang xử lý smart action: {action['name']}...")

        if pre_selected_text is not None:
            selected_text = pre_selected_text
        else:
            selected_text, selection_error = PLATFORM.get_selected_text(target_window_id=target_window_id)
            if selection_error:
                print(selection_error)
                return
            if not selected_text:
                print("[LỖI] Không có văn bản nào để xử lý (chưa bôi đen và clipboard cũng trống).")
                return

        if DEBUG:
            print(f"[DEBUG] Văn bản gốc: {selected_text}")

        extra_instruction = ""
        if action.get("ask_before_run"):
            ask_result = show_ask_window(
                action["name"],
                "Nhập yêu cầu bổ sung cho action này...",
                response_mode_enabled=False,
            )
            if ask_result is None:
                print(f"[HỦY] Đã hủy smart action: {action['name']}.")
                return
            extra_instruction = ask_result["prompt"]

        prompt = build_smart_action_prompt(get_brain_context(), selected_text, action["prompt"], extra_instruction)
        result_text = call_text_once(prompt)

        if DEBUG:
            print(f"[DEBUG] Văn bản kết quả: {result_text}")

        if action.get("return_with_source"):
            result_text = f"{result_text}{SOURCE_SEPARATOR}{selected_text}"

        if target_window_id:
            PLATFORM.restore_focus(target_window_id)

        paste_error = PLATFORM.paste_processed_text(
            result_text,
            action_type="smart_action",
            target_window_id=target_window_id,
        )
        if paste_error:
            print(paste_error)
            return

        save_history(selected_text, result_text, user_edit=False)
        print(f"[THÀNH CÔNG] Đã hoàn tất {action['name']}!")
    except Exception as ex:
        print(f"\n[LỖI NGHIÊM TRỌNG] Đã xảy ra lỗi trong quá trình xử lý hotkey: {ex}")
    finally:
        is_processing = False


def on_ai_prompt_activate(pre_selected_text=None, target_window_id=None):
    global is_processing
    if is_processing:
        return
    is_processing = True

    try:
        builtin_action = get_builtin_action_by_id(AI_PROMPT_ID)
        if not builtin_action:
            print("[LỖI] Không tìm thấy built-in AI Prompt.")
            return

        print(f"\n[HOTKEY] Đang xử lý built-in action: {builtin_action['name']}...")

        if pre_selected_text is not None:
            selected_text = pre_selected_text
        else:
            selected_text, selection_error = PLATFORM.get_selected_text(target_window_id=target_window_id)
            if selection_error:
                print(selection_error)
                return
            if not selected_text:
                print("[LỖI] Không có văn bản được chọn hoặc trong clipboard.")
                return

        ask_result = show_ask_window(
            builtin_action["name"],
            "Nhập yêu cầu của bạn cho đoạn văn bản này...",
            response_mode_enabled=True,
        )
        if ask_result is None or not ask_result["prompt"].strip():
            print("[HỦY] Đã hủy AI Prompt.")
            return

        if ask_result["response_mode"] == "chat":
            run_chat_window(
                {
                    "session": {
                        "kind": AI_PROMPT_ID,
                        "title": builtin_action["name"],
                        "target_window_id": target_window_id,
                        "selected_text": selected_text,
                        "initial_user_prompt": ask_result["prompt"].strip(),
                        "messages": [],
                        "latest_reply": "",
                    }
                }
            )
            return

        prompt = build_ai_prompt_first_turn(get_brain_context(), selected_text, ask_result["prompt"].strip())
        result_text = call_text_once(prompt)

        if target_window_id:
            PLATFORM.restore_focus(target_window_id)

        paste_error = PLATFORM.paste_processed_text(
            result_text,
            action_type="smart_action",
            target_window_id=target_window_id,
        )
        if paste_error:
            print(paste_error)
            return

        save_history(selected_text, result_text, user_edit=False)
        print(f"[THÀNH CÔNG] Đã hoàn tất {builtin_action['name']}!")
    except Exception as ex:
        print(f"\n[LỖI NGHIÊM TRỌNG] Đã xảy ra lỗi trong quá trình xử lý AI Prompt: {ex}")
    finally:
        is_processing = False


def on_image_action_activate(target_window_id=None):
    global is_processing
    if is_processing:
        return
    is_processing = True

    try:
        builtin_action = get_builtin_action_by_id(IMAGE_ASK_ID)
        if not builtin_action:
            print("[LỖI] Không tìm thấy built-in Ask by Image.")
            return

        print(f"\n[HOTKEY] Đang xử lý built-in action: {builtin_action['name']}...")

        image_payload, image_error = capture_image_context()
        if image_error:
            print(image_error)
            return
        if not image_payload:
            print("[LỖI] Không lấy được image context.")
            return

        if DEBUG:
            print(
                f"[DEBUG] Image source: {image_payload['source']}, "
                f"size={image_payload.get('size')}, region={image_payload.get('region')}"
            )

        ask_result = show_ask_window(
            builtin_action["name"],
            "Nhập câu hỏi cho hình ảnh này...",
            response_mode_enabled=True,
        )
        if ask_result is None or not ask_result["prompt"].strip():
            print("[HỦY] Đã hủy action hỏi bằng hình ảnh.")
            return

        if ask_result["response_mode"] == "chat":
            run_chat_window(
                {
                    "session": {
                        "kind": IMAGE_ASK_ID,
                        "title": builtin_action["name"],
                        "target_window_id": target_window_id,
                        "image_payload": serialize_image_payload(image_payload),
                        "initial_user_prompt": ask_result["prompt"].strip(),
                        "messages": [],
                        "latest_reply": "",
                    }
                }
            )
            return

        question_prompt = build_image_question_prompt(get_brain_context(), ask_result["prompt"].strip())
        result_text = call_image_once(question_prompt, image_payload)

        if DEBUG:
            print(f"[DEBUG] Văn bản kết quả từ image action: {result_text}")

        if target_window_id:
            PLATFORM.restore_focus(target_window_id)

        paste_error = PLATFORM.paste_processed_text(
            result_text,
            action_type="smart_action",
            target_window_id=target_window_id,
        )
        if paste_error:
            print(paste_error)
            return

        save_history(f"[image:{image_payload['source']}] {ask_result['prompt'].strip()}", result_text, user_edit=False)
        print(f"[THÀNH CÔNG] Đã hoàn tất {builtin_action['name']}!")
    except Exception as ex:
        print(f"\n[LỖI NGHIÊM TRỌNG] Đã xảy ra lỗi trong quá trình xử lý image action: {ex}")
    finally:
        is_processing = False


def show_settings_window() -> bool:
    result = run_webview_page("settings", UI_LANGUAGE)
    return isinstance(result, dict) and result.get("type") == "settings_saved"


def show_popup_menu():
    global is_processing
    if is_processing:
        return
    is_processing = True

    target_window_id = PLATFORM.get_current_active_window()

    try:
        result = run_webview_page("popup", UI_LANGUAGE)
        if not result:
            is_processing = False
            return

        if isinstance(result, dict) and result.get("type") == "open_settings":
            is_processing = False
            if show_settings_window():
                reload_runtime_settings(rebuild_listener=True)
                print("[SETTINGS] Đã lưu cấu hình mới và áp dụng ngay.")
            return

        choice = result.get("action_id") if isinstance(result, dict) else str(result)
        if not choice:
            is_processing = False
            return

        if choice == IMAGE_ASK_ID:
            is_processing = False
            threading.Thread(target=on_image_action_activate, args=(target_window_id,), daemon=True).start()
            return

        if choice == AI_PROMPT_ID:
            selected_text, selection_error = PLATFORM.get_selected_text(target_window_id=target_window_id)
            if selection_error:
                print(selection_error)
                is_processing = False
                return
            if not selected_text:
                print("[LỖI] Không có văn bản được chọn hoặc trong clipboard.")
                is_processing = False
                return

            is_processing = False
            threading.Thread(
                target=on_ai_prompt_activate,
                args=(selected_text, target_window_id),
                daemon=True,
            ).start()
            return

        selected_text, selection_error = PLATFORM.get_selected_text(target_window_id=target_window_id)
        if selection_error:
            print(selection_error)
            is_processing = False
            return
        if not selected_text:
            print("[LỖI] Không có văn bản được chọn hoặc trong clipboard.")
            is_processing = False
            return

        is_processing = False
        threading.Thread(
            target=on_text_action_activate,
            args=(choice, selected_text, target_window_id),
            daemon=True,
        ).start()
    except Exception as e:
        print(f"Lỗi popup: {e}")
        is_processing = False


def activate_popup():
    threading.Thread(target=show_popup_menu, daemon=True).start()


class HotkeyListenerManager:
    def __init__(self):
        self.listener = None
        self.lock = threading.Lock()

    def rebuild(self):
        with self.lock:
            if self.listener is not None:
                self.listener.stop()
                self.listener.join(timeout=1)
                self.listener = None

            if not HOTKEY_POPUP:
                print("[HOTKEY] HOTKEY_POPUP đang trống, không đăng ký listener.")
                return

            try:
                self.listener = keyboard.GlobalHotKeys({HOTKEY_POPUP: activate_popup})
                self.listener.start()
                print(f"[HOTKEY] Listener sẵn sàng với popup hotkey: {HOTKEY_POPUP}")
            except Exception as e:
                print(f"[LỖI] Không thể đăng ký popup hotkey '{HOTKEY_POPUP}': {e}")
                self.listener = None

    def stop(self):
        with self.lock:
            if self.listener is not None:
                self.listener.stop()
                self.listener.join(timeout=1)
                self.listener = None


HOTKEY_MANAGER = HotkeyListenerManager()


def print_startup_banner():
    text_actions_summary = ", ".join(f"{action['hotkey']}={action['name']}" for action in SMART_ACTIONS)
    builtin_summary = ", ".join(f"{action['hotkey']}={action['name']}" for action in BUILTIN_ACTIONS)
    popup_summary = ", ".join(part for part in [text_actions_summary, builtin_summary] if part)

    print("=" * 60)
    print("KoDauKoVui background service started")
    print(f"Provider       : {AI_PROVIDER}")
    print(f"Popup hotkey   : {HOTKEY_POPUP}")
    print(f"Popup keys     : {popup_summary}")
    print(f"UI language    : {UI_LANGUAGE}")
    if not (gemini_client or openai_client):
        print("[WARN] Chưa có API key hợp lệ. Mở popup rồi bấm gear để cấu hình.")
    print("=" * 60)


def run_log_loop():
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nĐang thoát ứng dụng...")
    finally:
        HOTKEY_MANAGER.stop()
        WEBVIEW_BROKER.stop()


def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "--learn":
            run_learning_mode()
            return
        if sys.argv[1] == "--webview":
            from webview_host import run_webview_host

            page = sys.argv[2] if len(sys.argv) > 2 else "ask"
            ui_lang = sys.argv[3] if len(sys.argv) > 3 else UI_LANGUAGE
            payload = None
            if len(sys.argv) > 4:
                try:
                    payload = json.loads(sys.argv[4])
                except json.JSONDecodeError:
                    payload = None
            run_webview_host(page=page, ui_lang=ui_lang, payload=payload)
            return
        if sys.argv[1] == "--webview-broker":
            from webview_host import run_webview_broker

            run_webview_broker()
            return
        if sys.argv[1] == "--roi-capture":
            from roi_capture import run_roi_capture

            run_roi_capture()
            return

    reload_runtime_settings(rebuild_listener=False)
    WEBVIEW_BROKER.start()
    HOTKEY_MANAGER.rebuild()
    print_startup_banner()
    run_log_loop()


if __name__ == "__main__":
    main()
