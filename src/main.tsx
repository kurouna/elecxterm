import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { ThemeProvider } from "./ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

async function bootstrap() {
  // 開発時に通常のブラウザで開いた場合は IPC をモックする（本番ビルドからは除去される）
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
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
}

void bootstrap();
