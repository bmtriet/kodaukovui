import base64
import json
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import messagebox
from pathlib import Path

from google import genai
import openai
from pynput import keyboard

from app_paths import get_resource_path, get_user_data_path
from platform_adapter import create_platform_adapter
from settings_store import BUILTIN_POPUP_ACTIONS, load_settings, load_smart_actions


BUNDLE_DIR = get_resource_path()
ENV_FILE = Path(get_user_data_path(".env"))
SMART_ACTIONS_FILE = Path(get_user_data_path("smart_actions.json"))
HISTORY_FILE = Path(get_user_data_path("history.json"))
LEARNED_FILE = Path(get_user_data_path("learned.json"))
HISTORY_LIMIT = 1000
SOURCE_SEPARATOR = "\n\n---\nSource:\n"
IMAGE_ASK_ID = "image_ask"

client = None
openai_client = None
controller = keyboard.Controller()
PLATFORM = create_platform_adapter(controller=controller, debug=False)

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
RUNTIME_SETTINGS = {}
is_processing = False


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


def load_brain_context():
    brain_path = get_user_data_path("brain.md")
    if not brain_path.exists():
        brain_path = get_resource_path("brain.md")
    if brain_path.exists():
        with open(brain_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            marker = "[Nhập thông tin ngữ cảnh của bạn vào bên dưới dòng này]"
            if marker in content:
                content = content.split(marker)[-1].strip()
            if content:
                return f"[AI BRAIN CONTEXT]\n{content}\n[END CONTEXT]"
    return ""


def build_text_prompt(selected_text: str, action: dict, extra_instruction: str = "") -> str:
    sections = []
    brain_ctx = load_brain_context().strip()
    if brain_ctx:
        sections.append(brain_ctx)

    sections.append(action["prompt"].strip())

    if extra_instruction.strip():
        sections.append(
            f"[ADDITIONAL USER INSTRUCTION]\n{extra_instruction.strip()}\n[END ADDITIONAL USER INSTRUCTION]"
        )

    sections.append(
        "Hãy làm theo đúng hướng dẫn ở trên. Nếu không có yêu cầu khác trong prompt, chỉ trả về kết quả cuối cùng."
    )
    sections.append(f"[SELECTED TEXT]\n{selected_text}\n[END SELECTED TEXT]")
    return "\n\n".join(section for section in sections if section)


def build_image_question_prompt(question: str) -> str:
    sections = []
    brain_ctx = load_brain_context().strip()
    if brain_ctx:
        sections.append(brain_ctx)
    sections.append(
        "Bạn là trợ lý AI phân tích hình ảnh. Hãy trả lời câu hỏi của người dùng dựa trên ảnh được cung cấp."
    )
    sections.append(f"[USER QUESTION]\n{question.strip()}\n[END USER QUESTION]")
    return "\n\n".join(section for section in sections if section)


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


def apply_runtime_settings(settings: dict, smart_actions: list[dict]):
    global RUNTIME_SETTINGS, AI_PROVIDER, GEMINI_API_KEY, GEMINI_MODEL, OPENAI_API_KEY
    global OPENAI_MODEL, OPENAI_API_BASE, HOTKEY_POPUP, UI_LANGUAGE, DEBUG, SMART_ACTIONS

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


def initialize_ai_clients(require_api_key: bool = False) -> bool:
    global client, openai_client

    client = (
        genai.Client(api_key=GEMINI_API_KEY)
        if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_token_here"
        else None
    )
    openai_client = (
        openai.OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_API_BASE)
        if OPENAI_API_KEY and OPENAI_API_KEY != "your_openai_api_key_here"
        else None
    )

    if client or openai_client:
        return True

    if require_api_key:
        print("[WARN] Chưa cấu hình API Key. Mở popup rồi bấm gear để vào Settings.")
    return False


def reload_runtime_settings(rebuild_listener: bool = False) -> None:
    settings = load_settings(ENV_FILE)
    smart_actions = load_smart_actions(SMART_ACTIONS_FILE)
    apply_runtime_settings(settings, smart_actions)
    initialize_ai_clients(require_api_key=False)
    if rebuild_listener:
        HOTKEY_MANAGER.rebuild()


def run_webview_page(page: str, ui_lang: str, payload: dict | None = None):
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
    for action in BUILTIN_POPUP_ACTIONS:
        if action["id"] == action_id:
            return action
    return None


def find_action_by_id(action_id: str):
    for action in SMART_ACTIONS:
        if action["id"] == action_id:
            return action
    return None


def show_ask_window(title: str, placeholder: str):
    data = run_webview_page(
        "ask",
        UI_LANGUAGE,
        {
            "title": title,
            "placeholder": placeholder,
        },
    )
    if isinstance(data, dict):
        return str(data.get("prompt", "") or "").strip()
    return None


def call_ai_with_text(prompt: str) -> str:
    if AI_PROVIDER == "openai" and openai_client:
        response = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content.strip()

    if client:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        return response.text.strip()

    raise RuntimeError("Chưa cấu hình AI provider/API key. Mở popup rồi bấm gear để vào Settings.")


def call_ai_with_image(question: str, image_payload: dict) -> str:
    prompt = build_image_question_prompt(question)

    if AI_PROVIDER == "openai" and openai_client:
        data_url = (
            f"data:{image_payload['mime_type']};base64,"
            f"{base64.b64encode(image_payload['image_bytes']).decode('ascii')}"
        )
        response = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
        )
        return response.choices[0].message.content.strip()

    if client:
        image_part = genai.types.Part.from_bytes(
            data=image_payload["image_bytes"],
            mime_type=image_payload["mime_type"],
        )
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[image_part, prompt],
        )
        return response.text.strip()

    raise RuntimeError("Chưa cấu hình AI provider/API key. Mở popup rồi bấm gear để vào Settings.")


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
            extra_instruction = show_ask_window(
                action["name"],
                "Nhập yêu cầu bổ sung cho action này...",
            )
            if extra_instruction is None:
                print(f"[HỦY] Đã hủy smart action: {action['name']}.")
                return

        prompt = build_text_prompt(selected_text, action, extra_instruction)
        result_text = call_ai_with_text(prompt)

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


def on_image_action_activate(target_window_id=None):
    global is_processing
    if is_processing:
        return
    is_processing = True

    try:
        builtin_action = get_builtin_action_by_id(IMAGE_ASK_ID)
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

        question = show_ask_window(
            builtin_action["name"],
            "Nhập câu hỏi cho hình ảnh này...",
        )
        if question is None or not question.strip():
            print("[HỦY] Đã hủy action hỏi bằng hình ảnh.")
            return

        result_text = call_ai_with_image(question.strip(), image_payload)

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

        save_history(f"[image:{image_payload['source']}] {question.strip()}", result_text, user_edit=False)
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
    builtin_summary = ", ".join(f"{action['hotkey']}={action['name']}" for action in BUILTIN_POPUP_ACTIONS)
    popup_summary = ", ".join(part for part in [text_actions_summary, builtin_summary] if part)

    print("=" * 60)
    print("KoDauKoVui background service started")
    print(f"Provider       : {AI_PROVIDER}")
    print(f"Popup hotkey   : {HOTKEY_POPUP}")
    print(f"Popup keys     : {popup_summary}")
    print(f"UI language    : {UI_LANGUAGE}")
    if not (client or openai_client):
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
        if sys.argv[1] == "--roi-capture":
            from roi_capture import run_roi_capture

            run_roi_capture()
            return

    reload_runtime_settings(rebuild_listener=False)
    HOTKEY_MANAGER.rebuild()
    print_startup_banner()
    run_log_loop()


if __name__ == "__main__":
    main()
