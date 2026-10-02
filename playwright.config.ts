import { defineConfig } from "@playwright/test";

/**
 * e2e テスト。`npm run dev`（Vite）を起動し、ブラウザ上で Tauri の IPC をモックした状態
 * （src/dev/mockTauri.ts）で UI を操作する。インストール済みの Microsoft Edge を使うので
 * ブラウザのダウンロードは不要。
 *
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1420",
    channel: "msedge",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
