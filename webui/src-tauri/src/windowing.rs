use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde_json::json;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, Size, UserAttentionType, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::native;

#[derive(Clone, Copy, Debug)]
pub enum Page {
    Popup,
    Ask,
    Settings,
    Chat,
    ImageSource,
    Response,
}

impl Page {
    pub fn label(self) -> &'static str {
        match self {
            Page::Popup => "popup",
            Page::Ask => "ask",
            Page::Settings => "settings",
            Page::Chat => "chat",
            Page::ImageSource => "image_source",
            Page::Response => "response",
        }
    }

    fn title(self) -> &'static str {
        match self {
            Page::Popup => "clipBo Popup",
            Page::Ask => "clipBo",
            Page::Settings => "clipBo Settings",
            Page::Chat => "clipBo Chat",
            Page::ImageSource => "Ask by Image",
            Page::Response => "clipBo Response",
        }
    }

    fn size(self) -> (f64, f64) {
        match self {
            Page::Popup => (480.0, 460.0),
            Page::Ask => (760.0, 540.0),
            Page::Settings => (980.0, 780.0),
            Page::Chat => (900.0, 760.0),
            Page::ImageSource => (680.0, 360.0),
            Page::Response => (760.0, 560.0),
        }
    }

    fn resizable(self) -> bool {
        matches!(self, Page::Chat)
    }

    fn decorations(self) -> bool {
        !matches!(self, Page::Response)
    }

}

pub fn hide_window(app: &AppHandle, page: Page) {
    if let Some(window) = app.get_webview_window(page.label()) {
        let _ = window.hide();
    }
}

pub fn is_window_visible(app: &AppHandle, page: Page) -> bool {
    app.get_webview_window(page.label())
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

pub fn show_page(
    app: &AppHandle,
    page: Page,
    ui_language: &str,
    payload: serde_json::Value,
    target_window_id: Option<&str>,
    size_override: Option<(f64, f64)>,
) -> Result<WebviewWindow, String> {
    let url = page_url(page, ui_language, payload);
    let (width, height) = size_override.unwrap_or_else(|| page.size());
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
            .always_on_top(matches!(page, Page::Popup | Page::Response))
            .visible_on_all_workspaces(matches!(page, Page::Popup | Page::Response));
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
    #[cfg(target_os = "linux")]
    if matches!(page, Page::Popup) {
        crate::native::force_focus_popup();
    }
    Ok(window)
}

pub fn open_settings_page(app: &AppHandle, ui_language: &str) -> Result<(), String> {
    show_page(app, Page::Settings, ui_language, json!({}), None, None).map(|_| ())
}

fn apply_popup_placement(
    window: &WebviewWindow,
    target_window_id: Option<&str>,
    width: f64,
    height: f64,
) {
    if let Some(position) = popup_position_for_target(window, target_window_id, width, height) {
        let _ = window.set_position(position);
        return;
    }

    let _ = window.center();
}

fn popup_position_for_target(
    window: &WebviewWindow,
    target_window_id: Option<&str>,
    width: f64,
    height: f64,
) -> Option<PhysicalPosition<i32>> {
    #[cfg(target_os = "linux")]
    if let Some(point) = native::popup_position_for_target(
        target_window_id,
        width.round() as i32,
        height.round() as i32,
    ) {
        return Some(PhysicalPosition::new(point.x.round() as i32, point.y.round() as i32));
    }

    #[cfg(target_os = "macos")]
    {
        let cursor = native::mouse_position()?;
        let monitors = window.available_monitors().ok()?;
        let monitor = monitors
            .into_iter()
            .find(|m| {
                let p = m.position();
                let s = m.size();
                let left = p.x as f64;
                let top = p.y as f64;
                let right = left + s.width as f64;
                let bottom = top + s.height as f64;
                cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom
            })
            .or_else(|| window.current_monitor().ok().flatten())?;
        let origin = monitor.position();
        let size = monitor.size();
        let scale = monitor.scale_factor();
        let margin = 12.0;
        let right_bound = origin.x as f64 + size.width as f64;
        let bottom_bound = origin.y as f64 + size.height as f64;
        let popup_width = width * scale;
        let popup_height = height * scale;

        let prefer_right = cursor.x + popup_width + margin <= right_bound;
        let prefer_bottom = cursor.y + popup_height + margin <= bottom_bound;

        let mut x = if prefer_right { cursor.x + margin } else { cursor.x - popup_width - margin };
        let mut y = if prefer_bottom { cursor.y + margin } else { cursor.y - popup_height - margin };

        x = x.max(origin.x as f64 + margin).min(right_bound - popup_width - margin);
        y = y.max(origin.y as f64 + margin).min(bottom_bound - popup_height - margin);
        return Some(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    }

    None
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
