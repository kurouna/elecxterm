<p align="center">
  <img src="./public/elecxterm_repo_card.svg" width="800" alt="electerm - Next-generation terminal manager">
</p>


[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/built%20with-Tauri-blue?logo=tauri)](https://tauri.app/)
[![X](https://img.shields.io/badge/X-elecxzy-black)](https://x.com/elecxzy)
[![Created by Google Antigravity](https://img.shields.io/badge/Created%20by-Google%20Antigravity-orange)](https://github.com/google-deepmind/antigravity)

**elecxterm** は、Google Antigravity によって作成された、Tauri v2 と Rust で構築された次世代ターミナルマネージャーです。  
"elecxzy" エコシステムの一環として、直感的なタイリングレイアウト、高性能な PTY 管理、そして洗練されたユーザー体験を提供します。

<img src="./public/screenshot-dark.png" width="480" alt="electerm - Next-generation terminal manager dark theme">　
<img src="./public/screenshot-light.png" width="480" alt="electerm - Next-generation terminal manager light theme">

<img src="./public/screenshot-palette.png" width="480" alt="electerm - Next-generation terminal manager command palette">

> [!WARNING]
> **🚧 Project Status: Pre-release (Alpha) / 開発中（アルファ版）**
>
> This software is currently in an **early alpha stage**. Features are under active development, and some functions may be incomplete or unstable. Use with caution.
>
> 本ソフトウェアは現在、**開発初期のプレリリース（アルファ）版**です。すべての機能が完全に動作する状態ではなく、挙動が不安定な場合があります。あらかじめご了承ください。

## 🚀 主な機能

- **マルチタブ機能**: 複数の作業環境をタブで管理。各タブごとに独自のタイリングレイアウトを保持。
- **高度なタイリングエンジン**: 直感的な画面分割（垂直・水平）と、ドラッグアンドドロップによる直感的なサイズ調整。
- **マルチシェル対応**: `cmd.exe` や `PowerShell` を自在に使い分け、同一ウィンドウ内で一括管理。
- **堅牢な PTY バックエンド**:
    - **パフォーマンス**: Base64 エンコードを排したバイナリ IPC 通信により、超低遅延な入出力を実現。
    - **安定性**: 終了したペインのステータス監視と、レイアウト変更時でも状態を維持するスマートな再描画同期機能を搭載。
    - **ネイティブ実装**: `portable-pty` を採用したクロスプラットフォームな疑似端末実装。
- **洗練された UI/UX**:
    - **Midnight デザイン**: 深いネイビーを基調とした、目に優しくプレミアムな質感。
    - **Glassmorphism / Glow エフェクト**: 透明感のあるインターフェースと、アクティブペインの視覚的強調。
    - **キーボードファースト**: コマンドパレット (`Ctrl+Shift+K`) と豊富なショートカットによる高速な操作。
- **セッション永続化**: レイアウト設定（作業ディレクトリ含む）を自動保存し、次回起動時にシームレスに復元。

## ⚠️ 制限事項

- **最大ペイン数**: システムリソースの最適化とパフォーマンス維持のため、アプリケーション全体で同時に開けるペイン（ターミナル）の数は最大 **15個** に制限されています。

## ⌨️ キーボードショートカット

| キー | アクション |
| :--- | :--- |
| `Ctrl+Shift+K` | コマンドパレットを開く |
| `Ctrl+Shift+T` | 新しいタブを作成 |
| `Ctrl+Shift+→` | 次のタブへ移動 |
| `Ctrl+Shift+←` | 前のタブへ移動 |
| `Ctrl+Shift+D` | ペインを横に分割 (CMD) |
| `Ctrl+Shift+E` | ペインを縦に分割 (CMD) |
| `Ctrl+Alt+D` | ペインを横に分割 (PowerShell) |
| `Ctrl+Alt+E` | ペインを縦に分割 (PowerShell) |
| `Ctrl+Shift+W` | アクティブなペインを閉じる |
| `Ctrl+Shift+N` | 次のペインへ移動 |
| `Ctrl+Shift+P` | 前のペインへ移動 |
| `Ctrl+Shift+<` | 先頭のペインへ移動 |
| `Ctrl+Shift+>` | 最後のペインへ移動 |

## 🛠️ 開発とビルド

### プリリクエスト

- **Rust**: [rustup](https://rustup.rs/) を通じて最新の安定版をインストールしてください。
- **Node.js**: LTS バージョンを推奨します。
- **Windows**: [Build Tools for Visual Studio 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) が必要です。

### 初回セットアップ

リポジトリをクローンした後、初回のビルドを行う前に必ず以下のコマンドを実行して、OS 用のアイコン資産を生成してください。

```powershell
npm install
npx tauri icon ./app-icon.svg
```

### 開発用サーバーの起動 (Dev Build)

```powershell
.\dev.ps1
```

または単体での起動:
```powershell
npm run dev
```

### リリースビルド

実行バイナリとインストーラー（.msi / .exe）を生成します。

```powershell
npm run tauri build
```

## 📂 プロジェクト構造

- `src/`: React フロントエンド (TypeScript, Tailwind CSS, Vite)
- `src-tauri/`: Rust バックエンド (Tauri v2, portable-pty)
- `src-tauri/icons/`: アプリアイコン資産

## 📄 ライセンス

このプロジェクトは **MIT License** の下で公開されています。詳細については [LICENSE](./LICENSE) を参照してください。

---

© 2026 elecxzy project
