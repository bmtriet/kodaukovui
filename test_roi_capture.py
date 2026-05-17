import unittest
from unittest.mock import patch

from PIL import Image

from roi_capture import (
    ensure_screen_capture_permission,
    ensure_tk_runtime,
    get_monitor_for_point,
    is_probably_permission_black_frame,
    parse_xrandr_listmonitors,
)


class RoiCaptureTests(unittest.TestCase):
    def test_parse_xrandr_listmonitors(self):
        output = """Monitors: 2
 0: +*HDMI-0 1920/531x1080/299+0+0  HDMI-0
 1: +DP-0 2560/597x1440/336+1920+0  DP-0
"""

        monitors = parse_xrandr_listmonitors(output)

        self.assertEqual(
            monitors,
            [
                {"left": 0, "top": 0, "right": 1920, "bottom": 1080, "width": 1920, "height": 1080},
                {"left": 1920, "top": 0, "right": 4480, "bottom": 1440, "width": 2560, "height": 1440},
            ],
        )

    def test_get_monitor_for_point_chooses_current_monitor(self):
        monitors = [
            {"left": 0, "top": 0, "right": 1920, "bottom": 1080, "width": 1920, "height": 1080},
            {"left": 1920, "top": 0, "right": 4480, "bottom": 1440, "width": 2560, "height": 1440},
        ]

        chosen = get_monitor_for_point(monitors, 2500, 400)

        self.assertEqual(chosen, monitors[1])

    def test_get_monitor_for_point_falls_back_to_first_monitor(self):
        monitors = [
            {"left": 0, "top": 0, "right": 1920, "bottom": 1080, "width": 1920, "height": 1080},
            {"left": 1920, "top": 0, "right": 4480, "bottom": 1440, "width": 2560, "height": 1440},
        ]

        chosen = get_monitor_for_point(monitors, -10, -10)

        self.assertEqual(chosen, monitors[0])

    def test_screen_capture_permission_is_noop_off_macos(self):
        with patch("roi_capture.sys.platform", "linux"):
            self.assertTrue(ensure_screen_capture_permission())

    def test_tk_runtime_reports_missing_homebrew_tk(self):
        real_import = __import__

        def fake_import(name, *args, **kwargs):
            if name == "tkinter":
                raise ModuleNotFoundError("No module named '_tkinter'", name="_tkinter")
            return real_import(name, *args, **kwargs)

        with (
            patch("builtins.__import__", fake_import),
            patch("roi_capture.tk", None),
            patch("roi_capture.Image", None),
            patch("roi_capture.ImageGrab", None),
            patch("roi_capture.ImageTk", None),
        ):
            self.assertFalse(ensure_tk_runtime())

    def test_black_frame_detection_only_applies_on_macos(self):
        black = Image.new("RGB", (20, 20), color="black")
        with patch("roi_capture.sys.platform", "darwin"):
            self.assertTrue(is_probably_permission_black_frame(black))
        with patch("roi_capture.sys.platform", "linux"):
            self.assertFalse(is_probably_permission_black_frame(black))

    def test_black_frame_detection_allows_nonblack_macos_image(self):
        image = Image.new("RGB", (20, 20), color=(20, 20, 20))
        with patch("roi_capture.sys.platform", "darwin"):
            self.assertFalse(is_probably_permission_black_frame(image))


if __name__ == "__main__":
    unittest.main()
