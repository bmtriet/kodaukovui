import base64
import io
import json
import sys
import time
import tkinter as tk

from PIL import ImageGrab


def emit_and_exit(payload, exit_code=0):
    print(json.dumps(payload), flush=True)
    sys.exit(exit_code)


class RoiCaptureOverlay:
    def __init__(self):
        self.root = tk.Tk()
        self.root.attributes("-fullscreen", True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", 0.25)
        self.root.configure(bg="black")
        self.root.overrideredirect(True)
        self.root.title("KoDauKoVui ROI Capture")

        self.canvas = tk.Canvas(self.root, bg="black", highlightthickness=0, cursor="crosshair")
        self.canvas.pack(fill="both", expand=True)

        self.start_x = 0
        self.start_y = 0
        self.end_x = 0
        self.end_y = 0
        self.rect_id = None
        self.result = None
        self.cancelled = False

        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.root.bind("<Escape>", self.on_escape)
        self.root.focus_force()

    def on_press(self, event):
        self.start_x = event.x_root
        self.start_y = event.y_root
        self.end_x = event.x_root
        self.end_y = event.y_root
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
        self.end_x = event.x_root
        self.end_y = event.y_root
        if self.rect_id is not None:
            self.canvas.coords(
                self.rect_id,
                self.start_x - self.root.winfo_rootx(),
                self.start_y - self.root.winfo_rooty(),
                self.end_x - self.root.winfo_rootx(),
                self.end_y - self.root.winfo_rooty(),
            )

    def on_release(self, event):
        self.end_x = event.x_root
        self.end_y = event.y_root
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

        self.root.withdraw()
        self.root.update_idletasks()
        time.sleep(0.15)

        try:
            screenshot = ImageGrab.grab(all_screens=True)
        except TypeError:
            screenshot = ImageGrab.grab()

        cropped = screenshot.crop((left, top, right, bottom))
        buffer = io.BytesIO()
        cropped.save(buffer, format="PNG")
        self.result = {
            "source": "roi_screenshot",
            "mime_type": "image/png",
            "image_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
            "size": {"width": cropped.width, "height": cropped.height},
            "region": {"left": left, "top": top, "right": right, "bottom": bottom},
        }
        self.root.destroy()

    def run(self):
        self.root.mainloop()
        if self.cancelled or self.result is None:
            return None
        return self.result


def run_roi_capture():
    overlay = RoiCaptureOverlay()
    result = overlay.run()
    if result is None:
        sys.exit(1)
    emit_and_exit(result)


if __name__ == "__main__":
    run_roi_capture()
