use std::{
    fs,
    process::Command,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};

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

#[derive(Clone, Copy, Debug)]
pub struct ScreenPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

enum ClipboardSnapshot {
    Text(String),
    Image(ImageData<'static>),
    Empty,
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
        unsafe {
            let display = x11::xlib::XOpenDisplay(std::ptr::null());
            if display.is_null() {
                return None;
            }
            let mut window: x11::xlib::Window = 0;
            let mut _revert: std::ffi::c_int = 0;
            x11::xlib::XGetInputFocus(display, &mut window, &mut _revert);
            x11::xlib::XCloseDisplay(display);
            if window != 0 {
                return Some(window.to_string());
            }
        }
    }
    None
}

pub fn mouse_position() -> Option<ScreenPoint> {
    #[cfg(target_os = "macos")]
    unsafe {
        #[repr(C)]
        struct CGPoint {
            x: f64,
            y: f64,
        }

        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGEventCreate(source: *const std::ffi::c_void) -> *mut std::ffi::c_void;
            fn CGEventGetLocation(event: *mut std::ffi::c_void) -> CGPoint;
            fn CFRelease(cf: *const std::ffi::c_void);
        }

        let event = CGEventCreate(std::ptr::null());
        if event.is_null() {
            return None;
        }
        let point = CGEventGetLocation(event);
        CFRelease(event);
        return Some(ScreenPoint {
            x: point.x,
            y: point.y,
        });
    }
    None
}

pub fn target_window_center(target_window_id: Option<&str>) -> Option<ScreenPoint> {
    #[cfg(target_os = "linux")]
    {
        let window_id = target_window_id?.trim();
        if window_id.is_empty() {
            return None;
        }
        let window: x11::xlib::Window = window_id.parse().ok()?;
        unsafe {
            let display = x11::xlib::XOpenDisplay(std::ptr::null());
            if display.is_null() {
                return None;
            }
            let mut root: x11::xlib::Window = 0;
            let mut x: std::ffi::c_int = 0;
            let mut y: std::ffi::c_int = 0;
            let mut width: std::ffi::c_uint = 0;
            let mut height: std::ffi::c_uint = 0;
            let mut border: std::ffi::c_uint = 0;
            let mut depth: std::ffi::c_uint = 0;
            if x11::xlib::XGetGeometry(
                display,
                window,
                &mut root,
                &mut x,
                &mut y,
                &mut width,
                &mut height,
                &mut border,
                &mut depth,
            ) == 0
            {
                x11::xlib::XCloseDisplay(display);
                return None;
            }
            let mut root_x: std::ffi::c_int = 0;
            let mut root_y: std::ffi::c_int = 0;
            let mut child: x11::xlib::Window = 0;
            x11::xlib::XTranslateCoordinates(
                display,
                window,
                root,
                0,
                0,
                &mut root_x,
                &mut root_y,
                &mut child,
            );
            x11::xlib::XCloseDisplay(display);
            return Some(ScreenPoint {
                x: (root_x as f64) + (width as f64 / 2.0),
                y: (root_y as f64) + (height as f64 / 2.0),
            });
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = target_window_id;
        None
    }
}

pub fn popup_position_for_target(
    target_window_id: Option<&str>,
    popup_width: i32,
    popup_height: i32,
) -> Option<ScreenPoint> {
    #[cfg(target_os = "linux")]
    {
        let center = target_window_center(target_window_id)?;
        let screen = screen_for_point(center)?;
        let x = screen.x + ((screen.width - popup_width).max(0) / 2);
        let y = screen.y + ((screen.height - popup_height).max(0) / 2);
        Some(ScreenPoint {
            x: x as f64,
            y: y as f64,
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
    #[cfg(not(target_os = "linux"))]
    let _ = target_window_id;
    #[cfg(not(target_os = "linux"))]
    let _ = popup_width;
    #[cfg(not(target_os = "linux"))]
    let _ = popup_height;
    None
    }
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
        if let Ok(window) = window_id.parse::<x11::xlib::Window>() {
            unsafe {
                let display = x11::xlib::XOpenDisplay(std::ptr::null());
                if !display.is_null() {
                    x11::xlib::XSetInputFocus(
                        display,
                        window,
                        x11::xlib::RevertToParent,
                        x11::xlib::CurrentTime,
                    );
                    x11::xlib::XCloseDisplay(display);
                }
            }
        }
        thread::sleep(Duration::from_millis(180));
    }
}

pub fn copy_selected_text(target_window_id: Option<&str>) -> Result<String, NativeError> {
    restore_focus(target_window_id);
    copy_selected_text_internal()
}

pub fn copy_selected_text_fast() -> Result<String, NativeError> {
    copy_selected_text_internal()
}

fn copy_selected_text_internal() -> Result<String, NativeError> {
    let old_clipboard = snapshot_clipboard();
    press_copy_shortcut()?;
    thread::sleep(Duration::from_millis(80));
    let mut selected = read_clipboard_text().unwrap_or_default();
    let deadline = std::time::Instant::now() + Duration::from_millis(500);
    while selected.trim().is_empty() && std::time::Instant::now() < deadline {
        thread::sleep(Duration::from_millis(40));
        selected = read_clipboard_text().unwrap_or_default();
    }
    let text = selected;
    restore_clipboard(old_clipboard);
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

pub fn set_clipboard_text(text: &str) -> Result<(), NativeError> {
    let mut clipboard = Clipboard::new().map_err(|err| NativeError::Message(err.to_string()))?;
    clipboard
        .set_text(text.to_string())
        .map_err(|err| NativeError::Message(err.to_string()))
}

pub fn target_has_editable_focus(target_window_id: Option<&str>) -> bool {
    restore_focus(target_window_id);
    #[cfg(target_os = "macos")]
    {
        return macos_focused_element_is_editable();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = target_window_id;
        true
    }
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

pub fn clipboard_has_text() -> bool {
    read_clipboard_text()
        .map(|text| !text.trim().is_empty())
        .unwrap_or(false)
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

#[cfg(target_os = "linux")]
pub fn force_focus_popup() {
    use std::{thread, time::Duration};
    thread::sleep(Duration::from_millis(50));
    unsafe {
        let display = x11::xlib::XOpenDisplay(std::ptr::null());
        if display.is_null() {
            return;
        }
        let mut window: x11::xlib::Window = 0;
        let mut _revert: std::ffi::c_int = 0;
        x11::xlib::XGetInputFocus(display, &mut window, &mut _revert);
        if window != 0 {
            x11::xlib::XSetInputFocus(
                display,
                window,
                x11::xlib::RevertToParent,
                x11::xlib::CurrentTime,
            );
        }
        x11::xlib::XFlush(display);
        x11::xlib::XCloseDisplay(display);
    }
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

fn snapshot_clipboard() -> ClipboardSnapshot {
    let Ok(mut clipboard) = Clipboard::new() else {
        return ClipboardSnapshot::Empty;
    };

    if let Ok(text) = clipboard.get_text() {
        return ClipboardSnapshot::Text(text);
    }

    if let Ok(image) = clipboard.get_image() {
        return ClipboardSnapshot::Image(image);
    }

    ClipboardSnapshot::Empty
}

fn restore_clipboard(snapshot: ClipboardSnapshot) {
    match snapshot {
        ClipboardSnapshot::Text(text) => restore_clipboard_text(&text),
        ClipboardSnapshot::Image(image) => {
            if let Ok(mut clipboard) = Clipboard::new() {
                let _ = clipboard.set_image(image);
            }
        }
        ClipboardSnapshot::Empty => {}
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

#[cfg(target_os = "linux")]
fn screen_for_point(point: ScreenPoint) -> Option<ScreenRect> {
    let output = Command::new("xrandr").arg("--query").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let mut matched = None;
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some(rect) = parse_xrandr_screen_rect(line) else {
            continue;
        };
        let within_x = point.x >= rect.x as f64 && point.x < (rect.x + rect.width) as f64;
        let within_y = point.y >= rect.y as f64 && point.y < (rect.y + rect.height) as f64;
        if within_x && within_y {
            return Some(rect);
        }
        if matched.is_none() {
            matched = Some(rect);
        }
    }
    matched
}

#[cfg(target_os = "linux")]
fn parse_xrandr_screen_rect(line: &str) -> Option<ScreenRect> {
    let token = line.split_whitespace().find(|part| {
        let part = *part;
        part.contains('x')
            && part.contains('+')
            && part
                .chars()
                .all(|ch| ch.is_ascii_digit() || matches!(ch, 'x' | '+' | '-'))
    })?;

    let (size_part, x_part, y_part) = split_geometry_token(token)?;
    let (width, height) = size_part.split_once('x')?;
    Some(ScreenRect {
        x: x_part.parse().ok()?,
        y: y_part.parse().ok()?,
        width: width.parse().ok()?,
        height: height.parse().ok()?,
    })
}

#[cfg(target_os = "linux")]
fn split_geometry_token(token: &str) -> Option<(&str, &str, &str)> {
    let first_plus = token.find('+')?;
    let second_plus = token[first_plus + 1..].find('+')? + first_plus + 1;
    Some((&token[..first_plus], &token[first_plus + 1..second_plus], &token[second_plus + 1..]))
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
                "Cannot send keyboard shortcut. Grant Accessibility permission to clipBo."
                    .to_string(),
            ))
        }
    }

    #[cfg(target_os = "linux")]
    {
        unsafe {
            let display = x11::xlib::XOpenDisplay(std::ptr::null());
            if display.is_null() {
                return Err(NativeError::Message(
                    "Cannot open X11 display.".to_string(),
                ));
            }
            let key_cstr = std::ffi::CString::new(key).unwrap();
            let keysym = x11::xlib::XStringToKeysym(key_cstr.as_ptr());
            if keysym == 0 {
                x11::xlib::XCloseDisplay(display);
                return Err(NativeError::Message(format!(
                    "Unknown key: {}",
                    key
                )));
            }
            let keycode = x11::xlib::XKeysymToKeycode(display, keysym);
            let ctrl_cstr = std::ffi::CString::new("Control_L").unwrap();
            let ctrl_keysym = x11::xlib::XStringToKeysym(ctrl_cstr.as_ptr());
            let ctrl_keycode = x11::xlib::XKeysymToKeycode(display, ctrl_keysym);

            x11::xtest::XTestFakeKeyEvent(display, ctrl_keycode as u32, 1, 0);
            x11::xtest::XTestFakeKeyEvent(display, keycode as u32, 1, 0);
            x11::xtest::XTestFakeKeyEvent(display, keycode as u32, 0, 0);
            x11::xtest::XTestFakeKeyEvent(display, ctrl_keycode as u32, 0, 0);

            x11::xlib::XFlush(display);
            x11::xlib::XCloseDisplay(display);
            Ok(())
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

#[cfg(target_os = "macos")]
fn macos_focused_element_is_editable() -> bool {
    use std::ffi::{c_char, c_void, CStr, CString};

    type CFStringRef = *const c_void;
    type AXUIElementRef = *mut c_void;

    const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: *mut *const c_void,
        ) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            c_str: *const c_char,
            encoding: u32,
        ) -> CFStringRef;
        fn CFStringGetCStringPtr(the_string: CFStringRef, encoding: u32) -> *const c_char;
        fn CFStringGetCString(
            the_string: CFStringRef,
            buffer: *mut c_char,
            buffer_size: isize,
            encoding: u32,
        ) -> bool;
        fn CFRelease(cf: *const c_void);
    }

    unsafe fn cf_string(value: &str) -> Option<CFStringRef> {
        let c_value = CString::new(value).ok()?;
        let cf = CFStringCreateWithCString(std::ptr::null(), c_value.as_ptr(), K_CF_STRING_ENCODING_UTF8);
        if cf.is_null() {
            None
        } else {
            Some(cf)
        }
    }

    unsafe fn cf_string_to_string(value: CFStringRef) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let ptr = CFStringGetCStringPtr(value, K_CF_STRING_ENCODING_UTF8);
        if !ptr.is_null() {
            return CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string());
        }
        let mut buffer = vec![0 as c_char; 512];
        if CFStringGetCString(value, buffer.as_mut_ptr(), buffer.len() as isize, K_CF_STRING_ENCODING_UTF8) {
            CStr::from_ptr(buffer.as_ptr()).to_str().ok().map(|s| s.to_string())
        } else {
            None
        }
    }

    unsafe fn copy_attr(element: AXUIElementRef, attr: &str) -> Option<*const c_void> {
        let attr = cf_string(attr)?;
        let mut value: *const c_void = std::ptr::null();
        let result = AXUIElementCopyAttributeValue(element, attr, &mut value);
        CFRelease(attr);
        if result == 0 && !value.is_null() {
            Some(value)
        } else {
            None
        }
    }

    unsafe {
        let system = AXUIElementCreateSystemWide();
        if system.is_null() {
            return false;
        }
        let focused_attr = match cf_string("AXFocusedUIElement") {
            Some(value) => value,
            None => return false,
        };
        let mut focused: *const c_void = std::ptr::null();
        let focused_result = AXUIElementCopyAttributeValue(system, focused_attr, &mut focused);
        CFRelease(focused_attr);
        CFRelease(system);
        if focused_result != 0 || focused.is_null() {
            return false;
        }

        let role_value = copy_attr(focused as AXUIElementRef, "AXRole")
            .and_then(|value| {
                let role = cf_string_to_string(value as CFStringRef);
                CFRelease(value);
                role
            })
            .unwrap_or_default();
        let subrole_value = copy_attr(focused as AXUIElementRef, "AXSubrole")
            .and_then(|value| {
                let subrole = cf_string_to_string(value as CFStringRef);
                CFRelease(value);
                subrole
            })
            .unwrap_or_default();
        CFRelease(focused);

        matches!(
            role_value.as_str(),
            "AXTextField" | "AXTextArea" | "AXComboBox" | "AXSearchField"
        ) || subrole_value.contains("Text")
            || subrole_value.contains("Search")
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
        static DID_OPEN_SCREEN_RECORDING_SETTINGS: AtomicBool = AtomicBool::new(false);

        if !macos_screen_capture_preflight() {
            let granted = macos_screen_capture_request();
            let now_granted = granted || macos_screen_capture_preflight();
            if !now_granted
                && !DID_OPEN_SCREEN_RECORDING_SETTINGS.swap(true, Ordering::SeqCst)
            {
                open_screen_recording_settings();
            }
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
