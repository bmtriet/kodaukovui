import json
import tempfile
import unittest
from pathlib import Path

from settings_store import (
    load_settings,
    load_smart_actions,
    save_settings,
    save_smart_actions,
    validate_settings_payload,
    validate_smart_actions_payload,
)


class SettingsStoreTests(unittest.TestCase):
    def test_validate_rejects_duplicate_action_hotkeys(self):
        actions = [
            {
                "id": "one",
                "name": "Action One",
                "prompt": "Prompt one",
                "hotkey": "e",
                "return_with_source": False,
                "ask_before_run": False,
            },
            {
                "id": "two",
                "name": "Action Two",
                "prompt": "Prompt two",
                "hotkey": "e",
                "return_with_source": False,
                "ask_before_run": True,
            },
        ]

        with self.assertRaises(ValueError):
            validate_smart_actions_payload(actions)

    def test_general_settings_roundtrip(self):
        payload = {
            "AI_PROVIDER": "openai",
            "GEMINI_API_KEY": "",
            "GEMINI_MODEL": "gemini-2.5-flash-lite",
            "OPENAI_API_KEY": "secret",
            "OPENAI_MODEL": "gpt-4o-mini",
            "OPENAI_API_BASE": "https://api.openai.com/v1",
            "HOTKEY_POPUP": "<ctrl>+'",
            "UI_LANGUAGE": "vi",
            "DEBUG": True,
        }

        normalized = validate_settings_payload(payload)

        with tempfile.TemporaryDirectory() as tmpdir:
            env_path = Path(tmpdir) / ".env"
            save_settings(env_path, normalized)
            loaded = load_settings(env_path)

        self.assertEqual(loaded["AI_PROVIDER"], "openai")
        self.assertEqual(loaded["OPENAI_API_KEY"], "secret")
        self.assertEqual(loaded["UI_LANGUAGE"], "vi")
        self.assertTrue(loaded["DEBUG"])

    def test_load_smart_actions_seeds_default_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            actions_path = Path(tmpdir) / "smart_actions.json"
            actions = load_smart_actions(actions_path)

            self.assertTrue(actions_path.exists())
            self.assertGreaterEqual(len(actions), 1)
            persisted = json.loads(actions_path.read_text(encoding="utf-8"))
            self.assertEqual(actions, persisted)

    def test_save_smart_actions_roundtrip(self):
        actions = [
            {
                "id": "custom-action",
                "name": "Custom Action",
                "prompt": "Do something custom",
                "hotkey": "q",
                "return_with_source": True,
                "ask_before_run": True,
            }
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            actions_path = Path(tmpdir) / "smart_actions.json"
            save_smart_actions(actions_path, actions)
            loaded = load_smart_actions(actions_path)

        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0]["id"], "custom-action")
        self.assertEqual(loaded[0]["hotkey"], "q")
        self.assertTrue(loaded[0]["return_with_source"])
        self.assertTrue(loaded[0]["ask_before_run"])


if __name__ == "__main__":
    unittest.main()
