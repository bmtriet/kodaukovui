from __future__ import annotations

import json
import uuid
from collections import OrderedDict
from copy import deepcopy
from pathlib import Path
from typing import Any

from dotenv import dotenv_values, set_key


AI_PROMPT_ID = "ai_prompt"
IMAGE_ASK_ID = "image_ask"
RETIRED_SMART_ACTION_IDS = {"ai-prompt", AI_PROMPT_ID}

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

BUILTIN_ACTION_DEFS = [
    {
        "id": AI_PROMPT_ID,
        "name": "AI Prompt",
        "kind": AI_PROMPT_ID,
        "hotkey": "a",
        "env_key": "BUILTIN_KEY_AI_PROMPT",
    },
    {
        "id": IMAGE_ASK_ID,
        "name": "Ask by Image",
        "kind": IMAGE_ASK_ID,
        "hotkey": "i",
        "env_key": "BUILTIN_KEY_IMAGE_ASK",
    },
]

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


def _default_smart_actions() -> list[dict[str, Any]]:
    return deepcopy(DEFAULT_SMART_ACTIONS)


def _default_builtin_actions() -> list[dict[str, Any]]:
    return [
        {
            "id": item["id"],
            "name": item["name"],
            "kind": item["kind"],
            "hotkey": item["hotkey"],
        }
        for item in BUILTIN_ACTION_DEFS
    ]


def _builtin_env_map() -> dict[str, str]:
    return {item["id"]: item["env_key"] for item in BUILTIN_ACTION_DEFS}


def _builtin_defs_map() -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in BUILTIN_ACTION_DEFS}


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


def load_builtin_actions(env_path: str | Path) -> list[dict[str, Any]]:
    env_values = dotenv_values(env_path)
    defaults = _default_builtin_actions()
    env_map = _builtin_env_map()
    for action in defaults:
        raw = env_values.get(env_map[action["id"]])
        if raw is not None:
            try:
                action["hotkey"] = _normalize_action_key(raw, field_name=env_map[action["id"]])
            except ValueError:
                pass
    return validate_builtin_actions_payload(defaults)


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


def validate_builtin_actions_payload(payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise ValueError("Built-in actions payload must be a list.")

    defs_map = _builtin_defs_map()
    normalized: list[dict[str, Any]] = []

    for item in payload:
        action_id = _normalize_string(item.get("id"))
        if action_id not in defs_map:
            raise ValueError(f"Unknown built-in action id: {action_id}")
        action_def = defs_map[action_id]
        normalized.append(
            {
                "id": action_id,
                "name": action_def["name"],
                "kind": action_def["kind"],
                "hotkey": _normalize_action_key(item.get("hotkey")),
            }
        )

    expected_ids = {item["id"] for item in BUILTIN_ACTION_DEFS}
    actual_ids = {item["id"] for item in normalized}
    if actual_ids != expected_ids:
        missing = ", ".join(sorted(expected_ids - actual_ids))
        extra = ", ".join(sorted(actual_ids - expected_ids))
        detail = missing or extra or "invalid set"
        raise ValueError(f"Built-in actions payload is incomplete: {detail}")

    hotkeys = [item["hotkey"] for item in normalized]
    if len(set(hotkeys)) != len(hotkeys):
        raise ValueError("Built-in action hotkeys must be unique.")

    return sorted(normalized, key=lambda item: [a["id"] for a in BUILTIN_ACTION_DEFS].index(item["id"]))


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


def save_builtin_actions(env_path: str | Path, actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    env_path = Path(env_path)
    env_path.parent.mkdir(parents=True, exist_ok=True)
    if not env_path.exists():
        env_path.touch()

    normalized_actions = validate_builtin_actions_payload(actions)
    env_map = _builtin_env_map()
    for action in normalized_actions:
        set_key(str(env_path), env_map[action["id"]], action["hotkey"])
    return normalized_actions


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


def validate_smart_actions_payload(
    payload: list[dict[str, Any]],
    builtin_actions: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise ValueError("Smart actions payload must be a list.")

    reserved_hotkeys = {
        action["hotkey"] for action in (builtin_actions if builtin_actions is not None else _default_builtin_actions())
    }
    normalized_actions = [validate_smart_action_payload(item) for item in payload]
    normalized_actions = [item for item in normalized_actions if item["id"] not in RETIRED_SMART_ACTION_IDS]

    hotkeys = [item["hotkey"] for item in normalized_actions]
    if len(set(hotkeys)) != len(hotkeys):
        raise ValueError("Smart action hotkeys must be unique.")
    if reserved_hotkeys.intersection(hotkeys):
        reserved = ", ".join(sorted(reserved_hotkeys.intersection(hotkeys)))
        raise ValueError(f"Smart action hotkeys cannot use reserved built-in keys: {reserved}.")

    ids = [item["id"] for item in normalized_actions]
    if len(set(ids)) != len(ids):
        raise ValueError("Smart action ids must be unique.")

    return normalized_actions


def load_smart_actions(
    actions_path: str | Path,
    builtin_actions: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    actions_path = Path(actions_path)
    actions_path.parent.mkdir(parents=True, exist_ok=True)

    if not actions_path.exists():
        actions = _default_smart_actions()
        save_smart_actions(actions_path, actions, builtin_actions=builtin_actions)
        return actions

    try:
        data = json.loads(actions_path.read_text(encoding="utf-8"))
        normalized = validate_smart_actions_payload(data, builtin_actions=builtin_actions)
        if normalized != data:
            save_smart_actions(actions_path, normalized, builtin_actions=builtin_actions)
        return normalized
    except Exception:
        actions = _default_smart_actions()
        save_smart_actions(actions_path, actions, builtin_actions=builtin_actions)
        return actions


def save_smart_actions(
    actions_path: str | Path,
    actions: list[dict[str, Any]],
    builtin_actions: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    actions_path = Path(actions_path)
    actions_path.parent.mkdir(parents=True, exist_ok=True)
    normalized_actions = validate_smart_actions_payload(actions, builtin_actions=builtin_actions)
    actions_path.write_text(
        json.dumps(normalized_actions, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return normalized_actions


def load_settings_snapshot(env_path: str | Path, actions_path: str | Path) -> dict[str, Any]:
    builtin_actions = load_builtin_actions(env_path)
    return {
        "settings": load_settings(env_path),
        "smart_actions": load_smart_actions(actions_path, builtin_actions=builtin_actions),
        "builtin_actions": builtin_actions,
    }
