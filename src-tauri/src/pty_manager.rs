use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::Arc;
use std::sync::atomic::{AtomicU16, AtomicBool, Ordering};
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

/// PTYマネージャー: 複数のPTYインスタンスを非同期管理
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

    /// 新しいPTYインスタンスを生成し、出力をフロントエンドに非同期でストリームする
    pub async fn create_pty(
        &self,
        app_handle: &AppHandle,
        options: PtyCreateOptions,
    ) -> Result<String, PtyError> {
        // 二重作成防止
        if self.instances.contains_key(&options.id) {
            return Ok(options.id);
        }

        // PTYの初期化
        let options_clone = options.clone();
        let (pair, child) = tokio::task::spawn_blocking(move || {
            let pty_system = NativePtySystem::default();
            let rows = options_clone.rows.unwrap_or(24);
            let cols = options_clone.cols.unwrap_or(80);

            let pair = pty_system
                .openpty(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                }).map_err(|e| e.to_string())?;

            let shell = options_clone.shell.unwrap_or_else(|| {
                if cfg!(target_os = "windows") {
                    "cmd.exe".to_string()
                } else {
                    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
                }
            });

            let mut cmd = CommandBuilder::new(&shell);
            if let Some(ref cwd) = options_clone.cwd {
                cmd.cwd(cwd);
            }

            let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
            Ok::<(portable_pty::PtyPair, Box<dyn portable_pty::Child + Send>), String>((pair, child))
        })
        .await
        .map_err(|e| PtyError::Internal("spawn_blocking".into(), e.to_string()))?
        .map_err(|e| PtyError::Internal("open pty".into(), e))?;

        let master = pair.master;
        let reader = master
            .try_clone_reader()
            .map_err(|e| PtyError::Internal("clone reader".into(), e.to_string()))?;
        let writer = master
            .take_writer()
            .map_err(|e| PtyError::Internal("take writer".into(), e.to_string()))?;

        let pty_id = options.id.clone();
        let app_handle_clone = app_handle.clone();
        
        let exit_sent = Arc::new(AtomicBool::new(false));
        let exit_sent_read = Arc::clone(&exit_sent);
        let exit_sent_wait = Arc::clone(&exit_sent);

        // 出力読み取りタスク
        let pty_id_for_read = pty_id.clone();
        let app_handle_for_read = app_handle_clone.clone();
        tokio::spawn(async move {
            let mut reader = reader;
            loop {
                // 読み取りを blocking スレッドで実行
                let result = tokio::task::spawn_blocking(move || {
                    use std::io::Read;
                    let mut buf = [0u8; 8192];
                    match reader.read(&mut buf) {
                        Ok(n) => (Ok(n), buf, reader),
                        Err(e) => (Err(e), buf, reader),
                    }
                }).await.expect("spawn_blocking failed");

                let (res, buf, next_reader) = result;
                reader = next_reader;

                match res {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let _ = app_handle_for_read.emit(&format!("pty-data-{}", pty_id_for_read), &buf[..n]);
                    }
                    Err(_) => break,
                }
            }
            if !exit_sent_read.swap(true, Ordering::SeqCst) {
                let _ = app_handle_for_read.emit(&format!("pty-exit-{}", pty_id_for_read), ());
            }
        });

        // 子プロセス終了監視タスク
        let app_handle_for_child = app_handle.clone();
        let pty_id_for_child = pty_id.clone();
        tokio::spawn(async move {
            let _ = tokio::task::spawn_blocking(move || {
                let mut child = child;
                let _ = child.wait();
            }).await;
            
            if !exit_sent_wait.swap(true, Ordering::SeqCst) {
                let _ = app_handle_for_child.emit(&format!("pty-exit-{}", pty_id_for_child), ());
            }
        });

        let rows = options.rows.unwrap_or(24);
        let cols = options.cols.unwrap_or(80);
        let instance = Arc::new(PtyInstance {
            writer: Mutex::new(writer),
            master: Mutex::new(master),
            rows: AtomicU16::new(rows),
            cols: AtomicU16::new(cols),
        });

        self.instances.insert(pty_id.clone(), instance);

        Ok(pty_id)
    }

    pub async fn write_to_pty(&self, id: &str, data: Vec<u8>) -> Result<(), PtyError> {
        let instance = {
            let map_ref = self.instances.get(id).ok_or_else(|| PtyError::NotFound(id.to_string()))?;
            Arc::clone(map_ref.value())
        };
        
        tokio::task::spawn_blocking(move || {
            let mut writer = instance.writer.lock();
            writer.write_all(&data).map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        }).await.map_err(|e| PtyError::Internal("spawn_blocking".into(), e.to_string()))?
          .map_err(|e| PtyError::Internal("write data".into(), e))?;
        
        Ok(())
    }

    pub async fn resize_pty(&self, id: &str, rows: u16, cols: u16) -> Result<(), PtyError> {
        let instance = {
            let map_ref = self.instances.get(id).ok_or_else(|| PtyError::NotFound(id.to_string()))?;
            Arc::clone(map_ref.value())
        };
        
        let current_rows = instance.rows.load(Ordering::SeqCst);
        let current_cols = instance.cols.load(Ordering::SeqCst);

        let instance_cloned = Arc::clone(&instance);
        tokio::task::spawn_blocking(move || {
            let master = instance_cloned.master.lock();
            if current_rows == rows && current_cols == cols {
                master.resize(PtySize {
                    rows: rows + 1,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                }).map_err(|e| e.to_string())?;
            }

            master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            }).map_err(|e| e.to_string())?;
            
            Ok::<(), String>(())
        }).await.map_err(|e| PtyError::Internal("spawn_blocking".into(), e.to_string()))?
          .map_err(|e| PtyError::Internal("resize".into(), e))?;

        // instance is still available here
        instance.rows.store(rows, Ordering::SeqCst);
        instance.cols.store(cols, Ordering::SeqCst);
        
        Ok(())
    }

    pub async fn destroy_pty(&self, id: &str) -> Result<(), PtyError> {
        self.instances.remove(id).ok_or_else(|| PtyError::NotFound(id.to_string()))?;
        Ok(())
    }
}

pub type SharedPtyManager = Arc<PtyManager>;

pub fn create_shared_pty_manager() -> SharedPtyManager {
    Arc::new(PtyManager::new())
}
