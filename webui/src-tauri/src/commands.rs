use serde_json::json;
use tauri::{AppHandle, State};

use crate::{
    platform,
    runtime::{self, RuntimeState},
    settings::{AppState, SaveSnapshotResponse, SettingsSnapshot},
    windowing::{self, Page},
};

#[tauri::command]
pub fn get_settings_snapshot(state: State<'_, AppState>) -> SettingsSnapshot {
    state.snapshot()
}

#[tauri::command]
pub fn save_settings_snapshot(state: State<'_, AppState>, payload: String) -> SaveSnapshotResponse {
    match serde_json::from_str::<SettingsSnapshot>(&payload)
        .map_err(|err| err.to_string())
        .and_then(|snapshot| state.save_snapshot(snapshot).map_err(|err| err.to_string()))
    {
        Ok(snapshot) => SaveSnapshotResponse {
            ok: true,
            error: None,
            smart_actions: Some(snapshot.smart_actions),
            builtin_actions: Some(snapshot.builtin_actions),
        },
        Err(error) => SaveSnapshotResponse {
            ok: false,
            error: Some(error),
            smart_actions: None,
            builtin_actions: None,
        },
    }
}

#[tauri::command]
pub fn set_ui_language(state: State<'_, AppState>, lang: String) {
    let mut snapshot = state.snapshot();
    snapshot.settings.ui_language = lang;
    let _ = state.save_snapshot(snapshot);
}

#[tauri::command]
pub fn submit_ask(state: State<'_, RuntimeState>, prompt: String, response_mode: Option<String>) {
    state.answer_pending(
        Page::Ask,
        json!({
            "prompt": prompt,
            "response_mode": response_mode.unwrap_or_else(|| "paste".to_string())
        }),
    );
}

#[tauri::command]
pub fn cancel_ask(app: AppHandle, state: State<'_, RuntimeState>) {
    state.answer_pending(Page::Ask, json!({ "type": "cancel" }));
    windowing::hide_window(&app, Page::Ask);
}

#[tauri::command]
pub fn submit_popup(app: AppHandle, state: State<'_, RuntimeState>, action_id: String) {
    state.answer_pending(Page::Popup, json!({ "type": "popup_action", "action_id": action_id }));
    windowing::hide_window(&app, Page::Popup);
}

#[tauri::command]
pub fn cancel_popup(app: AppHandle, state: State<'_, RuntimeState>) {
    state.answer_pending(Page::Popup, json!({ "type": "cancel" }));
    windowing::hide_window(&app, Page::Popup);
}

#[tauri::command]
pub fn open_settings(app: AppHandle, settings: State<'_, AppState>, state: State<'_, RuntimeState>) {
    state.answer_pending(Page::Popup, json!({ "type": "open_settings" }));
    let lang = settings.snapshot().settings.ui_language;
    let _ = windowing::open_settings_page(&app, &lang);
}

#[tauri::command]
pub fn close_settings(app: AppHandle, _saved: bool) {
    windowing::hide_window(&app, Page::Settings);
}

#[tauri::command]
pub fn choose_image_source(app: AppHandle, state: State<'_, RuntimeState>, source: String, do_not_ask_again: Option<bool>) {
    state.answer_pending(Page::ImageSource, json!({ "source": source, "do_not_ask_again": do_not_ask_again.unwrap_or(false) }));
    windowing::hide_window(&app, Page::ImageSource);
}

#[tauri::command]
pub fn cancel_image_source(app: AppHandle, state: State<'_, RuntimeState>) {
    state.answer_pending(Page::ImageSource, json!({ "type": "cancel" }));
    windowing::hide_window(&app, Page::ImageSource);
}

#[tauri::command]
pub async fn bootstrap_chat(
    settings: State<'_, AppState>,
    runtime_state: State<'_, RuntimeState>,
) -> Result<runtime::ChatResponse, String> {
    Ok(runtime::bootstrap_chat(settings.inner(), runtime_state.inner()).await)
}

#[tauri::command]
pub async fn send_chat_message(
    settings: State<'_, AppState>,
    runtime_state: State<'_, RuntimeState>,
    prompt: String,
) -> Result<runtime::ChatResponse, String> {
    Ok(runtime::send_chat_message(settings.inner(), runtime_state.inner(), prompt).await)
}

#[tauri::command]
pub fn insert_latest_reply(runtime_state: State<'_, RuntimeState>) -> serde_json::Value {
    runtime::insert_latest_reply(runtime_state.inner())
}

#[tauri::command]
pub fn close_chat(app: AppHandle) {
    windowing::hide_window(&app, Page::Chat);
}

#[tauri::command]
pub fn platform_summary() -> platform::PlatformSummary {
    platform::summary()
}
