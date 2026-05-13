import unittest

from platform_adapter import LinuxPlatformAdapter, WindowsPlatformAdapter


class PlatformAdapterTests(unittest.TestCase):
    def test_linux_popup_hotkey_normalization(self):
        adapter = LinuxPlatformAdapter(controller=None)
        self.assertEqual(adapter.normalize_hotkey("<ctrl>+/"), "<ctrl>+/")

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


if __name__ == "__main__":
    unittest.main()
