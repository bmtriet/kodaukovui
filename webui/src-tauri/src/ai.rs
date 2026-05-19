use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::settings::GeneralSettings;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImagePayload {
    pub source: String,
    pub mime_type: String,
    pub image_base64: String,
    pub size: Option<ImageSize>,
    pub region: Option<ImageRegion>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImageSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImageRegion {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ChatSession {
    pub kind: String,
    pub title: String,
    pub messages: Vec<ChatMessage>,
    pub latest_reply: String,
    pub context_hint: String,
    pub selected_text: Option<String>,
    pub image_payload: Option<ImagePayload>,
    pub initial_user_prompt: Option<String>,
    pub target_window_id: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("Chưa cấu hình AI provider/API key. Mở Settings để nhập API key.")]
    MissingProvider,
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("AI response is empty.")]
    EmptyResponse,
    #[error("AI provider error: {0}")]
    Provider(String),
}

pub fn has_configured_token(settings: &GeneralSettings) -> bool {
    if settings.ai_provider == "openai" {
        !settings.openai_api_key.trim().is_empty()
    } else if settings.ai_provider == "ollama" {
        !settings.ollama_model.trim().is_empty()
    } else {
        !settings.gemini_api_key.trim().is_empty()
    }
}

pub async fn call_text(settings: &GeneralSettings, prompt: &str) -> Result<String, AiError> {
    if settings.ai_provider == "openai" {
        call_openai_text(settings, prompt).await
    } else if settings.ai_provider == "ollama" {
        call_ollama_text(settings, prompt).await
    } else {
        call_gemini_text(settings, prompt).await
    }
}

pub async fn call_image(
    settings: &GeneralSettings,
    prompt: &str,
    image: &ImagePayload,
) -> Result<String, AiError> {
    if settings.ai_provider == "openai" {
        call_openai_image(settings, prompt, image).await
    } else if settings.ai_provider == "ollama" {
        Err(AiError::Provider("Ollama image asking is not supported yet.".to_string()))
    } else {
        call_gemini_image(settings, prompt, image).await
    }
}

pub async fn call_chat_turn(
    settings: &GeneralSettings,
    session: &ChatSession,
) -> Result<String, AiError> {
    if settings.ai_provider == "openai" {
        call_openai_chat(settings, session).await
    } else if settings.ai_provider == "ollama" {
        call_ollama_chat(settings, session).await
    } else {
        call_gemini_chat(settings, session).await
    }
}

async fn call_ollama_text(settings: &GeneralSettings, prompt: &str) -> Result<String, AiError> {
    ensure_ollama(settings)?;
    post_ollama(
        settings,
        json!({
            "model": settings.ollama_model.trim(),
            "messages": [{ "role": "user", "content": prompt }],
            "think": settings.ollama_thinking,
            "stream": false
        }),
    )
    .await
}

async fn call_ollama_chat(
    settings: &GeneralSettings,
    session: &ChatSession,
) -> Result<String, AiError> {
    ensure_ollama(settings)?;
    let mut messages = Vec::new();
    if session.kind == "ai_prompt" {
        if let Some(selected_text) = session.selected_text.as_deref().filter(|s| !s.trim().is_empty()) {
            messages.push(json!({
                "role": "system",
                "content": format!("[SELECTED TEXT]\n{}\n[END SELECTED TEXT]", selected_text)
            }));
        }
    } else {
        messages.push(json!({
            "role": "system",
            "content": "Answer questions about screenshot/image context naturally."
        }));
    }
    for message in &session.messages {
        messages.push(json!({ "role": message.role, "content": message.content }));
    }
    post_ollama(
        settings,
        json!({
            "model": settings.ollama_model.trim(),
            "messages": messages,
            "think": settings.ollama_thinking,
            "stream": false
        }),
    )
    .await
}

async fn post_ollama(settings: &GeneralSettings, body: serde_json::Value) -> Result<String, AiError> {
    let url = format!("{}/api/chat", settings.ollama_api_base.trim_end_matches('/'));
    let value: serde_json::Value = reqwest::Client::new()
        .post(url)
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if let Some(error) = value["error"].as_str() {
        return Err(AiError::Provider(error.to_string()));
    }
    let text = value["message"]["content"].as_str().unwrap_or("").trim().to_string();
    if text.is_empty() {
        Err(AiError::EmptyResponse)
    } else {
        Ok(text)
    }
}

async fn call_openai_text(settings: &GeneralSettings, prompt: &str) -> Result<String, AiError> {
    ensure_openai(settings)?;
    let body = json!({
        "model": settings.openai_model,
        "messages": [{ "role": "user", "content": prompt }],
    });
    post_openai(settings, body).await
}

async fn call_openai_image(
    settings: &GeneralSettings,
    prompt: &str,
    image: &ImagePayload,
) -> Result<String, AiError> {
    ensure_openai(settings)?;
    let data_url = format!("data:{};base64,{}", image.mime_type, image.image_base64);
    let body = json!({
        "model": settings.openai_model,
        "messages": [{
            "role": "user",
            "content": [
                { "type": "text", "text": prompt },
                { "type": "image_url", "image_url": { "url": data_url } }
            ]
        }],
    });
    post_openai(settings, body).await
}

async fn call_openai_chat(
    settings: &GeneralSettings,
    session: &ChatSession,
) -> Result<String, AiError> {
    ensure_openai(settings)?;
    let mut messages = Vec::new();
    if session.kind == "ai_prompt" {
        if let Some(selected_text) = session.selected_text.as_deref().filter(|s| !s.trim().is_empty()) {
            messages.push(json!({
                "role": "system",
                "content": "Use the selected text as background context for the whole discussion."
            }));
            messages.push(json!({
                "role": "system",
                "content": format!("[SELECTED TEXT]\n{}\n[END SELECTED TEXT]", selected_text)
            }));
        }
        for message in &session.messages {
            messages.push(json!({ "role": message.role, "content": message.content }));
        }
    } else {
        messages.push(json!({
            "role": "system",
            "content": "The first user turn includes the reference image. Use that image as primary evidence for the whole thread. Answer the user's actual question about the screenshot or image. Do not merely transcribe or translate visible text unless the user explicitly asks for transcription or translation."
        }));
        let image = session.image_payload.as_ref();
        let mut first_user_added = false;
        for message in &session.messages {
            if message.role == "user" && !first_user_added {
                if let Some(image) = image {
                    let data_url = format!("data:{};base64,{}", image.mime_type, image.image_base64);
                    messages.push(json!({
                        "role": "user",
                        "content": [
                            { "type": "text", "text": message.content },
                            { "type": "image_url", "image_url": { "url": data_url } }
                        ]
                    }));
                } else {
                    messages.push(json!({ "role": message.role, "content": message.content }));
                }
                first_user_added = true;
            } else {
                messages.push(json!({ "role": message.role, "content": message.content }));
            }
        }
    }
    post_openai(settings, json!({ "model": settings.openai_model, "messages": messages })).await
}

async fn post_openai(settings: &GeneralSettings, body: serde_json::Value) -> Result<String, AiError> {
    let url = format!(
        "{}/chat/completions",
        settings.openai_api_base.trim_end_matches('/')
    );
    let value: serde_json::Value = reqwest::Client::new()
        .post(url)
        .bearer_auth(settings.openai_api_key.trim())
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let text = value["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        Err(AiError::EmptyResponse)
    } else {
        Ok(text)
    }
}

async fn call_gemini_text(settings: &GeneralSettings, prompt: &str) -> Result<String, AiError> {
    ensure_gemini(settings)?;
    post_gemini(
        settings,
        json!({ "contents": [{ "role": "user", "parts": [{ "text": prompt }] }] }),
    )
    .await
}

async fn call_gemini_image(
    settings: &GeneralSettings,
    prompt: &str,
    image: &ImagePayload,
) -> Result<String, AiError> {
    ensure_gemini(settings)?;
    post_gemini(
        settings,
        json!({
            "contents": [{
                "role": "user",
                "parts": [
                    { "inlineData": { "mimeType": image.mime_type, "data": image.image_base64 } },
                    { "text": prompt }
                ]
            }]
        }),
    )
    .await
}

async fn call_gemini_chat(
    settings: &GeneralSettings,
    session: &ChatSession,
) -> Result<String, AiError> {
    ensure_gemini(settings)?;
    let mut contents = Vec::new();
    if session.kind == "ai_prompt" {
        if let Some(selected_text) = session.selected_text.as_deref().filter(|s| !s.trim().is_empty()) {
            contents.push(json!({
                "role": "user",
                "parts": [{ "text": format!("[SELECTED TEXT]\n{}\n[END SELECTED TEXT]", selected_text) }]
            }));
        } else {
            contents.push(json!({
                "role": "user",
                "parts": [{ "text": "This is a direct chat with no selected-text context. Answer the user's latest question naturally." }]
            }));
        }
        append_gemini_text_messages(&mut contents, &session.messages);
    } else {
        contents.push(json!({
            "role": "user",
            "parts": [{ "text": "Use the reference image from the first turn as primary evidence for the whole discussion. Answer the user's actual question about the screenshot or image. Do not merely transcribe or translate visible text unless the user explicitly asks for that." }]
        }));
        let mut first_user_added = false;
        for message in &session.messages {
            let role = if message.role == "assistant" { "model" } else { "user" };
            if message.role == "user" && !first_user_added {
                if let Some(image) = &session.image_payload {
                    contents.push(json!({
                        "role": role,
                        "parts": [
                            { "inlineData": { "mimeType": image.mime_type, "data": image.image_base64 } },
                            { "text": message.content }
                        ]
                    }));
                } else {
                    contents.push(json!({ "role": role, "parts": [{ "text": message.content }] }));
                }
                first_user_added = true;
            } else {
                contents.push(json!({ "role": role, "parts": [{ "text": message.content }] }));
            }
        }
    }
    post_gemini(settings, json!({ "contents": contents })).await
}

fn append_gemini_text_messages(contents: &mut Vec<serde_json::Value>, messages: &[ChatMessage]) {
    for message in messages {
        let role = if message.role == "assistant" { "model" } else { "user" };
        contents.push(json!({ "role": role, "parts": [{ "text": message.content }] }));
    }
}

async fn post_gemini(settings: &GeneralSettings, body: serde_json::Value) -> Result<String, AiError> {
    let model = percent_encoding::utf8_percent_encode(
        settings.gemini_model.trim(),
        percent_encoding::NON_ALPHANUMERIC,
    );
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    );
    let value: serde_json::Value = reqwest::Client::new()
        .post(url)
        .header("x-goog-api-key", settings.gemini_api_key.trim())
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if let Some(error) = value["error"]["message"].as_str() {
        return Err(AiError::Provider(error.to_string()));
    }
    let text = value["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        Err(AiError::EmptyResponse)
    } else {
        Ok(text)
    }
}

fn ensure_openai(settings: &GeneralSettings) -> Result<(), AiError> {
    let key = settings.openai_api_key.trim();
    if key.is_empty() || key == "your_openai_api_key_here" {
        Err(AiError::MissingProvider)
    } else {
        Ok(())
    }
}

fn ensure_gemini(settings: &GeneralSettings) -> Result<(), AiError> {
    let key = settings.gemini_api_key.trim();
    if key.is_empty() || key == "your_gemini_token_here" {
        Err(AiError::MissingProvider)
    } else {
        Ok(())
    }
}

fn ensure_ollama(settings: &GeneralSettings) -> Result<(), AiError> {
    if settings.ollama_model.trim().is_empty() {
        Err(AiError::MissingProvider)
    } else {
        Ok(())
    }
}

pub fn image_from_bytes(source: &str, bytes: Vec<u8>, region: Option<ImageRegion>) -> Result<ImagePayload, String> {
    let image = image::load_from_memory(&bytes).map_err(|err| err.to_string())?;
    Ok(ImagePayload {
        source: source.to_string(),
        mime_type: "image/png".to_string(),
        image_base64: general_purpose::STANDARD.encode(bytes),
        size: Some(ImageSize {
            width: image.width(),
            height: image.height(),
        }),
        region,
    })
}
