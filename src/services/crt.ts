/**
 * CRT 演出（styles/crt.css）を DOM 要素へ一時的に掛けるヘルパー。
 * React の状態を経由しないので、閉じる直前の要素や、別コンポーネントのペインにも掛けられる。
 * 「アニメーションを減らす」設定のときは何もしない（閉じる操作も待たせない）。
 */

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** アニメーションの終了を待つ（途中で要素が消えたり打ち切られても timeoutMs で抜ける） */
function waitForAnimation(el: Element, name: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(finish, timeoutMs);
    function onEnd(e: Event) {
      if (e.target === el && (e as AnimationEvent).animationName === name) finish();
    }
    function finish() {
      window.clearTimeout(timer);
      el.removeEventListener("animationend", onEnd);
      resolve();
    }
    el.addEventListener("animationend", onEnd);
  });
}

function withDuration(el: HTMLElement, ms: number, delayMs = 0) {
  el.style.setProperty("--crt-duration", `${ms}ms`);
  el.style.setProperty("--crt-delay", `${delayMs}ms`);
}

function clear(el: HTMLElement, ...classes: string[]) {
  el.classList.remove(...classes);
  el.style.removeProperty("--crt-duration");
  el.style.removeProperty("--crt-delay");
}

/**
 * 電源オフ: 絵が横線に潰れて点になって消える。終わったら resolve する。
 * 呼び出し側はその後で要素を取り除くこと。取り除かれなかった場合に備え、
 * 少し後でクラスを外して元に戻す（見えないまま残らないように）。
 */
export async function powerOff(el: Element | null, ms = 340): Promise<void> {
  if (!(el instanceof HTMLElement) || prefersReducedMotion()) return;
  withDuration(el, ms);
  el.classList.add("crt-off", "crt-beam");
  await waitForAnimation(el, "crt-power-off", ms + 120);
  window.setTimeout(() => {
    if (el.isConnected) clear(el, "crt-off", "crt-beam");
  }, 200);
}

/** 電源オン: 横線から開く。既に再生中なら頭から再生し直す */
export function powerOn(el: Element | null, ms = 420, delayMs = 0) {
  if (!(el instanceof HTMLElement) || prefersReducedMotion()) return;
  el.classList.remove("crt-on");
  // クラスを付け直してもアニメーションは再開しないので、リフローを挟んで再始動させる
  void el.offsetWidth;
  withDuration(el, ms, delayMs);
  el.classList.add("crt-on");
  void waitForAnimation(el, "crt-power-on", ms + delayMs + 120).then(() => clear(el, "crt-on"));
}

/** タブ切り替えなどの一瞬の明滅 */
export function flash(el: Element | null) {
  if (!(el instanceof HTMLElement) || prefersReducedMotion() || tabFlashSuppressed()) return;
  el.classList.remove("crt-flash");
  void el.offsetWidth;
  el.classList.add("crt-flash");
  void waitForAnimation(el, "crt-flash", 400).then(() => el.classList.remove("crt-flash"));
}

/** ペイン・タブの DOM 要素 */
export const paneElement = (paneId: string) => document.querySelector(`.pane[data-pane-id="${paneId}"]`);
export const tabContentElement = (tabId: string) => document.querySelector(`[data-tab-content="${tabId}"]`);

/**
 * FLIP: 要素を「直前の位置・大きさ」から今の位置へ飛ばす（ペインのズーム）。
 * レイアウトは一度で最終の大きさになり、見た目だけを transform で補間するので、
 * 端末に途中のサイズが送られることはない。飛んでいる間は少し露出オーバーにする。
 */
export function flyFrom(el: Element | null, from: DOMRect | undefined, ms = 280) {
  if (!(el instanceof HTMLElement) || !from || prefersReducedMotion()) return;
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  el.animate(
    [
      { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, filter: "brightness(1.7) saturate(0.85)" },
      { transformOrigin: "0 0", transform: "none", filter: "none" },
    ],
    { duration: ms, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" }
  );
}

/** 直後に起きるタブ切り替えの明滅を抑える（別の演出と重ならないように） */
let suppressFlashUntil = 0;
export function suppressTabFlash(ms = 400) {
  suppressFlashUntil = Date.now() + ms;
}
export function tabFlashSuppressed(): boolean {
  return Date.now() < suppressFlashUntil;
}
