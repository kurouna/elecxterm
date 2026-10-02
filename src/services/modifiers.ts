/**
 * Ctrl キーが押されているかをアプリ全体で追跡する。
 * Ctrl+Tab の切り替え UI は「Ctrl を離したら確定」なので、UI のマウント
 * （= リスナー登録）より先に Ctrl が離された素早いタップも取りこぼさないようにする。
 */
let ctrlDown = false;

function track(e: KeyboardEvent) {
  // Control 自身の keyup では環境により ctrlKey が true のまま届くことがあるため明示的に倒す
  ctrlDown = e.type === "keyup" && e.key === "Control" ? false : e.ctrlKey;
}

window.addEventListener("keydown", track, true);
window.addEventListener("keyup", track, true);
window.addEventListener("blur", () => {
  ctrlDown = false;
});

export function isCtrlDown(): boolean {
  return ctrlDown;
}
