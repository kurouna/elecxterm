// ChildKiller は `Child` のスーパートレイト。`child.kill()` のメソッド解決に必要。
use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};
use dashmap::DashMap;
use thiserror::Error;
use parking_lot::Mutex;

/// 同時に保持できる PTY の上限。フロント側の MAX_PANES を超える値だが、
/// フロントの不具合やレース時に無制限にプロセスが生成されるのを防ぐ最後の砦。
const MAX_INSTANCES: usize = 64;

/// 子プロセスの終了をポーリングする間隔。`wait()` でブロックしてしまうと
/// destroy 時に `kill()` のためのロックが取れなくなるため try_wait で回す。
const CHILD_POLL_INTERVAL: Duration = Duration::from_millis(120);

#[derive(Error, Debug)]
pub enum PtyError {
    #[error("PTY not found: {0}")]
    NotFound(String),
    #[error("Too many PTY instances (max {0})")]
    TooManyInstances(usize),
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
    // 子プロセス。destroy 時に明示的に kill するために保持する。
    // 監視タスクは try_wait でポーリングするため、ロックは常に短時間で解放される。
    child: Mutex<Box<dyn Child + Send>>,
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
        on_data: Channel<InvokeResponseBody>,
    ) -> Result<String, PtyError> {
        // 二重作成防止
        if self.instances.contains_key(&options.id) {
            return Ok(options.id);
        }
        if self.instances.len() >= MAX_INSTANCES {
            return Err(PtyError::TooManyInstances(MAX_INSTANCES));
        }

        let rows = options.rows.unwrap_or(24).max(1);
        let cols = options.cols.unwrap_or(80).max(1);

        // PTYの初期化
        let options_clone = options.clone();
        let (pair, child) = tokio::task::spawn_blocking(move || {
            let pty_system = NativePtySystem::default();

            let pair = pty_system
                .openpty(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                }).map_err(|e| e.to_string())?;

            let shell = options_clone.shell.unwrap_or_else(default_shell);

            let mut cmd = CommandBuilder::new(&shell);
            // 存在しないディレクトリを渡すと spawn 自体が失敗するため、
            // 実在するものだけを cwd として採用しフォールバックする。
            if let Some(cwd) = options_clone.cwd.filter(|p| std::path::Path::new(p).is_dir()) {
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

        let instance = Arc::new(PtyInstance {
            writer: Mutex::new(writer),
            master: Mutex::new(master),
            child: Mutex::new(child),
            rows: AtomicU16::new(rows),
            cols: AtomicU16::new(cols),
        });

        let exit_sent = Arc::new(AtomicBool::new(false));
        let exit_sent_read = Arc::clone(&exit_sent);
        let exit_sent_wait = Arc::clone(&exit_sent);

        // 出力読み取りタスク
        let pty_id_for_read = pty_id.clone();
        let app_handle_for_read = app_handle.clone();
        tokio::spawn(async move {
            let mut reader = reader;
            loop {
                // 読み取りを blocking スレッドで実行
                let joined = tokio::task::spawn_blocking(move || {
                    use std::io::Read;
                    let mut buf = [0u8; 8192];
                    let res = reader.read(&mut buf);
                    (res, buf, reader)
                })
                .await;

                // ランタイム停止などで join に失敗した場合は静かに読み取りを終える。
                // ここで panic するとアプリ全体を巻き込むため expect は使わない。
                let Ok((res, buf, next_reader)) = joined else { break };
                reader = next_reader;

                match res {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        // 生バイトを Channel で転送する。Tauri v2 の Raw 経路は
                        // JSON 配列化を避けるため、高スループット出力でも軽量。
                        if on_data
                            .send(InvokeResponseBody::Raw(buf[..n].to_vec()))
                            .is_err()
                        {
                            // 受信側（フロントのペイン）が消滅している。読み続ける意味がない。
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            if !exit_sent_read.swap(true, Ordering::SeqCst) {
                let _ = app_handle_for_read.emit(&format!("pty-exit-{}", pty_id_for_read), ());
            }
        });

        // 子プロセス終了監視タスク。
        // `wait()` で待つと Mutex を掴みっぱなしになり destroy_pty の kill が
        // ブロックされるため、短周期の try_wait でポーリングする。
        let app_handle_for_child = app_handle.clone();
        let pty_id_for_child = pty_id.clone();
        let instance_for_child = Arc::clone(&instance);
        tokio::spawn(async move {
            loop {
                let inst = Arc::clone(&instance_for_child);
                let finished = tokio::task::spawn_blocking(move || {
                    // Ok(Some) = 終了（ここで reap 済み）、Err = 監視続行不能
                    !matches!(inst.child.lock().try_wait(), Ok(None))
                })
                .await
                .unwrap_or(true);

                if finished {
                    break;
                }
                tokio::time::sleep(CHILD_POLL_INTERVAL).await;
            }

            if !exit_sent_wait.swap(true, Ordering::SeqCst) {
                let _ = app_handle_for_child.emit(&format!("pty-exit-{}", pty_id_for_child), ());
            }
        });

        self.instances.insert(pty_id.clone(), instance);

        Ok(pty_id)
    }

    pub async fn write_to_pty(&self, id: &str, data: Vec<u8>) -> Result<(), PtyError> {
        let instance = self.get_instance(id)?;

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
        // 0 を渡すと一部の端末アプリが異常動作するため下限を 1 にする
        let rows = rows.max(1);
        let cols = cols.max(1);

        let instance = self.get_instance(id)?;

        let current_rows = instance.rows.load(Ordering::SeqCst);
        let current_cols = instance.cols.load(Ordering::SeqCst);

        let instance_cloned = Arc::clone(&instance);
        tokio::task::spawn_blocking(move || {
            let master = instance_cloned.master.lock();
            // サイズが変わっていない場合、ConPTY / SIGWINCH が発火せず
            // TUI アプリが再描画しないことがある。一度ずらしてから戻すことで
            // 明示的に通知する（既存挙動の維持）。
            if current_rows == rows && current_cols == cols {
                master.resize(PtySize {
                    rows: rows.saturating_add(1),
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

    /// PTY を破棄する。子プロセスを明示的に kill するため、実行中のコマンドが
    /// ペインを閉じた後も生き残ることがない。存在しない ID に対しては冪等に成功する
    /// （フロントは終了済みペインに対しても destroy を呼ぶため）。
    pub async fn destroy_pty(&self, id: &str) -> Result<(), PtyError> {
        let Some((_, instance)) = self.instances.remove(id) else {
            return Ok(());
        };

        tokio::task::spawn_blocking(move || {
            let mut child = instance.child.lock();
            // 既に終了していれば kill は失敗するが、その場合は何もする必要がない
            let _ = child.kill();
            let _ = child.try_wait();
        })
        .await
        .map_err(|e| PtyError::Internal("spawn_blocking".into(), e.to_string()))?;

        Ok(())
    }

    fn get_instance(&self, id: &str) -> Result<Arc<PtyInstance>, PtyError> {
        let map_ref = self
            .instances
            .get(id)
            .ok_or_else(|| PtyError::NotFound(id.to_string()))?;
        Ok(Arc::clone(map_ref.value()))
    }
}

fn default_shell() -> String {
    if cfg!(target_os = "windows") {
        "cmd.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}

pub type SharedPtyManager = Arc<PtyManager>;

pub fn create_shared_pty_manager() -> SharedPtyManager {
    Arc::new(PtyManager::new())
}
