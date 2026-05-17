use std::{fs, sync::Mutex};

use serde::Serialize;
use serde_json::json;
use tauri::AppHandle;
use tokio::sync::oneshot;

use crate::{
    actions::{AI_PROMPT_ID, IMAGE_ASK_ID},
    ai::{self, ChatMessage, ChatSession, ImagePayload},
    native, prompts,
    settings::{AppState, SettingsSnapshot},
    windowing::{self, Page},
};

type PendingSender = oneshot::Sender<serde_json::Value>;

#[derive(Default)]
pub struct RuntimeState {
    ask: Mutex<Option<PendingSender>>,
    popup: Mutex<Option<PendingSender>>,
    image_source: Mutex<Option<PendingSender>>,
    chat_session: Mutex<Option<ChatSession>>,
    skip_image_source_picker: Mutex<bool>,
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

    fn pending_slot(&self, page: Page) -> &Mutex<Option<PendingSender>> {
        match page {
            Page::Ask => &self.ask,
            Page::Popup => &self.popup,
            Page::ImageSource => &self.image_source,
            Page::Settings | Page::Chat => {
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
    let (sender, receiver) = oneshot::channel();
    runtime.set_pending(Page::Popup, sender);
    windowing::show_page(
        &app,
        Page::Popup,
        &snapshot.settings.ui_language,
        json!({}),
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

pub async fn process_action(
    app: AppHandle,
    settings_state: &AppState,
    runtime: &RuntimeState,
    snapshot: SettingsSnapshot,
    action_id: String,
    target_window_id: Option<String>,
) -> Result<(), String> {
    if action_id == AI_PROMPT_ID {
        process_ai_prompt(app, settings_state, runtime, snapshot, target_window_id).await
    } else if action_id == IMAGE_ASK_ID {
        process_image_ask(app, settings_state, runtime, snapshot, target_window_id).await
    } else {
        process_smart_action(app, settings_state, runtime, snapshot, action_id, target_window_id).await
    }
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
    let selected_text = native::copy_selected_text(target_window_id.as_deref()).map_err(|err| err.to_string())?;
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
    native::paste_text(&result, target_window_id.as_deref()).map_err(|err| err.to_string())?;
    save_history(settings_state, &selected_text, &result);
    Ok(())
}

async fn process_ai_prompt(
    app: AppHandle,
    settings_state: &AppState,
    runtime: &RuntimeState,
    snapshot: SettingsSnapshot,
    target_window_id: Option<String>,
) -> Result<(), String> {
    let selected_text = native::copy_selected_text(target_window_id.as_deref()).unwrap_or_default();
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
            "defaultResponseMode": "paste",
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
        windowing::show_page(&app, Page::Chat, &snapshot.settings.ui_language, json!({}))?;
        return Ok(());
    }
    let prompt = prompts::build_ai_prompt_first_turn(&brain_context(settings_state), &selected_text, &ask.prompt);
    let result = ai::call_text(&snapshot.settings, &prompt)
        .await
        .map_err(|err| err.to_string())?;
    native::paste_text(&result, target_window_id.as_deref()).map_err(|err| err.to_string())?;
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
    let image = capture_image_context(&app, runtime, &snapshot).await?;
    let ask = ask_user(
        &app,
        runtime,
        &snapshot.settings.ui_language,
        json!({
            "title": "Ask by Image",
            "placeholder": "Nhập câu hỏi cho hình ảnh này...",
            "responseModeEnabled": true,
            "defaultResponseMode": "paste",
            "contextMode": "prompt_only",
        }),
    )
    .await?;
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
        windowing::show_page(&app, Page::Chat, &snapshot.settings.ui_language, json!({}))?;
        return Ok(());
    }
    let prompt = prompts::build_image_question_prompt(&brain_context(settings_state), &ask.prompt);
    let result = ai::call_image(&snapshot.settings, &prompt, &image)
        .await
        .map_err(|err| err.to_string())?;
    native::paste_text(&result, target_window_id.as_deref()).map_err(|err| err.to_string())?;
    save_history(settings_state, &format!("[image:{}] {}", image.source, ask.prompt), &result);
    Ok(())
}

async fn capture_image_context(
    app: &AppHandle,
    runtime: &RuntimeState,
    snapshot: &SettingsSnapshot,
) -> Result<ImagePayload, String> {
    if *runtime.skip_image_source_picker.lock().expect("skip_image_source poisoned") {
        if let Some(clipboard_image) = native::read_clipboard_image().map_err(|err| err.to_string())? {
            return Ok(clipboard_image);
        }
    }
    if let Some(clipboard_image) = native::read_clipboard_image().map_err(|err| err.to_string())? {
        let (sender, receiver) = oneshot::channel();
        runtime.set_pending(Page::ImageSource, sender);
        windowing::show_page(
            app,
            Page::ImageSource,
            &snapshot.settings.ui_language,
            json!({ "title": "Ask by Image" }),
        )?;
        let response = receiver
            .await
            .map_err(|_| "User cancelled image source selection.".to_string())?;
        windowing::hide_window(app, Page::ImageSource);
        if response.get("do_not_ask_again").and_then(|v| v.as_bool()).unwrap_or(false) {
            *runtime.skip_image_source_picker.lock().expect("skip_image_source poisoned") = true;
        }
        match response.get("source").and_then(|v| v.as_str()) {
            Some("clipboard") => return Ok(clipboard_image),
            Some("roi") => return native::capture_roi().map_err(|err| err.to_string()),
            _ => return Err("User cancelled image source selection.".to_string()),
        }
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
    windowing::show_page(app, Page::Ask, ui_language, payload)?;
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
    if !session.messages.is_empty() {
        return chat_ok(session);
    }
    let initial_prompt = session.initial_user_prompt.clone().unwrap_or_default();
    if initial_prompt.trim().is_empty() {
        return chat_error("Initial prompt is empty.");
    }
    let first_prompt = if session.kind == AI_PROMPT_ID {
        prompts::build_ai_prompt_first_turn(
            &brain_context(settings_state),
            session.selected_text.as_deref().unwrap_or(""),
            &initial_prompt,
        )
    } else {
        prompts::build_image_question_prompt(&brain_context(settings_state), &initial_prompt)
    };
    session.messages.push(ChatMessage {
        role: "user".to_string(),
        content: first_prompt,
    });
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

pub fn insert_latest_reply(runtime: &RuntimeState) -> serde_json::Value {
    let session = match runtime.chat_session() {
        Some(session) => session,
        None => return json!({ "ok": false, "error": "Chat session is not available." }),
    };
    if session.latest_reply.trim().is_empty() {
        return json!({ "ok": false, "error": "No assistant reply to insert." });
    }
    match native::paste_text(&session.latest_reply, session.target_window_id.as_deref()) {
        Ok(()) => json!({ "ok": true }),
        Err(err) => json!({ "ok": false, "error": err.to_string() }),
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
