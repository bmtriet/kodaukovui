import base64
import ctypes
import ctypes.util
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import traceback
from ctypes import POINTER, Structure, byref, c_long, c_void_p


tk = None
Image = None
ImageGrab = None
ImageTk = None


SCREEN_RECORDING_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"


if os.name == "nt":
    from ctypes import WINFUNCTYPE, c_bool, windll

    class POINT(Structure):
        _fields_ = [("x", c_long), ("y", c_long)]


    class RECT(Structure):
        _fields_ = [("left", c_long), ("top", c_long), ("right", c_long), ("bottom", c_long)]


    MonitorEnumProc = WINFUNCTYPE(c_bool, c_void_p, c_void_p, POINTER(RECT), c_long)


def emit_and_exit(payload, exit_code=0):
    print(json.dumps(payload), flush=True)
    sys.exit(exit_code)


def parse_xrandr_listmonitors(output: str):
    monitors = []
    pattern = re.compile(r"\s*\d+:\s+\+?\*?[\w-]+\s+(\d+)/\d+x(\d+)/\d+\+(-?\d+)\+(-?\d+)")
    for line in output.splitlines():
        match = pattern.match(line)
        if not match:
            continue
        width, height, x, y = map(int, match.groups())
        monitors.append(
            {
                "left": x,
                "top": y,
                "right": x + width,
                "bottom": y + height,
                "width": width,
                "height": height,
            }
        )
    return monitors


def get_monitors():
    if os.name == "nt":
        return get_windows_monitors()
    return get_linux_monitors()


def get_linux_monitors():
    try:
        result = subprocess.run(
            ["xrandr", "--listmonitors"],
            capture_output=True,
            text=True,
            timeout=1,
        )
        if result.returncode == 0:
            monitors = parse_xrandr_listmonitors(result.stdout)
            if monitors:
                return monitors
    except Exception:
        pass
    return []


def get_windows_monitors():
    monitors = []

    def callback(_monitor, _dc, rect_ptr, _data):
        rect = rect_ptr.contents
        monitors.append(
            {
                "left": int(rect.left),
                "top": int(rect.top),
                "right": int(rect.right),
                "bottom": int(rect.bottom),
                "width": int(rect.right - rect.left),
                "height": int(rect.bottom - rect.top),
            }
        )
        return True

    if os.name != "nt":
        return monitors

    windll.user32.EnumDisplayMonitors(0, 0, MonitorEnumProc(callback), 0)
    return monitors


def get_current_pointer_position(root):
    if os.name == "nt":
        point = POINT()
        if windll.user32.GetCursorPos(byref(point)):
            return int(point.x), int(point.y)
    return int(root.winfo_pointerx()), int(root.winfo_pointery())


def ensure_screen_capture_permission():
    if sys.platform != "darwin":
        return True

    try:
        core_graphics = load_framework("CoreGraphics")
        preflight = getattr(core_graphics, "CGPreflightScreenCaptureAccess", None)
        request = getattr(core_graphics, "CGRequestScreenCaptureAccess", None)

        if preflight is not None:
            preflight.argtypes = []
            preflight.restype = ctypes.c_bool
            if preflight():
                return True

        if request is not None:
            request.argtypes = []
            request.restype = ctypes.c_bool
            if request():
                return True

        print(
            "[MACOS] KoDauKoVui cần quyền Screen Recording để chụp vùng màn hình cho Ask by Image.",
            file=sys.stderr,
            flush=True,
        )
        print(
            "[MACOS] Hãy bật quyền cho Terminal/iTerm hoặc app KoDauKoVui, rồi chạy lại thao tác capture.",
            file=sys.stderr,
            flush=True,
        )
        open_screen_recording_settings()
        return False
    except Exception:
        return True


def open_screen_recording_settings():
    try:
        subprocess.run(
            ["open", SCREEN_RECORDING_SETTINGS_URL],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=1,
        )
    except Exception:
        pass


def load_framework(name: str):
    path = ctypes.util.find_library(name) or f"/System/Library/Frameworks/{name}.framework/{name}"
    return ctypes.cdll.LoadLibrary(path)


def ensure_tk_runtime():
    global tk, Image, ImageGrab, ImageTk
    if tk is not None and Image is not None and ImageGrab is not None and ImageTk is not None:
        return True

    try:
        import tkinter as tk_module
        from PIL import Image as image_module
        from PIL import ImageGrab as image_grab_module
        from PIL import ImageTk as image_tk_module
    except ModuleNotFoundError as exc:
        if exc.name == "_tkinter":
            print(
                "[MACOS] Python hiện tại thiếu Tk runtime nên không mở được cửa sổ chọn vùng màn hình.",
                file=sys.stderr,
                flush=True,
            )
            print(
                "[MACOS] Nếu dùng Homebrew Python 3.12, hãy cài: brew install python-tk@3.12",
                file=sys.stderr,
                flush=True,
            )
            return False
        raise

    tk = tk_module
    Image = image_module
    ImageGrab = image_grab_module
    ImageTk = image_tk_module
    return True


def capture_monitor_screenshot(monitor):
    if sys.platform == "darwin":
        screenshot = capture_macos_screenshot(monitor)
    else:
        screenshot = ImageGrab.grab(
            bbox=(
                monitor["left"],
                monitor["top"],
                monitor["right"],
                monitor["bottom"],
            )
        )

    if is_probably_permission_black_frame(screenshot):
        print(
            "[MACOS] Ảnh chụp màn hình đang trả về khung đen. Thường là do macOS chưa cấp Screen Recording "
            "cho đúng app đang chạy KoDauKoVui.",
            file=sys.stderr,
            flush=True,
        )
        print(
            "[MACOS] Hãy bật Screen Recording cho Terminal/iTerm hoặc Python/KoDauKoVui, quit hẳn app đó, rồi chạy lại.",
            file=sys.stderr,
            flush=True,
        )
        app_path = get_macos_permission_app_path()
        if app_path:
            print(
                f"[MACOS] Nếu app chưa có trong danh sách, bấm + và thêm: {app_path}",
                file=sys.stderr,
                flush=True,
            )
        open_screen_recording_settings()
        return None

    return screenshot


def get_macos_permission_app_path():
    executable = os.path.realpath(sys.executable)
    app_marker = ".app/Contents/MacOS/"
    if app_marker in executable:
        return executable.split(app_marker, 1)[0] + ".app"

    match = re.search(r"(.*/Python\.framework/Versions/[^/]+)/bin/python[^/]*$", executable)
    if match:
        candidate = os.path.join(match.group(1), "Resources", "Python.app")
        if os.path.isdir(candidate):
            return candidate

    return executable


def capture_macos_screenshot(monitor):
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as temp_file:
        temp_path = temp_file.name

    try:
        region = f"{monitor['left']},{monitor['top']},{monitor['width']},{monitor['height']}"
        result = subprocess.run(
            ["screencapture", "-x", "-R", region, temp_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and os.path.getsize(temp_path) > 0:
            image = Image.open(temp_path)
            image.load()
            return image
    except Exception:
        pass
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass

    return ImageGrab.grab(
        bbox=(
            monitor["left"],
            monitor["top"],
            monitor["right"],
            monitor["bottom"],
        )
    )


def is_probably_permission_black_frame(image):
    if sys.platform != "darwin":
        return False
    if image.width == 0 or image.height == 0:
        return True

    sample = image.resize((1, 1)).convert("RGB").getpixel((0, 0))
    return max(sample) <= 3


def get_monitor_for_point(monitors, x: int, y: int):
    for monitor in monitors:
        if monitor["left"] <= x < monitor["right"] and monitor["top"] <= y < monitor["bottom"]:
            return monitor
    return monitors[0] if monitors else None


class RoiCaptureOverlay:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("KoDauKoVui ROI Capture")
        self.root.configure(bg="#111827")
        self.root.attributes("-topmost", True)
        self.root.overrideredirect(True)
        self.root.resizable(False, False)
        self.root.bind("<Button-3>", self.on_escape)

        self.pointer_x, self.pointer_y = get_current_pointer_position(self.root)
        self.monitor = self._resolve_monitor()
        self.screenshot = capture_monitor_screenshot(self.monitor)
        if self.screenshot is None:
            raise RuntimeError("Screen Recording permission is missing or returning a black frame.")
        self.photo = ImageTk.PhotoImage(self.screenshot)

        self.canvas = tk.Canvas(
            self.root,
            width=self.monitor["width"],
            height=self.monitor["height"],
            bg="black",
            highlightthickness=0,
            cursor="crosshair",
        )
        self.canvas.pack(fill="both", expand=True)
        self.canvas.create_image(0, 0, anchor="nw", image=self.photo)
        self.canvas.create_rectangle(
            0,
            0,
            self.monitor["width"],
            self.monitor["height"],
            fill="#000000",
            stipple="gray25",
            outline="",
        )

        self.start_x = 0
        self.start_y = 0
        self.end_x = 0
        self.end_y = 0
        self.rect_id = None
        self.result = None
        self.cancelled = False

        self._draw_banner()
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.root.bind("<Escape>", self.on_escape)

        self.root.geometry(
            f"{self.monitor['width']}x{self.monitor['height']}+{self.monitor['left']}+{self.monitor['top']}"
        )
        self.root.update_idletasks()
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    def _resolve_monitor(self):
        monitors = get_monitors()
        monitor = get_monitor_for_point(monitors, self.pointer_x, self.pointer_y)
        if monitor:
            return monitor
        return {
            "left": 0,
            "top": 0,
            "right": self.root.winfo_screenwidth(),
            "bottom": self.root.winfo_screenheight(),
            "width": self.root.winfo_screenwidth(),
            "height": self.root.winfo_screenheight(),
        }

    def _draw_banner(self):
        self.canvas.create_rectangle(16, 16, 420, 82, fill="#111827", outline="#334155", width=1)
        self.canvas.create_text(
            32,
            34,
            anchor="nw",
            text="Draw ROI on current screen",
            fill="#f8fafc",
            font=("Arial", 16, "bold"),
        )
        self.canvas.create_text(
            32,
            58,
            anchor="nw",
            text="Drag to capture, Esc to cancel",
            fill="#cbd5e1",
            font=("Arial", 11),
        )

    def on_press(self, event):
        self.start_x = event.x
        self.start_y = event.y
        self.end_x = event.x
        self.end_y = event.y
        if self.rect_id is not None:
            self.canvas.delete(self.rect_id)
        self.rect_id = self.canvas.create_rectangle(
            event.x,
            event.y,
            event.x,
            event.y,
            outline="#38bdf8",
            width=2,
            fill="#ffffff",
            stipple="gray25",
        )

    def on_drag(self, event):
        self.end_x = max(0, min(event.x, self.monitor["width"]))
        self.end_y = max(0, min(event.y, self.monitor["height"]))
        if self.rect_id is not None:
            self.canvas.coords(
                self.rect_id,
                self.start_x,
                self.start_y,
                self.end_x,
                self.end_y,
            )

    def on_release(self, event):
        self.end_x = max(0, min(event.x, self.monitor["width"]))
        self.end_y = max(0, min(event.y, self.monitor["height"]))
        self.root.after(10, self.finish_capture)

    def on_escape(self, _event):
        self.cancelled = True
        self.root.destroy()

    def finish_capture(self):
        left = min(self.start_x, self.end_x)
        top = min(self.start_y, self.end_y)
        right = max(self.start_x, self.end_x)
        bottom = max(self.start_y, self.end_y)

        if right - left < 4 or bottom - top < 4:
            self.cancelled = True
            self.root.destroy()
            return

        cropped = self.screenshot.crop((left, top, right, bottom))
        buffer = io.BytesIO()
        cropped.save(buffer, format="PNG")
        self.result = {
            "source": "roi_screenshot",
            "mime_type": "image/png",
            "image_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
            "size": {"width": cropped.width, "height": cropped.height},
            "region": {
                "left": self.monitor["left"] + left,
                "top": self.monitor["top"] + top,
                "right": self.monitor["left"] + right,
                "bottom": self.monitor["top"] + bottom,
            },
            "monitor": self.monitor,
        }
        self.root.destroy()

    def run(self):
        self.root.mainloop()
        if self.cancelled or self.result is None:
            return None
        return self.result


def run_roi_capture():
    try:
        if not ensure_screen_capture_permission():
            sys.exit(1)
        if not ensure_tk_runtime():
            sys.exit(1)
        overlay = RoiCaptureOverlay()
        result = overlay.run()
        if result is None:
            sys.exit(1)
        emit_and_exit(result)
    except Exception as exc:
        print(f"[ROI ERROR] {exc}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    run_roi_capture()
