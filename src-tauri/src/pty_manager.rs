use portable_pty::{CommandBuilder, NativePtySystem, PtyPair, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

/// PTYインスタンスごとの情報を保持する構造体
struct PtyInstance {
    writer: Box<dyn Write + Send>,
    _pair: PtyPair,
}

/// PTYマネージャー: 複数のPTYインスタンスを管理
pub struct PtyManager {
    instances: HashMap<String, PtyInstance>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PtyCreateOptions {
    pub id: String,
    pub cwd: Option<String>,
    pub shell: Option<String>,
    pub rows: Option<u16>,
    pub cols: Option<u16>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PtyResizeOptions {
    pub id: String,
    pub rows: u16,
    pub cols: u16,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager {
            instances: HashMap::new(),
        }
    }

    /// 新しいPTYインスタンスを生成し、出力をフロントエンドにストリームする
    pub fn create_pty(
        &mut self,
        app_handle: &AppHandle,
        options: PtyCreateOptions,
    ) -> Result<String, String> {
        if self.instances.contains_key(&options.id) {
            return Ok(options.id);
        }

        let pty_system = NativePtySystem::default();
        let rows = options.rows.unwrap_or(24);
        let cols = options.cols.unwrap_or(80);

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open pty: {}", e))?;

        let shell = options.shell.unwrap_or_else(|| {
            if cfg!(target_os = "windows") {
                "cmd.exe".to_string()
            } else {
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
            }
        });

        let mut cmd = CommandBuilder::new(&shell);
        if let Some(ref cwd) = options.cwd {
            cmd.cwd(cwd);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let pty_id = options.id.clone();
        let app_handle_clone = app_handle.clone();
        let pty_id_for_thread = pty_id.clone();

        // 出力読み取りスレッド
        thread::Builder::new()
            .name(format!("pty-read-{}", pty_id))
            .spawn(move || {
                let mut buf = [0u8; 8192]; // バッファサイズを拡張して効率化
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let _ = app_handle_clone.emit(&format!("pty-data-{}", pty_id_for_thread), &buf[..n]);
                        }
                        Err(_) => break,
                    }
                }
                let _ = app_handle_clone.emit(&format!("pty-exit-{}", pty_id_for_thread), ());
            })
            .map_err(|e| format!("Failed to spawn read thread: {}", e))?;

        // 子プロセス終了監視スレッド
        let app_handle_for_child = app_handle.clone();
        let pty_id_for_child = pty_id.clone();
        thread::Builder::new()
            .name(format!("pty-wait-{}", pty_id))
            .spawn(move || {
                let mut child = child;
                let _ = child.wait();
                let _ = app_handle_for_child.emit(&format!("pty-exit-{}", pty_id_for_child), ());
            })
            .map_err(|e| format!("Failed to spawn wait thread: {}", e))?;

        self.instances.insert(
            pty_id.clone(),
            PtyInstance {
                writer,
                _pair: pair,
            },
        );

        Ok(pty_id)
    }

    pub fn write_to_pty(&mut self, id: &str, data: &[u8]) -> Result<(), String> {
        if let Some(instance) = self.instances.get_mut(id) {
            instance.writer.write_all(data).map_err(|e| e.to_string())?;
            instance.writer.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err(format!("PTY not found: {}", id))
        }
    }

    pub fn resize_pty(&mut self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        if let Some(instance) = self.instances.get_mut(id) {
            instance._pair.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            }).map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err(format!("PTY not found: {}", id))
        }
    }

    pub fn destroy_pty(&mut self, id: &str) -> Result<(), String> {
        self.instances.remove(id).ok_or_else(|| format!("PTY not found: {}", id))?;
        Ok(())
    }
}

pub type SharedPtyManager = Arc<Mutex<PtyManager>>;

pub fn create_shared_pty_manager() -> SharedPtyManager {
    Arc::new(Mutex::new(PtyManager::new()))
}
