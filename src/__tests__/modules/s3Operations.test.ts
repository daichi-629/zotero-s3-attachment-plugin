import { S3Operations } from "../../modules/s3Operations";
import { S3AuthManager } from "../../modules/s3AuthManager";
import { S3Error } from "../../modules/s3Types";

// AWS SDKのモック
jest.mock("@aws-sdk/client-s3");
jest.mock("@aws-sdk/lib-storage");

// S3AuthManagerのモック
jest.mock("../../modules/s3AuthManager");

// S3ClientとCommandsのモック
const mockSend = jest.fn();
const mockS3Client = {
  send: mockSend,
};

// AWS SDK Constructorsのモック
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} = jest.requireMock("@aws-sdk/client-s3");
const { Upload } = jest.requireMock("@aws-sdk/lib-storage");

S3Client.mockImplementation(() => mockS3Client);
PutObjectCommand.mockImplementation((params: any) => ({
  ...params,
  commandType: "PutObject",
}));
GetObjectCommand.mockImplementation((params: any) => ({
  ...params,
  commandType: "GetObject",
}));
DeleteObjectCommand.mockImplementation((params: any) => ({
  ...params,
  commandType: "DeleteObject",
}));
ListObjectsV2Command.mockImplementation((params: any) => ({
  ...params,
  commandType: "ListObjectsV2",
}));
HeadObjectCommand.mockImplementation((params: any) => ({
  ...params,
  commandType: "HeadObject",
}));

// Upload クラスのモック
Upload.mockImplementation((params: any) => ({
  done: jest.fn().mockResolvedValue({
    ETag: '"test-etag"',
    Location: "https://test-bucket.s3.us-east-1.amazonaws.com/test-key",
  }),
}));

// S3AuthManagerのモック
const mockS3AuthManager = S3AuthManager as jest.Mocked<typeof S3AuthManager>;

describe("S3Operations", () => {
  let s3Operations: S3Operations;

  beforeEach(() => {
    jest.clearAllMocks();
    s3Operations = new S3Operations();
    mockSend.mockClear();
    // setup.tsのmockDebugNotifyを使用
    (global as any).debugNotify.mockClear();

    // setTimeoutをモック化して待機時間を短縮
    jest
      .spyOn(global, "setTimeout")
      .mockImplementation((callback: () => void) => {
        // 実際には待機せずに即座にコールバックを実行
        callback();
        return 1 as any;
      });

    // デフォルトの認証情報モック
    mockS3AuthManager.getCompleteCredentials.mockReturnValue({
      provider: "aws",
      accessKeyId: "ABCDEFGHIJKLMNOPQRST",
      secretAccessKey: "abcdefghijklmnopqrstuvwxyz1234567890abcdef",
      region: "us-east-1",
      bucketName: "test-bucket",
      endpoint: "https://s3.us-east-1.amazonaws.com",
    });

    // Uploadクラスのモックをリセット
    Upload.mockImplementation((params: any) => ({
      done: jest.fn().mockResolvedValue({
        ETag: '"test-etag"',
        Location: "https://test-bucket.s3.us-east-1.amazonaws.com/test-key",
      }),
    }));
  });

  afterEach(() => {
    // setTimeoutのモックをリストア
    jest.restoreAllMocks();
  });

  describe("initializeClient", () => {
    test("正常な認証情報でクライアントを初期化する", async () => {
      await s3Operations.initializeClient();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: "us-east-1",
          credentials: {
            accessKeyId: "ABCDEFGHIJKLMNOPQRST",
            secretAccessKey: "abcdefghijklmnopqrstuvwxyz1234567890abcdef",
          },
        }),
      );
    });

    test("認証情報がない場合はエラーを投げる", async () => {
      mockS3AuthManager.getCompleteCredentials.mockReturnValue(null);

      await expect(s3Operations.initializeClient()).rejects.toThrow(S3Error);
      await expect(s3Operations.initializeClient()).rejects.toThrow(
        "ストレージクライアントの初期化に失敗しました",
      );
    });

    test("カスタムエンドポイントの設定", async () => {
      mockS3AuthManager.getCompleteCredentials.mockReturnValue({
        provider: "minio",
        accessKeyId: "minioaccesskey",
        secretAccessKey: "miniosecretkey",
        region: "us-east-1",
        bucketName: "test-bucket",
        endpoint: "http://localhost:9000",
      });

      await s3Operations.initializeClient();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "http://localhost:9000",
          forcePathStyle: true,
          tls: false,
        }),
      );
    });
  });

  describe("clearClient", () => {
    test("S3クライアントをクリアする", () => {
      s3Operations.clearClient();
    });
  });

  describe("testConnection", () => {
    test("接続テストが成功する", async () => {
      mockSend.mockReset();
      mockSend.mockResolvedValue({
        Contents: [],
        $metadata: { httpStatusCode: 200 },
      });

      const result = await s3Operations.testConnection();

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: "ListObjectsV2",
          Bucket: "test-bucket",
          MaxKeys: 1,
        }),
      );
    });

    test("接続テストが失敗する", async () => {
      mockSend.mockReset();
      mockSend.mockRejectedValue(new Error("Network error"));

      const result = await s3Operations.testConnection();

      expect(result).toBe(false);
    });
  });

  describe("uploadFile", () => {
    test("ファイルを正常にアップロードする（小さいファイル: PutObjectCommand）", async () => {
      // 前のテストの影響をクリア
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // PutObjectCommandのレスポンスをモック
      mockSend.mockResolvedValue({
        ETag: '"test-etag-put"',
        $metadata: { httpStatusCode: 200 },
      });

      const fileData = new Uint8Array([1, 2, 3, 4]); // 4バイト（5MB未満）
      const customMetadata = {
        originalfilename: "file.txt",
        uploaddate: "2023-01-01T00:00:00Z",
        md5hash: "abcd1234",
        filesize: "4",
      };

      const result = await s3Operations.uploadFile(
        "test/file.txt",
        fileData,
        "text/plain",
        customMetadata,
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: "PutObject",
          Bucket: "test-bucket",
          Key: "test/file.txt",
          ContentType: "text/plain",
          Metadata: expect.objectContaining({
            originalfilename: "file.txt",
            uploaddate: "2023-01-01T00:00:00Z",
            md5hash: "abcd1234",
            filesize: "4",
          }),
        }),
      );

      expect(result).toEqual({
        etag: '"test-etag-put"',
        location: "https://test-bucket.s3.amazonaws.com/test/file.txt",
      });
    });

    test("大きなファイルを正常にアップロードする（Uploadクラス使用）", async () => {
      // 前のテストの影響をクリア
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // 5MB以上のファイルデータを作成（実際は小さなデータで代用）
      const largeFileData = new Uint8Array(6 * 1024 * 1024); // 6MB
      largeFileData.fill(65); // 'A'で埋める

      const bodyData = new ReadableStream({
        start(controller: ReadableStreamDefaultController<Uint8Array>) {
          controller.enqueue(largeFileData);
          controller.close();
        },
      });
      const customMetadata = {
        originalfilename: "large-file.pdf",
        uploaddate: "2023-01-01T00:00:00Z",
        md5hash: "abcd5678",
        filesize: "6291456",
      };

      // Uploadクラスのモックが既に設定されているので、そのレスポンスを使用
      const result = await s3Operations.uploadFile(
        "test/large-file.pdf",
        largeFileData,
        "application/pdf",
        customMetadata,
      );

      // Uploadクラスが適切に初期化されたことを確認
      expect(Upload).toHaveBeenCalledWith({
        client: mockS3Client,
        params: {
          Bucket: "test-bucket",
          Key: "test/large-file.pdf",
          Body: expect.any(ReadableStream),
          ContentType: "application/pdf",
          ChecksumAlgorithm: undefined,
          Metadata: {
            originalfilename: "large-file.pdf",
            uploaddate: "2023-01-01T00:00:00Z",
            md5hash: "abcd5678",
            filesize: "6291456",
          },
        },
        partSize: 5242880,
        queueSize: 4,
      });

      expect(result).toEqual({
        etag: '"test-etag"',
        location: "https://test-bucket.s3.us-east-1.amazonaws.com/test-key",
      });
    });

    test("大きなファイルアップロード中にエラーが発生した場合", async () => {
      // 前のテストの影響をクリア
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // Uploadクラスのdoneメソッドでエラーを発生させる
      Upload.mockImplementation(() => ({
        done: jest.fn().mockRejectedValue(new Error("Upload failed")),
      }));

      const largeFileData = new Uint8Array(6 * 1024 * 1024);
      const customMetadata = {
        originalfilename: "large-file.pdf",
        uploaddate: "2023-01-01T00:00:00Z",
        md5hash: "abcd5678",
        filesize: "6291456",
      };

      await expect(
        s3Operations.uploadFile(
          "test/large-file.pdf",
          largeFileData,
          "application/pdf",
          customMetadata,
        ),
      ).rejects.toThrow("Upload failed");

      // Uploadクラスが初期化されたことを確認
      expect(Upload).toHaveBeenCalled();
    });

    test("ファイルサイズ境界値のテスト（5MB丁度）", async () => {
      // 前のテストの影響をクリア
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // 正確に5MBのファイルデータを作成
      const exactlyFiveMB = new Uint8Array(5 * 1024 * 1024); // 5MB
      exactlyFiveMB.fill(66); // 'B'で埋める

      // PutObjectCommandのレスポンスをモック（5MBはPutObjectCommandを使用）
      mockSend.mockResolvedValue({
        ETag: '"test-etag-5mb"',
        $metadata: { httpStatusCode: 200 },
      });

      const customMetadata = {
        originalfilename: "five-mb-file.bin",
        uploaddate: "2023-01-01T00:00:00Z",
        md5hash: "5mbhash",
        filesize: "5242880",
      };

      const result = await s3Operations.uploadFile(
        "test/five-mb-file.bin",
        exactlyFiveMB,
        "application/octet-stream",
        customMetadata,
      );

      // 5MBはPutObjectCommandを使用することを確認
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: "PutObject",
          Bucket: "test-bucket",
          Key: "test/five-mb-file.bin",
          ContentType: "application/octet-stream",
        }),
      );

      expect(result).toEqual({
        etag: '"test-etag-5mb"',
        location: "https://test-bucket.s3.amazonaws.com/test/five-mb-file.bin",
      });
    });

    test("大きなファイルアップロード時のプログレス更新", async () => {
      // 前のテストの影響をクリア
      mockSend.mockReset();
      await s3Operations.initializeClient();

      const progressCallback = jest.fn();

      // Uploadクラスのモックで、onメソッドを持つオブジェクトを返す
      const mockUpload = {
        done: jest.fn().mockResolvedValue({
          ETag: '"test-etag-progress"',
          Location:
            "https://test-bucket.s3.us-east-1.amazonaws.com/test-progress",
        }),
        on: jest.fn().mockImplementation((event: string, callback: any) => {
          if (event === "httpUploadProgress") {
            // プログレスイベントをシミュレート
            setTimeout(() => {
              callback({ loaded: 1048576, total: 6291456 }); // 1MB/6MB
            }, 0);
            setTimeout(() => {
              callback({ loaded: 3145728, total: 6291456 }); // 3MB/6MB
            }, 0);
            setTimeout(() => {
              callback({ loaded: 6291456, total: 6291456 }); // 6MB/6MB
            }, 0);
          }
          return mockUpload;
        }),
      };

      Upload.mockImplementation(() => mockUpload);

      const largeFileData = new Uint8Array(6 * 1024 * 1024);
      const customMetadata = {
        originalfilename: "progress-test.pdf",
        uploaddate: "2023-01-01T00:00:00Z",
        md5hash: "progresshash",
        filesize: "6291456",
      };

      const result = await s3Operations.uploadFile(
        "test/progress-test.pdf",
        largeFileData,
        "application/pdf",
        customMetadata,
        progressCallback,
      );

      // プログレスコールバックが呼び出されたことを確認
      await new Promise((resolve) => setTimeout(resolve, 10)); // 非同期プログレスイベントを待つ

      expect(progressCallback).toHaveBeenCalled();
      expect(mockUpload.on).toHaveBeenCalledWith(
        "httpUploadProgress",
        expect.any(Function),
      );

      expect(result).toEqual({
        etag: '"test-etag-progress"',
        location:
          "https://test-bucket.s3.us-east-1.amazonaws.com/test-progress",
      });
    });

    test("クライアントが初期化されていない場合は自動で初期化する", async () => {
      // 前のテストの影響をクリア
      mockSend.mockReset();

      // PutObjectCommandのレスポンスをモック
      mockSend.mockResolvedValue({
        ETag: '"test-etag-auto"',
        $metadata: { httpStatusCode: 200 },
      });

      const fileData = new Uint8Array([1, 2, 3, 4]);
      const customMetadata = {
        originalfilename: "file.txt",
        uploaddate: "2023-01-01T00:00:00Z",
        md5hash: "abcd1234",
        filesize: "4",
      };

      await s3Operations.uploadFile(
        "test/file.txt",
        fileData,
        "text/plain",
        customMetadata,
      );

      expect(S3Client).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe("downloadFile", () => {
    test("ファイルを正常にダウンロードする", async () => {
      // 前のテストの影響をクリア
      mockSend.mockReset();
      await s3Operations.initializeClient();

      const mockResponseBody = {
        transformToByteArray: jest
          .fn()
          .mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
      };

      mockSend.mockResolvedValue({
        Body: mockResponseBody,
        ContentLength: 4,
        $metadata: { httpStatusCode: 200 },
      });

      const result = await s3Operations.downloadFile("test/file.txt");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: "GetObject",
          Bucket: "test-bucket",
          Key: "test/file.txt",
        }),
      );

      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    test("ファイルが見つからない場合はS3Errorを投げる", async () => {
      // 前のテストの影響をクリア
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // レスポンスボディが undefined の場合をモック
      mockSend.mockResolvedValue({
        Body: undefined,
        $metadata: { httpStatusCode: 200 },
      });

      await expect(
        s3Operations.downloadFile("test/nonexistent.txt"),
      ).rejects.toThrow(S3Error);
    });
  });

  describe("deleteFile", () => {
    test("ファイルを正常に削除する", async () => {
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // HeadObjectCommandの応答をモック（削除前の存在確認で「存在する」を返す）
      mockSend
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 200 },
        })
        // DeleteObjectCommandの応答をモック（削除成功）
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 204 },
        })
        // HeadObjectCommandの応答をモック（削除後のファイル存在確認で「存在しない」を返す）
        .mockRejectedValueOnce(
          Object.assign(new Error("NotFound"), {
            name: "NotFound",
            $metadata: { httpStatusCode: 404 },
          }),
        );

      await s3Operations.deleteFile("test/file.txt");

      // 3回のAPI呼び出しが行われることを確認
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    test("削除エラーが発生した場合はエラーを投げる", async () => {
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // HeadObjectCommandが存在確認で成功した後、DeleteObjectCommandでエラーが発生
      mockSend
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 200 },
        })
        .mockRejectedValue(new Error("Delete failed"));

      await expect(s3Operations.deleteFile("test/file.txt")).rejects.toThrow(
        S3Error,
      );
    });

    test("削除後もファイルが存在する場合は再削除を試行する", async () => {
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // 最初の存在確認、削除、削除後の存在確認（まだ存在）、再削除、最終確認（存在しない）
      mockSend
        // 削除前の存在確認（ファイルが存在）
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 200 },
        })
        // 最初の削除
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 204 },
        })
        // 削除後の存在確認（ファイルがまだ存在）
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 200 },
        })
        // 再削除
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 204 },
        })
        // 最終的な存在確認（ファイルが存在しない）
        .mockRejectedValueOnce(
          Object.assign(new Error("NotFound"), {
            name: "NotFound",
            $metadata: { httpStatusCode: 404 },
          }),
        );

      await s3Operations.deleteFile("test/file.txt");

      // 5回のAPI呼び出しが行われることを確認
      expect(mockSend).toHaveBeenCalledTimes(5);
    });

    test("再削除後もファイルが存在する場合はエラーを投げる", async () => {
      mockSend.mockReset();
      await s3Operations.initializeClient();

      // 削除は成功するが、存在確認では常に「存在する」を返す
      mockSend
        // 削除前の存在確認（ファイルが存在）
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 200 },
        })
        // 最初の削除
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 204 },
        })
        // 1回目の削除後の存在確認（ファイルがまだ存在）
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 200 },
        })
        // 2回目の削除
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 204 },
        })
        // 2回目の削除後の存在確認（ファイルがまだ存在）
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 200 },
        })
        // 3回目の削除
        .mockResolvedValueOnce({
          $metadata: { httpStatusCode: 204 },
        })
        // 最終的な存在確認（ファイルがまだ存在）
        .mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

      await expect(s3Operations.deleteFile("test/file.txt")).rejects.toThrow(
        "ファイル削除に失敗しました（再試行後もファイルが存在）",
      );
    });
  });

  describe("getFileMetadata", () => {
    test("ファイルメタデータを正常に取得する", async () => {
      mockSend.mockReset();
      await s3Operations.initializeClient();

      mockSend.mockResolvedValue({
        ContentLength: 1024,
        LastModified: new Date("2023-01-01T00:00:00Z"),
        ContentType: "text/plain",
        ETag: '"test-etag"',
        Metadata: {
          customKey: "customValue",
        },
        $metadata: { httpStatusCode: 200 },
      });

      const metadata = await s3Operations.getFileMetadata("test/file.txt");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: "HeadObject",
          Bucket: "test-bucket",
          Key: "test/file.txt",
        }),
      );

      expect(metadata).toEqual({
        key: "test/file.txt",
        size: 1024,
        lastModified: new Date("2023-01-01T00:00:00Z"),
        contentType: "text/plain",
        etag: '"test-etag"',
        metadata: {
          customKey: "customValue",
        },
      });
    });

    test("ファイルが存在しない場合はnullを返す", async () => {
      mockSend.mockReset();
      await s3Operations.initializeClient();

      mockSend.mockRejectedValue(
        Object.assign(new Error("NotFound"), { name: "NotFound" }),
      );

      const metadata = await s3Operations.getFileMetadata(
        "test/nonexistent.txt",
      );

      expect(metadata).toBeNull();
    });
  });

  describe("listFiles", () => {
    test("ファイル一覧を正常に取得する", async () => {
      mockSend.mockReset();
      await s3Operations.initializeClient();

      mockSend.mockResolvedValue({
        Contents: [
          {
            Key: "test/file1.txt",
            Size: 1024,
            LastModified: new Date("2023-01-01T00:00:00Z"),
            ETag: '"etag1"',
          },
          {
            Key: "test/file2.txt",
            Size: 2048,
            LastModified: new Date("2023-01-02T00:00:00Z"),
            ETag: '"etag2"',
          },
        ],
        $metadata: { httpStatusCode: 200 },
      });

      const files = await s3Operations.listFiles("test/");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: "ListObjectsV2",
          Bucket: "test-bucket",
          Prefix: "test/",
        }),
      );

      expect(files).toHaveLength(2);
      expect(files[0]).toEqual({
        key: "test/file1.txt",
        size: 1024,
        lastModified: new Date("2023-01-01T00:00:00Z"),
        etag: '"etag1"',
      });
    });

    test("空のバケットの場合は空の配列を返す", async () => {
      mockSend.mockReset();
      await s3Operations.initializeClient();

      mockSend.mockResolvedValue({
        Contents: [],
        $metadata: { httpStatusCode: 200 },
      });

      const files = await s3Operations.listFiles();

      expect(files).toEqual([]);
    });
  });
});
