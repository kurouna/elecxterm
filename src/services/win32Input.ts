/**
 * キーを Windows のキーイベントとして送る: win32-input-mode。
 *
 * ConPTY は起動時に `CSI ? 9001 h` を出して、このモードを端末に求める。xterm.js はこれを知らず、
 * キーを VT の文字列にして送るため、ConPTY は文字列から US 配列を前提にキーを推し量って作り直す。
 * Ctrl+Space は NUL になって Ctrl+Shift+2 に戻り、Windows 版 Emacs（-nw）は日本語配列でそれを C-" と
 * 読む（elecdex で実測、2026-11-01）。Ctrl+/ と Ctrl+. は何も送られない。このモードでは各キーを
 * `CSI Vk ; Sc ; Uc ; Kd ; Cs ; Rc _` として、Windows Terminal と同じくそのキーのまま送る。
 *
 * 確実に表せないキーは xterm.js に任せる（null）。これまでどおり文字列で送られる:
 * IME の変換中、デッドキー、AltGr、スキャンコードの分からないキー、貼り付けのキー。
 */

/** ConPTY が win32-input-mode を求める DEC のプライベートモード番号 */
export const WIN32_INPUT_MODE = 9001;

/** DECSET (`h`) / DECRST (`l`) の引数がこのモードを名指していれば、その新しい値。名指していなければ undefined */
export function win32ModeChange(params: readonly (number | number[])[], set: boolean): boolean | undefined {
  return params.some((p) => p === WIN32_INPUT_MODE) ? set : undefined;
}

/** エンコードに使う KeyboardEvent の部分 */
export interface KeyLike {
  type: string;
  keyCode: number;
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  getModifierState(key: string): boolean;
}

// dwControlKeyState のフラグ（wincon.h）
const RIGHT_ALT = 0x01;
const LEFT_ALT = 0x02;
const RIGHT_CTRL = 0x04;
const LEFT_CTRL = 0x08;
const SHIFT = 0x10;
const NUM_LOCK = 0x20;
const SCROLL_LOCK = 0x40;
const CAPS_LOCK = 0x80;
const ENHANCED_KEY = 0x100;

/** `KeyboardEvent.code`（キーボード上の位置。配列によらない）からセット 1 のスキャンコード */
const SCAN_CODES: Readonly<Record<string, number>> = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06,
  Digit6: 0x07, Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b, Minus: 0x0c,
  Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f, KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13,
  KeyT: 0x14, KeyY: 0x15, KeyU: 0x16, KeyI: 0x17, KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1a,
  BracketRight: 0x1b, Enter: 0x1c, NumpadEnter: 0x1c, KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20,
  KeyF: 0x21, KeyG: 0x22, KeyH: 0x23, KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27,
  Quote: 0x28, Backquote: 0x29, Backslash: 0x2b, KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e,
  KeyV: 0x2f, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32, Comma: 0x33, Period: 0x34, Slash: 0x35,
  NumpadDivide: 0x35, NumpadMultiply: 0x37, Space: 0x39, F1: 0x3b, F2: 0x3c, F3: 0x3d,
  F4: 0x3e, F5: 0x3f, F6: 0x40, F7: 0x41, F8: 0x42, F9: 0x43, F10: 0x44, Numpad7: 0x47,
  Home: 0x47, Numpad8: 0x48, ArrowUp: 0x48, Numpad9: 0x49, PageUp: 0x49, NumpadSubtract: 0x4a,
  Numpad4: 0x4b, ArrowLeft: 0x4b, Numpad5: 0x4c, Numpad6: 0x4d, ArrowRight: 0x4d,
  NumpadAdd: 0x4e, Numpad1: 0x4f, End: 0x4f, Numpad2: 0x50, ArrowDown: 0x50, Numpad3: 0x51,
  PageDown: 0x51, Numpad0: 0x52, Insert: 0x52, NumpadDecimal: 0x53, Delete: 0x53,
  IntlBackslash: 0x56, F11: 0x57, F12: 0x58,
  // 日本語キーボードだけにあるキー
  IntlRo: 0x73, IntlYen: 0x7d,
  ContextMenu: 0x5d,
};

/** Windows が拡張キーとして扱うもの: テンキーと同じスキャンコードを持つ、テンキー以外のキー */
const EXTENDED = new Set([
  "NumpadEnter", "NumpadDivide", "Home", "ArrowUp", "PageUp", "ArrowLeft", "ArrowRight",
  "End", "ArrowDown", "PageDown", "Insert", "Delete", "ContextMenu",
]);

/** 単独では送らない修飾キー（encodeWin32Key を参照） */
const MODIFIERS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "NumLock", "ScrollLock"]);

/** 配列によらず Windows がこれらのキーに付ける文字 */
const NAMED_CHARS: Readonly<Record<string, number>> = { Enter: 13, Tab: 9, Backspace: 8, Escape: 27 };

/** Windows が付けるのと同じ、キーの文字。文字を作らないキーは 0 */
function unicodeOf(e: KeyLike): number {
  const named = NAMED_CHARS[e.key];
  if (named !== undefined) return named;
  // Ctrl と英字は制御文字。それ以外の Ctrl の組み合わせはプログラムがキーから読む
  // （Emacs は Ctrl+/ をキーから C-/ と読む。実測）ので、ここでは推し量らない
  if (e.ctrlKey) return e.keyCode >= 65 && e.keyCode <= 90 ? e.keyCode - 64 : 0;
  return e.key.length === 1 ? e.key.charCodeAt(0) : 0;
}

function controlKeyState(e: KeyLike): number {
  let state = 0;
  if (e.shiftKey) state |= SHIFT;
  if (e.ctrlKey) state |= e.code === "ControlRight" ? RIGHT_CTRL : LEFT_CTRL;
  if (e.altKey) state |= e.code === "AltRight" ? RIGHT_ALT : LEFT_ALT;
  if (e.getModifierState("CapsLock")) state |= CAPS_LOCK;
  if (e.getModifierState("NumLock")) state |= NUM_LOCK;
  if (e.getModifierState("ScrollLock")) state |= SCROLL_LOCK;
  if (EXTENDED.has(e.code)) state |= ENHANCED_KEY;
  return state;
}

/**
 * キーとしてではなく文字として扱うもの: IME の変換中、デッドキー、AltGr で作る文字、
 * Shift+Insert（貼り付け。Ctrl+V は terminalRegistry が先に貼り付けとして扱う）。
 */
function leftToXterm(e: KeyLike): boolean {
  if (e.isComposing || e.keyCode === 229) return true;
  if (e.key === "Process" || e.key === "Dead" || e.key === "Unidentified") return true;
  if (e.getModifierState("AltGraph")) return true;
  if (e.metaKey) return true;
  return e.shiftKey && e.code === "Insert" && !e.ctrlKey && !e.altKey;
}

/**
 * win32-input-mode で送る列。xterm.js に任せるなら null。
 *
 * 修飾キー単独は送らない。Windows Terminal は送るが、使うプログラムはなく、elecxterm のショートカット
 * （Ctrl+Shift+T など）で押した Ctrl・Shift が、押下だけ届いて離されないまま残ってしまう。
 */
export function encodeWin32Key(e: KeyLike): string | null {
  if (e.type !== "keydown" && e.type !== "keyup") return null;
  if (MODIFIERS.has(e.key) || leftToXterm(e)) return null;
  const vk = e.keyCode;
  const scan = SCAN_CODES[e.code];
  if (scan === undefined || vk <= 0 || vk > 254) return null;
  const down = e.type === "keydown" ? 1 : 0;
  return `\x1b[${vk};${scan};${unicodeOf(e)};${down};${controlKeyState(e)};1_`;
}

/**
 * win32-input-mode で押下を送ったキー。離したことは、押下を送ったキーにだけ送る。
 * ショートカットとして押下を取られたキーは、離したときにも何も送らない。
 */
export class PressedKeys {
  private readonly down = new Set<string>();

  /** このイベントで送る列。xterm.js に任せるなら null、何も送らないなら空文字列 */
  take(e: KeyLike): string | null {
    const sequence = encodeWin32Key(e);
    if (sequence === null) return null;
    if (e.type === "keydown") {
      this.down.add(e.code);
      return sequence;
    }
    return this.down.delete(e.code) ? sequence : "";
  }

  /** 新しい PTY に替わったとき: 前の PTY で押していたキーは忘れる */
  clear() {
    this.down.clear();
  }
}
