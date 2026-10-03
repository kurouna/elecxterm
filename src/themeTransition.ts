import { flushSync } from "react-dom";
import { prefersReducedMotion } from "./services/crt";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/** 古い絵が横線に潰れるまで / 新しい絵が線から開ききるまで */
const COLLAPSE_MS = 240;
const OPEN_MS = 520;

/**
 * テーマ切り替えを CRT の「チャンネル切り替え」で見せる（View Transitions API）。
 * 古いテーマの画面が中央の明るい横線へ潰れ、その線から新しいテーマの画面が
 * 少し行き過ぎながら開く（styles/crt.css の電源オン／オフと同じ形）。
 * 押したボタンの位置を横線の高さにして、そこから画面が切り替わるようにする。
 *
 * View Transition は「更新前」と「更新後」のスナップショットを撮って動かすため、
 * 更新は flushSync で同期的に DOM へ反映させる（端末の配色も layout effect で反映される）。
 * 未対応環境やアニメーション削減設定では即時に切り替える。
 */
export function runThemeTransition(apply: () => void, origin?: { x: number; y: number }) {
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || prefersReducedMotion()) {
    apply();
    return;
  }

  // 横線はボタンの高さではなく画面中央に置く（CRT の管は中央から開く）。
  // 横方向の起点だけボタンに合わせ、線が少し偏って伸びることで「押した所から」感を出す。
  const originX = origin ? `${(origin.x / window.innerWidth) * 100}%` : "50%";

  const transition = doc.startViewTransition(() => {
    flushSync(apply);
  });

  transition.ready
    .then(() => {
      const root = document.documentElement;
      // 古い絵: 横線に潰れ、露出オーバーになって点へ消える
      root.animate(
        [
          { transform: "none", filter: "none", opacity: 1, transformOrigin: `${originX} 50%` },
          { transform: "scale(1, 0.004)", filter: "brightness(4)", opacity: 1, offset: 0.6, transformOrigin: `${originX} 50%` },
          { transform: "scale(0.04, 0.004)", filter: "brightness(6)", opacity: 0, transformOrigin: `${originX} 50%` },
        ],
        { duration: COLLAPSE_MS, easing: "ease-in", fill: "forwards", pseudoElement: "::view-transition-old(root)" }
      );
      // 新しい絵: 線から上下に開く（easeOutBack で少し行き過ぎる）。古い絵が潰れきってから始める
      root.animate(
        [
          { transform: "scale(0.3, 0.004)", filter: "brightness(5) saturate(0.4)", opacity: 0, transformOrigin: `${originX} 50%` },
          { transform: "scale(1, 0.004)", filter: "brightness(5) saturate(0.4)", opacity: 1, offset: 0.08, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", transformOrigin: `${originX} 50%` },
          { transform: "scale(1, 1)", filter: "brightness(1.8) saturate(0.85)", opacity: 1, offset: 0.6, easing: "ease-out", transformOrigin: `${originX} 50%` },
          { transform: "none", filter: "none", opacity: 1, transformOrigin: `${originX} 50%` },
        ],
        {
          duration: OPEN_MS,
          delay: COLLAPSE_MS - 40,
          fill: "backwards",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    })
    .catch(() => {});
}
