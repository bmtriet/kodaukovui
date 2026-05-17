import io
import os
import re
import subprocess
import sys
import time
from ctypes import Structure, byref, c_bool, c_long, c_ulong, c_void_p, sizeof

import pyperclip
from PIL import Image, ImageGrab
try:
    from pynput import keyboard
except ModuleNotFoundError:
    class _FallbackKey:
        shift = "shift"
        ctrl = "ctrl"
        alt = "alt"
        left = "left"

    class _FallbackKeyboard:
        Key = _FallbackKey

    keyboard = _FallbackKeyboard()

if os.name == "nt":
    from ctypes import windll
else:
    windll = None


class PlatformAdapter:
    def __init__(self, controller, debug: bool = False):
        self.controller = controller
        self.debug = debug

    def normalize_hotkey(self, hotkey: str) -> str:
        return hotkey

    def get_current_active_window(self):
        return None

    def restore_focus(self, window_id):
        return

    def get_mouse_position(self):
        return None

    def get_selected_text(self, target_window_id=None):
        return self._copy_selected_text()

    def get_clipboard_image(self):
        try:
            image = ImageGrab.grabclipboard()
        except Exception:
            image = None

        if isinstance(image, Image.Image):
            return self._image_to_payload(image, source="clipboard_image"), None

        return None, None

    def prepare_add_marks_placeholder(self, target_window_id=None):
        error = self._ensure_can_interact(target_window_id, "ghi vào ứng dụng đích")
        if error:
            return error

        try:
            pyperclip.copy("...")
        except pyperclip.PyperclipException as exc:
            return f"[LỖI] Không thể ghi clipboard: {exc}"

        time.sleep(0.05)
        self._press_ctrl_char("v")
        time.sleep(0.05)
        return None

    def paste_processed_text(self, text: str, action_type="add_marks", target_window_id=None):
        error = self._ensure_can_interact(target_window_id, "dán văn bản vào ứng dụng đích")
        if error:
            return error

        try:
            pyperclip.copy(text)
        except pyperclip.PyperclipException as exc:
            return f"[LỖI] Không thể ghi clipboard: {exc}"

        time.sleep(0.1)

        if action_type == "add_marks":
            self._select_placeholder()

        self._press_ctrl_char("v")
        return None

    def _ensure_can_interact(self, target_window_id, action_label: str):
        return None

    def _copy_selected_text(self):
        self.controller.release(keyboard.Key.shift)
        self.controller.release(keyboard.Key.ctrl)
        self.controller.release(keyboard.Key.alt)

        try:
            old_clipboard = pyperclip.paste()
        except pyperclip.PyperclipException as exc:
            return "", f"[LỖI] Không thể đọc clipboard: {exc}"

        self._press_ctrl_char("c")
        time.sleep(0.2)

        try:
            selected_text = pyperclip.paste()
        except pyperclip.PyperclipException as exc:
            return "", f"[LỖI] Không thể đọc clipboard: {exc}"

        if not selected_text and old_clipboard:
            selected_text = old_clipboard

        return selected_text.strip() if selected_text else "", None

    def _press_ctrl_char(self, char: str):
        self.controller.press(keyboard.Key.ctrl)
        self.controller.press(char)
        self.controller.release(char)
        self.controller.release(keyboard.Key.ctrl)

    def _image_to_payload(self, image: Image.Image, source: str, region: dict | None = None):
        output = io.BytesIO()
        image.save(output, format="PNG")
        return {
            "source": source,
            "mime_type": "image/png",
            "image_bytes": output.getvalue(),
            "size": {"width": image.width, "height": image.height},
            "region": region,
        }

    def _bytes_to_payload(self, raw: bytes, source: str, region: dict | None = None):
        image = Image.open(io.BytesIO(raw))
        image.load()
        return self._image_to_payload(image, source=source, region=region)

    def _select_placeholder(self):
        self.controller.press(keyboard.Key.shift)
        for _ in range(3):
            self.controller.press(keyboard.Key.left)
            self.controller.release(keyboard.Key.left)
            time.sleep(0.02)
        self.controller.release(keyboard.Key.shift)
        time.sleep(0.05)


class LinuxPlatformAdapter(PlatformAdapter):
    def normalize_hotkey(self, hotkey: str) -> str:
        return re.sub(r"\+/$", f"+{chr(47)}", hotkey)

    def get_current_active_window(self):
        try:
            res = subprocess.run(["xdotool", "getactivewindow"], capture_output=True, text=True, timeout=0.5)
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout.strip()
        except Exception:
            pass
        return None

    def restore_focus(self, window_id):
        if not window_id:
            return
        try:
            subprocess.run(["xdotool", "windowactivate", str(window_id)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(0.15)
        except Exception:
            pass

    def get_mouse_position(self):
        try:
            res = subprocess.run(["xdotool", "getmouselocation"], capture_output=True, text=True, timeout=0.5)
            if res.returncode == 0:
                match = re.search(r"x:(\d+)\s+y:(\d+)", res.stdout)
                if match:
                    return int(match.group(1)), int(match.group(2))
        except Exception:
            pass
        return None

    def get_selected_text(self, target_window_id=None):
        try:
            result = subprocess.run(["xclip", "-o", "-selection", "primary"], capture_output=True, text=True, timeout=1)
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip(), None
        except Exception:
            pass
        return super().get_selected_text(target_window_id=target_window_id)

    def get_clipboard_image(self):
        try:
            targets = subprocess.run(
                ["xclip", "-selection", "clipboard", "-t", "TARGETS", "-o"],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if targets.returncode == 0 and "image/png" in targets.stdout:
                raw = subprocess.run(
                    ["xclip", "-selection", "clipboard", "-t", "image/png", "-o"],
                    capture_output=True,
                    timeout=2,
                )
                if raw.returncode == 0 and raw.stdout:
                    return self._bytes_to_payload(raw.stdout, source="clipboard_image"), None
        except Exception:
            pass

        return super().get_clipboard_image()


class MacOSPlatformAdapter(PlatformAdapter):
    def normalize_hotkey(self, hotkey: str) -> str:
        if hotkey.startswith("<ctrl>+"):
            return hotkey.replace("<ctrl>+", "<cmd>+", 1)
        return hotkey

    def get_current_active_window(self):
        try:
            result = subprocess.run(
                [
                    "osascript",
                    "-e",
                    'tell application "System Events" to get bundle identifier of first application process whose frontmost is true',
                ],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except Exception:
            pass
        return None

    def restore_focus(self, window_id):
        if not window_id:
            return
        try:
            subprocess.run(
                ["osascript", "-e", f'tell application id "{window_id}" to activate'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=1,
            )
            time.sleep(0.2)
        except Exception:
            pass

    def _press_ctrl_char(self, char: str):
        self.controller.press(keyboard.Key.cmd)
        self.controller.press(char)
        self.controller.release(char)
        self.controller.release(keyboard.Key.cmd)


if os.name == "nt":
    class POINT(Structure):
        _fields_ = [("x", c_long), ("y", c_long)]


    class TOKEN_ELEVATION(Structure):
        _fields_ = [("TokenIsElevated", c_ulong)]


class WindowsPlatformAdapter(PlatformAdapter):
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    TOKEN_QUERY = 0x0008
    SW_RESTORE = 9
    TokenElevation = 20

    def get_current_active_window(self):
        hwnd = windll.user32.GetForegroundWindow()
        return int(hwnd) if hwnd else None

    def restore_focus(self, window_id):
        if not window_id:
            return
        try:
            windll.user32.ShowWindow(c_void_p(int(window_id)), self.SW_RESTORE)
            windll.user32.SetForegroundWindow(c_void_p(int(window_id)))
            time.sleep(0.15)
        except Exception:
            pass

    def get_mouse_position(self):
        point = POINT()
        if windll.user32.GetCursorPos(byref(point)):
            return point.x, point.y
        return None

    def get_selected_text(self, target_window_id=None):
        error = self._ensure_can_interact(target_window_id, "đọc văn bản từ ứng dụng đích")
        if error:
            return "", error
        return super().get_selected_text(target_window_id=target_window_id)

    def _ensure_can_interact(self, target_window_id, action_label: str):
        if not target_window_id:
            return None
        if self._is_current_process_elevated():
            return None
        if not self._window_is_elevated(target_window_id):
            return None
        return (
            f"[WINDOWS] Không thể {action_label} vì cửa sổ đích đang chạy bằng quyền Administrator "
            "còn KoDauKoVui đang chạy ở quyền user thường. Hãy mở ứng dụng đích ở quyền thường "
            "hoặc chạy KoDauKoVui cùng mức quyền nếu thật sự cần."
        )

    def _window_is_elevated(self, window_id) -> bool:
        pid = c_ulong()
        windll.user32.GetWindowThreadProcessId(c_void_p(int(window_id)), byref(pid))
        if not pid.value:
            return False
        return self._is_process_elevated(pid.value)

    def _is_current_process_elevated(self) -> bool:
        return self._is_process_elevated(os.getpid())

    def _is_process_elevated(self, pid: int) -> bool:
        process_handle = windll.kernel32.OpenProcess(self.PROCESS_QUERY_LIMITED_INFORMATION, c_bool(False), pid)
        if not process_handle:
            return False

        token_handle = c_void_p()
        try:
            if not windll.advapi32.OpenProcessToken(process_handle, self.TOKEN_QUERY, byref(token_handle)):
                return False

            elevation = TOKEN_ELEVATION()
            size = c_ulong()
            if not windll.advapi32.GetTokenInformation(
                token_handle,
                self.TokenElevation,
                byref(elevation),
                sizeof(elevation),
                byref(size),
            ):
                return False
            return bool(elevation.TokenIsElevated)
        finally:
            if token_handle:
                windll.kernel32.CloseHandle(token_handle)
            windll.kernel32.CloseHandle(process_handle)


def create_platform_adapter(controller, debug: bool = False) -> PlatformAdapter:
    if os.name == "nt":
        return WindowsPlatformAdapter(controller, debug=debug)
    if sys.platform == "darwin":
        return MacOSPlatformAdapter(controller, debug=debug)
    return LinuxPlatformAdapter(controller, debug=debug)
