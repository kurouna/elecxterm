use crate::pty_manager::{PtyCreateOptions, PtyResizeOptions, SharedPtyManager};
use tauri::{AppHandle, State};


/// PTYインスタンスを新規作成するコマンド
#[tauri::command]
pub fn create_pty(
    app_handle: AppHandle,
    state: State<'_, SharedPtyManager>,
    options: PtyCreateOptions,
) -> Result<String, String> {
    // SharedPtyManager が Arc 化されたため、全体の Lock は不要になりました。
    state.create_pty(&app_handle, options).map_err(|e| e.to_string())
}

/// PTYに入力データを書き込むコマンド
#[tauri::command]
pub fn write_pty(
    state: State<'_, SharedPtyManager>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    state.write_to_pty(&id, &data).map_err(|e| e.to_string())
}

/// PTYのサイズを変更するコマンド
#[tauri::command]
pub fn resize_pty(
    state: State<'_, SharedPtyManager>,
    options: PtyResizeOptions,
) -> Result<(), String> {
    state.resize_pty(&options.id, options.rows, options.cols).map_err(|e| e.to_string())
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
    state.destroy_pty(&id).map_err(|e| e.to_string())
}
