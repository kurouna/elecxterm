import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 描画中の例外でアプリ全体が白画面になるのを防ぐ。
 * レイアウトツリーや xterm 周りは外部データ（永続化ファイル）と
 * ネイティブ側の状態に依存するため、想定外の形が入り込む余地がある。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg-main p-8 text-tx-primary">
        <h1 className="text-sm font-semibold">Something went wrong</h1>
        <pre className="max-h-48 max-w-full overflow-auto rounded border border-border-dim bg-bg-surface p-3 text-[11px] text-tx-secondary">
          {error.message}
        </pre>
        <button
          onClick={this.handleReload}
          className="rounded bg-accent px-4 py-1.5 text-[12px] font-medium text-white"
        >
          Reload
        </button>
      </div>
    );
  }
}
