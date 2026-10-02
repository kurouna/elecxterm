import { useEffect, useState } from "react";
import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import type { WindowMaterial } from "../types";
import type { Theme } from "../ThemeContext";

/** Mica / Mica Alt は Windows 11（UA-CH の platformVersion 13 以上）でのみ使える */
async function supportsMica(): Promise<boolean> {
  if (!/Windows/i.test(navigator.userAgent)) return false;
  const uaData = (navigator as Navigator & {
    userAgentData?: { getHighEntropyValues(hints: string[]): Promise<{ platformVersion?: string }> };
  }).userAgentData;
  try {
    const { platformVersion } = (await uaData?.getHighEntropyValues(["platformVersion"])) ?? {};
    return Number.parseInt(platformVersion?.split(".")[0] ?? "0", 10) >= 13;
  } catch {
    return false;
  }
}

/**
 * ウィンドウ背景の素材（Mica など）を適用する。素材を使う間は `<html data-material>` を立て、
 * CSS 側でタイトルバー・ステータスバー・ペイン間の余白を半透明にする（端末本体は不透明のまま）。
 * Mica の明暗はウィンドウのテーマに従うため、アプリのテーマ設定に合わせて揃える。
 *
 * 戻り値は Mica が使える環境か（判定中は null）。
 */
export function useWindowMaterial(material: WindowMaterial, theme: Theme): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    supportsMica().then(setSupported);
  }, []);

  const effective: WindowMaterial = supported ? material : "solid";

  useEffect(() => {
    if (supported === null) return;
    const win = getCurrentWindow();
    const root = document.documentElement;

    if (effective === "solid") {
      delete root.dataset.material;
      win.clearEffects().catch(() => {});
      // 素材を使わないときはウィンドウのテーマを OS に戻す
      win.setTheme(null).catch(() => {});
      return;
    }

    root.dataset.material = effective;
    // "system" のときは null（OS に追従）にしておくと、WebView の prefers-color-scheme も固定されない
    win.setTheme(theme === "system" ? null : theme).catch(() => {});
    win
      .setEffects({ effects: [effective === "tabbed" ? Effect.Tabbed : Effect.Mica] })
      .catch(() => {
        // 適用できなければ半透明の CSS も戻す（背景が素通しになるのを防ぐ）
        delete root.dataset.material;
      });
  }, [effective, theme, supported]);

  return supported;
}
