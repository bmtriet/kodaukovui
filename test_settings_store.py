import json
import tempfile
import unittest
from pathlib import Path

from settings_store import (
    AI_PROMPT_ID,
    BUILTIN_ACTION_DEFS,
    IMAGE_ASK_ID,
    load_builtin_actions,
    load_settings,
    load_settings_snapshot,
    load_smart_actions,
    save_builtin_actions,
    save_settings,
    save_smart_actions,
    validate_builtin_actions_payload,
    validate_settings_payload,
    validate_smart_actions_payload,
)


class SettingsStoreTests(unittest.TestCase):
    def test_validate_rejects_duplicate_action_hotkeys(self):
        builtins = validate_builtin_actions_payload(
            [
                {"id": AI_PROMPT_ID, "hotkey": "a"},
                {"id": IMAGE_ASK_ID, "hotkey": "i"},
            ]
        )
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
            validate_smart_actions_payload(actions, builtin_actions=builtins)

    def test_validate_rejects_reserved_builtin_hotkey(self):
        builtins = validate_builtin_actions_payload(
            [
                {"id": AI_PROMPT_ID, "hotkey": "a"},
                {"id": IMAGE_ASK_ID, "hotkey": "i"},
            ]
        )
        actions = [
            {
                "id": "image-conflict",
                "name": "Image conflict",
                "prompt": "Prompt one",
                "hotkey": "i",
                "return_with_source": False,
                "ask_before_run": False,
            }
        ]

        with self.assertRaises(ValueError):
            validate_smart_actions_payload(actions, builtin_actions=builtins)

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

    def test_builtin_actions_roundtrip(self):
        builtins = [
            {"id": AI_PROMPT_ID, "hotkey": "p"},
            {"id": IMAGE_ASK_ID, "hotkey": "o"},
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            env_path = Path(tmpdir) / ".env"
            save_builtin_actions(env_path, builtins)
            loaded = load_builtin_actions(env_path)

        self.assertEqual(loaded[0]["id"], AI_PROMPT_ID)
        self.assertEqual(loaded[0]["hotkey"], "p")
        self.assertEqual(loaded[1]["id"], IMAGE_ASK_ID)
        self.assertEqual(loaded[1]["hotkey"], "o")

    def test_load_smart_actions_seeds_default_file_without_ai_prompt(self):
        builtins = validate_builtin_actions_payload(
            [
                {"id": AI_PROMPT_ID, "hotkey": "a"},
                {"id": IMAGE_ASK_ID, "hotkey": "i"},
            ]
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            actions_path = Path(tmpdir) / "smart_actions.json"
            actions = load_smart_actions(actions_path, builtin_actions=builtins)

            self.assertTrue(actions_path.exists())
            self.assertGreaterEqual(len(actions), 1)
            self.assertNotIn("ai-prompt", {action["id"] for action in actions})
            persisted = json.loads(actions_path.read_text(encoding="utf-8"))
            self.assertEqual(actions, persisted)

    def test_save_smart_actions_roundtrip(self):
        builtins = validate_builtin_actions_payload(
            [
                {"id": AI_PROMPT_ID, "hotkey": "a"},
                {"id": IMAGE_ASK_ID, "hotkey": "i"},
            ]
        )
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
            save_smart_actions(actions_path, actions, builtin_actions=builtins)
            loaded = load_smart_actions(actions_path, builtin_actions=builtins)

        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0]["id"], "custom-action")
        self.assertEqual(loaded[0]["hotkey"], "q")
        self.assertTrue(loaded[0]["return_with_source"])
        self.assertTrue(loaded[0]["ask_before_run"])

    def test_settings_snapshot_includes_builtin_actions(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            env_path = Path(tmpdir) / ".env"
            actions_path = Path(tmpdir) / "smart_actions.json"
            snapshot = load_settings_snapshot(env_path, actions_path)

        self.assertIn("builtin_actions", snapshot)
        self.assertEqual(snapshot["builtin_actions"][0]["id"], BUILTIN_ACTION_DEFS[0]["id"])
        self.assertEqual(snapshot["builtin_actions"][1]["id"], BUILTIN_ACTION_DEFS[1]["id"])

    def test_validate_rejects_duplicate_builtin_hotkeys(self):
        with self.assertRaises(ValueError):
            validate_builtin_actions_payload(
                [
                    {"id": AI_PROMPT_ID, "hotkey": "a"},
                    {"id": IMAGE_ASK_ID, "hotkey": "a"},
                ]
            )


if __name__ == "__main__":
    unittest.main()
