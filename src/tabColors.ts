import { Tab, TabColor } from "./types";

/** タブ識別色の色相。彩度・明度はテーマ共通にして、どちらのテーマでも読めるようにする */
const HUES: Record<TabColor, number> = {
  red: 0,
  orange: 28,
  yellow: 46,
  green: 145,
  teal: 178,
  blue: 215,
  purple: 265,
  pink: 325,
};

/** タブの識別色（CSS の色文字列）。未指定のタブは並び順から自動で割り当てる */
export function tabAccent(tab: Tab, index: number): string {
  const hue = tab.color ? HUES[tab.color] : (index * 47 + 230) % 360;
  return `hsl(${hue} 72% 60%)`;
}

export function colorSwatch(color: TabColor): string {
  return `hsl(${HUES[color]} 72% 60%)`;
}
