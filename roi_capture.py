import base64
import io
import json
import os
import re
import subprocess
import sys
import traceback
import tkinter as tk
from ctypes import POINTER, Structure, byref, c_long, c_void_p

from PIL import ImageGrab, ImageTk


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


def get_current_pointer_position(root: tk.Tk):
    if os.name == "nt":
        point = POINT()
        if windll.user32.GetCursorPos(byref(point)):
            return int(point.x), int(point.y)
    return int(root.winfo_pointerx()), int(root.winfo_pointery())


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
        self.screenshot = ImageGrab.grab(
            bbox=(
                self.monitor["left"],
                self.monitor["top"],
                self.monitor["right"],
                self.monitor["bottom"],
            )
        )
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
