use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};

use crate::actions::{default_builtin_actions, default_smart_actions, BuiltinAction, SmartAction};

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Validation(String),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GeneralSettings {
    #[serde(rename = "AI_PROVIDER")]
    pub ai_provider: String,
    #[serde(rename = "GEMINI_API_KEY")]
    pub gemini_api_key: String,
    #[serde(rename = "GEMINI_MODEL")]
    pub gemini_model: String,
    #[serde(rename = "OPENAI_API_KEY")]
    pub openai_api_key: String,
    #[serde(rename = "OPENAI_MODEL")]
    pub openai_model: String,
    #[serde(rename = "OPENAI_API_BASE")]
    pub openai_api_base: String,
    #[serde(rename = "HOTKEY_POPUP")]
    pub hotkey_popup: String,
    #[serde(rename = "UI_LANGUAGE")]
    pub ui_language: String,
    #[serde(rename = "DEBUG")]
    pub debug: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SettingsSnapshot {
    pub settings: GeneralSettings,
    pub smart_actions: Vec<SmartAction>,
    pub builtin_actions: Vec<BuiltinAction>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SaveSnapshotResponse {
    pub ok: bool,
    pub error: Option<String>,
    pub smart_actions: Option<Vec<SmartAction>>,
    pub builtin_actions: Option<Vec<BuiltinAction>>,
}

pub struct AppState {
    store: Mutex<SettingsSnapshot>,
    data_dir: PathBuf,
    legacy_dir: PathBuf,
}

impl AppState {
    pub fn load() -> Self {
        let data_dir = app_data_dir()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
        let legacy_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let snapshot = read_snapshot(&data_dir).unwrap_or_else(|_| import_legacy_snapshot(&data_dir, &legacy_dir).unwrap_or_else(|_| SettingsSnapshot {
            settings: default_settings(),
            smart_actions: default_smart_actions(),
            builtin_actions: default_builtin_actions(),
        }));

        Self {
            store: Mutex::new(snapshot),
            data_dir,
            legacy_dir,
        }
    }

    pub fn snapshot(&self) -> SettingsSnapshot {
        self.store.lock().expect("settings state poisoned").clone()
    }

    pub fn save_snapshot(
        &self,
        snapshot: SettingsSnapshot,
    ) -> Result<SettingsSnapshot, SettingsError> {
        validate_snapshot(&snapshot)?;
        fs::create_dir_all(&self.data_dir)?;
        write_json(self.data_dir.join("settings.json"), &snapshot.settings)?;
        write_json(
            self.data_dir.join("smart_actions.json"),
            &snapshot.smart_actions,
        )?;
        write_json(
            self.data_dir.join("builtin_actions.json"),
            &snapshot.builtin_actions,
        )?;

        let mut store = self.store.lock().expect("settings state poisoned");
        *store = snapshot.clone();
        Ok(snapshot)
    }

    pub fn data_dir(&self) -> PathBuf {
        self.data_dir.clone()
    }

    pub fn legacy_dir(&self) -> PathBuf {
        self.legacy_dir.clone()
    }
}

pub fn default_settings() -> GeneralSettings {
    GeneralSettings {
        ai_provider: "gemini".to_string(),
        gemini_api_key: String::new(),
        gemini_model: "gemini-2.5-flash-lite".to_string(),
        openai_api_key: String::new(),
        openai_model: "gpt-4o-mini".to_string(),
        openai_api_base: "https://api.openai.com/v1".to_string(),
        hotkey_popup: "<ctrl>+'".to_string(),
        ui_language: "en".to_string(),
        debug: false,
    }
}

fn app_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join("KoDauKoVui"))
}

fn read_snapshot(data_dir: &PathBuf) -> Result<SettingsSnapshot, SettingsError> {
    let settings = read_json(data_dir.join("settings.json")).unwrap_or_else(|_| default_settings());
    let smart_actions =
        read_json(data_dir.join("smart_actions.json")).unwrap_or_else(|_| default_smart_actions());
    let builtin_actions = read_json(data_dir.join("builtin_actions.json"))
        .unwrap_or_else(|_| default_builtin_actions());
    let snapshot = SettingsSnapshot {
        settings,
        smart_actions,
        builtin_actions,
    };
    validate_snapshot(&snapshot)?;
    Ok(snapshot)
}

fn import_legacy_snapshot(
    data_dir: &PathBuf,
    legacy_dir: &PathBuf,
) -> Result<SettingsSnapshot, SettingsError> {
    let env_values = read_dotenv(legacy_dir.join(".env")).unwrap_or_default();
    let settings = import_legacy_settings(&env_values);
    let builtin_actions = import_legacy_builtin_actions(&env_values);
    let smart_actions = read_json(legacy_dir.join("smart_actions.json"))
        .unwrap_or_else(|_| default_smart_actions());
    let snapshot = SettingsSnapshot {
        settings,
        smart_actions,
        builtin_actions,
    };
    validate_snapshot(&snapshot)?;
    fs::create_dir_all(data_dir)?;
    write_json(data_dir.join("settings.json"), &snapshot.settings)?;
    write_json(data_dir.join("smart_actions.json"), &snapshot.smart_actions)?;
    write_json(data_dir.join("builtin_actions.json"), &snapshot.builtin_actions)?;
    copy_legacy_text_file(legacy_dir, data_dir, "brain.md");
    copy_legacy_text_file(legacy_dir, data_dir, "history.json");
    copy_legacy_text_file(legacy_dir, data_dir, "learned.json");
    Ok(snapshot)
}

fn import_legacy_settings(values: &HashMap<String, String>) -> GeneralSettings {
    let default = default_settings();
    GeneralSettings {
        ai_provider: normalize_provider(values.get("AI_PROVIDER"), &default.ai_provider),
        gemini_api_key: values
            .get("GEMINI_API_KEY")
            .cloned()
            .unwrap_or(default.gemini_api_key),
        gemini_model: values
            .get("GEMINI_MODEL")
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .unwrap_or(default.gemini_model),
        openai_api_key: values
            .get("OPENAI_API_KEY")
            .cloned()
            .unwrap_or(default.openai_api_key),
        openai_model: values
            .get("OPENAI_MODEL")
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .unwrap_or(default.openai_model),
        openai_api_base: values
            .get("OPENAI_API_BASE")
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .unwrap_or(default.openai_api_base),
        hotkey_popup: values
            .get("HOTKEY_POPUP")
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .unwrap_or(default.hotkey_popup),
        ui_language: values
            .get("UI_LANGUAGE")
            .map(|value| normalize_language(value, &default.ui_language))
            .unwrap_or(default.ui_language),
        debug: values
            .get("DEBUG")
            .map(|value| value.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(default.debug),
    }
}

fn import_legacy_builtin_actions(values: &HashMap<String, String>) -> Vec<BuiltinAction> {
    let mut actions = default_builtin_actions();
    for action in &mut actions {
        let env_key = match action.id.as_str() {
            "ai_prompt" => "BUILTIN_KEY_AI_PROMPT",
            "image_ask" => "BUILTIN_KEY_IMAGE_ASK",
            _ => "",
        };
        if let Some(value) = values.get(env_key).filter(|value| value.chars().count() == 1) {
            action.hotkey = value.to_lowercase();
        }
    }
    actions
}

fn read_dotenv(path: PathBuf) -> Result<HashMap<String, String>, SettingsError> {
    let raw = fs::read_to_string(path)?;
    let mut values = HashMap::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let value = value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            values.insert(key.trim().to_string(), value);
        }
    }
    Ok(values)
}

fn copy_legacy_text_file(legacy_dir: &PathBuf, data_dir: &PathBuf, name: &str) {
    let source = legacy_dir.join(name);
    let target = data_dir.join(name);
    if source.exists() && !target.exists() {
        let _ = fs::copy(source, target);
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(path: PathBuf) -> Result<T, SettingsError> {
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

fn write_json<T: Serialize>(path: PathBuf, value: &T) -> Result<(), SettingsError> {
    fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

fn validate_snapshot(snapshot: &SettingsSnapshot) -> Result<(), SettingsError> {
    if snapshot.settings.hotkey_popup.trim().is_empty() {
        return Err(SettingsError::Validation(
            "HOTKEY_POPUP cannot be empty.".to_string(),
        ));
    }
    validate_language(&snapshot.settings.ui_language)?;
    validate_action_keys(&snapshot.smart_actions, &snapshot.builtin_actions)?;
    Ok(())
}

fn normalize_provider(value: Option<&String>, default: &str) -> String {
    match value.map(|value| value.trim().to_lowercase()) {
        Some(value) if value == "gemini" || value == "openai" => value,
        _ => default.to_string(),
    }
}

fn normalize_language(value: &str, default: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "en" | "vi" | "zh" => value.trim().to_lowercase(),
        _ => default.to_string(),
    }
}

fn validate_language(language: &str) -> Result<(), SettingsError> {
    match language {
        "en" | "vi" | "zh" => Ok(()),
        _ => Err(SettingsError::Validation(
            "UI_LANGUAGE must be one of: en, vi, zh.".to_string(),
        )),
    }
}

fn validate_action_keys(
    smart_actions: &[SmartAction],
    builtin_actions: &[BuiltinAction],
) -> Result<(), SettingsError> {
    let mut keys = std::collections::HashSet::new();
    for key in smart_actions
        .iter()
        .map(|action| action.hotkey.trim().to_lowercase())
        .chain(
            builtin_actions
                .iter()
                .map(|action| action.hotkey.trim().to_lowercase()),
        )
    {
        if key.chars().count() != 1 {
            return Err(SettingsError::Validation(
                "Action hotkeys must be a single character.".to_string(),
            ));
        }
        if !keys.insert(key) {
            return Err(SettingsError::Validation(
                "Action hotkeys must be unique.".to_string(),
            ));
        }
    }
    Ok(())
}
