import unittest

from roi_capture import get_monitor_for_point, parse_xrandr_listmonitors


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


if __name__ == "__main__":
    unittest.main()
