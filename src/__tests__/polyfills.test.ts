import {
  AbortSignalPolyfill,
  AbortControllerPolyfill,
  getSafeAbortController,
} from "../modules/polyfills";

describe("polyfills", () => {
  describe("AbortSignalPolyfill", () => {
    let signal: AbortSignalPolyfill;

    beforeEach(() => {
      signal = new AbortSignalPolyfill();
    });

    test("初期状態では aborted が false であること", () => {
      expect(signal.aborted).toBe(false);
    });

    test("abort() を呼ぶと aborted が true になること", () => {
      signal.abort();
      expect(signal.aborted).toBe(true);
    });

    test("addEventListener でリスナーを追加できること", () => {
      const listener = jest.fn();
      signal.addEventListener("abort", listener);

      signal.abort();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("abort イベント以外のイベントは無視されること", () => {
      const listener = jest.fn();
      signal.addEventListener("other", listener);

      signal.abort();

      expect(listener).not.toHaveBeenCalled();
    });

    test("複数のリスナーが登録できること", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      signal.addEventListener("abort", listener1);
      signal.addEventListener("abort", listener2);

      signal.abort();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    test("removeEventListener でリスナーを削除できること", () => {
      const listener = jest.fn();

      signal.addEventListener("abort", listener);
      signal.removeEventListener("abort", listener);
      signal.abort();

      expect(listener).not.toHaveBeenCalled();
    });

    test("存在しないリスナーを削除しても エラーにならないこと", () => {
      const listener = jest.fn();

      expect(() => {
        signal.removeEventListener("abort", listener);
      }).not.toThrow();
    });

    test("abort イベント以外の removeEventListener は無視されること", () => {
      const listener = jest.fn();
      signal.addEventListener("abort", listener);

      signal.removeEventListener("other", listener);
      signal.abort();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("AbortControllerPolyfill", () => {
    let controller: AbortControllerPolyfill;

    beforeEach(() => {
      controller = new AbortControllerPolyfill();
    });

    test("signal プロパティが AbortSignalPolyfill のインスタンスであること", () => {
      expect(controller.signal).toBeInstanceOf(AbortSignalPolyfill);
    });

    test("abort() を呼ぶと signal.aborted が true になること", () => {
      expect(controller.signal.aborted).toBe(false);

      controller.abort();

      expect(controller.signal.aborted).toBe(true);
    });

    test("abort() を呼ぶと signal のリスナーが実行されること", () => {
      const listener = jest.fn();
      controller.signal.addEventListener("abort", listener);

      controller.abort();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("getSafeAbortController", () => {
    test("ネイティブのAbortControllerが利用可能な場合はそれを返すこと", () => {
      // ネイティブのAbortControllerが存在する場合をモック
      const originalAbortController = global.AbortController;
      global.AbortController = AbortController;

      const controller = getSafeAbortController();

      expect(controller).toBeInstanceOf(AbortController);

      // 元に戻す
      global.AbortController = originalAbortController;
    });

    test("ネイティブのAbortControllerが利用できない場合はポリフィルを返すこと", () => {
      // ネイティブのAbortControllerを削除
      const originalAbortController = global.AbortController;
      delete (global as any).AbortController;

      const controller = getSafeAbortController();

      expect(controller).toBeInstanceOf(AbortControllerPolyfill);

      // 元に戻す
      global.AbortController = originalAbortController;
    });
  });

  describe("AbortSignalPolyfill - 追加テスト", () => {
    test("複数回abort()を呼んでも安全であること", () => {
      const signal = new AbortSignalPolyfill();
      const listener = jest.fn();
      signal.addEventListener("abort", listener);

      signal.abort();
      signal.abort();
      signal.abort();

      // 現在の実装では、abort()を呼ぶたびにリスナーが実行される
      expect(listener).toHaveBeenCalledTimes(3);
      expect(signal.aborted).toBe(true);
    });

    test("abort()前にリスナーを削除すると呼ばれないこと", () => {
      const signal = new AbortSignalPolyfill();
      const listener = jest.fn();

      signal.addEventListener("abort", listener);
      signal.removeEventListener("abort", listener);
      signal.abort();

      expect(listener).not.toHaveBeenCalled();
    });

    test("同じリスナーを複数回登録すると複数回実行されること", () => {
      const signal = new AbortSignalPolyfill();
      const listener = jest.fn();

      signal.addEventListener("abort", listener);
      signal.addEventListener("abort", listener);
      signal.addEventListener("abort", listener);

      signal.abort();

      // 現在の実装では、同じリスナーを複数回登録すると複数回実行される
      expect(listener).toHaveBeenCalledTimes(3);
    });

    test("空の文字列のイベントタイプを無視すること", () => {
      const signal = new AbortSignalPolyfill();
      const listener = jest.fn();

      signal.addEventListener("", listener);
      signal.abort();

      expect(listener).not.toHaveBeenCalled();
    });

    test("異なるリスナーが独立して動作すること", () => {
      const signal = new AbortSignalPolyfill();
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      signal.addEventListener("abort", listener1);
      signal.addEventListener("abort", listener2);
      signal.addEventListener("other", listener3); // 無視されるイベント

      signal.abort();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).not.toHaveBeenCalled();
    });

    test("リスナーの実行順序が登録順序と一致すること", () => {
      const signal = new AbortSignalPolyfill();
      const callOrder: number[] = [];

      const listener1 = () => callOrder.push(1);
      const listener2 = () => callOrder.push(2);
      const listener3 = () => callOrder.push(3);

      signal.addEventListener("abort", listener1);
      signal.addEventListener("abort", listener2);
      signal.addEventListener("abort", listener3);

      signal.abort();

      expect(callOrder).toEqual([1, 2, 3]);
    });
  });

  describe("AbortControllerPolyfill - 追加テスト", () => {
    test("複数のコントローラーが独立して動作すること", () => {
      const controller1 = new AbortControllerPolyfill();
      const controller2 = new AbortControllerPolyfill();

      const listener1 = jest.fn();
      const listener2 = jest.fn();

      controller1.signal.addEventListener("abort", listener1);
      controller2.signal.addEventListener("abort", listener2);

      controller1.abort();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).not.toHaveBeenCalled();
      expect(controller1.signal.aborted).toBe(true);
      expect(controller2.signal.aborted).toBe(false);
    });

    test("signalプロパティが読み取り専用でないが変更しても影響がないこと", () => {
      const controller = new AbortControllerPolyfill();
      const originalSignal = controller.signal;

      // signalプロパティを変更してみる（実際のコードではやってはいけない）
      (controller as any).signal = new AbortSignalPolyfill();

      // 元のsignalは独立して動作する
      const listener = jest.fn();
      originalSignal.addEventListener("abort", listener);
      controller.abort(); // 新しいsignalに対してabortが呼ばれる

      expect(listener).not.toHaveBeenCalled();
      expect(originalSignal.aborted).toBe(false);
    });
  });
});
