import { expect, Page } from "@playwright/test";

/**
 * e2e テストの共通操作。ブラウザでは src/dev/mockTauri.ts が IPC をモックし、
 * `window.__ELECXTERM_MOCK__` から「生きている PTY」と IPC 履歴を参照できる。
 */

type MockHooks = {
  livePtys: () => string[];
  log: { cmd: string; id?: string; shell?: string }[];
};

declare global {
  interface Window {
    __ELECXTERM_MOCK__: MockHooks;
    /** 開発ビルドで terminalRegistry が公開する（画面の文字の読み取り用） */
    __ELECXTERM_REGISTRY__: { getTerminalSnapshot: (paneId: string, maxLines: number) => string[] };
  }
}

/** まっさらな状態でアプリを開き、最初のシェルが起動するまで待つ */
export async function openApp(page: Page) {
  await page.addInitScript(() => {
    // 初回起動のウェルカムカードはテストの邪魔になるので出さない
    localStorage.setItem("elecxterm-welcomed", "1");
  });
  await page.goto("/");
  await expect(tabs(page)).toHaveCount(1);
  await expect(visiblePanes(page)).toHaveCount(1);
  await expectFocusedPane(page, await paneIds(page).then((ids) => ids[0]));
}

export const tabs = (page: Page) => page.locator('[role="tab"]');

/** アクティブなタブに表示されているペイン */
export const visiblePanes = (page: Page) => page.locator('[aria-hidden="false"] .pane[data-pane-id]');

/** 全タブのペイン ID（DOM 上の表示順） */
export function allPaneIds(page: Page): Promise<string[]> {
  return page.locator(".pane[data-pane-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-pane-id")!));
}

/** アクティブなタブのペイン ID（表示順） */
export function paneIds(page: Page): Promise<string[]> {
  return visiblePanes(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-pane-id")!));
}

export function livePtys(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__ELECXTERM_MOCK__.livePtys());
}

export function ptyLog(page: Page) {
  return page.evaluate(() => [...window.__ELECXTERM_MOCK__.log]);
}

/** キーボードフォーカスを持っているペイン */
export function focusedPaneId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.closest(".pane")?.getAttribute("data-pane-id") ?? null);
}

export async function expectFocusedPane(page: Page, paneId: string | undefined) {
  expect(paneId).toBeTruthy();
  await expect.poll(() => focusedPaneId(page)).toBe(paneId);
}

/** ペインの端末に表示されている末尾のテキスト */
export function screenText(page: Page, paneId: string): Promise<string> {
  return page.evaluate((id) => window.__ELECXTERM_REGISTRY__.getTerminalSnapshot(id, 200).join("\n"), paneId);
}

/** シェルのプロンプトが出るまで待つ（疑似シェルの起動完了） */
export async function waitForPrompt(page: Page, paneId: string) {
  await expect.poll(() => screenText(page, paneId)).toMatch(/>\s*$/);
}

/** フォーカス中の端末へコマンドを打って Enter */
export async function runCommand(page: Page, command: string) {
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

/**
 * PTY のリークが無いこと: 生きている PTY と画面上のペインが 1 対 1 に対応する。
 * （閉じたペイン・タブのシェルが残っていれば、ここで検出される）
 */
export async function expectNoLeakedShells(page: Page) {
  await expect(async () => {
    const [live, panes] = await Promise.all([livePtys(page), allPaneIds(page)]);
    expect([...live].sort()).toEqual([...panes].sort());
  }).toPass({ timeout: 5_000 });
}
