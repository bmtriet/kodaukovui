import os
import sys
import json
import time
import threading
import subprocess
from dotenv import load_dotenv, set_key
from pynput import keyboard
import pyperclip
from google import genai
import openai

# Load environment variables
load_dotenv()
env_file = os.path.join(os.path.dirname(__file__), '.env')

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
HOTKEY = os.getenv("HOTKEY", "<ctrl>+<shift>+1")
HOTKEY_TRANS_EN = os.getenv("HOTKEY_TRANS_EN", "<ctrl>+<shift>+@")
HOTKEY_TRANS_ZHTW = os.getenv("HOTKEY_TRANS_ZHTW", "<ctrl>+<shift>+#")
HOTKEY_TRANS_KHMER = os.getenv("HOTKEY_TRANS_KHMER", "<ctrl>+<shift>+$")
HOTKEY_TRANS_VI = os.getenv("HOTKEY_TRANS_VI", "<ctrl>+<f5>")
HOTKEY_QA = os.getenv("HOTKEY_QA", "<ctrl>+<f12>")
HOTKEY_POPUP = os.getenv("HOTKEY_POPUP", "<ctrl>+/")
KEEP_ORIGINAL_TEXT = os.getenv("KEEP_ORIGINAL_TEXT", "false").lower() == "true"

def normalize_hotkey(hk: str) -> str:
    """Chuyển phím đặc biệt như '/' thành dạng chr() mà pynput X11 nhận được khi giữ Ctrl."""
    import re
    # Thay thế +/ ở cuối bằng +chr(47) để X11 nhận đúng khi Ctrl đang được giữ
    return re.sub(r'\+/$', f'+{chr(47)}', hk)

HOTKEY_POPUP = normalize_hotkey(HOTKEY_POPUP)
SHOW_QUESTION_IN_QA = os.getenv("SHOW_QUESTION_IN_QA", "false").lower() == "true"
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower()
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

HISTORY_FILE = "history.json"
LEARNED_FILE = "learned.json"
HISTORY_LIMIT = 1000

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_token_here" else None
openai_client = openai.OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_API_BASE) if OPENAI_API_KEY and OPENAI_API_KEY != "your_openai_api_key_here" else None

if not client and not openai_client:
    print("Vui lòng cấu hình ít nhất một API Key (Gemini hoặc OpenAI) trong file .env")
    exit(1)

controller = keyboard.Controller()

def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Lỗi đọc file history: {e}")
        return []

def load_learned():
    if not os.path.exists(LEARNED_FILE):
        return {}
    try:
        with open(LEARNED_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Lỗi đọc file learned: {e}")
        return {}

def save_history(original, result, user_edit=False):
    history = load_history()
    history.append({
        "original": original,
        "result": result,
        "user_edit": user_edit
    })
    
    if len(history) > HISTORY_LIMIT:
        history = history[-HISTORY_LIMIT:]
        
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=4)

def run_learning_mode():
    print("\n--- Đang chạy Learning Mode ---")
    history = load_history()
    learned = load_learned()
    
    count = 0
    for item in history:
        if item.get("user_edit") == True:
            orig = item.get("original", "").strip()
            res = item.get("result", "").strip()
            if orig and res:
                if orig not in learned or learned[orig] != res:
                    learned[orig] = res
                    count += 1
                    
    with open(LEARNED_FILE, 'w', encoding='utf-8') as f:
        json.dump(learned, f, ensure_ascii=False, indent=4)
        
    print(f"Hoàn tất! Đã cập nhật {count} mẫu mới từ người dùng vào {LEARNED_FILE}.\n")

def load_brain_context():
    brain_path = os.path.join(os.path.dirname(__file__), "brain.md")
    if os.path.exists(brain_path):
        with open(brain_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            # Bỏ qua phần hướng dẫn mặc định của hệ thống
            if "[Nhập thông tin ngữ cảnh của bạn vào bên dưới dòng này]" in content:
                content = content.split("[Nhập thông tin ngữ cảnh của bạn vào bên dưới dòng này]")[-1].strip()
            if content:
                return f"\n[AI BRAIN CONTEXT]\n{content}\n[END CONTEXT]\n\n"
    return ""

def build_prompt(text, action_type="add_marks", custom_prompt="", custom_lang="Auto"):
    brain_ctx = load_brain_context()
    
    if action_type == "add_marks":
        learned = load_learned()
        prompt = f"{brain_ctx}Bạn là một chuyên gia ngôn ngữ tiếng Việt. Hãy thêm dấu chuẩn xác nhất cho đoạn văn bản không dấu hoặc sai dấu sau. CHỈ trả về văn bản đã được thêm dấu, KHÔNG giải thích, KHÔNG thêm bất kỳ bình luận nào khác.\n"
        if learned:
            prompt += "\nDưới đây là một số ví dụ do người dùng đã sửa lỗi từ những lần trước (bạn hãy học theo phong cách này hoặc tránh sai lầm tương tự):\n"
            examples = list(learned.items())[-10:]
            for orig, res in examples:
                prompt += f"Văn bản gốc: {orig}\nVăn bản chuẩn: {res}\n\n"
        prompt += f"Văn bản cần xử lý:\n{text}"
        return prompt
    elif action_type == "trans_en":
        return f"{brain_ctx}Hãy dịch đoạn văn bản sau sang tiếng Anh một cách tự nhiên nhất. CHỈ trả về văn bản đã dịch, KHÔNG giải thích, KHÔNG bình luận.\n\nVăn bản gốc:\n{text}"
    elif action_type == "trans_zhtw":
        return f"{brain_ctx}Hãy dịch đoạn văn bản sau sang tiếng Hoa phồn thể (Traditional Chinese) một cách tự nhiên nhất. CHỈ trả về văn bản đã dịch, KHÔNG giải thích, KHÔNG bình luận.\n\nVăn bản gốc:\n{text}"
    elif action_type == "trans_khmer":
        return f"{brain_ctx}Hãy dịch đoạn văn bản sau sang tiếng Khmer một cách tự nhiên nhất. CHỈ trả về văn bản đã dịch, KHÔNG giải thích, KHÔNG bình luận.\n\nVăn bản gốc:\n{text}"
    elif action_type == "trans_vi":
        return f"{brain_ctx}Hãy dịch đoạn văn bản sau sang tiếng Việt một cách tự nhiên nhất. CHỈ trả về văn bản đã dịch, KHÔNG giải thích, KHÔNG bình luận.\n\nVăn bản gốc:\n{text}"
    elif action_type == "qa":
        base = f"{brain_ctx}Bạn là một trợ lý AI thông minh."
        if custom_lang != "Auto":
            base += f"\nLUÔN LUÔN trả lời bằng ngôn ngữ: {custom_lang}."
        if custom_prompt:
            base += f"\n\nYêu cầu của người dùng:\n{custom_prompt}"
        base += f"\n\nNội dung/Câu hỏi:\n{text}"
        return base
    return ""

is_processing = False

def on_activate(action_type="add_marks", pre_selected_text=None):
    global is_processing
    if is_processing:
        return
    is_processing = True

    action_names = {
        "add_marks": "Thêm dấu tiếng Việt",
        "trans_en": "Dịch sang Tiếng Anh",
        "trans_zhtw": "Dịch sang Tiếng Hoa Phồn thể",
        "trans_khmer": "Dịch sang Tiếng Khmer",
        "trans_vi": "Dịch sang Tiếng Việt",
        "qa": "Hỏi đáp AI"
    }
    
    print(f"\n[HOTKEY] Đã nhận diện phím tắt! Đang tiến hành xử lý: {action_names.get(action_type, '...')}...")
    try:
        if pre_selected_text is not None:
            selected_text = pre_selected_text
        else:
            selected_text = get_selected_text()
                
            if not selected_text:
                print("[LỖI] Không có văn bản nào để xử lý (chưa bôi đen và clipboard cũng trống).")
                return
            
        if DEBUG:
            print(f"[DEBUG] Văn bản gốc: {selected_text}")
            
        if action_type == "add_marks":
            pyperclip.copy("...")
            time.sleep(0.05)
            controller.press(keyboard.Key.ctrl)
            controller.press('v')
            controller.release('v')
            controller.release(keyboard.Key.ctrl)
            time.sleep(0.05)
        
        result_text = None
        
        # Chỉ check cache cho Thêm dấu
        if action_type == "add_marks":
            selected_text_stripped = selected_text.strip()
            learned = load_learned()
            if selected_text_stripped in learned:
                result_text = learned[selected_text_stripped]
            else:
                history = load_history()
                for item in reversed(history):
                    if item.get("original", "").strip() == selected_text_stripped:
                        result_text = item.get("result")
                        break
                        
            if result_text and DEBUG:
                print(f"[DEBUG] [CACHE HIT] Lấy từ bộ nhớ: {result_text}")

        if not result_text:
            custom_prompt = ""
            custom_lang = "Auto"
            
            if action_type == "qa":
                qa_script = """
import tkinter as tk
from tkinter import ttk
import sys
import json

root = tk.Tk()
root.title("Hỏi đáp AI")
root.attributes('-topmost', True)

root.update_idletasks()
w = 450
h = 120
x = root.winfo_screenwidth()//2 - w//2
y = root.winfo_screenheight()//2 - h//2
root.geometry(f"{w}x{h}+{x}+{y}")

tk.Label(root, text="Nhập yêu cầu cho AI (Prompt):", font=("Arial", 10, "bold")).pack(anchor="w", padx=10, pady=(10, 5))
entry = tk.Entry(root, font=("Arial", 11))
entry.pack(fill="x", padx=10)
entry.focus_force()

frame = tk.Frame(root)
frame.pack(fill="x", padx=10, pady=10)

tk.Label(frame, text="Ngôn ngữ trả lời:").pack(side="left")
lang_var = tk.StringVar(value="Auto")
cb = ttk.Combobox(frame, textvariable=lang_var, values=["Auto", "En", "Zh", "Vi", "Kh"], state="readonly", width=8)
cb.pack(side="left", padx=5)

def submit(e=None):
    print(json.dumps({"prompt": entry.get().strip(), "lang": lang_var.get()}), flush=True)
    root.destroy()
    sys.exit(0)
def cancel(e=None):
    root.destroy()
    sys.exit(1)

tk.Button(frame, text="Gửi (Enter)", command=submit, bg="#008298", fg="white", width=10).pack(side="right")
tk.Button(frame, text="Hủy (ESC)", command=cancel, width=10).pack(side="right", padx=5)

root.bind('<Return>', submit)
root.bind('<Escape>', cancel)
root.mainloop()
"""
                try:
                    res = subprocess.run(["python3", "-c", qa_script], capture_output=True, text=True)
                    if res.returncode == 0 and res.stdout.strip():
                        import json
                        data = json.loads(res.stdout.strip())
                        custom_prompt = data.get("prompt", "")
                        custom_lang = data.get("lang", "Auto")
                    else:
                        print("[HỦY] Người dùng đã hủy Hỏi đáp AI.")
                        is_processing = False
                        return
                except Exception as e:
                    print(f"Lỗi hiển thị cửa sổ QA: {e}")
                    is_processing = False
                    return

            try:
                prompt = build_prompt(selected_text, action_type, custom_prompt, custom_lang)
                
                if AI_PROVIDER == "openai" and openai_client:
                    response = openai_client.chat.completions.create(
                        model=OPENAI_MODEL,
                        messages=[{"role": "user", "content": prompt}]
                    )
                    result_text = response.choices[0].message.content.strip()
                elif client:
                    response = client.models.generate_content(
                        model=GEMINI_MODEL,
                        contents=prompt
                    )
                    result_text = response.text.strip()
                else:
                    print("[LỖI] Client API chưa được cấu hình đúng.")
                    return
                
                if DEBUG:
                    print(f"[DEBUG] Văn bản kết quả (từ API): {result_text}")
                
                # Chỉ lưu history cho thêm dấu để đỡ loãng data
                if action_type == "add_marks":
                    save_history(selected_text, result_text, user_edit=False)
                
            except Exception as e:
                print(f"[LỖI] Lỗi khi gọi API Gemini hoặc xử lý: {e}")
                return
                
        # Giữ lại bản gốc
        if action_type == "qa":
            if SHOW_QUESTION_IN_QA:
                result_text = f"{selected_text}\n---\n{result_text}"
        elif KEEP_ORIGINAL_TEXT and action_type != "add_marks":
            result_text = f"{selected_text}\n---\n{result_text}"
            
        pyperclip.copy(result_text)
        
        time.sleep(0.1)
        
        if action_type == "add_marks":
            controller.press(keyboard.Key.shift)
            for _ in range(3):
                controller.press(keyboard.Key.left)
                controller.release(keyboard.Key.left)
                time.sleep(0.02)
            controller.release(keyboard.Key.shift)
            time.sleep(0.05)
            
        controller.press(keyboard.Key.ctrl)
        controller.press('v')
        controller.release('v')
        controller.release(keyboard.Key.ctrl)
        
        print(f"[THÀNH CÔNG] Đã hoàn tất {action_names.get(action_type)}!")
    except Exception as ex:
        print(f"\n[LỖI NGHIÊM TRỌNG] Đã xảy ra lỗi trong quá trình xử lý hotkey: {ex}")
    finally:
        is_processing = False

def on_press(key):
    if DEBUG:
        print(f"[DEBUG] Bấm phím: {key}")

def activate_add_marks(): on_activate("add_marks")
def activate_trans_en(): on_activate("trans_en")
def activate_trans_zhtw(): on_activate("trans_zhtw")
def activate_trans_khmer(): on_activate("trans_khmer")
def activate_trans_vi(): on_activate("trans_vi")
def activate_qa(): on_activate("qa")

def get_selected_text():
    # 1. Thử lấy từ Primary Selection (Linux) trước (không can thiệp clipboard)
    try:
        result = subprocess.run(['xclip', '-o', '-selection', 'primary'], capture_output=True, text=True, timeout=1)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass
        
    # 2. Fallback: Dùng Ctrl+C như cũ
    controller.release(keyboard.Key.shift)
    controller.release(keyboard.Key.ctrl)
    controller.release(keyboard.Key.alt)
    
    old_clipboard = pyperclip.paste()
    controller.press(keyboard.Key.ctrl)
    controller.press('c')
    controller.release('c')
    controller.release(keyboard.Key.ctrl)
    
    time.sleep(0.2)
    selected_text = pyperclip.paste()
    
    if not selected_text and old_clipboard:
        selected_text = old_clipboard
        
    return selected_text.strip() if selected_text else ""

def show_popup_menu():
    global is_processing
    if is_processing: return
    is_processing = True

    popup_script = os.path.join(os.path.dirname(__file__), "popup_ui.py")
    try:
        result = subprocess.run(
            [sys.executable, popup_script, os.path.dirname(__file__)],
            capture_output=True, text=True
        )
        if result.stderr:
            print(f"[POPUP ERROR] {result.stderr.strip()}")
        choice = result.stdout.strip()
        if not choice:
            is_processing = False
            return
        # Lấy text SAU khi user chọn action (primary selection vẫn còn nguyên)
        selected_text = get_selected_text()
        if not selected_text:
            print("[LỖI] Không có văn bản được chọn hoặc trong clipboard.")
            is_processing = False
            return
        is_processing = False
        threading.Thread(target=on_activate, args=(choice, selected_text)).start()
    except Exception as e:
        print(f"Lỗi popup: {e}")
        is_processing = False

def activate_popup(): threading.Thread(target=show_popup_menu).start()
def start_background_listener():
    if DEBUG:
        debug_listener = keyboard.Listener(on_press=on_press)
        debug_listener.start()
    
    try:
        mapping = {}
        if HOTKEY: mapping[HOTKEY] = activate_add_marks
        if HOTKEY_TRANS_EN: mapping[HOTKEY_TRANS_EN] = activate_trans_en
        if HOTKEY_TRANS_ZHTW: mapping[HOTKEY_TRANS_ZHTW] = activate_trans_zhtw
        if HOTKEY_TRANS_KHMER: mapping[HOTKEY_TRANS_KHMER] = activate_trans_khmer
        if HOTKEY_TRANS_VI: mapping[HOTKEY_TRANS_VI] = activate_trans_vi
        if HOTKEY_QA: mapping[HOTKEY_QA] = activate_qa
        if HOTKEY_POPUP: mapping[HOTKEY_POPUP] = activate_popup
            
        with keyboard.GlobalHotKeys(mapping) as h:
            h.join()
    except Exception as e:
        print(f"Lỗi khi đăng ký hotkey: {e}. Vui lòng kiểm tra cấu hình phím tắt.")

def capture_hotkey():
    print("\n>>> Hãy bấm tổ hợp phím tắt mới (VD: Bấm giữ Ctrl + Shift rồi gõ A). Bấm ESC để hủy. <<<")
    pressed = set()
    result = []
    
    def hk_on_press(key):
        if key == keyboard.Key.esc:
            return False
        pressed.add(key)
        
    def hk_on_release(key):
        nonlocal result
        has_char = any(hasattr(k, 'char') and k.char is not None for k in pressed)
        if has_char: 
            mods = []
            chars = []
            for k in pressed:
                if isinstance(k, keyboard.Key):
                    name = k.name.split('_')[0]
                    if f"<{name}>" not in mods:
                        mods.append(f"<{name}>")
                elif hasattr(k, 'char') and k.char:
                    chars.append(k.char.lower())
            
            if chars:
                result.append("+".join(mods + chars))
                return False
        
        if key in pressed:
            pressed.remove(key)
            
    with keyboard.Listener(on_press=hk_on_press, on_release=hk_on_release) as l:
        l.join()
        
    return result[0] if result else None

def config_menu():
    global GEMINI_API_KEY, GEMINI_MODEL, client, HOTKEY, HOTKEY_TRANS_EN, HOTKEY_TRANS_ZHTW, HOTKEY_TRANS_KHMER, HOTKEY_TRANS_VI, HOTKEY_QA, HOTKEY_POPUP, KEEP_ORIGINAL_TEXT, SHOW_QUESTION_IN_QA
    global AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, openai_client
    os.system('clear' if os.name == 'posix' else 'cls')
    print("\n" + "="*50)
    print("               CÀI ĐẶT CẤU HÌNH               ")
    print("="*50)
    hidden_g = f"{GEMINI_API_KEY[:6]}...{GEMINI_API_KEY[-4:]}" if GEMINI_API_KEY and len(GEMINI_API_KEY) > 10 else "Chưa có"
    hidden_o = f"{OPENAI_API_KEY[:6]}...{OPENAI_API_KEY[-4:]}" if OPENAI_API_KEY and len(OPENAI_API_KEY) > 10 else "Chưa có"
    print(f"1. Provider hiện tại  : {AI_PROVIDER.upper()}")
    print(f"2. Cấu hình Gemini    : {GEMINI_MODEL} ({hidden_g})")
    print(f"3. Cấu hình OpenAI    : {OPENAI_MODEL} ({hidden_o})")
    print(f"4. Phím tắt Thêm Dấu  : {HOTKEY}")
    print(f"5. Phím tắt Dịch EN   : {HOTKEY_TRANS_EN}")
    print(f"6. Phím tắt Dịch Hoa  : {HOTKEY_TRANS_ZHTW}")
    print(f"7. Phím tắt Dịch Khmer: {HOTKEY_TRANS_KHMER}")
    print(f"8. Phím tắt Dịch Việt : {HOTKEY_TRANS_VI}")
    print(f"9. Phím tắt Hỏi đáp AI: {HOTKEY_QA}")
    print(f"10. Phím tắt Menu Popup: {HOTKEY_POPUP}")
    print(f"11. Giữ câu hỏi khi Hỏi đáp: {'BẬT' if SHOW_QUESTION_IN_QA else 'TẮT'}")
    print(f"12. Giữ bản gốc khi dịch: {'BẬT' if KEEP_ORIGINAL_TEXT else 'TẮT'}")
    print("13. Quay lại")
    
    try:
        c = input("\nChọn chức năng (1-13): ").strip()
    except (KeyboardInterrupt, EOFError):
        return
        
    if c == '1':
        AI_PROVIDER = "openai" if AI_PROVIDER == "gemini" else "gemini"
        set_key(env_file, "AI_PROVIDER", AI_PROVIDER)
        print(f"Đã chuyển Provider sang: {AI_PROVIDER.upper()}")
        
    elif c == '2':
        new_token = input("Nhập Gemini Token mới (bỏ trống để giữ nguyên): ").strip()
        if new_token:
            set_key(env_file, "GEMINI_API_KEY", new_token)
            GEMINI_API_KEY = new_token
            client = genai.Client(api_key=GEMINI_API_KEY)
        
        new_model = input(f"Nhập Gemini Model mới (hiện tại: {GEMINI_MODEL}, bỏ trống để giữ nguyên): ").strip()
        if new_model:
            set_key(env_file, "GEMINI_MODEL", new_model)
            GEMINI_MODEL = new_model
        print("Đã cập nhật cấu hình Gemini!")
            
    elif c == '3':
        new_token = input("Nhập OpenAI Token mới (bỏ trống để giữ nguyên): ").strip()
        if new_token:
            set_key(env_file, "OPENAI_API_KEY", new_token)
            OPENAI_API_KEY = new_token
            openai_client = openai.OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_API_BASE)
        
        new_model = input(f"Nhập OpenAI Model mới (hiện tại: {OPENAI_MODEL}, bỏ trống để giữ nguyên): ").strip()
        if new_model:
            set_key(env_file, "OPENAI_MODEL", new_model)
            OPENAI_MODEL = new_model
        print("Đã cập nhật cấu hình OpenAI!")
            
    elif c in ['4', '5', '6', '7', '8', '9', '10']:
        new_hk = capture_hotkey()
        if new_hk:
            mapping_keys = {
                '4': 'HOTKEY',
                '5': 'HOTKEY_TRANS_EN',
                '6': 'HOTKEY_TRANS_ZHTW',
                '7': 'HOTKEY_TRANS_KHMER',
                '8': 'HOTKEY_TRANS_VI',
                '9': 'HOTKEY_QA',
                '10': 'HOTKEY_POPUP'
            }
            key_name = mapping_keys.get(c)
            set_key(env_file, key_name, new_hk)
            if c == '4': HOTKEY = new_hk
            elif c == '5': HOTKEY_TRANS_EN = new_hk
            elif c == '6': HOTKEY_TRANS_ZHTW = new_hk
            elif c == '7': HOTKEY_TRANS_KHMER = new_hk
            elif c == '8': HOTKEY_TRANS_VI = new_hk
            elif c == '9': HOTKEY_QA = new_hk
            elif c == '10': HOTKEY_POPUP = new_hk
            print(f"Đã cập nhật {key_name} = {new_hk}")
            print("LƯU Ý: Vui lòng thoát ứng dụng và mở lại để áp dụng phím tắt mới!")
            
    elif c == '11':
        SHOW_QUESTION_IN_QA = not SHOW_QUESTION_IN_QA
        set_key(env_file, "SHOW_QUESTION_IN_QA", "true" if SHOW_QUESTION_IN_QA else "false")
        print(f"Đã cập nhật tính năng giữ câu hỏi thành: {'BẬT' if SHOW_QUESTION_IN_QA else 'TẮT'}")
        
    elif c == '12':
        KEEP_ORIGINAL_TEXT = not KEEP_ORIGINAL_TEXT
        set_key(env_file, "KEEP_ORIGINAL_TEXT", "true" if KEEP_ORIGINAL_TEXT else "false")
        print(f"Đã cập nhật tính năng giữ bản gốc thành: {'BẬT' if KEEP_ORIGINAL_TEXT else 'TẮT'}")

def show_statistics():
    history = load_history()
    learned = load_learned()
    total_requests = len(history)
    total_learned = len(learned)
    total_chars = sum(len(item.get("result", "")) for item in history)
    
    manual_time = total_chars / 2.44 if total_chars > 0 else 0
    tool_time = total_requests * 10.0
    saved_time = manual_time - tool_time
    
    print("\n" + "="*50)
    print("                BẢNG THỐNG KÊ                 ")
    print("="*50)
    print(f" 🔹 Lần Thêm dấu AI: {total_requests}")
    print(f" 🔹 Ký tự đã xử lý : {total_chars}")
    print(f" 🔹 Mẫu đã tự học  : {total_learned}")
    print("-" * 50)
    if saved_time > 0:
        print(f" 🎉 THỜI GIAN TIẾT KIỆM: {saved_time:.1f} giây (~{saved_time/60:.1f} phút)")
    else:
        print(f" ⚠️ Mẹo: Bôi đen văn bản dài hơn để tiết kiệm TG")
    print("="*50)

def tui_loop():
    while True:
        os.system('clear' if os.name == 'posix' else 'cls')
        show_statistics()
        
        print("\n" + "="*50)
        print("     AI GÕ DẤU & DỊCH THUẬT - CONTROL PANEL     ")
        print("="*50)
        print(f" 🤖 AI Provider : {AI_PROVIDER.upper()}")
        print(f" ⌨️  Phím tắt kích hoạt:")
        print(f"   • Thêm dấu tiếng Việt : {HOTKEY}")
        print(f"   • Dịch sang Tiếng Anh : {HOTKEY_TRANS_EN}")
        print(f"   • Dịch sang Tiếng Hoa : {HOTKEY_TRANS_ZHTW}")
        print(f"   • Dịch sang Tiếng Khmer: {HOTKEY_TRANS_KHMER}")
        print(f"   • Dịch sang Tiếng Việt : {HOTKEY_TRANS_VI}")
        print(f"   • Hỏi đáp thông minh AI : {HOTKEY_QA}")
        print(f"   • Menu Popup Chức Năng : {HOTKEY_POPUP}")
        print("-" * 50)
        print("1. Xem lịch sử gần đây (history.json)")
        print("2. Kích hoạt Learning Mode")
        print("3. Xem danh sách đã học (learned.json)")
        print("4. Cài đặt (Token, Model, Phím tắt, Dịch thuật)")
        print("5. Thoát ứng dụng (Exit)")
        print("="*50)
        
        try:
            choice = input("Lựa chọn của bạn (1-5): ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nĐang thoát ứng dụng...")
            os._exit(0)
            
        if choice == '1':
            history = load_history()
            print("\n--- 5 MỤC HISTORY GẦN NHẤT ---")
            for item in history[-5:]:
                label = "SỬA" if item.get("user_edit") else " AI"
                print(f"[{label}] {item.get('original')} -> {item.get('result')}")
            if len(history) > 5:
                print(f"... (và {len(history)-5} mục khác)")
            input("\n(Nhấn Enter để quay lại)")
        elif choice == '2':
            run_learning_mode()
            input("\n(Nhấn Enter để quay lại)")
        elif choice == '3':
            learned = load_learned()
            print("\n--- 5 MỤC CACHE ĐÃ HỌC GẦN NHẤT ---")
            for k, v in list(learned.items())[-5:]:
                print(f"Gốc: {k}\nSửa: {v}\n")
            if len(learned) > 5:
                print(f"... (và {len(learned)-5} mục khác)")
            input("\n(Nhấn Enter để quay lại)")
        elif choice == '4':
            config_menu()
            input("\n(Nhấn Enter để quay lại)")
        elif choice == '5':
            print("\nĐang thoát ứng dụng...")
            os._exit(0)
        else:
            print("\nLựa chọn không hợp lệ!")
            time.sleep(1)

def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--learn':
        run_learning_mode()
        return

    # Chạy listener ở background
    listener_thread = threading.Thread(target=start_background_listener, daemon=True)
    listener_thread.start()
    
    # Chạy giao diện TUI
    tui_loop()

if __name__ == "__main__":
    main()
