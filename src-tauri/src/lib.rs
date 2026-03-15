mod commands;
mod pty_manager;

use pty_manager::create_shared_pty_manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pty_manager = create_shared_pty_manager();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(pty_manager)
        .invoke_handler(tauri::generate_handler![
            commands::create_pty,
            commands::write_pty,
            commands::resize_pty,
            commands::destroy_pty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
