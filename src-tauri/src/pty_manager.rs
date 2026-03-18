use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::Arc;
use std::sync::atomic::{AtomicU16, Ordering};
use std::thread;
use tauri::{AppHandle, Emitter};
use dashmap::DashMap;
use thiserror::Error;
use parking_lot::Mutex;

#[derive(Error, Debug)]
pub enum PtyError {
    #[error("PTY not found: {0}")]
    NotFound(String),
    #[error("Failed to {0}: {1}")]
    Internal(String, String),
}

// Tauri コマンドの戻り値として使うために String へ変換しやすくする
impl From<PtyError> for String {
    fn from(err: PtyError) -> Self {
        err.to_string()
    }
}

/// PTYインスタンスごとの情報を保持する構造体
struct PtyInstance {
    // 書き込み用
    writer: Mutex<Box<dyn Write + Send>>,
    // リサイズ制御用
    master: Mutex<Box<dyn MasterPty + Send>>,
    // 原子的に読み書き可能なサイズ情報（ロック不要）
    rows: AtomicU16,
    cols: AtomicU16,
}

/// PTYマネージャー: 複数のPTYインスタンスを並列管理
pub struct PtyManager {
    // スレッドセーフなマップ。個別のキー操作で全体がロックされない
    instances: DashMap<String, Arc<PtyInstance>>,
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
            instances: DashMap::new(),
        }
    }

    /// 新しいPTYインスタンスを生成し、出力をフロントエンドにストリームする
    pub fn create_pty(
        &self,
        app_handle: &AppHandle,
        options: PtyCreateOptions,
    ) -> Result<String, PtyError> {
        // 二重作成防止
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
            .map_err(|e| PtyError::Internal("open pty".into(), e.to_string()))?;

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
            .map_err(|e| PtyError::Internal("spawn command".into(), e.to_string()))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::Internal("clone reader".into(), e.to_string()))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::Internal("take writer".into(), e.to_string()))?;

        let pty_id = options.id.clone();
        let app_handle_clone = app_handle.clone();
        let pty_id_for_thread = pty_id.clone();

        // 出力読み取りスレッド
        thread::Builder::new()
            .name(format!("pty-read-{}", pty_id))
            .spawn(move || {
                use std::io::Read;
                let mut buf = [0u8; 8192];
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
            .map_err(|e| PtyError::Internal("spawn read thread".into(), e.to_string()))?;

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
            .map_err(|e| PtyError::Internal("spawn wait thread".into(), e.to_string()))?;

        let instance = Arc::new(PtyInstance {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            rows: AtomicU16::new(rows),
            cols: AtomicU16::new(cols),
        });

        self.instances.insert(pty_id.clone(), instance);

        Ok(pty_id)
    }

    pub fn write_to_pty(&self, id: &str, data: &[u8]) -> Result<(), PtyError> {
        let instance = self.instances.get(id).ok_or_else(|| PtyError::NotFound(id.to_string()))?;
        
        let mut writer = instance.writer.lock();
        writer.write_all(data).map_err(|e| PtyError::Internal("write data".into(), e.to_string()))?;
        writer.flush().map_err(|e| PtyError::Internal("flush".into(), e.to_string()))?;
        Ok(())
    }

    pub fn resize_pty(&self, id: &str, rows: u16, cols: u16) -> Result<(), PtyError> {
        let instance = self.instances.get(id).ok_or_else(|| PtyError::NotFound(id.to_string()))?;
        
        // 現在のサイズを原子的に取得
        let current_rows = instance.rows.load(Ordering::SeqCst);
        let current_cols = instance.cols.load(Ordering::SeqCst);

        let master = instance.master.lock();

        // 現在のサイズと同じ場合は、一旦+1してから戻すことで強制的にSIGWINCH相当の信号を送る
        if current_rows == rows && current_cols == cols {
            master.resize(PtySize {
                rows: rows + 1,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            }).map_err(|e| PtyError::Internal("force resize".into(), e.to_string()))?;
        }

        master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| PtyError::Internal("resize".into(), e.to_string()))?;

        // サイズ情報を更新
        instance.rows.store(rows, Ordering::SeqCst);
        instance.cols.store(cols, Ordering::SeqCst);
        
        Ok(())
    }

    pub fn destroy_pty(&self, id: &str) -> Result<(), PtyError> {
        self.instances.remove(id).ok_or_else(|| PtyError::NotFound(id.to_string()))?;
        Ok(())
    }
}

// ロックが不要になったため Mutex を除去
pub type SharedPtyManager = Arc<PtyManager>;

pub fn create_shared_pty_manager() -> SharedPtyManager {
    Arc::new(PtyManager::new())
}
