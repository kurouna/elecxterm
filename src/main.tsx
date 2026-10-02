import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { ThemeProvider } from "./ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

async function bootstrap() {
  // 開発時に通常のブラウザで開いた場合は IPC をモックする（本番ビルドからは除去される）。
  // ?demo=<scene> を付けると README 用スクリーンショットのデモシナリオを再現する。
  let playDemo: (() => Promise<void>) | null = null;
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const params = new URLSearchParams(location.search);
    if (params.has("demo")) {
      const demo = await import("./dev/demo");
      const config = demo.seedDemo(params);
      playDemo = () => demo.playDemo(config);
    }
    const { installTauriMock } = await import("./dev/mockTauri");
    installTauriMock();
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );

  void playDemo?.();
}

void bootstrap();
