/**
 * Zotero環境で利用できない Web API のポリフィル実装
 */

/**
 * AbortSignalのポリフィル実装
 */
export class AbortSignalPolyfill {
  aborted: boolean = false;
  private _listeners: (() => void)[] = [];

  abort() {
    this.aborted = true;
    this._listeners.forEach((listener) => listener());
  }

  addEventListener(type: string, listener: () => void) {
    if (type === "abort") {
      this._listeners.push(listener);
    }
  }

  removeEventListener(type: string, listener: () => void) {
    if (type === "abort") {
      const index = this._listeners.indexOf(listener);
      if (index > -1) {
        this._listeners.splice(index, 1);
      }
    }
  }
}

/**
 * AbortControllerのポリフィル実装
 */
export class AbortControllerPolyfill {
  signal: AbortSignalPolyfill;

  constructor() {
    this.signal = new AbortSignalPolyfill();
  }

  abort() {
    this.signal.abort();
  }
}

/**
 * 安全なAbortControllerの取得
 * ネイティブ実装が利用可能な場合はそれを使用、そうでなければポリフィルを使用
 */
export function getSafeAbortController():
  | AbortControllerPolyfill
  | AbortController {
  if (typeof AbortController !== "undefined") {
    return new AbortController();
  }
  return new AbortControllerPolyfill();
}
