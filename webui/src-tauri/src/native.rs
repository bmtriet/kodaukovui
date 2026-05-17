use std::{
    fs,
    process::Command,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose, Engine as _};

use crate::ai::{image_from_bytes, ImagePayload, ImageSize};

#[derive(Debug, thiserror::Error)]
pub enum NativeError {
    #[error("{0}")]
    Message(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

pub fn active_window_id() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to get bundle identifier of first application process whose frontmost is true",
            ])
            .output()
            .ok()?;
        if output.status.success() {
            let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("xdotool")
            .arg("getactivewindow")
            .output()
            .ok()?;
        if output.status.success() {
            let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

pub fn restore_focus(window_id: Option<&str>) {
    #[cfg(target_os = "macos")]
    if let Some(window_id) = window_id.filter(|id| !id.trim().is_empty()) {
        let _ = Command::new("osascript")
            .args([
                "-e",
                &format!("tell application id \"{}\" to activate", window_id.replace('"', "")),
            ])
            .status();
        thread::sleep(Duration::from_millis(180));
    }
    #[cfg(target_os = "linux")]
    if let Some(window_id) = window_id.filter(|id| !id.trim().is_empty()) {
        let _ = Command::new("xdotool")
            .args(["windowactivate", window_id])
            .status();
        thread::sleep(Duration::from_millis(180));
    }
}

pub fn copy_selected_text(target_window_id: Option<&str>) -> Result<String, NativeError> {
    restore_focus(target_window_id);
    let old_clipboard = read_clipboard_text().unwrap_or_default();
    press_copy_shortcut()?;
    thread::sleep(Duration::from_millis(80));
    let mut selected = read_clipboard_text().unwrap_or_default();
    let deadline = std::time::Instant::now() + Duration::from_millis(500);
    while selected.trim().is_empty() && std::time::Instant::now() < deadline {
        thread::sleep(Duration::from_millis(40));
        selected = read_clipboard_text().unwrap_or_default();
    }
    let text = if selected.trim().is_empty() {
        old_clipboard.clone()
    } else {
        selected
    };
    if !old_clipboard.is_empty() {
        restore_clipboard_text(&old_clipboard);
    }
    Ok(text.trim().to_string())
}

pub fn paste_text(text: &str, target_window_id: Option<&str>) -> Result<(), NativeError> {
    restore_focus(target_window_id);
    let mut clipboard = Clipboard::new().map_err(|err| NativeError::Message(err.to_string()))?;
    clipboard
        .set_text(text.to_string())
        .map_err(|err| NativeError::Message(err.to_string()))?;
    thread::sleep(Duration::from_millis(100));
    press_paste_shortcut()
}

pub fn read_clipboard_image() -> Result<Option<ImagePayload>, NativeError> {
    let mut clipboard = Clipboard::new().map_err(|err| NativeError::Message(err.to_string()))?;
    let image = match clipboard.get_image() {
        Ok(image) => image,
        Err(_) => return Ok(None),
    };
    let png = rgba_to_png(&image)?;
    Ok(Some(ImagePayload {
        source: "clipboard_image".to_string(),
        mime_type: "image/png".to_string(),
        image_base64: general_purpose::STANDARD.encode(png),
        size: Some(ImageSize {
            width: image.width as u32,
            height: image.height as u32,
        }),
        region: None,
    }))
}

pub fn capture_roi() -> Result<ImagePayload, NativeError> {
    #[cfg(target_os = "macos")]
    {
        ensure_screen_capture_permission();
        let mut path = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        path.push(format!("kodaukovui-roi-{nonce}.png"));
        let status = Command::new("screencapture")
            .arg("-i")
            .arg("-x")
            .arg(&path)
            .status()?;
        if !status.success() || !path.exists() {
            return Err(NativeError::Message(
                "ROI capture was cancelled or failed.".to_string(),
            ));
        }
        let bytes = fs::read(&path)?;
        let _ = fs::remove_file(&path);
        if bytes.is_empty() {
            return Err(NativeError::Message(
                "ROI capture returned an empty image.".to_string(),
            ));
        }
        return image_from_bytes("roi_screenshot", bytes, None).map_err(NativeError::Message);
    }

    #[cfg(target_os = "linux")]
    {
        let mut path = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        path.push(format!("kodaukovui-roi-{nonce}.png"));

        if command_exists("gnome-screenshot") {
            let status = Command::new("gnome-screenshot")
                .args(["-a", "-f"])
                .arg(&path)
                .status()?;
            if status.success() && path.exists() {
                let bytes = fs::read(&path)?;
                let _ = fs::remove_file(&path);
                return image_from_bytes("roi_screenshot", bytes, None).map_err(NativeError::Message);
            }
        }

        if command_exists("flameshot") {
            let output = Command::new("flameshot").args(["gui", "-r"]).output()?;
            if output.status.success() && !output.stdout.is_empty() {
                return image_from_bytes("roi_screenshot", output.stdout, None)
                    .map_err(NativeError::Message);
            }
        }

        if command_exists("grim") && command_exists("slurp") {
            let selection = Command::new("slurp").output()?;
            if selection.status.success() {
                let geometry = String::from_utf8_lossy(&selection.stdout).trim().to_string();
                if !geometry.is_empty() {
                    let status = Command::new("grim")
                        .args(["-g", &geometry])
                        .arg(&path)
                        .status()?;
                    if status.success() && path.exists() {
                        let bytes = fs::read(&path)?;
                        let _ = fs::remove_file(&path);
                        return image_from_bytes("roi_screenshot", bytes, None)
                            .map_err(NativeError::Message);
                    }
                }
            }
        }

        if command_exists("scrot") {
            let status = Command::new("scrot").arg("-s").arg(&path).status()?;
            if status.success() && path.exists() {
                let bytes = fs::read(&path)?;
                let _ = fs::remove_file(&path);
                return image_from_bytes("roi_screenshot", bytes, None).map_err(NativeError::Message);
            }
        }

        Err(NativeError::Message(
            "Linux ROI capture needs one of: gnome-screenshot, flameshot, grim+slurp, or scrot."
                .to_string(),
        ))
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        Err(NativeError::Message(
            "ROI capture is not implemented for this platform.".to_string(),
        ))
    }
}

pub fn ensure_accessibility_permission(prompt: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_accessibility_trusted(prompt)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = prompt;
        true
    }
}

pub fn open_accessibility_settings() {
    #[cfg(target_os = "macos")]
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status();
}

pub fn open_screen_recording_settings() {
    #[cfg(target_os = "macos")]
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .status();
}

fn read_clipboard_text() -> Result<String, NativeError> {
    let mut clipboard = Clipboard::new().map_err(|err| NativeError::Message(err.to_string()))?;
    clipboard
        .get_text()
        .map_err(|err| NativeError::Message(err.to_string()))
}

fn restore_clipboard_text(text: &str) {
    if let Ok(mut clipboard) = Clipboard::new() {
        let _ = clipboard.set_text(text.to_string());
    }
}

#[cfg(target_os = "linux")]
fn command_exists(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn press_copy_shortcut() -> Result<(), NativeError> {
    press_key_chord("c")
}

fn press_paste_shortcut() -> Result<(), NativeError> {
    press_key_chord("v")
}

fn press_key_chord(key: &str) -> Result<(), NativeError> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"System Events\" to keystroke \"{}\" using command down",
            key
        );
        let status = Command::new("osascript").args(["-e", &script]).status()?;
        if status.success() {
            Ok(())
        } else {
            Err(NativeError::Message(
                "Cannot send keyboard shortcut. Grant Accessibility permission to KoDauKoVui."
                    .to_string(),
            ))
        }
    }

    #[cfg(target_os = "linux")]
    {
        let status = Command::new("xdotool")
            .args(["key", &format!("ctrl+{key}")])
            .status()?;
        if status.success() {
            Ok(())
        } else {
            Err(NativeError::Message("xdotool shortcut failed.".to_string()))
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = key;
        Err(NativeError::Message(
            "Paste/copy shortcut automation for Windows is pending.".to_string(),
        ))
    }
}

fn rgba_to_png(image: &ImageData<'_>) -> Result<Vec<u8>, NativeError> {
    let mut bytes = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut bytes);
    image::ImageEncoder::write_image(
        encoder,
        image.bytes.as_ref(),
        image.width as u32,
        image.height as u32,
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|err| NativeError::Message(err.to_string()))?;
    Ok(bytes)
}

fn ensure_screen_capture_permission() {
    #[cfg(target_os = "macos")]
    unsafe {
        if !macos_screen_capture_preflight() {
            let _ = macos_screen_capture_request();
            open_screen_recording_settings();
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_accessibility_trusted(prompt: bool) -> bool {
    use std::ffi::c_void;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    }

    if prompt {
        open_accessibility_settings();
    }
    unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
}

#[cfg(target_os = "macos")]
unsafe fn macos_screen_capture_preflight() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    CGPreflightScreenCaptureAccess()
}

#[cfg(target_os = "macos")]
unsafe fn macos_screen_capture_request() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGRequestScreenCaptureAccess() -> bool;
    }
    CGRequestScreenCaptureAccess()
}
