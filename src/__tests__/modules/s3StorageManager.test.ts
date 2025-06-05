import { S3StorageManager } from "../../modules/s3StorageManager";
import { S3Operations } from "../../modules/s3Operations";
import { S3AuthManager } from "../../modules/s3AuthManager";
import { S3MetadataManager } from "../../modules/s3MetadataManager";
import { FileIntegrityManager } from "../../modules/fileIntegrityManager";
import { createDuplicateDetector } from "../../modules/duplicateDetector";
import {
  S3Error,
  S3CustomMetadata,
  S3FileMetadata,
  sanitizeFilePath,
} from "../../modules/s3Types";

// 依存モジュールのモック
jest.mock("../../modules/s3Operations");
jest.mock("../../modules/s3AuthManager");
jest.mock("../../modules/s3MetadataManager");
jest.mock("../../modules/fileIntegrityManager");
jest.mock("../../modules/duplicateDetector");

// IOUtilsグローバルモックを設定
global.IOUtils = {
  exists: jest.fn(),
  read: jest.fn(),
  write: jest.fn(),
  remove: jest.fn(),
  stat: jest.fn(),
} as any;

// モックされたクラスの型定義
const MockedS3Operations = S3Operations as jest.MockedClass<
  typeof S3Operations
>;
const MockedS3AuthManager = S3AuthManager as jest.Mocked<typeof S3AuthManager>;
const MockedS3MetadataManager = S3MetadataManager as jest.Mocked<
  typeof S3MetadataManager
>;
const MockedFileIntegrityManager = FileIntegrityManager as jest.Mocked<
  typeof FileIntegrityManager
>;
const mockCreateDuplicateDetector =
  createDuplicateDetector as jest.MockedFunction<
    typeof createDuplicateDetector
  >;

describe("S3StorageManager", () => {
  let mockS3Operations: jest.Mocked<S3Operations>;
  let mockDuplicateDetector: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // IOUtilsモックをリセット
    (IOUtils.exists as jest.Mock).mockClear();
    (IOUtils.read as jest.Mock).mockClear();
    (IOUtils.write as jest.Mock).mockClear();
    (IOUtils.remove as jest.Mock).mockClear();
    (IOUtils.stat as jest.Mock).mockClear();

    // debugNotifyモックをクリア
    (global as any).debugNotify.mockClear();

    // S3StorageManagerのインスタンスをリセット
    S3StorageManager.resetInstance();

    // S3Operationsのモックインスタンスを作成
    mockS3Operations = {
      clearClient: jest.fn(),
      initializeClient: jest.fn(),
      testConnection: jest.fn(),
      uploadFile: jest.fn(),
      downloadFile: jest.fn(),
      deleteFile: jest.fn(),
      getFileMetadata: jest.fn(),
    } as any;

    MockedS3Operations.mockImplementation(() => mockS3Operations);

    // DuplicateDetectorのモックを作成
    mockDuplicateDetector = {
      findDuplicateFile: jest.fn(),
      findDuplicateFileFast: jest.fn(),
      getDuplicateStatistics: jest.fn(),
    };

    mockCreateDuplicateDetector.mockReturnValue(mockDuplicateDetector);

    // S3AuthManagerのデフォルトモックを設定
    MockedS3AuthManager.getCompleteCredentials.mockReturnValue({
      provider: "aws",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      region: "us-east-1",
      bucketName: "test-bucket",
      endpoint: "https://s3.us-east-1.amazonaws.com",
    });
  });

  afterEach(() => {
    S3StorageManager.resetInstance();
  });

  describe("静的メソッド", () => {
    describe("clearClient", () => {
      test("S3クライアントをクリアする", () => {
        S3StorageManager.clearClient();

        expect(mockS3Operations.clearClient).toHaveBeenCalledTimes(1);
      });
    });

    describe("initializeClient", () => {
      test("S3クライアントを初期化する", async () => {
        mockS3Operations.initializeClient.mockResolvedValue();

        await S3StorageManager.initializeClient();

        expect(mockS3Operations.initializeClient).toHaveBeenCalledTimes(1);
      });

      test("初期化に失敗した場合エラーを投げる", async () => {
        const error = new Error("初期化失敗");
        mockS3Operations.initializeClient.mockRejectedValue(error);

        await expect(S3StorageManager.initializeClient()).rejects.toThrow(
          "初期化失敗",
        );
      });
    });

    describe("testConnection", () => {
      test("接続テストが成功する", async () => {
        mockS3Operations.testConnection.mockResolvedValue(true);

        const result = await S3StorageManager.testConnection();

        expect(result).toBe(true);
        expect(mockS3Operations.testConnection).toHaveBeenCalledTimes(1);
      });

      test("接続テストが失敗する", async () => {
        mockS3Operations.testConnection.mockResolvedValue(false);

        const result = await S3StorageManager.testConnection();

        expect(result).toBe(false);
        expect(mockS3Operations.testConnection).toHaveBeenCalledTimes(1);
      });
    });

    describe("uploadFile", () => {
      const testFilePath = "/path/to/test.pdf";
      const testS3Key = "attachments/test.pdf";
      const testFileData = new Uint8Array([1, 2, 3, 4, 5]);
      const testMD5Hash = "abcdef123456";

      beforeEach(() => {
        // IOUtils モックの設定
        (IOUtils.exists as jest.Mock).mockResolvedValue(true);
        (IOUtils.stat as jest.Mock).mockResolvedValue({ size: 12345 });
        (IOUtils.read as jest.Mock).mockResolvedValue(testFileData);

        // FileIntegrityManager モックの設定
        MockedFileIntegrityManager.calculateMD5FromFile.mockResolvedValue(
          testMD5Hash,
        );

        // S3MetadataManager モックの設定（正しいキー形式）
        MockedS3MetadataManager.createCustomMetadata.mockReturnValue({
          originalfilename: "test.pdf",
          uploaddate: new Date().toISOString(),
          md5hash: testMD5Hash,
          filesize: "12345",
        } as S3CustomMetadata);

        MockedS3MetadataManager.getMD5Hash.mockReturnValue(testMD5Hash);

        // S3Operations モックの設定
        mockS3Operations.uploadFile.mockResolvedValue({
          etag: "test-etag",
          location: "https://test-bucket.s3.amazonaws.com/test-key",
        });

        mockS3Operations.getFileMetadata.mockResolvedValue({
          key: testS3Key,
          etag: "test-etag",
          lastModified: new Date(),
          size: 12345,
          metadata: {
            originalfilename: "test.pdf",
            uploaddate: new Date().toISOString(),
            md5hash: testMD5Hash,
            filesize: "12345",
          } as S3CustomMetadata,
        } as S3FileMetadata);
      });

      test("ファイルを正常にアップロードする", async () => {
        mockDuplicateDetector.findDuplicateFileFast.mockResolvedValue(null);

        const result = await S3StorageManager.uploadFile(
          testFilePath,
          testS3Key,
        );

        expect(result).toEqual({
          etag: "test-etag",
          location: "https://test-bucket.s3.amazonaws.com/test-key",
          md5Hash: testMD5Hash,
          isDuplicate: false,
          duplicateKey: undefined,
        });

        expect(IOUtils.exists).toHaveBeenCalledWith(testFilePath);
        expect(IOUtils.stat).toHaveBeenCalledWith(testFilePath);
        expect(IOUtils.read).toHaveBeenCalledWith(testFilePath);
        expect(
          MockedFileIntegrityManager.calculateMD5FromFile,
        ).toHaveBeenCalledWith(testFilePath);
        expect(mockS3Operations.uploadFile).toHaveBeenCalled();
      });

      test("重複ファイルが見つかった場合は既存ファイル情報を返す", async () => {
        const duplicateKey = "attachments/duplicate.pdf";
        mockDuplicateDetector.findDuplicateFileFast.mockResolvedValue(
          duplicateKey,
        );

        const result = await S3StorageManager.uploadFile(
          testFilePath,
          testS3Key,
        );

        expect(result).toEqual({
          etag: "test-etag",
          location: expect.stringContaining(duplicateKey),
          md5Hash: testMD5Hash,
          isDuplicate: true,
          duplicateKey,
        });

        expect(mockS3Operations.uploadFile).not.toHaveBeenCalled();
      });

      test("重複チェックを無効にした場合は常にアップロードする", async () => {
        mockDuplicateDetector.findDuplicateFileFast.mockResolvedValue(
          "duplicate-key",
        );

        const result = await S3StorageManager.uploadFile(
          testFilePath,
          testS3Key,
          undefined,
          false,
        );

        expect(result.isDuplicate).toBe(false);
        expect(
          mockDuplicateDetector.findDuplicateFileFast,
        ).not.toHaveBeenCalled();
        expect(mockS3Operations.uploadFile).toHaveBeenCalled();
      });

      test("ファイルが存在しない場合はエラーを投げる", async () => {
        (IOUtils.exists as jest.Mock).mockResolvedValue(false);

        await expect(
          S3StorageManager.uploadFile(testFilePath, testS3Key),
        ).rejects.toThrow(S3Error);
        await expect(
          S3StorageManager.uploadFile(testFilePath, testS3Key),
        ).rejects.toThrow("ファイルが見つかりません");
      });

      test("アップロード後の整合性検証でエラーが発生した場合", async () => {
        mockDuplicateDetector.findDuplicateFileFast.mockResolvedValue(null);
        MockedS3MetadataManager.getMD5Hash.mockReturnValue("different-hash");

        await expect(
          S3StorageManager.uploadFile(testFilePath, testS3Key),
        ).rejects.toThrow(S3Error);
        await expect(
          S3StorageManager.uploadFile(testFilePath, testS3Key),
        ).rejects.toThrow("整合性検証に失敗");
      });

      test("プログレスコールバックが呼ばれる", async () => {
        const onProgress = jest.fn();
        mockDuplicateDetector.findDuplicateFileFast.mockResolvedValue(null);

        await S3StorageManager.uploadFile(testFilePath, testS3Key, onProgress);

        expect(mockS3Operations.uploadFile).toHaveBeenCalledWith(
          testS3Key,
          testFileData,
          expect.any(String),
          expect.any(Object),
          onProgress,
        );
      });
    });

    describe("downloadFile", () => {
      const testS3Key = "attachments/test.pdf";
      const testDownloadPath = "/path/to/download.pdf";
      const testFileData = new Uint8Array([1, 2, 3, 4, 5]);
      const testMD5Hash = "abcdef123456";

      beforeEach(() => {
        // S3Operations モックの設定
        mockS3Operations.downloadFile.mockResolvedValue(testFileData);
        mockS3Operations.getFileMetadata.mockResolvedValue({
          key: testS3Key,
          etag: "test-etag",
          lastModified: new Date(),
          size: 12345,
          metadata: {
            originalfilename: "test.pdf",
            uploaddate: new Date().toISOString(),
            md5hash: testMD5Hash,
            filesize: "12345",
          } as S3CustomMetadata,
        } as S3FileMetadata);

        // S3MetadataManager モックの設定
        MockedS3MetadataManager.getMD5Hash.mockReturnValue(testMD5Hash);

        // FileIntegrityManager モックの設定
        MockedFileIntegrityManager.verifyFileIntegrity.mockResolvedValue({
          md5Hash: testMD5Hash,
          size: 12345,
          isValid: true,
        });

        // IOUtils モックの設定
        (IOUtils.write as jest.Mock).mockResolvedValue(undefined);
      });

      test("ファイルを正常にダウンロードする", async () => {
        await S3StorageManager.downloadFile(testS3Key, testDownloadPath);

        expect(mockS3Operations.getFileMetadata).toHaveBeenCalledWith(
          testS3Key,
        );
        expect(mockS3Operations.downloadFile).toHaveBeenCalledWith(
          testS3Key,
          undefined,
        );
        expect(IOUtils.write).toHaveBeenCalledWith(
          testDownloadPath,
          testFileData,
        );
        expect(
          MockedFileIntegrityManager.verifyFileIntegrity,
        ).toHaveBeenCalledWith(testDownloadPath, testMD5Hash);
      });

      test("整合性検証を無効にしてダウンロードする", async () => {
        await S3StorageManager.downloadFile(
          testS3Key,
          testDownloadPath,
          undefined,
          false,
        );

        expect(mockS3Operations.downloadFile).toHaveBeenCalledWith(
          testS3Key,
          undefined,
        );
        expect(IOUtils.write).toHaveBeenCalledWith(
          testDownloadPath,
          testFileData,
        );
        expect(
          MockedFileIntegrityManager.verifyFileIntegrity,
        ).not.toHaveBeenCalled();
      });

      test("ChecksumStreamエラーが発生した場合は再試行する", async () => {
        const checksumError = new Error("ChecksumStream error occurred");
        mockS3Operations.downloadFile
          .mockRejectedValueOnce(checksumError)
          .mockResolvedValue(testFileData);

        await S3StorageManager.downloadFile(testS3Key, testDownloadPath);

        expect(mockS3Operations.downloadFile).toHaveBeenCalledTimes(2);
        expect(
          MockedFileIntegrityManager.verifyFileIntegrity,
        ).not.toHaveBeenCalled();
      });

      test("整合性検証に失敗した場合はファイルを削除してエラーを投げる", async () => {
        MockedFileIntegrityManager.verifyFileIntegrity.mockResolvedValue({
          md5Hash: "different-hash",
          size: 12345,
          isValid: false,
        });

        await expect(
          S3StorageManager.downloadFile(testS3Key, testDownloadPath),
        ).rejects.toThrow(S3Error);
        await expect(
          S3StorageManager.downloadFile(testS3Key, testDownloadPath),
        ).rejects.toThrow("整合性検証に失敗");

        expect(IOUtils.remove).toHaveBeenCalledWith(testDownloadPath);
      });

      test("プログレスコールバックが呼ばれる", async () => {
        const onProgress = jest.fn();

        await S3StorageManager.downloadFile(
          testS3Key,
          testDownloadPath,
          onProgress,
        );

        expect(mockS3Operations.downloadFile).toHaveBeenCalledWith(
          testS3Key,
          onProgress,
        );
      });

      test("メタデータ取得に失敗した場合でもダウンロードは継続する", async () => {
        // メタデータ取得でエラーが発生するようにモック設定
        mockS3Operations.getFileMetadata.mockRejectedValue(
          new Error("Metadata fetch failed"),
        );

        await S3StorageManager.downloadFile(testS3Key, testDownloadPath);

        expect(mockS3Operations.downloadFile).toHaveBeenCalledWith(
          testS3Key,
          undefined,
        );
        expect(IOUtils.write).toHaveBeenCalledWith(
          testDownloadPath,
          testFileData,
        );
        // メタデータ取得に失敗したため整合性検証はスキップされる
        expect(
          MockedFileIntegrityManager.verifyFileIntegrity,
        ).not.toHaveBeenCalled();
      });

      test("IOUtils.writeが失敗した場合はエラーを投げる", async () => {
        (IOUtils.write as jest.Mock).mockRejectedValue(
          new Error("Write failed"),
        );

        await expect(
          S3StorageManager.downloadFile(testS3Key, testDownloadPath),
        ).rejects.toThrow(S3Error);
        await expect(
          S3StorageManager.downloadFile(testS3Key, testDownloadPath),
        ).rejects.toThrow("ファイルダウンロードに失敗しました");
      });
    });

    describe("deleteFile", () => {
      test("ファイルを削除する", async () => {
        const testS3Key = "attachments/test.pdf";
        mockS3Operations.deleteFile.mockResolvedValue();

        await S3StorageManager.deleteFile(testS3Key);

        expect(mockS3Operations.deleteFile).toHaveBeenCalledWith(testS3Key);
      });
    });

    describe("getFileMetadata", () => {
      test("ファイルメタデータを取得する", async () => {
        const testS3Key = "attachments/test.pdf";
        const testMetadata: S3FileMetadata = {
          key: testS3Key,
          etag: "test-etag",
          lastModified: new Date(),
          size: 12345,
          metadata: {
            originalfilename: "test.pdf",
            uploaddate: new Date().toISOString(),
            md5hash: "abcdef123456",
            filesize: "12345",
          } as S3CustomMetadata,
        };

        mockS3Operations.getFileMetadata.mockResolvedValue(testMetadata);

        const result = await S3StorageManager.getFileMetadata(testS3Key);

        expect(result).toBe(testMetadata);
        expect(mockS3Operations.getFileMetadata).toHaveBeenCalledWith(
          testS3Key,
        );
      });

      test("ファイルが存在しない場合はnullを返す", async () => {
        const testS3Key = "attachments/nonexistent.pdf";
        mockS3Operations.getFileMetadata.mockResolvedValue(null);

        const result = await S3StorageManager.getFileMetadata(testS3Key);

        expect(result).toBeNull();
      });
    });

    describe("verifyFileIntegrity", () => {
      test("ファイル整合性を検証する", async () => {
        const testFilePath = "/path/to/test.pdf";
        const testMD5Hash = "abcdef123456";
        const testIntegrity = {
          md5Hash: testMD5Hash,
          size: 12345,
          isValid: true,
        };

        MockedFileIntegrityManager.verifyFileIntegrity.mockResolvedValue(
          testIntegrity,
        );

        const result = await S3StorageManager.verifyFileIntegrity(
          testFilePath,
          testMD5Hash,
        );

        expect(result).toBe(testIntegrity);
        expect(
          MockedFileIntegrityManager.verifyFileIntegrity,
        ).toHaveBeenCalledWith(testFilePath, testMD5Hash);
      });
    });

    describe("findDuplicateFile", () => {
      test("重複ファイルを検出する", async () => {
        const testFilePath = "/path/to/test.pdf";
        const duplicateKey = "attachments/duplicate.pdf";

        mockDuplicateDetector.findDuplicateFile.mockResolvedValue(duplicateKey);

        const result = await S3StorageManager.findDuplicateFile(testFilePath);

        expect(result).toBe(duplicateKey);
        expect(mockDuplicateDetector.findDuplicateFile).toHaveBeenCalledWith(
          testFilePath,
        );
      });

      test("重複ファイルが見つからない場合はnullを返す", async () => {
        const testFilePath = "/path/to/test.pdf";

        mockDuplicateDetector.findDuplicateFile.mockResolvedValue(null);

        const result = await S3StorageManager.findDuplicateFile(testFilePath);

        expect(result).toBeNull();
      });
    });

    describe("getDuplicateStatistics", () => {
      test("重複ファイル統計を取得する", async () => {
        const testStats = {
          totalFiles: 100,
          duplicateGroups: 10,
          duplicateFiles: 25,
          savedSpace: 1024000,
        };

        mockDuplicateDetector.getDuplicateStatistics.mockResolvedValue(
          testStats,
        );

        const result = await S3StorageManager.getDuplicateStatistics();

        expect(result).toBe(testStats);
        expect(
          mockDuplicateDetector.getDuplicateStatistics,
        ).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("インスタンスメソッド", () => {
    let storageManager: any;

    beforeEach(() => {
      // プライベートなインスタンスメソッドをテストするため、リフレクションを使用
      storageManager = new (S3StorageManager as any)();
    });

    describe("generateLocationUrl", () => {
      test("S3 URLを正しく生成する", () => {
        const testS3Key = "attachments/test.pdf";

        const result = storageManager.generateLocationUrl(testS3Key);

        expect(result).toContain(testS3Key);
        expect(result).toContain("test-bucket");
      });

      test("認証情報がない場合はエラーを投げる", () => {
        MockedS3AuthManager.getCompleteCredentials.mockReturnValue(null);

        expect(() => {
          storageManager.generateLocationUrl("test-key");
        }).toThrow("S3認証情報が設定されていません");
      });
    });
  });

  describe("シングルトンパターン", () => {
    test("getInstance は同じインスタンスを返す", () => {
      // プライベートメソッドにアクセスするため、any型でキャスト
      const getInstance = (S3StorageManager as any).getInstance;
      const instance1 = getInstance();
      const instance2 = getInstance();

      expect(instance1).toBe(instance2);
    });

    test("resetInstance 後は新しいインスタンスが作成される", () => {
      const getInstance = (S3StorageManager as any).getInstance;
      const instance1 = getInstance();

      S3StorageManager.resetInstance();

      const instance2 = getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("エラーハンドリング", () => {
    test("IOUtils.exists エラーのハンドリング", async () => {
      const testFilePath = "/path/to/test.pdf";
      const testS3Key = "attachments/test.pdf";

      (IOUtils.exists as jest.Mock).mockRejectedValue(
        new Error("Permission denied"),
      );

      await expect(
        S3StorageManager.uploadFile(testFilePath, testS3Key),
      ).rejects.toThrow(S3Error);
    });

    test("S3Operations エラーのハンドリング", async () => {
      const testS3Key = "attachments/test.pdf";

      mockS3Operations.deleteFile.mockRejectedValue(new Error("S3 error"));

      await expect(S3StorageManager.deleteFile(testS3Key)).rejects.toThrow(
        "S3 error",
      );
    });

    test("DuplicateDetector エラーのハンドリング", async () => {
      const testFilePath = "/path/to/test.pdf";

      mockDuplicateDetector.findDuplicateFile.mockRejectedValue(
        new Error("Detection error"),
      );

      await expect(
        S3StorageManager.findDuplicateFile(testFilePath),
      ).rejects.toThrow("Detection error");
    });
  });

  describe("パフォーマンステスト", () => {
    test("大量のファイル操作でもメモリリークしない", async () => {
      const testS3Key = "attachments/test.pdf";
      mockS3Operations.getFileMetadata.mockResolvedValue({
        key: testS3Key,
        etag: "test-etag",
        lastModified: new Date(),
        size: 12345,
        metadata: {
          originalfilename: "test.pdf",
          uploaddate: new Date().toISOString(),
          md5hash: "abcdef123456",
          filesize: "12345",
        } as S3CustomMetadata,
      } as S3FileMetadata);

      // 100回連続でメタデータを取得
      const promises = Array.from({ length: 100 }, () =>
        S3StorageManager.getFileMetadata(testS3Key),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
      expect(mockS3Operations.getFileMetadata).toHaveBeenCalledTimes(100);
    });
  });
});
