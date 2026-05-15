from __future__ import annotations

import json
import uuid
from collections import OrderedDict
from copy import deepcopy
from pathlib import Path
from typing import Any

from dotenv import dotenv_values, set_key


DEFAULT_SETTINGS = OrderedDict(
    [
        ("AI_PROVIDER", "gemini"),
        ("GEMINI_API_KEY", ""),
        ("GEMINI_MODEL", "gemini-2.5-flash-lite"),
        ("OPENAI_API_KEY", ""),
        ("OPENAI_MODEL", "gpt-4o-mini"),
        ("OPENAI_API_BASE", "https://api.openai.com/v1"),
        ("HOTKEY_POPUP", "<ctrl>+'"),
        ("UI_LANGUAGE", "en"),
        ("DEBUG", "false"),
    ]
)

BOOLEAN_FIELDS = {"DEBUG"}
LANGUAGE_OPTIONS = {"en", "vi", "zh"}
PROVIDER_OPTIONS = {"gemini", "openai"}

DEFAULT_SMART_ACTIONS = [
    {
        "id": "add-vietnamese-marks",
        "name": "Thêm dấu tiếng Việt",
        "prompt": (
            "Bạn là chuyên gia tiếng Việt. Hãy thêm dấu chuẩn xác nhất cho đoạn văn bản được cung cấp. "
            "Chỉ trả về văn bản đã thêm dấu, không giải thích, không thêm bình luận."
        ),
        "hotkey": "1",
        "return_with_source": False,
        "ask_before_run": False,
    },
    {
        "id": "translate-to-english",
        "name": "Translate to English",
        "prompt": (
            "Translate the provided text into natural English. Return only the translated text. "
            "Do not explain your answer."
        ),
        "hotkey": "e",
        "return_with_source": False,
        "ask_before_run": False,
    },
    {
        "id": "translate-to-vietnamese",
        "name": "Translate to Vietnamese",
        "prompt": (
            "Hãy dịch đoạn văn bản được cung cấp sang tiếng Việt tự nhiên. "
            "Chỉ trả về bản dịch, không giải thích."
        ),
        "hotkey": "v",
        "return_with_source": False,
        "ask_before_run": False,
    },
    {
        "id": "translate-to-zh-tw",
        "name": "Translate to Traditional Chinese",
        "prompt": (
            "Translate the provided text into Traditional Chinese used in Taiwan. "
            "Return only the translated text without explanations."
        ),
        "hotkey": "z",
        "return_with_source": False,
        "ask_before_run": False,
    },
    {
        "id": "translate-to-khmer",
        "name": "Translate to Khmer",
        "prompt": (
            "Translate the provided text into natural Khmer. "
            "Return only the translated text without explanations."
        ),
        "hotkey": "k",
        "return_with_source": False,
        "ask_before_run": False,
    },
    {
        "id": "ai-prompt",
        "name": "AI Prompt",
        "prompt": (
            "You are a helpful AI assistant. Apply the user's additional instruction to the provided text. "
            "Return the final answer directly unless the user's instruction asks for a different output format."
        ),
        "hotkey": "a",
        "return_with_source": False,
        "ask_before_run": True,
    },
]


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() == "true"


def _normalize_string(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def _normalize_language(value: Any) -> str:
    normalized = _normalize_string(value, "en").lower()
    if normalized not in LANGUAGE_OPTIONS:
        raise ValueError("UI_LANGUAGE must be one of: en, vi, zh.")
    return normalized


def _normalize_provider(value: Any) -> str:
    normalized = _normalize_string(value, "gemini").lower()
    if normalized not in PROVIDER_OPTIONS:
        raise ValueError("AI_PROVIDER must be either 'gemini' or 'openai'.")
    return normalized


def _normalize_hotkey_popup(value: Any) -> str:
    normalized = _normalize_string(value, DEFAULT_SETTINGS["HOTKEY_POPUP"])
    if not normalized:
        raise ValueError("HOTKEY_POPUP cannot be empty.")
    return normalized


def _normalize_action_key(value: Any, field_name: str = "hotkey") -> str:
    normalized = _normalize_string(value).lower()
    if len(normalized) != 1:
        raise ValueError(f"{field_name} must be a single character.")
    if normalized.isspace():
        raise ValueError(f"{field_name} cannot be whitespace.")
    return normalized


def load_settings(env_path: str | Path) -> dict[str, Any]:
    env_values = dotenv_values(env_path)
    settings: dict[str, Any] = {}

    for key, default in DEFAULT_SETTINGS.items():
        raw = env_values.get(key)

        if key in BOOLEAN_FIELDS:
            settings[key] = _coerce_bool(raw, default == "true")
        elif key == "AI_PROVIDER":
            try:
                settings[key] = _normalize_provider(raw if raw is not None else default)
            except ValueError:
                settings[key] = default
        elif key == "UI_LANGUAGE":
            try:
                settings[key] = _normalize_language(raw if raw is not None else default)
            except ValueError:
                settings[key] = default
        else:
            settings[key] = str(raw) if raw is not None else default

    return settings


def validate_settings_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    normalized["AI_PROVIDER"] = _normalize_provider(payload.get("AI_PROVIDER"))
    normalized["GEMINI_API_KEY"] = str(payload.get("GEMINI_API_KEY", "") or "")
    normalized["GEMINI_MODEL"] = _normalize_string(payload.get("GEMINI_MODEL"), DEFAULT_SETTINGS["GEMINI_MODEL"])
    normalized["OPENAI_API_KEY"] = str(payload.get("OPENAI_API_KEY", "") or "")
    normalized["OPENAI_MODEL"] = _normalize_string(payload.get("OPENAI_MODEL"), DEFAULT_SETTINGS["OPENAI_MODEL"])
    normalized["OPENAI_API_BASE"] = _normalize_string(payload.get("OPENAI_API_BASE"), DEFAULT_SETTINGS["OPENAI_API_BASE"])
    normalized["HOTKEY_POPUP"] = _normalize_hotkey_popup(payload.get("HOTKEY_POPUP"))
    normalized["UI_LANGUAGE"] = _normalize_language(payload.get("UI_LANGUAGE"))
    normalized["DEBUG"] = _coerce_bool(payload.get("DEBUG"))
    return normalized


def save_settings(env_path: str | Path, settings: dict[str, Any]) -> None:
    env_path = Path(env_path)
    env_path.parent.mkdir(parents=True, exist_ok=True)
    if not env_path.exists():
        env_path.touch()

    for key in DEFAULT_SETTINGS.keys():
        value = settings.get(key, DEFAULT_SETTINGS[key])
        if isinstance(value, bool):
            value = "true" if value else "false"
        else:
            value = str(value)
        set_key(str(env_path), key, value)


def _default_smart_actions() -> list[dict[str, Any]]:
    return deepcopy(DEFAULT_SMART_ACTIONS)


def validate_smart_action_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}

    action_id = _normalize_string(payload.get("id"))
    normalized["id"] = action_id or uuid.uuid4().hex

    name = _normalize_string(payload.get("name"))
    if not name:
        raise ValueError("Action name is required.")
    normalized["name"] = name

    prompt = str(payload.get("prompt", "") or "").strip()
    if not prompt:
        raise ValueError("Action prompt is required.")
    normalized["prompt"] = prompt

    normalized["hotkey"] = _normalize_action_key(payload.get("hotkey"))
    normalized["return_with_source"] = _coerce_bool(payload.get("return_with_source"))
    normalized["ask_before_run"] = _coerce_bool(payload.get("ask_before_run"))
    return normalized


def validate_smart_actions_payload(payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise ValueError("Smart actions payload must be a list.")

    normalized_actions = [validate_smart_action_payload(item) for item in payload]

    hotkeys = [item["hotkey"] for item in normalized_actions]
    if len(set(hotkeys)) != len(hotkeys):
        raise ValueError("Smart action hotkeys must be unique.")

    ids = [item["id"] for item in normalized_actions]
    if len(set(ids)) != len(ids):
        raise ValueError("Smart action ids must be unique.")

    return normalized_actions


def load_smart_actions(actions_path: str | Path) -> list[dict[str, Any]]:
    actions_path = Path(actions_path)
    actions_path.parent.mkdir(parents=True, exist_ok=True)

    if not actions_path.exists():
        actions = _default_smart_actions()
        save_smart_actions(actions_path, actions)
        return actions

    try:
        data = json.loads(actions_path.read_text(encoding="utf-8"))
        return validate_smart_actions_payload(data)
    except Exception:
        actions = _default_smart_actions()
        save_smart_actions(actions_path, actions)
        return actions


def save_smart_actions(actions_path: str | Path, actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    actions_path = Path(actions_path)
    actions_path.parent.mkdir(parents=True, exist_ok=True)
    normalized_actions = validate_smart_actions_payload(actions)
    actions_path.write_text(
        json.dumps(normalized_actions, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return normalized_actions


def load_settings_snapshot(env_path: str | Path, actions_path: str | Path) -> dict[str, Any]:
    return {
        "settings": load_settings(env_path),
        "smart_actions": load_smart_actions(actions_path),
    }
