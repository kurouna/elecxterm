use crate::pty_manager::{PtyCreateOptions, PtyResizeOptions, SharedPtyManager};
use tauri::{AppHandle, State};
use tauri::ipc::{Channel, InvokeResponseBody};


/// PTYインスタンスを新規作成するコマンド（非同期）
/// on_data: PTY 出力を生バイトでフロントへ流す Channel（JSON 化を避ける高速経路）
#[tauri::command]
pub async fn create_pty(
    app_handle: AppHandle,
    state: State<'_, SharedPtyManager>,
    options: PtyCreateOptions,
    on_data: Channel<InvokeResponseBody>,
) -> Result<String, String> {
    state.create_pty(&app_handle, options, on_data).await.map_err(|e| e.to_string())
}

/// PTYに入力データを書き込むコマンド（非同期）
#[tauri::command]
pub async fn write_pty(
    state: State<'_, SharedPtyManager>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    state.write_to_pty(&id, data).await.map_err(|e| e.to_string())
}

/// PTYのサイズを変更するコマンド（非同期）
#[tauri::command]
pub async fn resize_pty(
    state: State<'_, SharedPtyManager>,
    options: PtyResizeOptions,
) -> Result<(), String> {
    state.resize_pty(&options.id, options.rows, options.cols).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| format!("Failed to get current directory: {}", e))
}


/// PTYインスタンスを破棄するコマンド（非同期）
#[tauri::command]
pub async fn destroy_pty(
    state: State<'_, SharedPtyManager>,
    id: String,
) -> Result<(), String> {
    state.destroy_pty(&id).await.map_err(|e| e.to_string())
}
