import {
  createDebugNotification,
  createNotification,
  debugNotify,
  notify,
} from "../../utils/notify";

// setTimeoutのモック
jest.useFakeTimers();

describe("Notify utilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  describe("createDebugNotification", () => {
    test("should create debug notification with default parameters", () => {
      createDebugNotification("Test message");

      expect(Zotero.ProgressWindow).toHaveBeenCalled();
    });

    test("should create debug notification with custom level and function name", () => {
      createDebugNotification("Error occurred", "error", "testFunction");

      expect(Zotero.ProgressWindow).toHaveBeenCalled();
    });

    test("should close notification after 10 seconds", () => {
      const mockProgressWindow = createMockProgressWindow();
      (Zotero.ProgressWindow as jest.Mock).mockReturnValue(mockProgressWindow);

      createDebugNotification("Test message");

      // まだ閉じられていない
      expect(mockProgressWindow.close).not.toHaveBeenCalled();

      // 10秒進める
      jest.advanceTimersByTime(10000);

      // 10秒後に閉じられる
      expect(mockProgressWindow.close).toHaveBeenCalled();
    });

    test("should not display in production environment", () => {
      // production環境に設定
      (global as any).__env__ = "production";

      createDebugNotification("Test message");

      // 何も実行されない
      expect(Zotero.ProgressWindow).not.toHaveBeenCalled();

      // 元に戻す
      (global as any).__env__ = "development";
    });

    test("should respect debug level filtering", () => {
      // minLevelをerrorに設定
      (Zotero.Prefs.get as jest.Mock).mockReturnValue("error");

      // infoレベルの通知（表示されない）
      createDebugNotification("Info message", "info");
      expect(Zotero.ProgressWindow).not.toHaveBeenCalled();

      // errorレベルの通知（表示される）
      createDebugNotification("Error message", "error");
      expect(Zotero.ProgressWindow).toHaveBeenCalled();
    });

    test("should handle ProgressWindow creation error gracefully", () => {
      // ProgressWindowコンストラクタでエラーを発生
      (Zotero.ProgressWindow as jest.Mock).mockImplementation(() => {
        throw new Error("Mock error");
      });

      // console.logのモック
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      // エラーが発生してもクラッシュしない
      expect(() => {
        createDebugNotification("Test message");
      }).not.toThrow();

      // コンソールにエラーが出力される（実装に依存）
      consoleSpy.mockRestore();
    });
  });

  describe("createNotification", () => {
    test("should create notification with title and message", () => {
      createNotification("Test Title", "Test Message");

      expect(Zotero.ProgressWindow).toHaveBeenCalled();
    });

    test("should close notification after 5 seconds", () => {
      const mockProgressWindow = createMockProgressWindow();
      (Zotero.ProgressWindow as jest.Mock).mockReturnValue(mockProgressWindow);

      createNotification("Test Title", "Test Message");

      // まだ閉じられていない
      expect(mockProgressWindow.close).not.toHaveBeenCalled();

      // 5秒進める
      jest.advanceTimersByTime(5000);

      // 5秒後に閉じられる
      expect(mockProgressWindow.close).toHaveBeenCalled();
    });

    test("should display even in production environment", () => {
      // production環境に設定
      (global as any).__env__ = "production";

      createNotification("Test Title", "Test Message");

      // production環境でも表示される
      expect(Zotero.ProgressWindow).toHaveBeenCalled();

      // 元に戻す
      (global as any).__env__ = "development";
    });

    test("should handle ProgressWindow creation error gracefully", () => {
      // ProgressWindowコンストラクタでエラーを発生
      (Zotero.ProgressWindow as jest.Mock).mockImplementation(() => {
        throw new Error("Mock error");
      });

      // console.logのモック
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      // エラーが発生してもクラッシュしない
      expect(() => {
        createNotification("Test Title", "Test Message");
      }).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe("LogLevel priority", () => {
    beforeEach(() => {
      (global as any).__env__ = "development";
    });

    test("should respect log level hierarchy", () => {
      const testCases = [
        {
          minLevel: "debug",
          shouldShow: ["debug", "info", "warn", "error", "success"],
        },
        { minLevel: "info", shouldShow: ["info", "warn", "error", "success"] },
        { minLevel: "warn", shouldShow: ["warn", "error"] },
        { minLevel: "error", shouldShow: ["error"] },
      ];

      testCases.forEach(({ minLevel, shouldShow }) => {
        // minLevelを設定
        (Zotero.Prefs.get as jest.Mock).mockReturnValue(minLevel);

        const allLevels = ["debug", "info", "warn", "error", "success"];

        allLevels.forEach((level) => {
          jest.clearAllMocks();

          createDebugNotification("Test message", level as any);

          if (shouldShow.includes(level)) {
            expect(Zotero.ProgressWindow).toHaveBeenCalled();
          } else {
            expect(Zotero.ProgressWindow).not.toHaveBeenCalled();
          }
        });
      });
    });
  });

  describe("debugNotify", () => {
    test("createDebugNotificationのエイリアスとして動作する", () => {
      expect(debugNotify).toBe(createDebugNotification);
    });
  });

  describe("notify", () => {
    test("createNotificationのエイリアスとして動作する", () => {
      expect(notify).toBe(createNotification);
    });
  });
});
