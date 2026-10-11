import type { ITerminalAddon } from "@xterm/xterm";

/**
 * 端末を GPU が使える間は WebGL で、使えなくなったら xterm の DOM レンダラーで描かせる。
 *
 * ビデオドライバが落ちると Chromium（WebView2）の GPU プロセスごと落ち、ページ内の
 * WebGL コンテキストはすべて失われる。xterm の WebGL アドオンは 3 秒だけ復帰を待ち、
 * 戻ってくればそのコンテキストの中で自分を作り直すが、裏のタブにいた端末やズームで
 * DOM から外れていた端末は、そうして戻ったあと画面が空白のまま（カーソルだけ）になった。
 * 戻らずに DOM レンダラーへ切り替わった場合は、セル幅が WebGL と違うのに fit し直さず、
 * 右端の列がペインからはみ出した。
 *
 * そこで、失ったコンテキストは待たない。アドオンをすぐ破棄して DOM レンダラーに描かせ、
 * fit し直して画面全体を描き直す。少し後、ペインが表示されていれば新しいアドオン
 * （新しい canvas・コンテキスト・グリフのアトラス）を試す。何度も失うペインは DOM のまま。
 */

/** 失ってから WebGL を試し直すまでの時間（その間に GPU プロセスが立ち上がり直す） */
export const WEBGL_RETRY_MS = 2000;
/** これだけ失ったペインは WebGL をあきらめる */
export const WEBGL_MAX_LOSSES = 3;

export interface WebglKeeperOptions {
  /** アドオンを読み込む。WebGL が使えなければ例外を投げる */
  load(addon: ITerminalAddon): void;
  /** 端末の要素。コンテキストのイベントはバブルしないので、canvas へ降りる途中で拾う */
  element: EventTarget;
  /** 新しい WebGL アドオン */
  create(): ITerminalAddon;
  /** ペインが表示されているか（新しいアドオンはそのときだけ試す） */
  visible(): boolean;
  /** レンダラーが変わった。セルの大きさが変わり得るので fit し、画面全体を描き直す */
  changed(): void;
}

export class WebglKeeper {
  private readonly options: WebglKeeperOptions;
  private addon: ITerminalAddon | null = null;
  private losses = 0;
  /** WebGL が使えなかった、または失いすぎたら false */
  private wanted = true;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WebglKeeperOptions) {
    this.options = options;
    options.element.addEventListener("webglcontextlost", this.lost, true);
    this.load();
  }

  /** いま WebGL で描いているか */
  get active(): boolean {
    return this.addon !== null;
  }

  /** 望まれていてペインが表示されていれば WebGL を試し直す。表示・fit のたびに呼ばれる */
  resume(): void {
    if (this.stopped || !this.wanted || this.addon !== null || this.retryTimer !== null) return;
    if (!this.options.visible()) return;
    this.load();
    // 知らせる前に入れておく。fit がまた resume() を呼んでも何もしないように
    if (this.addon !== null) this.options.changed();
  }

  dispose(): void {
    this.stopped = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.options.element.removeEventListener("webglcontextlost", this.lost, true);
  }

  private load(): void {
    try {
      const addon = this.options.create();
      this.options.load(addon);
      this.addon = addon;
    } catch (e) {
      // 使える GPU が無い。以後は DOM レンダラーのまま
      console.warn("WebGL addon failed to load:", e);
      this.addon = null;
      this.wanted = false;
    }
  }

  private readonly lost = (): void => {
    const addon = this.addon;
    if (this.stopped || addon === null) return;
    this.addon = null;
    this.losses += 1;
    // アドオン自身のリスナーがイベントを受け取った後で破棄する（配信中に外さない）
    queueMicrotask(() => {
      addon.dispose();
      if (!this.stopped) this.options.changed();
    });
    if (this.losses >= WEBGL_MAX_LOSSES) {
      this.wanted = false;
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.resume();
    }, WEBGL_RETRY_MS);
  };
}
