// Child / ChildKiller はトレイトオブジェクト経由のメソッド解決（wait / clone_killer / kill）に必要
use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, NativePtySystem, PtyPair, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};
use dashmap::DashMap;
use thiserror::Error;
use parking_lot::Mutex;

/// 同時に保持できる PTY の上限。フロント側の MAX_PANES を超える値だが、
/// フロントの不具合やレース時に無制限にプロセスが生成されるのを防ぐ最後の砦。
const MAX_INSTANCES: usize = 64;

/// PTY 出力の読み取りバッファ。大量出力時に IPC 回数を減らすため大きめに取る。
const READ_BUFFER_SIZE: usize = 16 * 1024;

/// シェル統合（カレントディレクトリ通知）を無効化するための環境変数
const NO_SHELL_INTEGRATION_ENV: &str = "ELECXTERM_NO_SHELL_INTEGRATION";

/// PowerShell の prompt 関数をラップし、プロンプト表示のたびに
/// - OSC 133;D;<終了コード>（直前のコマンドの終了）
/// - OSC 133;A（プロンプト開始）/ OSC 133;B（プロンプト終了 = 入力開始位置）
/// - OSC 9;9（カレントディレクトリ）
/// を送らせるスクリプト。プロファイル（oh-my-posh 等）が定義した prompt を壊さないよう、
/// 既存の関数を呼び出した結果の前後に付け足すだけにする。`$?` は最初に読まないと上書きされる。
const PWSH_INTEGRATION_SCRIPT: &str = r#"
$global:__elecxtermPrompt = $function:prompt
function global:prompt {
  $ok = $?
  $code = if ($ok) { 0 } elseif ($global:LASTEXITCODE) { $global:LASTEXITCODE } else { 1 }
  $out = & $global:__elecxtermPrompt
  $e = [char]27
  $loc = $executionContext.SessionState.Path.CurrentLocation
  $cwd = if ($loc.Provider.Name -eq 'FileSystem') { "$e]9;9;$($loc.ProviderPath)$e\" } else { '' }
  "$e]133;D;$code$e\$e]133;A$e\$cwd" + ($out -join '') + "$e]133;B$e\"
}
"#;

#[derive(Error, Debug)]
pub enum PtyError {
    #[error("PTY not found: {0}")]
    NotFound(String),
    #[error("Too many PTY instances (max {0})")]
    TooManyInstances(usize),
    #[error("Failed to {0}: {1}")]
    Internal(String, String),
}

/// PTYインスタンスごとの情報を保持する構造体。
/// 子プロセス本体は終了監視スレッドが所有して `wait()` でブロックするため、
/// ここでは kill 専用のハンドル（ChildKiller）だけを持つ。これによりポーリング不要で
/// 終了を検知しつつ、破棄時はいつでも kill できる。
struct PtyInstance {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    /// 最後に適用したサイズ (rows, cols)
    size: Mutex<(u16, u16)>,
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

/// `pty-exit-{id}` イベントのペイロード
#[derive(Serialize, Clone)]
struct PtyExitPayload {
    code: Option<u32>,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager {
            instances: DashMap::new(),
        }
    }

    /// 新しいPTYインスタンスを生成し、出力をフロントエンドにストリームする。
    /// 戻り値は実際に起動したシェル（pwsh が無い場合のフォールバックを反映）。
    pub async fn create_pty(
        &self,
        app_handle: &AppHandle,
        options: PtyCreateOptions,
        on_data: Channel<InvokeResponseBody>,
    ) -> Result<String, PtyError> {
        // 同じ ID が残っているのはフロントがリロードされた場合だけ。古い PTY は
        // もう誰も出力を受け取れないので、破棄して作り直す。
        if self.instances.contains_key(&options.id) {
            self.destroy_pty(&options.id).await?;
        }
        if self.instances.len() >= MAX_INSTANCES {
            return Err(PtyError::TooManyInstances(MAX_INSTANCES));
        }

        let rows = options.rows.unwrap_or(24).max(1);
        let cols = options.cols.unwrap_or(80).max(1);
        let requested_shell = options.shell.clone().unwrap_or_else(default_shell);
        let cwd = options
            .cwd
            .clone()
            .filter(|p| Path::new(p).is_dir())
            .or_else(|| home_dir().map(|p| p.to_string_lossy().into_owned()));

        type Spawned = (PtyPair, Box<dyn Child + Send>, String);
        let (pair, child, shell) = tokio::task::spawn_blocking(move || -> Result<Spawned, String> {
            let pty_system = NativePtySystem::default();
            let pair = pty_system
                .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
                .map_err(|e| e.to_string())?;

            // pwsh (PowerShell 7) が未インストールの環境では Windows PowerShell に落とす
            let mut candidates = vec![requested_shell.clone()];
            if is_shell(&requested_shell, "pwsh") {
                candidates.push("powershell.exe".to_string());
            }

            let mut last_err = String::new();
            for shell in candidates {
                match pair.slave.spawn_command(build_command(&shell, cwd.as_deref())) {
                    Ok(child) => return Ok((pair, child as Box<dyn Child + Send>, shell)),
                    Err(e) => last_err = format!("{shell}: {e}"),
                }
            }
            Err(last_err)
        })
        .await
        .map_err(|e| PtyError::Internal("spawn_blocking".into(), e.to_string()))?
        .map_err(|e| PtyError::Internal("start shell".into(), e))?;

        // 子プロセス起動後はスレーブ側を保持する必要がない（保持すると Unix では EOF が届かない）
        drop(pair.slave);
        let master = pair.master;
        let mut reader = master
            .try_clone_reader()
            .map_err(|e| PtyError::Internal("clone reader".into(), e.to_string()))?;
        let writer = master
            .take_writer()
            .map_err(|e| PtyError::Internal("take writer".into(), e.to_string()))?;
        let killer = child.clone_killer();

        let pty_id = options.id.clone();
        let instance = Arc::new(PtyInstance {
            writer: Mutex::new(writer),
            master: Mutex::new(master),
            killer: Mutex::new(killer),
            size: Mutex::new((rows, cols)),
        });
        self.instances.insert(pty_id.clone(), instance);

        // 出力読み取りスレッド。ブロッキング read を専用スレッドで回すことで、
        // チャンクごとに tokio の blocking プールへタスクを投げるコストを避ける。
        // master が drop される（destroy）と EOF / エラーで抜ける。
        let spawn_reader = std::thread::Builder::new()
            .name(format!("pty-read-{pty_id}"))
            .spawn(move || {
                let mut buf = vec![0u8; READ_BUFFER_SIZE];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            // 生バイトを Channel で転送する（JSON 配列化を避ける高速経路）。
                            // 受信側（フロントのペイン）が消えていれば読み続ける意味はない。
                            if on_data.send(InvokeResponseBody::Raw(buf[..n].to_vec())).is_err() {
                                break;
                            }
                        }
                    }
                }
            });

        // 子プロセス終了監視スレッド。子プロセスを所有して wait() でブロックする
        // （kill は ChildKiller 経由で行えるのでロック競合は起きない）。
        let app_for_wait = app_handle.clone();
        let id_for_wait = pty_id.clone();
        let mut child = child;
        let spawn_waiter = std::thread::Builder::new()
            .name(format!("pty-wait-{pty_id}"))
            .spawn(move || {
                let code = child.wait().ok().map(|status| status.exit_code());
                let _ = app_for_wait.emit(&format!("pty-exit-{id_for_wait}"), PtyExitPayload { code });
            });

        if let Err(e) = spawn_reader.and(spawn_waiter) {
            let _ = self.destroy_pty(&pty_id).await;
            return Err(PtyError::Internal("spawn thread".into(), e.to_string()));
        }

        Ok(shell)
    }

    pub async fn write_to_pty(&self, id: &str, data: Vec<u8>) -> Result<(), PtyError> {
        let instance = self.get_instance(id)?;

        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut writer = instance.writer.lock();
            writer.write_all(&data).map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| PtyError::Internal("spawn_blocking".into(), e.to_string()))?
        .map_err(|e| PtyError::Internal("write data".into(), e))
    }

    pub async fn resize_pty(&self, id: &str, rows: u16, cols: u16) -> Result<(), PtyError> {
        // 0 を渡すと一部の端末アプリが異常動作するため下限を 1 にする
        let rows = rows.max(1);
        let cols = cols.max(1);
        let instance = self.get_instance(id)?;

        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let master = instance.master.lock();
            let mut size = instance.size.lock();
            // サイズが変わっていない場合、ConPTY が通知を発火せず TUI アプリが
            // 再描画しないことがある。一度ずらしてから戻すことで明示的に通知する。
            if *size == (rows, cols) {
                master
                    .resize(PtySize { rows: rows.saturating_add(1), cols, pixel_width: 0, pixel_height: 0 })
                    .map_err(|e| e.to_string())?;
            }
            master
                .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
                .map_err(|e| e.to_string())?;
            *size = (rows, cols);
            Ok(())
        })
        .await
        .map_err(|e| PtyError::Internal("spawn_blocking".into(), e.to_string()))?
        .map_err(|e| PtyError::Internal("resize".into(), e))
    }

    /// PTY を破棄する。子プロセスを明示的に kill するため、実行中のコマンドが
    /// ペインを閉じた後も生き残ることがない。存在しない ID に対しては冪等に成功する
    /// （フロントは終了済みペインに対しても destroy を呼ぶため）。
    pub async fn destroy_pty(&self, id: &str) -> Result<(), PtyError> {
        let Some((_, instance)) = self.instances.remove(id) else {
            return Ok(());
        };

        // ClosePseudoConsole（master の drop）は出力が掃けるまでブロックしうるため、
        // kill と drop は blocking スレッドで行う。
        tokio::task::spawn_blocking(move || {
            // 既に終了していれば kill は失敗するが、その場合は何もする必要がない
            let _ = instance.killer.lock().kill();
            drop(instance);
        })
        .await
        .map_err(|e| PtyError::Internal("spawn_blocking".into(), e.to_string()))
    }

    fn get_instance(&self, id: &str) -> Result<Arc<PtyInstance>, PtyError> {
        self.instances
            .get(id)
            .map(|entry| Arc::clone(entry.value()))
            .ok_or_else(|| PtyError::NotFound(id.to_string()))
    }
}

/// シェルの実行ファイル名が `name`（拡張子なし）と一致するか
fn is_shell(shell: &str, name: &str) -> bool {
    Path::new(shell)
        .file_stem()
        .map(|stem| stem.to_string_lossy().eq_ignore_ascii_case(name))
        .unwrap_or(false)
}

/// シェルごとの起動コマンドを組み立てる。cmd / PowerShell には、
/// プロンプトのたびにカレントディレクトリを OSC 9;9 で通知させる
/// 「シェル統合」を仕込む（Windows Terminal と同じ方式）。
fn build_command(shell: &str, cwd: Option<&str>) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(shell);
    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }
    cmd.env("TERM_PROGRAM", "elecxterm");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    cmd.env("COLORTERM", "truecolor");

    if std::env::var_os(NO_SHELL_INTEGRATION_ENV).is_some() {
        return cmd;
    }

    if is_shell(shell, "cmd") {
        // cmd の PROMPT は表示のたびに展開される。終了コードは取れないので 133;D は値なし。
        // 利用者が既にシェル統合を設定している場合は触らない
        let prompt = std::env::var("PROMPT").unwrap_or_else(|_| "$P$G".to_string());
        if !prompt.contains("]9;9;") && !prompt.contains("]133;") {
            cmd.env("PROMPT", format!(r"$e]133;D$e\$e]133;A$e\$e]9;9;$P$e\{prompt}$e]133;B$e\"));
        }
    } else if is_shell(shell, "pwsh") || is_shell(shell, "powershell") {
        // -EncodedCommand は UTF-16LE の Base64。引用符のエスケープ問題を避けられる
        let utf16: Vec<u8> = PWSH_INTEGRATION_SCRIPT
            .encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect();
        let encoded = base64_encode(&utf16);
        cmd.args(["-NoLogo", "-NoExit", "-EncodedCommand", encoded.as_str()]);
    }
    cmd
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(TABLE[((n >> (18 - 6 * i)) & 0x3f) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

pub fn home_dir() -> Option<PathBuf> {
    let var = if cfg!(target_os = "windows") { "USERPROFILE" } else { "HOME" };
    std::env::var_os(var).map(PathBuf::from).filter(|p| p.is_dir())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_reference() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    /// 実際のシェルを ConPTY で起動し、シェル統合のエスケープシーケンスが出ることを確かめる。
    /// 端末環境に依存するので通常は実行しない（`cargo test -- --ignored` で実行）。
    #[cfg(windows)]
    fn run_shell(shell: &str, input: &str) -> String {
        use std::sync::mpsc;
        let pair = NativePtySystem::default()
            .openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 })
            .expect("openpty");
        let mut child = pair.slave.spawn_command(build_command(shell, None)).expect("spawn");
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().expect("reader");
        let mut writer = pair.master.take_writer().expect("writer");
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 || tx.send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
        });
        // ConPTY は起動直後に端末への問い合わせ（DSR）を送ってくるので、カーソル位置を答えておく
        std::thread::sleep(std::time::Duration::from_millis(1500));
        writer.write_all(b"\x1b[1;1R").ok();
        writer.write_all(input.as_bytes()).expect("write");
        writer.flush().ok();
        let mut out = Vec::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while std::time::Instant::now() < deadline {
            if let Ok(chunk) = rx.recv_timeout(std::time::Duration::from_millis(200)) {
                out.extend(chunk);
            }
            if matches!(child.try_wait(), Ok(Some(_))) {
                break;
            }
        }
        let _ = child.kill();
        String::from_utf8_lossy(&out).into_owned()
    }

    #[cfg(windows)]
    #[test]
    #[ignore]
    fn cmd_emits_shell_integration_sequences() {
        let out = run_shell("cmd.exe", "cd /d C:\\Windows\r\nexit\r\n");
        assert!(out.contains("\x1b]9;9;C:\\Windows"), "cwd not reported: {out:?}");
        assert!(out.contains("\x1b]133;A"), "prompt start not reported: {out:?}");
        assert!(out.contains("\x1b]133;B"), "prompt end not reported: {out:?}");
    }

    #[cfg(windows)]
    #[test]
    #[ignore]
    fn powershell_reports_exit_code() {
        // pwsh (PowerShell 7) が無ければ、アプリと同じく Windows PowerShell で確かめる
        let shell = if std::process::Command::new("pwsh.exe").arg("-v").output().is_ok() {
            "pwsh.exe"
        } else {
            "powershell.exe"
        };
        eprintln!("testing shell integration with {shell}");
        let out = run_shell(shell, "cmd /c exit 3\rSet-Location C:\\Windows\rexit\r");
        assert!(out.contains("\x1b]133;D;3"), "exit code not reported: {out:?}");
        assert!(out.contains("\x1b]9;9;C:\\Windows"), "cwd not reported: {out:?}");
    }

    #[test]
    fn shell_name_matching() {
        assert!(is_shell("pwsh.exe", "pwsh"));
        assert!(is_shell("C:\\Windows\\System32\\cmd.exe", "cmd"));
        assert!(is_shell("PowerShell.EXE", "powershell"));
        assert!(!is_shell("pwsh-preview.exe", "pwsh"));
    }
}
