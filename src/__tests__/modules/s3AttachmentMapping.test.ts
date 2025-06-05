import {
  S3AttachmentMapping,
  S3AttachmentInfo,
  MappingStatistics,
} from "../../modules/s3AttachmentMapping";

// Zotero.Prefsのモック
const mockZoteroPrefs: {
  data: Map<string, string>;
  get: jest.MockedFunction<(key: string) => string>;
  set: jest.MockedFunction<(key: string, value: string) => void>;
  clear: jest.MockedFunction<(key: string) => void>;
} = {
  data: new Map<string, string>(),
  get: jest.fn((key: string): string => mockZoteroPrefs.data.get(key) || ""),
  set: jest.fn((key: string, value: string): void => {
    mockZoteroPrefs.data.set(key, value);
  }),
  clear: jest.fn((key: string): void => {
    mockZoteroPrefs.data.delete(key);
  }),
};

// グローバルなZoteroオブジェクトのモック
(global as any).Zotero = {
  Prefs: mockZoteroPrefs,
};

// debugNotifyのモック
(global as any).debugNotify = jest.fn();

describe("S3AttachmentMapping", () => {
  const testMappingKey = "test.s3-attachment-mapping";
  let mappingManager: S3AttachmentMapping;

  beforeEach(() => {
    // モックをクリア
    jest.clearAllMocks();
    mockZoteroPrefs.data.clear();

    // モックの実装をリセット（テスト間の干渉を防ぐため）
    mockZoteroPrefs.get.mockImplementation(
      (key: string): string => mockZoteroPrefs.data.get(key) || "",
    );
    mockZoteroPrefs.set.mockImplementation(
      (key: string, value: string): void => {
        mockZoteroPrefs.data.set(key, value);
      },
    );
    mockZoteroPrefs.clear.mockImplementation((key: string): void => {
      mockZoteroPrefs.data.delete(key);
    });

    // シングルトンインスタンスをリセット
    (S3AttachmentMapping as any).instance = null;

    // 新しいインスタンスを作成
    mappingManager = S3AttachmentMapping.getInstance(testMappingKey);
  });

  afterEach(() => {
    // テスト後のクリーンアップ
    mockZoteroPrefs.data.clear();
    (S3AttachmentMapping as any).instance = null;
  });

  describe("シングルトンパターン", () => {
    test("初回作成時にはpersistentCacheKeyが必要", () => {
      (S3AttachmentMapping as any).instance = null;

      expect(() => {
        S3AttachmentMapping.getInstance();
      }).toThrow("初回作成時にはpersistentCacheKeyが必要です");
    });

    test("同じインスタンスが返される", () => {
      const instance1 = S3AttachmentMapping.getInstance(testMappingKey);
      const instance2 = S3AttachmentMapping.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("初期化", () => {
    test("initializeが正常に実行される", async () => {
      await expect(mappingManager.initialize()).resolves.toBeUndefined();
    });
  });

  describe("基本的なマッピング操作", () => {
    const testItemID = 12345;
    const testS3Info: S3AttachmentInfo = {
      s3Key: "test-bucket/test-file.pdf",
      title: "テストファイル.pdf",
    };

    test("setとgetでマッピング情報の保存と取得ができる", async () => {
      await mappingManager.set(testItemID, testS3Info);

      expect(mockZoteroPrefs.set).toHaveBeenCalled();

      const result = mappingManager.get(testItemID);
      expect(result).toEqual(testS3Info);
    });

    test("存在しないアイテムのgetはnullを返す", () => {
      const result = mappingManager.get(99999);
      expect(result).toBeNull();
    });

    test("deleteAfterGetがtrueの場合、取得後にマッピングから削除される", async () => {
      await mappingManager.set(testItemID, testS3Info);

      const result = mappingManager.get(testItemID, true);
      expect(result).toEqual(testS3Info);

      // 再度取得するとnullが返される
      const secondResult = mappingManager.get(testItemID);
      expect(secondResult).toBeNull();
    });

    test("hasメソッドでマッピングの存在確認ができる", async () => {
      expect(mappingManager.has(testItemID)).toBe(false);

      await mappingManager.set(testItemID, testS3Info);
      expect(mappingManager.has(testItemID)).toBe(true);
    });

    test("deleteでマッピングを削除できる", async () => {
      await mappingManager.set(testItemID, testS3Info);
      expect(mappingManager.has(testItemID)).toBe(true);

      await mappingManager.delete(testItemID);
      expect(mappingManager.has(testItemID)).toBe(false);
    });
  });

  describe("バッチ操作", () => {
    test("setBatchで複数のマッピングを一度に追加できる", async () => {
      const batchItems = [
        { itemID: 1, info: { s3Key: "bucket/file1.pdf", title: "File1" } },
        { itemID: 2, info: { s3Key: "bucket/file2.pdf", title: "File2" } },
        { itemID: 3, info: { s3Key: "bucket/file3.pdf", title: "File3" } },
      ];

      await mappingManager.setBatch(batchItems);

      for (const item of batchItems) {
        expect(mappingManager.has(item.itemID)).toBe(true);
        expect(mappingManager.get(item.itemID)).toEqual(item.info);
      }
    });
  });

  describe("マッピングの管理", () => {
    test("clearでマッピングを全クリアできる", async () => {
      const testItemID = 12345;
      const testS3Info: S3AttachmentInfo = {
        s3Key: "test-bucket/test-file.pdf",
        title: "テストファイル.pdf",
      };

      await mappingManager.set(testItemID, testS3Info);
      expect(mappingManager.size()).toBe(1);

      await mappingManager.clear();
      expect(mappingManager.size()).toBe(0);
      expect(mockZoteroPrefs.clear).toHaveBeenCalledWith(testMappingKey);
    });

    test("sizeでマッピングの件数を取得できる", async () => {
      expect(mappingManager.size()).toBe(0);

      await mappingManager.set(1, { s3Key: "key1", title: "title1" });
      expect(mappingManager.size()).toBe(1);

      await mappingManager.set(2, { s3Key: "key2", title: "title2" });
      expect(mappingManager.size()).toBe(2);
    });
  });

  describe("統計情報", () => {
    test("getStatisticsで正確な統計情報を取得できる", async () => {
      const testS3Info: S3AttachmentInfo = {
        s3Key: "test-bucket/test-file.pdf",
        title: "テストファイル.pdf",
      };

      await mappingManager.set(1, testS3Info);

      // ヒット
      mappingManager.get(1);
      mappingManager.get(1);

      // ミス
      mappingManager.get(999);

      const stats = mappingManager.getStatistics();
      expect(stats.size).toBe(1);
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(66.67); // (2/3) * 100
    });

    test("リクエストがない場合のヒット率は0", () => {
      const stats = mappingManager.getStatistics();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe("データの妥当性チェック", () => {
    test("無効なS3AttachmentInfoは無視される", async () => {
      // 直接無効なデータを設定
      mockZoteroPrefs.data.set(
        testMappingKey,
        JSON.stringify({
          "123": { s3Key: "", title: "valid title" }, // 空のs3Key
          "456": { s3Key: "valid-key", title: "" }, // 空のtitle
          "789": { s3Key: "valid-key" }, // titleが存在しない
          "999": { s3Key: "valid-key", title: "valid title" }, // 有効なデータ
        }),
      );

      expect(mappingManager.has(123)).toBe(false);
      expect(mappingManager.has(456)).toBe(false);
      expect(mappingManager.has(789)).toBe(false);
      expect(mappingManager.has(999)).toBe(true);
    });

    test("JSONパースエラーの場合は空のマッピングデータを返す", () => {
      mockZoteroPrefs.data.set(testMappingKey, "invalid json");

      expect(mappingManager.size()).toBe(0);
    });
  });

  describe("エラーハンドリング", () => {
    test("Zotero.Prefs.setでエラーが発生した場合、setメソッドはエラーを投げる", async () => {
      mockZoteroPrefs.set.mockImplementation(() => {
        throw new Error("Prefs save error");
      });

      await expect(
        mappingManager.set(123, { s3Key: "test-key", title: "test-title" }),
      ).rejects.toThrow("Prefs save error");
    });

    test("Zotero.Prefs.getでエラーが発生した場合、getメソッドはnullを返す", () => {
      mockZoteroPrefs.get.mockImplementation(() => {
        throw new Error("Prefs get error");
      });

      const result = mappingManager.get(123);
      expect(result).toBeNull();
    });
  });

  describe("デバッグ機能", () => {
    test("debugメソッドで統計情報が出力される", async () => {
      await mappingManager.set(1, { s3Key: "key1", title: "title1" });
      await mappingManager.set(2, { s3Key: "key2", title: "title2" });

      mappingManager.debug();
    });
  });
});
