import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { openApp, paneIds, runCommand, screenText, tabs, visiblePanes, waitForPrompt } from "./helpers";
import { decodePng } from "./png";

/**
 * 端末が描けなくなる・出力が届かなくなる事故からの復帰。
 *
 * - ビデオドライバが落ちると GPU プロセスごと落ち、WebGL のコンテキストがすべて失われる。
 *   xterm の WebGL アドオンが同じコンテキストで作り直した端末は、裏のタブやズームで外れて
 *   いた場合に画面が空白のまま（カーソルだけ）になり、入力しても結果もプロンプトも見えなかった。
 *   ここでは CDP の Browser.crashGpuProcess で同じことを起こし、画面写真から描かれ方を確かめる。
 * - Tauri の Channel はハンドラが例外を投げるとそこで順番が止まり、以後の出力が二度と届かない。
 *   xterm の write は処理待ちが 50 MB を超えると投げる。
 *
 * GPU を落とすと同じブラウザでは 3 回ほどで GPU 自体が無効になるので、テストごとに Edge を起動する。
 */

let browser: Browser;
let page: Page;

test.beforeEach(async ({ baseURL }) => {
  browser = await chromium.launch({ channel: "msedge" });
  page = await browser.newPage({ baseURL, viewport: { width: 1280, height: 800 } });
  await openApp(page);
});

test.afterEach(async () => {
  await browser?.close();
});

async function crashGpu() {
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send("Browser.crashGpuProcess");
  // GPU プロセスが立ち上がり直し、端末が新しい WebGL を試す（WEBGL_RETRY_MS 後）まで
  await page.waitForTimeout(5000);
}

/** ペインの画面の、背景と見分けられる画素の割合（文字が描かれているか） */
async function ink(paneId: string): Promise<number> {
  const screen = page.locator(`.pane[data-pane-id="${paneId}"] .xterm-screen`);
  const box = await screen.boundingBox();
  if (!box) throw new Error("the terminal is not on screen");
  const shot = decodePng(await page.screenshot({ clip: box }));
  const { rgba } = shot;
  // 背景は最も多い色。文字はそこから離れた色
  const counts = new Map<number, number>();
  for (let i = 0; i < rgba.length; i += 4) {
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ground = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const g = [(ground >> 16) & 255, (ground >> 8) & 255, ground & 255];
  let inked = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const d = Math.abs(rgba[i] - g[0]) + Math.abs(rgba[i + 1] - g[1]) + Math.abs(rgba[i + 2] - g[2]);
    if (d > 90) inked += 1;
  }
  return inked / (rgba.length / 4);
}

/** WebGL で描いているか（DOM レンダラーなら canvas に生きた webgl2 が無い） */
function drawnByWebgl(paneId: string): Promise<boolean> {
  return page.evaluate((id) => {
    return [...document.querySelectorAll(`.pane[data-pane-id="${id}"] .xterm-screen canvas`)].some((c) => {
      const gl = (c as HTMLCanvasElement).getContext("webgl2");
      return gl !== null && !gl.isContextLost();
    });
  }, paneId);
}

/** 端末の画面がペインの中に収まっているか（DOM レンダラーへ移ったときに fit し直したか） */
function screenFits(paneId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const pane = document.querySelector(`.pane[data-pane-id="${id}"]`);
    const screen = pane?.querySelector(".xterm-screen")?.getBoundingClientRect();
    const root = pane?.querySelector(".terminal-root")?.getBoundingClientRect();
    return !!screen && !!root && screen.right <= root.right + 1 && screen.bottom <= root.bottom + 1;
  }, paneId);
}

/** 画面を消して何行か書かせ、文字が描かれることを確かめる */
async function expectDrawn(paneId: string) {
  await runCommand(page, "cls");
  for (let i = 0; i < 6; i++) await runCommand(page, `echo LINE-${i}-AFTER-THE-CRASH-WITH-ENOUGH-TEXT-TO-SEE`);
  await expect.poll(() => screenText(page, paneId)).toContain("LINE-5-AFTER");
  // 空白のまま（カーソルだけ）なら 0.001 にも届かない
  await expect.poll(() => ink(paneId), { timeout: 10_000 }).toBeGreaterThan(0.01);
  expect(await screenFits(paneId)).toBe(true);
}

test("a pane on screen while the GPU process crashes draws again, on WebGL", async () => {
  const [pane] = await paneIds(page);
  await waitForPrompt(page, pane);
  await runCommand(page, "echo BEFORE");
  await crashGpu();
  await expectDrawn(pane);
  expect(await drawnByWebgl(pane)).toBe(true);
});

test("a pane behind another tab while the GPU process crashes draws once shown", async () => {
  const [first] = await paneIds(page);
  await waitForPrompt(page, first);
  await runCommand(page, "echo BEFORE");
  await page.keyboard.press("Control+Shift+T");
  await expect(tabs(page)).toHaveCount(2);
  const [second] = await paneIds(page);
  await waitForPrompt(page, second);
  await crashGpu();
  await tabs(page).first().click();
  await expectDrawn(first);
  expect(await drawnByWebgl(first)).toBe(true);
});

test("a pane zoomed away while the GPU process crashes draws once the layout is back", async () => {
  const [first] = await paneIds(page);
  await waitForPrompt(page, first);
  await runCommand(page, "echo BEFORE");
  await page.keyboard.press("Control+Shift+D");
  await expect(visiblePanes(page)).toHaveCount(2);
  const [, second] = await paneIds(page);
  await waitForPrompt(page, second);
  // 右のペインだけを前に出し、左のペインを DOM から外す
  await page.keyboard.press("Control+Shift+Z");
  await expect(visiblePanes(page)).toHaveCount(1);
  await crashGpu();
  await page.keyboard.press("Control+Shift+Z");
  await expect(visiblePanes(page)).toHaveCount(2);
  await page.waitForTimeout(500);
  await visiblePanes(page).first().click();
  await expectDrawn(first);
  expect(await drawnByWebgl(first)).toBe(true);
});

test("output that overflows xterm's write buffer does not silence the pane for good", async () => {
  test.setTimeout(90_000);
  const [pane] = await paneIds(page);
  await waitForPrompt(page, pane);
  // 60 MB を一気に流す。xterm は処理待ちが 50 MB を超えた分を例外で捨てる
  await runCommand(page, "flood 60");
  await runCommand(page, "echo STILL-HERE");
  await expect.poll(() => screenText(page, pane), { timeout: 45_000 }).toContain("STILL-HERE");
});
