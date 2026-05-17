import unittest

from PIL import Image

from platform_adapter import LinuxPlatformAdapter, MacOSPlatformAdapter, WindowsPlatformAdapter


class PlatformAdapterTests(unittest.TestCase):
    def test_linux_popup_hotkey_normalization(self):
        adapter = LinuxPlatformAdapter(controller=None)
        self.assertEqual(adapter.normalize_hotkey("<ctrl>+/"), "<ctrl>+/")

    def test_macos_popup_hotkey_normalization_uses_command(self):
        adapter = MacOSPlatformAdapter(controller=None)
        self.assertEqual(adapter.normalize_hotkey("<ctrl>+'"), "<cmd>+'")

    def test_macos_keeps_explicit_command_hotkey(self):
        adapter = MacOSPlatformAdapter(controller=None)
        self.assertEqual(adapter.normalize_hotkey("<cmd>+space"), "<cmd>+space")

    def test_windows_blocks_cross_privilege_interaction(self):
        adapter = WindowsPlatformAdapter(controller=None)
        adapter._is_current_process_elevated = lambda: False
        adapter._window_is_elevated = lambda window_id: True

        message = adapter._ensure_can_interact(12345, "dán văn bản vào ứng dụng đích")

        self.assertIsNotNone(message)
        self.assertIn("Administrator", message)

    def test_windows_allows_same_privilege_interaction(self):
        adapter = WindowsPlatformAdapter(controller=None)
        adapter._is_current_process_elevated = lambda: False
        adapter._window_is_elevated = lambda window_id: False

        message = adapter._ensure_can_interact(12345, "đọc văn bản từ ứng dụng đích")

        self.assertIsNone(message)

    def test_clipboard_image_payload_shape(self):
        adapter = LinuxPlatformAdapter(controller=None)
        image = Image.new("RGB", (12, 8), color="red")

        payload = adapter._image_to_payload(image, source="clipboard_image")

        self.assertEqual(payload["source"], "clipboard_image")
        self.assertEqual(payload["mime_type"], "image/png")
        self.assertEqual(payload["size"], {"width": 12, "height": 8})
        self.assertTrue(payload["image_bytes"])


if __name__ == "__main__":
    unittest.main()
