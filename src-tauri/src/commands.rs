use crate::pty_manager::{PtyCreateOptions, PtyResizeOptions, SharedPtyManager};
use tauri::{AppHandle, State};


/// PTYインスタンスを新規作成するコマンド
#[tauri::command]
pub fn create_pty(
    app_handle: AppHandle,
    state: State<'_, SharedPtyManager>,
    options: PtyCreateOptions,
) -> Result<String, String> {
    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock pty manager: {}", e))?;
    manager.create_pty(&app_handle, options)
}

/// PTYに入力データを書き込むコマンド
#[tauri::command]
pub fn write_pty(
    state: State<'_, SharedPtyManager>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock pty manager: {}", e))?;
    manager.write_to_pty(&id, &data)
}

/// PTYのサイズを変更するコマンド
#[tauri::command]
pub fn resize_pty(
    state: State<'_, SharedPtyManager>,
    options: PtyResizeOptions,
) -> Result<(), String> {
    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock pty manager: {}", e))?;
    manager.resize_pty(&options.id, options.rows, options.cols)
}

#[tauri::command]
pub fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| format!("Failed to get current directory: {}", e))
}


/// PTYインスタンスを破棄するコマンド
#[tauri::command]
pub fn destroy_pty(
    state: State<'_, SharedPtyManager>,
    id: String,
) -> Result<(), String> {
    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock pty manager: {}", e))?;
    manager.destroy_pty(&id)
}
