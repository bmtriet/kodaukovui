mod actions;
mod ai;
mod commands;
mod launcher;
mod native;
mod platform;
mod prompts;
mod runtime;
mod settings;
mod windowing;

use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(settings::AppState::load())
        .manage(runtime::RuntimeState::default())
        .setup(|app| {
            let snapshot = app.state::<settings::AppState>().snapshot();
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
                                if let Err(error) = runtime::toggle_popup(app.clone(), settings, runtime).await {
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
            {
                let app = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let settings = app.state::<settings::AppState>();
                    let runtime = app.state::<runtime::RuntimeState>();
                    if let Err(error) = runtime::toggle_popup(app.clone(), settings, runtime).await {
                        eprintln!("[RUNTIME] {error}");
                    }
                });
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
            commands::retake_image_for_ask,
            commands::get_ask_image_context,
            commands::submit_popup,
            commands::cancel_popup,
            commands::open_settings,
            commands::close_settings,
            commands::choose_image_source,
            commands::cancel_image_source,
            commands::get_chat_state,
            commands::bootstrap_chat,
            commands::send_chat_message,
            commands::insert_latest_reply,
            commands::close_chat,
            commands::close_response,
            commands::copy_response_text,
            commands::show_pending_response,
            commands::platform_summary,
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building clipBo");

    app.run(|app, event| {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { .. } = event {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let settings = app.state::<settings::AppState>();
                let runtime = app.state::<runtime::RuntimeState>();
                if let Err(error) = runtime::toggle_popup(app.clone(), settings, runtime).await {
                    eprintln!("[RUNTIME] {error}");
                }
            });
        }
    });
}

pub fn normalize_shortcut(value: &str) -> String {
    let mut normalized = value
        .trim()
        .replace("<ctrl>+", "CommandOrControl+")
        .replace("<cmd>+", "Command+")
        .replace("<alt>+", "Alt+")
        .replace("<shift>+", "Shift+");

    if cfg!(target_os = "linux") {
        normalized = normalized.replace("'", "Backquote");
    } else {
        normalized = normalized.replace("'", "Quote");
    }

    if normalized.is_empty() {
        normalized = if cfg!(target_os = "linux") {
            "CommandOrControl+Backquote".to_string()
        } else {
            "CommandOrControl+Quote".to_string()
        };
    }

    if let Some(last_plus) = normalized.rfind('+') {
        let (modifiers, key) = normalized.split_at(last_plus + 1);
        if key.len() == 1 {
            normalized = format!("{}{}", modifiers, key.to_lowercase());
        }
    }

    normalized
}

pub fn rebind_popup_hotkey(app: &tauri::AppHandle, hotkey_popup: &str) -> Result<String, String> {
    let shortcut = normalize_shortcut(hotkey_popup);
    app.global_shortcut()
        .unregister_all()
        .map_err(|err| err.to_string())?;
    app.global_shortcut()
        .register(shortcut.as_str())
        .map_err(|err| err.to_string())?;
    println!("[HOTKEY] Rebound: {}", shortcut);
    Ok(shortcut)
}
