mod actions;
mod ai;
mod commands;
mod native;
mod platform;
mod prompts;
mod runtime;
mod settings;
mod windowing;

use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(settings::AppState::load())
        .manage(runtime::RuntimeState::default())
        .setup(|app| {
            let snapshot = app.state::<settings::AppState>().snapshot();
            if cfg!(target_os = "macos") && !native::ensure_accessibility_permission(false) {
                native::open_accessibility_settings();
            }
            let shortcut = normalize_shortcut(&snapshot.settings.hotkey_popup);
            let handle = app.handle().clone();
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts([shortcut.as_str()])?
                    .with_handler(move |app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let app = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let settings = app.state::<settings::AppState>();
                                let runtime = app.state::<runtime::RuntimeState>();
                                if let Err(error) = runtime::open_popup(app.clone(), settings, runtime).await {
                                    eprintln!("[RUNTIME] {error}");
                                }
                            });
                        }
                    })
                    .build(),
            )?;
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.hide();
            }
            println!("[HOTKEY] Listener ready: {}", shortcut);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings_snapshot,
            commands::save_settings_snapshot,
            commands::set_ui_language,
            commands::submit_ask,
            commands::cancel_ask,
            commands::submit_popup,
            commands::cancel_popup,
            commands::open_settings,
            commands::close_settings,
            commands::choose_image_source,
            commands::cancel_image_source,
            commands::bootstrap_chat,
            commands::send_chat_message,
            commands::insert_latest_reply,
            commands::close_chat,
            commands::platform_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running KoDauKoVui");
}

fn normalize_shortcut(value: &str) -> String {
    let mut normalized = value
        .trim()
        .replace("<ctrl>+", "CommandOrControl+")
        .replace("<cmd>+", "Command+")
        .replace("<alt>+", "Alt+")
        .replace("<shift>+", "Shift+")
        .replace("'", "Quote");
    if normalized.is_empty() {
        normalized = "CommandOrControl+Quote".to_string();
    }
    normalized
}
