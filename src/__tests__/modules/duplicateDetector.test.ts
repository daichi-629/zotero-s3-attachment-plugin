import { createDuplicateDetector } from "../../modules/duplicateDetector";
import { S3Operations } from "../../modules/s3Operations";

// S3Operationsのモック
jest.mock("../../modules/s3Operations");

// FileIntegrityManagerのモック
jest.mock("../../modules/fileIntegrityManager", () => ({
  FileIntegrityManager: {
    calculateMD5FromFile: jest.fn(),
  },
}));

// S3MetadataManagerのモック
jest.mock("../../modules/s3MetadataManager", () => ({
  S3MetadataManager: {
    getMD5Hash: jest.fn(),
  },
}));

// モックしたモジュールのインポート
import { FileIntegrityManager } from "../../modules/fileIntegrityManager";
import { S3MetadataManager } from "../../modules/s3MetadataManager";

describe("DuplicateDetector (via createDuplicateDetector)", () => {
  let mockS3Operations: jest.Mocked<S3Operations>;
  let duplicateDetector: ReturnType<typeof createDuplicateDetector>;
  let mockCalculateMD5: jest.MockedFunction<
    typeof FileIntegrityManager.calculateMD5FromFile
  >;
  let mockGetMD5Hash: jest.MockedFunction<typeof S3MetadataManager.getMD5Hash>;

  beforeEach(() => {
    mockS3Operations = new S3Operations() as jest.Mocked<S3Operations>;
    duplicateDetector = createDuplicateDetector(mockS3Operations);

    // モック関数の参照を取得
    mockCalculateMD5 =
      FileIntegrityManager.calculateMD5FromFile as jest.MockedFunction<
        typeof FileIntegrityManager.calculateMD5FromFile
      >;
    mockGetMD5Hash = S3MetadataManager.getMD5Hash as jest.MockedFunction<
      typeof S3MetadataManager.getMD5Hash
    >;

    // モックの初期化
    jest.clearAllMocks();
  });

  describe("createDuplicateDetector factory", () => {
    test("should create DuplicateDetector instance", () => {
      expect(duplicateDetector).toBeDefined();
      expect(typeof duplicateDetector.findDuplicateFile).toBe("function");
      expect(typeof duplicateDetector.findDuplicateFileFast).toBe("function");
      expect(typeof duplicateDetector.getDuplicateStatistics).toBe("function");
      expect(typeof duplicateDetector.getDuplicateFileGroups).toBe("function");
    });
  });

  describe("findDuplicateFile", () => {
    test("should return null when no duplicate found", async () => {
      // MD5計算のモック
      mockCalculateMD5.mockResolvedValue("test-md5-hash");

      // S3ファイルリストのモック（空）
      mockS3Operations.listFiles.mockResolvedValue([]);

      const result =
        await duplicateDetector.findDuplicateFile("/path/to/test.pdf");

      expect(result).toBeNull();
      expect(mockS3Operations.listFiles).toHaveBeenCalledWith(
        "zotero-attachments/",
      );
    });

    test("should handle S3 operations error gracefully", async () => {
      mockCalculateMD5.mockRejectedValue(new Error("File read error"));

      const result =
        await duplicateDetector.findDuplicateFile("/path/to/test.pdf");

      expect(result).toBeNull();
    });
  });

  describe("findDuplicateFileFast", () => {
    test("should return null when no files with matching size", async () => {
      // S3ファイルリストのモック（サイズが異なる）
      mockS3Operations.listFiles.mockResolvedValue([
        {
          key: "file1.pdf",
          size: 1024,
          lastModified: new Date("2023-01-01"),
          etag: "etag1",
        },
        {
          key: "file2.pdf",
          size: 2048,
          lastModified: new Date("2023-01-02"),
          etag: "etag2",
        },
      ]);

      const result = await duplicateDetector.findDuplicateFileFast(
        "/path/to/test.pdf",
        512,
      );

      expect(result).toBeNull();
      expect(mockS3Operations.listFiles).toHaveBeenCalledWith(
        "zotero-attachments/",
      );
    });

    test("should handle error in file integrity check", async () => {
      mockCalculateMD5.mockRejectedValue(new Error("MD5 calculation error"));

      const result = await duplicateDetector.findDuplicateFileFast(
        "/path/to/test.pdf",
        1024,
      );

      expect(result).toBeNull();
    });
  });

  describe("getDuplicateStatistics", () => {
    test("should return zero statistics for empty bucket", async () => {
      mockS3Operations.listFiles.mockResolvedValue([]);

      const stats = await duplicateDetector.getDuplicateStatistics();

      expect(stats).toEqual({
        totalFiles: 0,
        duplicateGroups: 0,
        duplicateFiles: 0,
        savedSpace: 0,
      });
    });

    test("should handle error in statistics calculation", async () => {
      mockS3Operations.listFiles.mockRejectedValue(
        new Error("List files error"),
      );

      const stats = await duplicateDetector.getDuplicateStatistics();

      expect(stats).toEqual({
        totalFiles: 0,
        duplicateGroups: 0,
        duplicateFiles: 0,
        savedSpace: 0,
      });
    });
  });

  describe("getDuplicateFileGroups", () => {
    test("should return empty map for no duplicates", async () => {
      mockS3Operations.listFiles.mockResolvedValue([
        {
          key: "file1.pdf",
          size: 1024,
          lastModified: new Date("2023-01-01"),
          etag: "etag1",
        },
      ]);

      // メタデータ取得のモック（ユニークなMD5）
      mockS3Operations.getFileMetadata.mockResolvedValue({
        key: "file1.pdf",
        size: 1024,
        lastModified: new Date("2023-01-01"),
        etag: "test-etag",
        metadata: {
          md5hash: "unique-hash",
          originalfilename: "file1.pdf",
          uploaddate: "2023-01-01T00:00:00.000Z",
          filesize: "1024",
        },
      });

      // S3MetadataManagerのモック
      mockGetMD5Hash.mockReturnValue("unique-hash");

      const groups = await duplicateDetector.getDuplicateFileGroups();

      expect(groups.size).toBe(0);
    });

    test("should handle error in file group retrieval", async () => {
      mockS3Operations.listFiles.mockRejectedValue(new Error("List error"));

      const groups = await duplicateDetector.getDuplicateFileGroups();

      expect(groups.size).toBe(0);
    });
  });

  describe("error handling", () => {
    test("should handle metadata retrieval errors gracefully", async () => {
      mockS3Operations.listFiles.mockResolvedValue([
        {
          key: "file1.pdf",
          size: 1024,
          lastModified: new Date("2023-01-01"),
          etag: "etag1",
        },
      ]);

      // メタデータ取得でエラー
      mockS3Operations.getFileMetadata.mockRejectedValue(
        new Error("Metadata error"),
      );

      const stats = await duplicateDetector.getDuplicateStatistics();

      // エラーが発生してもクラッシュしない
      expect(stats.totalFiles).toBe(1);
      expect(stats.duplicateGroups).toBe(0);
    });
  });
});
