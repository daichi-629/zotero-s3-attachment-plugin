// テスト環境のグローバル変数定義

// Mock用のインスタンスを作成する関数
const createMockProgressWindow = () => ({
  changeHeadline: jest.fn(),
  addDescription: jest.fn(),
  show: jest.fn(),
  close: jest.fn(),
});

// Zoteroグローバル変数のモック
const mockZotero = {
  Prefs: {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      // デフォルト値を適切に返す
      if (key.includes("debugLevel")) return defaultValue || "debug";
      if (key.includes("ignoreContentTypes")) return defaultValue || "";
      return defaultValue;
    }),
    set: jest.fn(),
    clear: jest.fn(),
  },
  ProgressWindow: jest
    .fn()
    .mockImplementation(() => createMockProgressWindow()),
};

// addonグローバル変数のモック
const mockAddon = {
  data: {
    config: {
      prefsPrefix: "extensions.zotero-s3-sync",
    },
  },
};

// debugNotifyグローバル関数のモック
const mockDebugNotify = jest.fn();

// ztoolkitグローバル変数のモック
const mockZtoolkit = {
  log: jest.fn().mockImplementation((...args: any[]) => {
    // デバッグ用：ログの内容を確認したい場合はコメントアウト
    // console.log('ztoolkit.log called:', args);
  }),
  ProgressWindow: jest
    .fn()
    .mockImplementation((title?: string, options?: any) => {
      const instance = {
        createLine: jest.fn().mockReturnThis(),
        changeLine: jest.fn().mockReturnThis(),
        show: jest.fn().mockReturnThis(),
        startCloseTimer: jest.fn().mockReturnThis(),
        close: jest.fn().mockReturnThis(),
      };
      return instance;
    }),
  Keyboard: {
    register: jest.fn(),
  },
  Prompt: {
    register: jest.fn(),
    unregister: jest.fn(),
  },
};

// 環境変数のモック
(global as any).__env__ = "development";

// グローバル環境に設定
(global as any).Zotero = mockZotero;
(global as any).addon = mockAddon;
(global as any).debugNotify = mockDebugNotify;
(global as any).ztoolkit = mockZtoolkit;

// テストユーティリティ関数をグローバルに追加
(global as any).createMockProgressWindow = createMockProgressWindow;

// 各テストの前にモックをクリア
beforeEach(() => {
  jest.clearAllMocks();
  // デフォルト環境を設定
  (global as any).__env__ = "development";
  // Zotero.Prefs.getのデフォルト実装をリセット
  mockZotero.Prefs.get.mockImplementation((key: string, defaultValue?: any) => {
    if (key.includes("debugLevel")) return defaultValue || "debug";
    if (key.includes("ignoreContentTypes")) return defaultValue || "";
    return defaultValue;
  });

  // ztoolkitオブジェクト全体を再設定して log が関数として保持されるようにする
  (global as any).ztoolkit = {
    log: jest.fn().mockImplementation((...args: any[]) => {
      // デバッグ用：ログの内容を確認したい場合はコメントアウト
      // console.log('ztoolkit.log called:', args);
    }),
    ProgressWindow: jest
      .fn()
      .mockImplementation((title?: string, options?: any) => {
        const instance = {
          createLine: jest.fn().mockReturnThis(),
          changeLine: jest.fn().mockReturnThis(),
          show: jest.fn().mockReturnThis(),
          startCloseTimer: jest.fn().mockReturnThis(),
          close: jest.fn().mockReturnThis(),
        };
        return instance;
      }),
    Keyboard: {
      register: jest.fn(),
    },
    Prompt: {
      register: jest.fn(),
      unregister: jest.fn(),
    },
  };
});
