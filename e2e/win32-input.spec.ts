import { expect, test } from "@playwright/test";
import { openApp, paneIds, ptyInput, runCommand, screenText, tabs, waitForPrompt } from "./helpers";

/**
 * win32-input-mode（src/services/win32Input.ts）。疑似シェルは実機の ConPTY と同じく起動時に
 * `CSI ? 9001 h` を出し、受け取った列を文字に戻す（src/dev/mockTauri.ts）。
 * xterm の文字列では Ctrl+Space は NUL になり、ConPTY が Ctrl+Shift+2 に戻すため、
 * Windows 版 Emacs（-nw）は日本語配列で C-" と読んでいた。
 */

const ESC = "\x1b";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("Ctrl+Space goes as the space key with Ctrl, not as NUL", async ({ page }) => {
  const [pane] = await paneIds(page);
  await waitForPrompt(page, pane);
  await page.keyboard.press("Control+Space");
  await expect.poll(() => ptyInput(page, pane)).toContain(`${ESC}[32;57;0;1;8;1_${ESC}[32;57;0;0;8;1_`);
  expect(await ptyInput(page, pane)).not.toContain("\x00");
});

test("keys xterm makes no text of reach the shell: Ctrl+/ and Ctrl+.", async ({ page }) => {
  const [pane] = await paneIds(page);
  await waitForPrompt(page, pane);
  await page.keyboard.press("Control+Slash");
  await page.keyboard.press("Control+Period");
  await expect.poll(() => ptyInput(page, pane)).toContain(`${ESC}[191;53;0;1;8;1_`);
  expect(await ptyInput(page, pane)).toContain(`${ESC}[190;52;0;1;8;1_`);
});

test("typing and Enter still run a command, as key events", async ({ page }) => {
  const [pane] = await paneIds(page);
  await waitForPrompt(page, pane);
  await runCommand(page, "echo hello-win32");
  await expect.poll(() => screenText(page, pane)).toContain("\nhello-win32");
  // a のキーが、押下と離した分の 2 つの列で送られている
  expect(await ptyInput(page, pane)).toContain(`${ESC}[13;28;13;1;0;1_`);
});

test("a shortcut's keys send nothing: neither the press the app took nor its release", async ({ page }) => {
  const [first] = await paneIds(page);
  await waitForPrompt(page, first);
  await page.keyboard.press("Control+Shift+T");
  await expect(tabs(page)).toHaveCount(2);
  // T のキー（VK 84）の押下はショートカットが取り、離した分も送られない。修飾キー単独も送らない
  const sent = await ptyInput(page, first);
  expect(sent).not.toMatch(/\x1b\[84;/);
  expect(sent).not.toMatch(/\x1b\[(16|17);/);
});

test("Enter restarts an exited shell", async ({ page }) => {
  const [pane] = await paneIds(page);
  await waitForPrompt(page, pane);
  await runCommand(page, "exit");
  await expect.poll(() => screenText(page, pane)).toContain("Press Enter to restart");
  await page.keyboard.press("Enter");
  await expect.poll(() => screenText(page, pane)).not.toContain("Press Enter to restart");
  await waitForPrompt(page, pane);
  // 新しい PTY も win32-input-mode を求め、キーはその列で届く
  await runCommand(page, "echo again");
  await expect.poll(() => screenText(page, pane)).toContain("\nagain");
});
