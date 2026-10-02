import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

/**
 * テーマ切り替えを、押したボタンの位置から円形に広がるアニメーションで行う
 * （View Transitions API）。未対応環境やアニメーション削減設定では即時に切り替える。
 *
 * View Transition は「更新前」と「更新後」のスナップショットを撮って補間するため、
 * 更新は flushSync で同期的に DOM へ反映させる（端末の配色も layout effect で反映される）。
 */
export function runThemeTransition(apply: () => void, origin?: { x: number; y: number }) {
  const doc = document as ViewTransitionDocument;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced) {
    apply();
    return;
  }

  const x = origin?.x ?? window.innerWidth - 120;
  const y = origin?.y ?? 20;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = doc.startViewTransition(() => {
    flushSync(apply);
  });
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    })
    .catch(() => {});
}
