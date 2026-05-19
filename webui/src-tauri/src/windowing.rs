use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde_json::json;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Size, UserAttentionType, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

#[cfg(target_os = "linux")]
use crate::native;

#[derive(Clone, Copy, Debug)]
pub enum Page {
    Popup,
    Ask,
    Settings,
    Chat,
    ImageSource,
}

impl Page {
    pub fn label(self) -> &'static str {
        match self {
            Page::Popup => "popup",
            Page::Ask => "ask",
            Page::Settings => "settings",
            Page::Chat => "chat",
            Page::ImageSource => "image_source",
        }
    }

    fn title(self) -> &'static str {
        match self {
            Page::Popup => "clipBo Popup",
            Page::Ask => "clipBo",
            Page::Settings => "clipBo Settings",
            Page::Chat => "clipBo Chat",
            Page::ImageSource => "Ask by Image",
        }
    }

    fn size(self) -> (f64, f64) {
        match self {
            Page::Popup => (480.0, 460.0),
            Page::Ask => (720.0, 430.0),
            Page::Settings => (980.0, 780.0),
            Page::Chat => (900.0, 760.0),
            Page::ImageSource => (920.0, 620.0),
        }
    }

    fn resizable(self) -> bool {
        matches!(self, Page::Chat)
    }

    fn decorations(self) -> bool {
        !matches!(self, Page::Popup)
    }

}

pub fn hide_window(app: &AppHandle, page: Page) {
    if let Some(window) = app.get_webview_window(page.label()) {
        let _ = window.hide();
    }
}

pub fn show_page(
    app: &AppHandle,
    page: Page,
    ui_language: &str,
    payload: serde_json::Value,
    target_window_id: Option<&str>,
) -> Result<WebviewWindow, String> {
    let url = page_url(page, ui_language, payload);
    let (width, height) = page.size();
    let window = if let Some(window) = app.get_webview_window(page.label()) {
        window
            .set_size(Size::Logical(LogicalSize { width, height }))
            .map_err(|err| err.to_string())?;
        window
            .eval(&format!("window.location.href = '{}'", js_escape(&url)))
            .map_err(|err| err.to_string())?;
        window
    } else {
        let mut builder = WebviewWindowBuilder::new(app, page.label(), WebviewUrl::App(url.into()))
            .title(page.title())
            .inner_size(width, height)
            .resizable(page.resizable())
            .decorations(page.decorations())
            .always_on_top(matches!(page, Page::Popup))
            .visible_on_all_workspaces(matches!(page, Page::Popup));
        if !matches!(page, Page::Popup) || !cfg!(target_os = "linux") {
            builder = builder.center();
        }
        builder.build().map_err(|err| err.to_string())?
    };
    let _ = window.show();
    let _ = window.unminimize();
    if matches!(page, Page::Popup) {
        apply_popup_placement(&window, target_window_id, width, height);
        let _ = window.set_always_on_top(true);
        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.request_user_attention(Some(UserAttentionType::Critical));
    }
    let _ = window.set_focus();
    Ok(window)
}

pub fn open_settings_page(app: &AppHandle, ui_language: &str) -> Result<(), String> {
    show_page(app, Page::Settings, ui_language, json!({}), None).map(|_| ())
}

fn apply_popup_placement(
    window: &WebviewWindow,
    target_window_id: Option<&str>,
    width: f64,
    height: f64,
) {
    #[cfg(target_os = "linux")]
    {
        if let Some(position) = popup_position_for_target(window, target_window_id, width, height) {
            let _ = window.set_position(position);
            return;
        }
    }

    let _ = window.center();
}

#[cfg(target_os = "linux")]
fn popup_position_for_target(
    _window: &WebviewWindow,
    target_window_id: Option<&str>,
    width: f64,
    height: f64,
) -> Option<LogicalPosition<f64>> {
    native::popup_position_for_target(
        target_window_id,
        width.round() as i32,
        height.round() as i32,
    )
    .map(|point| LogicalPosition::new(point.x, point.y))
}

fn page_url(page: Page, ui_language: &str, payload: serde_json::Value) -> String {
    let payload = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
    format!(
        "index.html?page={}&uilang={}&payload={}",
        page.label(),
        utf8_percent_encode(ui_language, NON_ALPHANUMERIC),
        utf8_percent_encode(&payload, NON_ALPHANUMERIC)
    )
}

fn js_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}
