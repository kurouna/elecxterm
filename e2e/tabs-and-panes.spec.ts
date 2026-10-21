import { expect, test } from "@playwright/test";
import {
  allPaneIds,
  expectFocusedPane,
  expectNoLeakedShells,
  livePtys,
  openApp,
  paneIds,
  ptyLog,
  runCommand,
  screenText,
  tabs,
  visiblePanes,
  waitForPrompt,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe("tabs", () => {
  test("starts with one tab, one pane and one live shell", async ({ page }) => {
    const [pane] = await paneIds(page);
    await waitForPrompt(page, pane);
    expect(await livePtys(page)).toEqual([pane]);
  });

  test("Ctrl+Shift+T opens a new tab with its own shell and focuses it", async ({ page }) => {
    const [first] = await paneIds(page);
    await page.keyboard.press("Control+Shift+T");

    await expect(tabs(page)).toHaveCount(2);
    await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    const [second] = await paneIds(page);
    expect(second).not.toBe(first);
    await expectFocusedPane(page, second);
    await waitForPrompt(page, second);
    await expectNoLeakedShells(page);
  });

  test("tab switching keys move between tabs", async ({ page }) => {
    await page.keyboard.press("Control+Shift+T");
    await page.keyboard.press("Control+Shift+T");
    await expect(tabs(page)).toHaveCount(3);
    await expect(tabs(page).nth(2)).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Control+Shift+B");
    await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Control+Shift+ArrowLeft");
    await expect(tabs(page).nth(0)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Control+Shift+F");
    await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Control+Alt+3");
    await expect(tabs(page).nth(2)).toHaveAttribute("aria-selected", "true");
  });

  test("dragging a tab reorders it without shifting any tab up or down", async ({ page }) => {
    for (let i = 0; i < 3; i++) await page.keyboard.press("Control+Shift+T");
    await expect(tabs(page)).toHaveCount(4);
    // 新しいタブは電源オンの演出で現れ、終われば止まる
    const powerOn = (els: Element[]) =>
      els.filter((e) => e.getAnimations().some((a) => (a as CSSAnimation).animationName === "crt-power-on")).length;
    await expect.poll(() => tabs(page).evaluateAll(powerOn)).toBe(0);

    const ids = await tabs(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-tab-id")));
    const from = (await tabs(page).nth(3).boundingBox())!;
    const to = (await tabs(page).nth(0).boundingBox())!;
    const tops = () => tabs(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));

    await page.mouse.move(from.x + 50, from.y + 16);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(from.x + 50 + ((to.x - from.x) * i) / 20, from.y + 16);
      // DOM の並べ替えで電源オンが再生されると、潰れた途中の大きさがレイアウトとして測られ、タブが上下にずれる
      expect(await tabs(page).evaluateAll(powerOn)).toBe(0);
      for (const top of await tops()) expect(top).toBeCloseTo(from.y, 0);
    }
    await page.mouse.up();

    await expect
      .poll(() => tabs(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-tab-id"))))
      .toEqual([ids[3], ids[0], ids[1], ids[2]]);
    await page.waitForTimeout(800);
    for (const top of await tops()) expect(top).toBeCloseTo(from.y, 0);
    await expectNoLeakedShells(page);
  });

  test("closing a tab with its close button destroys every shell in it", async ({ page }) => {
    await page.keyboard.press("Control+Shift+T");
    await page.keyboard.press("Control+Shift+D");
    await page.keyboard.press("Control+Shift+E");
    await expect(visiblePanes(page)).toHaveCount(3);
    expect(await livePtys(page)).toHaveLength(4);

    await tabs(page).nth(1).getByRole("button", { name: /^Close / }).click();

    await expect(tabs(page)).toHaveCount(1);
    await expect(visiblePanes(page)).toHaveCount(1);
    await expectNoLeakedShells(page);
    expect(await livePtys(page)).toHaveLength(1);
  });

  test("closing the last pane of a tab closes the tab, and the last tab is replaced by a fresh one", async ({ page }) => {
    await page.keyboard.press("Control+Shift+T");
    await expect(tabs(page)).toHaveCount(2);

    await page.keyboard.press("Control+Shift+W");
    await expect(tabs(page)).toHaveCount(1);
    await expectNoLeakedShells(page);

    const [before] = await paneIds(page);
    await page.keyboard.press("Control+Shift+W");
    // 最後のタブを閉じても空にはならず、新しいタブとシェルが用意される
    await expect(tabs(page)).toHaveCount(1);
    await expect.poll(async () => (await paneIds(page))[0]).not.toBe(before);
    const [fresh] = await paneIds(page);
    await waitForPrompt(page, fresh);
    await expectFocusedPane(page, fresh);
    await expectNoLeakedShells(page);
  });
});

test.describe("panes", () => {
  test("Ctrl+Shift+D splits right and Ctrl+Alt+E splits down with PowerShell", async ({ page }) => {
    const [first] = await paneIds(page);

    await page.keyboard.press("Control+Shift+D");
    await expect(visiblePanes(page)).toHaveCount(2);
    const [, right] = await paneIds(page);
    await expectFocusedPane(page, right);
    const firstBox = (await page.locator(`[data-pane-id="${first}"]`).boundingBox())!;
    const rightBox = (await page.locator(`[data-pane-id="${right}"]`).boundingBox())!;
    expect(rightBox.x).toBeGreaterThan(firstBox.x + firstBox.width / 2);
    expect(Math.abs(rightBox.y - firstBox.y)).toBeLessThan(2);

    await page.keyboard.press("Control+Alt+E");
    await expect(visiblePanes(page)).toHaveCount(3);
    const ids = await paneIds(page);
    const below = ids.find((id) => id !== first && id !== right)!;
    await expectFocusedPane(page, below);
    const belowBox = (await page.locator(`[data-pane-id="${below}"]`).boundingBox())!;
    expect(belowBox.y).toBeGreaterThan(rightBox.y + 20);
    expect(Math.abs(belowBox.x - rightBox.x)).toBeLessThan(2);

    // 分割に使ったシェルが実際に起動されている
    const shells = Object.fromEntries((await ptyLog(page)).filter((e) => e.cmd === "create_pty").map((e) => [e.id, e.shell]));
    expect(shells[right]).toBe("cmd.exe");
    expect(shells[below]).toBe("pwsh.exe");
    await waitForPrompt(page, below);
    await expectNoLeakedShells(page);
  });

  test("Ctrl+Shift+W closes the active pane, destroys its shell and keeps the others intact", async ({ page }) => {
    const [first] = await paneIds(page);
    await waitForPrompt(page, first);
    await runCommand(page, "echo keep-me");
    await expect.poll(() => screenText(page, first)).toContain("keep-me");

    await page.keyboard.press("Control+Shift+D");
    await expect(visiblePanes(page)).toHaveCount(2);
    const [, second] = await paneIds(page);
    await expectFocusedPane(page, second);

    await page.keyboard.press("Control+Shift+W");

    await expect(visiblePanes(page)).toHaveCount(1);
    expect(await paneIds(page)).toEqual([first]);
    await expectFocusedPane(page, first);
    await expectNoLeakedShells(page);
    expect((await ptyLog(page)).some((e) => e.cmd === "destroy_pty" && e.id === second)).toBe(true);
    // 残ったペインは同じ端末のまま（スクロールバックが消えていない）
    expect(await screenText(page, first)).toContain("keep-me");
    // 閉じた後もそのまま入力できる
    await runCommand(page, "echo still-alive");
    await expect.poll(() => screenText(page, first)).toContain("still-alive");
  });

  test("Move Pane to New Tab moves the pane with its shell and shows it in the new tab", async ({ page }) => {
    await page.keyboard.press("Control+Shift+D");
    await expect(visiblePanes(page)).toHaveCount(2);
    const [first, moved] = await paneIds(page);
    await expectFocusedPane(page, moved);

    await page.keyboard.press("Control+Shift+K");
    await page.keyboard.type("Move Pane to New Tab");
    await page.keyboard.press("Enter");

    await expect(tabs(page)).toHaveCount(2);
    await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    expect(await paneIds(page)).toEqual([moved]);
    await expectFocusedPane(page, moved);
    // 電源オフ・オンの演出が終わった後、ペインは見えたまま（クラスが残って消えたままにならない）
    const pane = page.locator(`[data-pane-id="${moved}"]`);
    await expect(pane).not.toHaveClass(/crt-off/);
    await expect.poll(() => pane.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    // シェルは作り直さずに引き継ぐ
    expect((await ptyLog(page)).filter((e) => e.cmd === "create_pty" && e.id === moved)).toHaveLength(1);
    expect(await allPaneIds(page)).toEqual(expect.arrayContaining([first, moved]));
    await expectNoLeakedShells(page);
  });

  test("closing a pane in the middle moves focus to its neighbour", async ({ page }) => {
    await page.keyboard.press("Control+Shift+D");
    await page.keyboard.press("Control+Shift+D");
    await expect(visiblePanes(page)).toHaveCount(3);
    const [a, b, c] = await paneIds(page);

    await page.keyboard.press("Control+Shift+P"); // c → b
    await expectFocusedPane(page, b);
    await page.keyboard.press("Control+Shift+W");

    await expect(visiblePanes(page)).toHaveCount(2);
    expect(await paneIds(page)).toEqual([a, c]);
    await expectFocusedPane(page, c);
    await expectNoLeakedShells(page);
  });

  test("first / last pane shortcuts", async ({ page }) => {
    await page.keyboard.press("Control+Shift+D");
    await page.keyboard.press("Control+Shift+E");
    const ids = await paneIds(page);
    await page.keyboard.press("Control+Shift+Home");
    await expectFocusedPane(page, ids[0]);
    await page.keyboard.press("Control+Shift+End");
    await expectFocusedPane(page, ids[ids.length - 1]);
    await page.keyboard.press("Control+Shift+Comma");
    await expectFocusedPane(page, ids[0]);
  });

  test("asks before closing a pane with a running command", async ({ page }) => {
    await page.keyboard.press("Control+Shift+D");
    const [, busy] = await paneIds(page);
    await waitForPrompt(page, busy);
    await runCommand(page, "sleep 30");

    await page.keyboard.press("Control+Shift+W");
    const dialog = page.getByRole("dialog", { name: "Close pane?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("sleep 30");

    // Esc で取り消せばペインもシェルも残る
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(visiblePanes(page)).toHaveCount(2);
    expect(await livePtys(page)).toContain(busy);

    // Enter で確定すると閉じる
    await page.keyboard.press("Control+Shift+W");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(visiblePanes(page)).toHaveCount(1);
    await expectNoLeakedShells(page);
  });

  test("does not open more than 15 panes in total", async ({ page }) => {
    for (let i = 0; i < 7; i++) await page.keyboard.press("Control+Shift+D");
    await page.keyboard.press("Control+Shift+T");
    for (let i = 0; i < 6; i++) await page.keyboard.press("Control+Shift+E");
    await expect.poll(async () => (await allPaneIds(page)).length).toBe(15);

    await page.keyboard.press("Control+Shift+D");
    await page.keyboard.press("Control+Shift+T");
    // 同じ通知は置き換わる（古い方は閉じるアニメーション中だけ残る）ので先頭を見る
    await expect(page.getByText("Maximum number of panes (15) reached.").first()).toBeVisible();
    expect(await allPaneIds(page)).toHaveLength(15);
    await expect(tabs(page)).toHaveCount(2);
    await expectNoLeakedShells(page);
  });

  test("the layout is restored after a reload", async ({ page }) => {
    await page.keyboard.press("Control+Shift+D");
    await page.keyboard.press("Control+Shift+E");
    await page.keyboard.press("Control+Shift+T");
    const before = await allPaneIds(page);
    expect(before).toHaveLength(4);
    // 保存はデバウンスされるので少し待つ
    await page.waitForTimeout(900);

    await page.reload();
    await expect(tabs(page)).toHaveCount(2);
    await expect.poll(async () => [...(await allPaneIds(page))].sort()).toEqual([...before].sort());
    await expectNoLeakedShells(page);
  });
});

test.describe("overview", () => {
  test("Enter jumps to the selected pane in another tab and closes the overview", async ({ page }) => {
    await page.keyboard.press("Control+Shift+D");
    await page.keyboard.press("Control+Shift+T");
    await expect(tabs(page)).toHaveCount(2);
    const firstTabPanes = await allPaneIds(page).then((ids) => ids.slice(0, 2));

    await page.keyboard.press("Control+Shift+O");
    const overview = page.getByRole("dialog", { name: "Pane overview" });
    await expect(overview).toBeVisible();
    await expect(page.locator("[data-overview-pane]")).toHaveCount(3);

    // 1 番目のカード（最初のタブの 1 枚目）を選んで開く
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expect(overview).toBeHidden();
    await expect(tabs(page).nth(0)).toHaveAttribute("aria-selected", "true");
    await expectFocusedPane(page, firstTabPanes[0]);
  });

  test("Ctrl+Tab switches back to the previous pane", async ({ page }) => {
    const [first] = await paneIds(page);
    await page.keyboard.press("Control+Shift+D");
    const [, second] = await paneIds(page);
    await expectFocusedPane(page, second);

    await page.keyboard.press("Control+Tab");
    await expect(page.getByRole("dialog", { name: "Pane overview" })).toBeHidden();
    await expectFocusedPane(page, first);
  });
});

test.describe("dialogs", () => {
  for (const [name, keys] of [
    ["Command palette", "Control+Shift+K"],
    ["Settings", "Control+Shift+Period"],
    ["Keyboard shortcuts", "Control+Shift+Slash"],
  ] as const) {
    test(`${name} opens with ${keys}, closes with Esc and gives focus back to the terminal`, async ({ page }) => {
      const [pane] = await paneIds(page);
      await page.keyboard.press(keys);
      const dialog = page.getByRole("dialog", { name });
      await expect(dialog).toBeVisible();
      // 演出はパネルの範囲だけに掛かる（ウィンドウ幅いっぱいの要素には掛けない）
      const effectBox = await dialog.locator(".crt-on").first().boundingBox();
      expect(effectBox!.width).toBeLessThan(900);

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectFocusedPane(page, pane);
    });
  }

  test("the tab context menu floats at the pointer", async ({ page }) => {
    const box = (await tabs(page).first().boundingBox())!;
    await tabs(page).first().click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // 演出用のクラス（crt-on）が fixed などの配置を上書きしないこと
    expect(await menu.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.y).toBeLessThan(box.y + box.height + 40);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("the new-tab shell menu is drawn above the panes", async ({ page }) => {
    await page.getByRole("button", { name: "New tab with shell…" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "PowerShell" })).toBeVisible();
    // 電源オンの演出が終わってから、メニュー下端（ペインに重なる位置）の最前面を確かめる
    await expect
      .poll(() =>
        menu.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 8));
        }),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("the tab menus open a shell, close a tab and close on an outside click", async ({ page }) => {
    const shellMenu = page.getByRole("button", { name: "New tab with shell…" });
    const menu = page.getByRole("menu");

    await shellMenu.click();
    await menu.getByRole("menuitem", { name: "PowerShell" }).click();
    await expect(menu).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(2);
    await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    const [pane] = await paneIds(page);
    await expectFocusedPane(page, pane);

    // メニューの外側を押すと閉じ、その下のペインには何も起きない
    await shellMenu.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(400, 400);
    await expect(menu).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(2);

    await tabs(page).nth(1).click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Close tab" }).click();
    await expect(tabs(page)).toHaveCount(1);
    await expectNoLeakedShells(page);
  });

  test("Ctrl+Shift+Z zooms the active pane and restores the layout", async ({ page }) => {
    await page.keyboard.press("Control+Shift+D");
    await expect(visiblePanes(page)).toHaveCount(2);
    const [, second] = await paneIds(page);

    await page.keyboard.press("Control+Shift+Z");
    await expect(visiblePanes(page)).toHaveCount(1);
    expect(await paneIds(page)).toEqual([second]);
    await expectFocusedPane(page, second);

    await page.keyboard.press("Control+Shift+Z");
    await expect(visiblePanes(page)).toHaveCount(2);
    await expectFocusedPane(page, second);
    await expectNoLeakedShells(page);
  });
});
