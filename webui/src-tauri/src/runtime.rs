use std::{fs, sync::Mutex};

use serde::Serialize;
use serde_json::json;
use tauri::AppHandle;
use tokio::sync::oneshot;

use crate::{
    actions::{AI_PROMPT_ID, IMAGE_ASK_ID},
    ai::{self, ChatMessage, ChatSession, ImagePayload},
    launcher,
    native, prompts,
    settings::{AppState, SettingsSnapshot},
    windowing::{self, Page},
};

fn popup_size_for_payload(payload: &launcher::PopupPayload) -> (f64, f64) {
    let width = 480.0;
    let header = 84.0;
    let footer = 62.0;
    let section_header = 32.0;
    let quick_item = 48.0;
    let action_row = 52.0;
    let mut body = 24.0;
    for section in &payload.sections {
        body += section_header;
        if section.id == "quick_translate" {
            let rows = (section.items.len() as f64 / 3.0).ceil().max(1.0);
            body += rows * quick_item + 10.0;
        } else {
            body += (section.items.len() as f64) * action_row + 8.0;
        }
    }
    let height = (header + body + footer).clamp(260.0, 760.0);
    (width, height)
}

type PendingSender = oneshot::Sender<serde_json::Value>;

#[derive(Default)]
pub struct RuntimeState {
    ask: Mutex<Option<PendingSender>>,
    popup: Mutex<Option<PendingSender>>,
    image_source: Mutex<Option<PendingSender>>,
    chat_session: Mutex<Option<ChatSession>>,
    ask_image_context: Mutex<Option<ImagePayload>>,
    popup_selected_text: Mutex<Option<String>>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub ok: bool,
    pub error: Option<String>,
    pub session: Option<ChatSession>,
}

impl RuntimeState {
    pub fn set_pending(&self, page: Page, sender: PendingSender) {
        let slot = self.pending_slot(page);
        *slot.lock().expect("pending state poisoned") = Some(sender);
    }

    pub fn answer_pending(&self, page: Page, value: serde_json::Value) {
        let slot = self.pending_slot(page);
        if let Some(sender) = slot.lock().expect("pending state poisoned").take() {
            let _ = sender.send(value);
        }
    }

    pub fn set_chat_session(&self, session: ChatSession) {
        *self.chat_session.lock().expect("chat state poisoned") = Some(session);
    }

    pub fn chat_session(&self) -> Option<ChatSession> {
        self.chat_session
            .lock()
            .expect("chat state poisoned")
            .clone()
    }

    pub fn update_chat_session(&self, session: ChatSession) {
        self.set_chat_session(session);
    }

    pub fn set_ask_image_context(&self, image: ImagePayload) {
        *self.ask_image_context.lock().expect("ask image state poisoned") = Some(image);
    }

    pub fn ask_image_context(&self) -> Option<ImagePayload> {
        self.ask_image_context
            .lock()
            .expect("ask image state poisoned")
            .clone()
    }

    pub fn set_popup_selected_text(&self, text: String) {
        if !text.trim().is_empty() {
            *self.popup_selected_text.lock().expect("selected text state poisoned") = Some(text.trim().to_string());
        }
    }

    pub fn take_popup_selected_text(&self) -> Option<String> {
        self.popup_selected_text
            .lock()
            .expect("selected text state poisoned")
            .take()
    }

    fn pending_slot(&self, page: Page) -> &Mutex<Option<PendingSender>> {
        match page {
            Page::Ask => &self.ask,
            Page::Popup => &self.popup,
            Page::ImageSource => &self.image_source,
            Page::Settings | Page::Chat | Page::Response => {
                eprintln!("[RUNTIME] WARNING: pending_slot called for non-pending page: {:?}", page);
                &self.ask
            }
        }
    }
}

pub async fn open_popup(
    app: AppHandle,
    settings_state: tauri::State<'_, AppState>,
    runtime: tauri::State<'_, RuntimeState>,
) -> Result<(), String> {
    let target_window_id = native::active_window_id();
    let snapshot = settings_state.snapshot();
    let (payload, selected_text) = launcher::build_popup_payload(settings_state.inner(), &snapshot, target_window_id.as_deref());
    runtime.set_popup_selected_text(selected_text);
    let (sender, receiver) = oneshot::channel();
    runtime.set_pending(Page::Popup, sender);
    let popup_size = popup_size_for_payload(&payload);
    windowing::show_page(
        &app,
        Page::Popup,
        &snapshot.settings.ui_language,
        serde_json::to_value(payload).unwrap_or_else(|_| json!({})),
        target_window_id.as_deref(),
        Some(popup_size),
    )?;
    let response = receiver.await        .map_err(|_| "Popup was closed.".to_string())?;

    windowing::hide_window(&app, Page::Popup);
    if response.get("type").and_then(|v| v.as_str()) == Some("open_settings") {
        windowing::open_settings_page(&app, &snapshot.settings.ui_language)?;
        return Ok(());
    }
    let action_id = response
        .get("action_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if action_id.is_empty() {
        return Ok(());
    }
    process_action(app, settings_state.inner(), runtime.inner(), snapshot, action_id, target_window_id).await
}

pub async fn toggle_popup_from_dock(
    app: AppHandle,
    settings_state: tauri::State<'_, AppState>,
    runtime: tauri::State<'_, RuntimeState>,
) -> Result<(), String> {
    if windowing::is_window_visible(&app, Page::Popup) {
        runtime.answer_pending(Page::Popup, json!({ "type": "cancel" }));
        windowing::hide_window(&app, Page::Popup);
        return Ok(());
    }
    open_popup(app, settings_state, runtime).await
}

pub async fn retake_image_for_ask(app: AppHandle, settings_state: &AppState, runtime: &RuntimeState) -> serde_json::Value {
    windowing::hide_window(&app, Page::Ask);
    tokio::time::sleep(std::time::Duration::from_millis(220)).await;
    let image = match tokio::task::spawn_blocking(|| native::capture_roi().map_err(|err| err.to_string())).await {
        Ok(Ok(image)) => image,
        Ok(Err(err)) => {
            let snapshot = settings_state.snapshot();
            let _ = windowing::show_page(
                &app,
                Page::Ask,
                &snapshot.settings.ui_language,
                json!({
                    "title": "Ask by Image",
                    "placeholder": "Nhập câu hỏi cho hình ảnh này...",
                    "responseModeEnabled": true,
                    "defaultResponseMode": "chat",
                    "contextMode": "prompt_only",
                    "imageContextAvailable": runtime.ask_image_context().is_some(),
                }),
                None,
                None,
            );
            return json!({ "ok": false, "error": err });
        }
        Err(err) => {
            let err = err.to_string();
            let snapshot = settings_state.snapshot();
            let _ = windowing::show_page(
                &app,
                Page::Ask,
                &snapshot.settings.ui_language,
                json!({
                    "title": "Ask by Image",
                    "placeholder": "Nhập câu hỏi cho hình ảnh này...",
                    "responseModeEnabled": true,
                    "defaultResponseMode": "chat",
                    "contextMode": "prompt_only",
                    "imageContextAvailable": runtime.ask_image_context().is_some(),
                }),
                None,
                None,
            );
            return json!({ "ok": false, "error": err });
        }
    };
    runtime.set_ask_image_context(image);
    let snapshot = settings_state.snapshot();
    match windowing::show_page(
        &app,
        Page::Ask,
        &snapshot.settings.ui_language,
        json!({
            "title": "Ask by Image",
            "placeholder": "Nhập câu hỏi cho hình ảnh này...",
            "responseModeEnabled": true,
            "defaultResponseMode": "chat",
            "contextMode": "prompt_only",
            "imageContextAvailable": true,
        }),
        None,
        None,
    ) {
        Ok(_) => json!({ "ok": true }),
        Err(err) => json!({ "ok": false, "error": err }),
    }
}

pub fn get_ask_image_context(runtime: &RuntimeState) -> serde_json::Value {
    json!({
        "ok": true,
        "image_payload": runtime.ask_image_context(),
    })
}

pub async fn process_action(
    app: AppHandle,
    settings_state: &AppState,
    runtime: &RuntimeState,
    snapshot: SettingsSnapshot,
    action_id: String,
    target_window_id: Option<String>,
) -> Result<(), String> {
    if !ensure_ai_ready(&app, &snapshot)? {
        return Ok(());
    }
    if action_id == AI_PROMPT_ID {
        process_ai_prompt(app, settings_state, runtime, snapshot, target_window_id).await
    } else if action_id == IMAGE_ASK_ID {
        process_image_ask(app, settings_state, runtime, snapshot, target_window_id).await
    } else {
        process_smart_action(app, settings_state, runtime, snapshot, action_id, target_window_id).await
    }
}

fn response_payload(title: &str, content: &str, source: &str) -> serde_json::Value {
    json!({
        "title": title,
        "content": content,
        "source": source,
    })
}

fn show_response_dialog(app: &AppHandle, ui_language: &str, title: &str, content: &str, source: &str) -> Result<(), String> {
    windowing::show_page(
        app,
        Page::Response,
        ui_language,
        response_payload(title, content, source),
        None,
        None,
    )
    .map(|_| ())
}

fn deliver_text_result(
    app: &AppHandle,
    snapshot: &SettingsSnapshot,
    text: &str,
    target_window_id: Option<&str>,
    title: &str,
    source: &str,
) -> Result<(), String> {
    if native::target_has_editable_focus(target_window_id) {
        if native::paste_text(text, target_window_id).is_ok() {
            return Ok(());
        }
    }

    native::set_clipboard_text(text).map_err(|err| err.to_string())?;
    if snapshot.settings.show_response_dialog_when_no_input {
        show_response_dialog(app, &snapshot.settings.ui_language, title, text, source)?;
    }
    Ok(())
}

async fn process_smart_action(
    app: AppHandle,
    settings_state: &AppState,
    runtime: &RuntimeState,
    snapshot: SettingsSnapshot,
    action_id: String,
    target_window_id: Option<String>,
) -> Result<(), String> {
    let action = snapshot
        .smart_actions
        .iter()
        .find(|action| action.id == action_id)
        .cloned()
        .ok_or_else(|| format!("Smart action not found: {action_id}"))?;
    let selected_text = runtime
        .take_popup_selected_text()
        .filter(|text| !text.is_empty())
        .or_else(|| native::copy_selected_text(target_window_id.as_deref()).ok().filter(|text| !text.trim().is_empty()))
        .ok_or_else(|| "No text selected or in clipboard.".to_string())?;
    if selected_text.trim().is_empty() {
        return Err("No text selected or in clipboard.".to_string());
    }
    let extra = if action.ask_before_run {
        let ask = ask_user(
            &app,
            runtime,
            &snapshot.settings.ui_language,
            json!({
                "title": action.name,
                "placeholder": "Nhập yêu cầu bổ sung cho action này...",
                "responseModeEnabled": false,
                "defaultResponseMode": "paste",
                "contextMode": "selected_text",
            }),
        )
        .await?;
        ask.prompt
    } else {
        String::new()
    };
    let prompt = prompts::build_smart_action_prompt(
        &brain_context(settings_state),
        &selected_text,
        &action.prompt,
        &extra,
    );
    let mut result = ai::call_text(&snapshot.settings, &prompt)
        .await
        .map_err(|err| err.to_string())?;
    if action.return_with_source {
        result = format!("{}{}{}", result, prompts::SOURCE_SEPARATOR, selected_text);
    }
    deliver_text_result(
        &app,
        &snapshot,
        &result,
        target_window_id.as_deref(),
        &action.name,
        "Smart Action",
    )?;
    save_history(settings_state, &selected_text, &result);
    launcher::note_translation_action(settings_state, &action.id);
    Ok(())
}

async fn process_ai_prompt(
    app: AppHandle,
    settings_state: &AppState,
    runtime: &RuntimeState,
    snapshot: SettingsSnapshot,
    target_window_id: Option<String>,
) -> Result<(), String> {
    let selected_text = runtime
        .take_popup_selected_text()
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| native::copy_selected_text(target_window_id.as_deref()).unwrap_or_default());
    let context_mode = if selected_text.trim().is_empty() {
        "prompt_only"
    } else {
        "selected_text"
    };
    let placeholder = if selected_text.trim().is_empty() {
        "Ask AI anything..."
    } else {
        "Enter your request for the selected text..."
    };
    let ask = ask_user(
        &app,
        runtime,
        &snapshot.settings.ui_language,
        json!({
            "title": "AI Prompt",
            "placeholder": placeholder,
            "responseModeEnabled": true,
            "defaultResponseMode": "chat",
            "contextMode": context_mode,
        }),
    )
    .await?;
    if ask.prompt.trim().is_empty() {
        return Ok(());
    }
    if ask.response_mode == "chat" {
        let session = ChatSession {
            kind: AI_PROMPT_ID.to_string(),
            title: "AI Prompt".to_string(),
            messages: Vec::new(),
            latest_reply: String::new(),
            context_hint: if selected_text.trim().is_empty() {
                "Direct AI chat with no selected-text context.".to_string()
            } else {
                "Using selected text as the discussion context.".to_string()
            },
            selected_text: Some(selected_text),
            image_payload: None,
            initial_user_prompt: Some(ask.prompt),
            target_window_id,
        };
        runtime.set_chat_session(session);
        windowing::show_page(&app, Page::Chat, &snapshot.settings.ui_language, json!({}), None, None)?;
        return Ok(());
    }
    let prompt = prompts::build_ai_prompt_first_turn(&brain_context(settings_state), &selected_text, &ask.prompt);
    let result = ai::call_text(&snapshot.settings, &prompt)
        .await
        .map_err(|err| err.to_string())?;
    deliver_text_result(
        &app,
        &snapshot,
        &result,
        target_window_id.as_deref(),
        "AI Prompt",
        "AI Prompt",
    )?;
    let source = if selected_text.trim().is_empty() {
        format!("[ai-prompt] {}", ask.prompt)
    } else {
        selected_text
    };
    save_history(settings_state, &source, &result);
    Ok(())
}

async fn process_image_ask(
    app: AppHandle,
    settings_state: &AppState,
    runtime: &RuntimeState,
    snapshot: SettingsSnapshot,
    target_window_id: Option<String>,
) -> Result<(), String> {
    let image = capture_image_context().await?;
    runtime.set_ask_image_context(image.clone());
    let ask = ask_user(
        &app,
        runtime,
        &snapshot.settings.ui_language,
        json!({
            "title": "Ask by Image",
            "placeholder": "Nhập câu hỏi cho hình ảnh này...",
            "responseModeEnabled": true,
            "defaultResponseMode": "chat",
            "contextMode": "prompt_only",
            "imageContextAvailable": true,
        }),
    )
    .await?;
    let image = runtime.ask_image_context().unwrap_or(image);
    if ask.prompt.trim().is_empty() {
        return Ok(());
    }
    if ask.response_mode == "chat" {
        let session = ChatSession {
            kind: IMAGE_ASK_ID.to_string(),
            title: "Ask by Image".to_string(),
            messages: Vec::new(),
            latest_reply: String::new(),
            context_hint: "Using the captured image as the discussion context.".to_string(),
            selected_text: None,
            image_payload: Some(image),
            initial_user_prompt: Some(ask.prompt),
            target_window_id,
        };
        runtime.set_chat_session(session);
        windowing::show_page(&app, Page::Chat, &snapshot.settings.ui_language, json!({}), None, None)?;
        return Ok(());
    }
    let prompt = prompts::build_image_question_prompt(&brain_context(settings_state), &ask.prompt);
    let result = ai::call_image(&snapshot.settings, &prompt, &image)
        .await
        .map_err(|err| err.to_string())?;
    deliver_text_result(
        &app,
        &snapshot,
        &result,
        target_window_id.as_deref(),
        "Ask by Image",
        "Ask by Image",
    )?;
    save_history(settings_state, &format!("[image:{}] {}", image.source, ask.prompt), &result);
    Ok(())
}

async fn capture_image_context() -> Result<ImagePayload, String> {
    if let Some(clipboard_image) = native::read_clipboard_image().map_err(|err| err.to_string())? {
        return Ok(clipboard_image);
    }
    native::capture_roi().map_err(|err| err.to_string())
}

#[derive(Debug)]
struct AskResult {
    prompt: String,
    response_mode: String,
}

async fn ask_user(
    app: &AppHandle,
    runtime: &RuntimeState,
    ui_language: &str,
    payload: serde_json::Value,
) -> Result<AskResult, String> {
    let (sender, receiver) = oneshot::channel();
    runtime.set_pending(Page::Ask, sender);
    windowing::show_page(app, Page::Ask, ui_language, payload, None, None)?;
    let response = receiver
        .await
        .map_err(|_| "User cancelled input.".to_string())?;
    windowing::hide_window(app, Page::Ask);
    if response.get("type").and_then(|v| v.as_str()) == Some("cancel") {
        return Err("User cancelled input.".to_string());
    }
    Ok(AskResult {
        prompt: response
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string(),
        response_mode: response
            .get("response_mode")
            .and_then(|v| v.as_str())
            .unwrap_or("paste")
            .trim()
            .to_lowercase(),
    })
}

pub async fn bootstrap_chat(
    settings_state: &AppState,
    runtime: &RuntimeState,
) -> ChatResponse {
    let mut session = match runtime.chat_session() {
        Some(session) => session,
        None => {
            return chat_error("Chat session is not available.");
        }
    };
    ensure_initial_user_message(&mut session);
    if session.messages.is_empty() {
        return chat_error("Initial prompt is empty.");
    }
    if session.latest_reply.trim().is_empty() {
        runtime.update_chat_session(session.clone());
    }
    if session
        .messages
        .last()
        .map(|message| message.role == "assistant")
        .unwrap_or(false)
    {
        return chat_ok(session);
    }
    match ai::call_chat_turn(&settings_state.snapshot().settings, &session).await {
        Ok(reply) => {
            session.messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: reply.clone(),
            });
            session.latest_reply = reply;
            runtime.update_chat_session(session.clone());
            chat_ok(session)
        }
        Err(err) => chat_error(err.to_string()),
    }
}

pub fn get_chat_state(runtime: &RuntimeState) -> ChatResponse {
    let mut session = match runtime.chat_session() {
        Some(session) => session,
        None => return chat_error("Chat session is not available."),
    };
    if ensure_initial_user_message(&mut session) {
        runtime.update_chat_session(session.clone());
    }
    chat_ok(session)
}

fn ensure_initial_user_message(session: &mut ChatSession) -> bool {
    if !session.messages.is_empty() {
        return false;
    }
    let Some(initial_prompt) = session.initial_user_prompt.as_deref() else {
        return false;
    };
    let initial_prompt = initial_prompt.trim();
    if initial_prompt.is_empty() {
        return false;
    }
    session.messages.push(ChatMessage {
        role: "user".to_string(),
        content: initial_prompt.to_string(),
    });
    true
}

pub async fn send_chat_message(
    settings_state: &AppState,
    runtime: &RuntimeState,
    prompt: String,
) -> ChatResponse {
    let mut session = match runtime.chat_session() {
        Some(session) => session,
        None => return chat_error("Chat session is not available."),
    };
    if prompt.trim().is_empty() {
        return chat_error("Message is empty.");
    }
    session.messages.push(ChatMessage {
        role: "user".to_string(),
        content: prompt.trim().to_string(),
    });
    runtime.update_chat_session(session.clone());
    match ai::call_chat_turn(&settings_state.snapshot().settings, &session).await {
        Ok(reply) => {
            session.messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: reply.clone(),
            });
            session.latest_reply = reply;
            runtime.update_chat_session(session.clone());
            chat_ok(session)
        }
        Err(err) => chat_error(err.to_string()),
    }
}

pub fn insert_latest_reply(app: &AppHandle, settings_state: &AppState, runtime: &RuntimeState) -> serde_json::Value {
    let session = match runtime.chat_session() {
        Some(session) => session,
        None => return json!({ "ok": false, "error": "Chat session is not available." }),
    };
    if session.latest_reply.trim().is_empty() {
        return json!({ "ok": false, "error": "No assistant reply to insert." });
    }
    let snapshot = settings_state.snapshot();
    match deliver_text_result(
        app,
        &snapshot,
        &session.latest_reply,
        session.target_window_id.as_deref(),
        "AI Chat",
        "Latest Reply",
    ) {
        Ok(()) => json!({ "ok": true }),
        Err(err) => json!({ "ok": false, "error": err }),
    }
}

fn brain_context(settings_state: &AppState) -> String {
    for path in [
        settings_state.data_dir().join("brain.md"),
        settings_state.legacy_dir().join("brain.md"),
    ] {
        if let Ok(raw) = fs::read_to_string(path) {
            let marker = "[Nhập thông tin ngữ cảnh của bạn vào bên dưới dòng này]";
            let content = raw
                .split(marker)
                .last()
                .unwrap_or(&raw)
                .trim()
                .to_string();
            if !content.is_empty() {
                return format!("[AI BRAIN CONTEXT]\n{content}\n[END CONTEXT]");
            }
        }
    }
    String::new()
}

fn save_history(settings_state: &AppState, original: &str, result: &str) {
    let path = settings_state.data_dir().join("history.json");
    let mut history: Vec<serde_json::Value> = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    history.push(json!({
        "original": original,
        "result": result,
        "user_edit": false,
    }));
    if history.len() > 1000 {
        history = history.split_off(history.len() - 1000);
    }
    if let Err(err) = fs::create_dir_all(settings_state.data_dir()) {
        eprintln!("[HISTORY] Failed to create data dir: {err}");
        return;
    }
    match serde_json::to_string_pretty(&history) {
        Ok(raw) => {
            if let Err(err) = fs::write(path, raw) {
                eprintln!("[HISTORY] Failed to write history.json: {err}");
            }
        }
        Err(err) => eprintln!("[HISTORY] Failed to serialize history: {err}"),
    }
}

fn ensure_ai_ready(app: &AppHandle, snapshot: &SettingsSnapshot) -> Result<bool, String> {
    if ai::has_configured_token(&snapshot.settings) {
        return Ok(true);
    }
    windowing::open_settings_page(app, &snapshot.settings.ui_language)?;
    Ok(false)
}

fn chat_ok(session: ChatSession) -> ChatResponse {
    ChatResponse {
        ok: true,
        error: None,
        session: Some(session),
    }
}

fn chat_error(error: impl Into<String>) -> ChatResponse {
    ChatResponse {
        ok: false,
        error: Some(error.into()),
        session: None,
    }
}
