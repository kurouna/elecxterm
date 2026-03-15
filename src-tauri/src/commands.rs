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
    data: String,
) -> Result<(), String> {
    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock pty manager: {}", e))?;
    // Base64デコード
    let decoded = base64_decode(&data)?;
    manager.write_to_pty(&id, &decoded)
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

/// 簡易Base64デコーダー
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    fn char_to_val(c: u8) -> Result<u8, String> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            b'=' => Ok(0),
            _ => Err(format!("Invalid base64 character: {}", c as char)),
        }
    }

    let bytes = input.as_bytes();
    let mut result = Vec::with_capacity(bytes.len() * 3 / 4);

    for chunk in bytes.chunks(4) {
        if chunk.len() < 4 {
            break;
        }
        let vals: Vec<u8> = chunk
            .iter()
            .map(|&b| char_to_val(b))
            .collect::<Result<Vec<_>, _>>()?;
        result.push((vals[0] << 2) | (vals[1] >> 4));
        if chunk[2] != b'=' {
            result.push((vals[1] << 4) | (vals[2] >> 2));
        }
        if chunk[3] != b'=' {
            result.push((vals[2] << 6) | vals[3]);
        }
    }

    Ok(result)
}
