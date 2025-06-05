import { R2UrlGenerator } from "../../../modules/r2/r2UrlGenerator";
import { R2Settings } from "../../../modules/r2/r2Settings";
import { S3AuthManager } from "../../../modules/s3AuthManager";
import { generateS3Url, encodeS3KeyForUrl } from "../../../modules/s3Types";

// 依存関係をモック
jest.mock("../../../modules/r2/r2Settings");
jest.mock("../../../modules/s3AuthManager");
jest.mock("../../../modules/s3Types");

// fetchをモック
global.fetch = jest.fn();

// ztoolkitのログ関数をモック
const mockZtoolkitLog = jest.fn();
(global as any).ztoolkit = {
  log: mockZtoolkitLog,
};

// モック関数を型安全に参照
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockR2Settings = R2Settings as jest.Mocked<typeof R2Settings>;
const mockS3AuthManager = S3AuthManager as jest.Mocked<typeof S3AuthManager>;
const mockEncodeS3KeyForUrl = encodeS3KeyForUrl as jest.MockedFunction<
  typeof encodeS3KeyForUrl
>;

describe("R2UrlGenerator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZtoolkitLog.mockClear();

    // グローバルztoolkitを確実に設定
    (global as any).ztoolkit = {
      log: mockZtoolkitLog,
    };

    // デフォルトのモック設定
    mockEncodeS3KeyForUrl.mockImplementation((key) => encodeURIComponent(key));
  });

  describe("generateUrl", () => {
    const testS3Key = "path/to/file.pdf";
    const mockCredentials = {
      provider: "r2",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      endpoint: "https://account.r2.cloudflarestorage.com",
      bucketName: "test-bucket",
      region: "auto",
    };

    beforeEach(() => {
      mockS3AuthManager.getCompleteCredentials.mockReturnValue(mockCredentials);
    });

    test("autoタイプでカスタムドメインURLを生成する", async () => {
      mockR2Settings.getCustomDomain.mockReturnValue("custom-domain.com");
      mockR2Settings.isValidCustomDomainFormat.mockReturnValue(true);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "auto",
      });

      expect(result).toBe("https://custom-domain.com/path/to/file.pdf");
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        expect.stringContaining("URL生成成功 (custom)"),
      );
    });

    test("autoタイプでR2開発URLにフォールバックする", async () => {
      // カスタムドメインが設定されていない
      mockR2Settings.getCustomDomain.mockReturnValue(null);

      // R2開発URL用の設定
      const mockValidatedCredentials = {
        credentials: mockCredentials,
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };
      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );

      // Cloudflare API呼び出しをモック（成功）
      const mockApiResponse = {
        success: true,
        result: {
          bucketId: "bucket-123",
          domain: "pub-123.r2.dev",
          enabled: true,
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "auto",
      });

      expect(result).toBe(
        `https://pub-123.r2.dev/${encodeURIComponent(testS3Key)}`,
      );
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        expect.stringContaining("URL生成成功 (r2dev)"),
      );
    });

    test("autoタイプで標準URLにフォールバックする", async () => {
      // カスタムドメイン、R2開発URLが利用できない
      mockR2Settings.getCustomDomain.mockReturnValue(null);
      mockR2Settings.validateR2Credentials.mockReturnValue(null);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "auto",
      });

      expect(result).toBe(
        `${mockCredentials.endpoint}/${mockCredentials.bucketName}/${testS3Key}`,
      );
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        expect.stringContaining("URL生成成功 (disabled)"),
      );
    });

    test("customタイプで有効なカスタムドメインURLを生成する", async () => {
      mockR2Settings.getCustomDomain.mockReturnValue(
        "https://custom-domain.com",
      );
      mockR2Settings.isValidCustomDomainFormat.mockReturnValue(true);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "custom",
      });

      expect(result).toBe("https://custom-domain.com/path/to/file.pdf");
    });

    test("customタイプでカスタムドメインが設定されていない場合フォールバックする", async () => {
      mockR2Settings.getCustomDomain.mockReturnValue(null);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "custom",
      });

      // フォールバックURL（標準S3 URL）が返される
      expect(result).toBe(
        `${mockCredentials.endpoint}/${mockCredentials.bucketName}/${testS3Key}`,
      );
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        expect.stringContaining("フォールバックURL"),
      );
    });

    test("r2devタイプでR2開発URLを生成する", async () => {
      const mockValidatedCredentials = {
        credentials: mockCredentials,
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };
      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );

      // Cloudflare API呼び出しをモック
      const mockApiResponse = {
        success: true,
        result: {
          bucketId: "bucket-123",
          domain: "pub-123.r2.dev",
          enabled: true,
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "r2dev",
      });

      expect(result).toBe(
        `https://pub-123.r2.dev/${encodeURIComponent(testS3Key)}`,
      );
    });

    test("r2devタイプでAPI失敗時にアカウントIDベースURLにフォールバックする", async () => {
      const mockValidatedCredentials = {
        credentials: mockCredentials,
        apiToken: "test-token",
        accountId: "abcdef0123456789abcdef0123456789",
        bucketName: "test-bucket",
      };
      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );

      // Cloudflare API呼び出しが失敗
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as any);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "r2dev",
      });

      expect(result).toBe(
        `https://pub-abcdef0123456789abcdef0123456789.r2.dev/${encodeURIComponent(testS3Key)}`,
      );
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        expect.stringContaining(
          "Cloudflare API失敗、アカウントIDベースのURLにフォールバック",
        ),
      );
    });

    test("disabledタイプで標準S3 URLを生成する", async () => {
      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "disabled",
      });

      expect(result).toBe(
        `${mockCredentials.endpoint}/${mockCredentials.bucketName}/${testS3Key}`,
      );
    });

    test("allowFallback=falseでカスタムドメインが無効でもフォールバックされる", async () => {
      mockR2Settings.getCustomDomain.mockReturnValue("invalid-domain");
      mockR2Settings.isValidCustomDomainFormat.mockReturnValue(false);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "custom",
        allowFallback: false,
      });

      // allowFallback=falseでもフォールバックURLが返される（現在の実装）
      expect(result).toBe(
        `${mockCredentials.endpoint}/${mockCredentials.bucketName}/${testS3Key}`,
      );
    });

    test("最終フォールバックでS3認証情報が取得できない場合", async () => {
      mockS3AuthManager.getCompleteCredentials.mockReturnValue(null);
      mockR2Settings.getCustomDomain.mockReturnValue(null);
      mockR2Settings.validateR2Credentials.mockReturnValue(null);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "auto",
      });

      // 汎用的なS3 URLが返される
      expect(result).toBe(
        `https://s3.amazonaws.com/unknown-bucket/${testS3Key}`,
      );
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        expect.stringContaining("フォールバックURL"),
      );
    });
  });

  describe("generatePublicUrl (deprecated)", () => {
    test("generateUrlを適切なオプションで呼び出す", async () => {
      const testS3Key = "test/file.pdf";
      const mockCredentials = {
        provider: "r2",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        endpoint: "https://account.r2.cloudflarestorage.com",
        bucketName: "test-bucket",
        region: "auto",
      };

      mockS3AuthManager.getCompleteCredentials.mockReturnValue(mockCredentials);
      mockR2Settings.getCustomDomain.mockReturnValue(null);
      mockR2Settings.validateR2Credentials.mockReturnValue(null);

      const result = await R2UrlGenerator.generatePublicUrl(testS3Key);

      expect(result).toBe(
        `${mockCredentials.endpoint}/${mockCredentials.bucketName}/${testS3Key}`,
      );
    });
  });

  describe("generateUrlByType (deprecated)", () => {
    test("指定されたタイプでgenerateUrlを呼び出す", async () => {
      const testS3Key = "test/file.pdf";
      const mockCredentials = {
        provider: "r2",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        endpoint: "https://account.r2.cloudflarestorage.com",
        bucketName: "test-bucket",
        region: "auto",
      };

      mockS3AuthManager.getCompleteCredentials.mockReturnValue(mockCredentials);

      const result = await R2UrlGenerator.generateUrlByType(
        testS3Key,
        "disabled",
      );

      expect(result).toBe(
        `${mockCredentials.endpoint}/${mockCredentials.bucketName}/${testS3Key}`,
      );
    });

    test("urlTypeが指定されていない場合autoを使用する", async () => {
      const testS3Key = "test/file.pdf";
      const mockCredentials = {
        provider: "r2",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        endpoint: "https://account.r2.cloudflarestorage.com",
        bucketName: "test-bucket",
        region: "auto",
      };

      mockS3AuthManager.getCompleteCredentials.mockReturnValue(mockCredentials);
      mockR2Settings.getCustomDomain.mockReturnValue(null);
      mockR2Settings.validateR2Credentials.mockReturnValue(null);

      const result = await R2UrlGenerator.generateUrlByType(testS3Key);

      expect(result).toBe(
        `${mockCredentials.endpoint}/${mockCredentials.bucketName}/${testS3Key}`,
      );
    });
  });

  describe("getPublicDevelopmentUrl", () => {
    test("R2開発URLを取得する", async () => {
      const testS3Key = "test/file.pdf";
      const mockValidatedCredentials = {
        credentials: { provider: "r2" },
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };

      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );

      // Cloudflare API呼び出しをモック
      const mockApiResponse = {
        success: true,
        result: {
          bucketId: "bucket-123",
          domain: "pub-123.r2.dev",
          enabled: true,
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result = await R2UrlGenerator.getPublicDevelopmentUrl(testS3Key);

      expect(result).toBe(
        `https://pub-123.r2.dev/${encodeURIComponent(testS3Key)}`,
      );
    });

    test("認証情報が無効な場合はフォールバックURLを返す", async () => {
      mockR2Settings.validateR2Credentials.mockReturnValue(null);

      const result =
        await R2UrlGenerator.getPublicDevelopmentUrl("test/file.pdf");

      // 認証情報が無効でも、フォールバックURLが返される
      expect(result).toBe(
        "https://account.r2.cloudflarestorage.com/test-bucket/test/file.pdf",
      );
    });
  });

  describe("enablePublicDevelopmentUrl", () => {
    test("R2開発URLを有効化してURLを返す", async () => {
      const testS3Key = "test/file.pdf";
      const mockValidatedCredentials = {
        credentials: { provider: "r2" },
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };

      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );
      mockR2Settings.enablePublicDevelopmentUrl.mockResolvedValue(true);

      // Cloudflare API呼び出しをモック
      const mockApiResponse = {
        success: true,
        result: {
          bucketId: "bucket-123",
          domain: "pub-123.r2.dev",
          enabled: true,
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result = await R2UrlGenerator.enablePublicDevelopmentUrl(testS3Key);

      expect(result).toBe(
        `https://pub-123.r2.dev/${encodeURIComponent(testS3Key)}`,
      );
      expect(mockR2Settings.enablePublicDevelopmentUrl).toHaveBeenCalledWith(
        "test-bucket",
      );
    });

    test("認証情報が無効な場合エラーを投げる", async () => {
      mockR2Settings.validateR2Credentials.mockReturnValue(null);

      await expect(
        R2UrlGenerator.enablePublicDevelopmentUrl("test/file.pdf"),
      ).rejects.toThrow(
        "R2開発URLを有効化するにはCloudflare APIトークンと正しいR2設定が必要です",
      );
    });

    test("有効化に失敗した場合エラーを投げる", async () => {
      const mockValidatedCredentials = {
        credentials: { provider: "r2" },
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };

      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );
      mockR2Settings.enablePublicDevelopmentUrl.mockResolvedValue(false);

      await expect(
        R2UrlGenerator.enablePublicDevelopmentUrl("test/file.pdf"),
      ).rejects.toThrow("R2開発URLの有効化に失敗しました");
    });

    test("URL生成で無効な場合はフォールバックURLを返す", async () => {
      const mockValidatedCredentials = {
        credentials: { provider: "r2" },
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };

      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );
      mockR2Settings.enablePublicDevelopmentUrl.mockResolvedValue(true);

      // Cloudflare API呼び出しが失敗するように設定
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as any);

      const result =
        await R2UrlGenerator.enablePublicDevelopmentUrl("test/file.pdf");

      // エラー時はアカウントIDベースのr2.devURLが返される
      expect(result).toBe("https://pub-test-account.r2.dev/test%2Ffile.pdf");
    });
  });

  describe("エラーハンドリング", () => {
    test("ネットワークエラー時の適切な処理", async () => {
      const testS3Key = "test/file.pdf";
      const mockValidatedCredentials = {
        credentials: { provider: "r2" },
        apiToken: "test-token",
        accountId: "abcdef0123456789abcdef0123456789",
        bucketName: "test-bucket",
      };

      mockR2Settings.getCustomDomain.mockReturnValue(null);
      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "r2dev",
      });

      // エラー時はアカウントIDベースのフォールバックURLが返される
      expect(result).toBe(
        `https://pub-abcdef0123456789abcdef0123456789.r2.dev/${encodeURIComponent(testS3Key)}`,
      );
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        expect.stringContaining("パブリック開発URLドメイン取得に失敗"),
      );
    });

    test("Cloudflare APIから成功=falseレスポンスを受信", async () => {
      const testS3Key = "test/file.pdf";
      const mockValidatedCredentials = {
        credentials: { provider: "r2" },
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };

      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );

      const mockApiResponse = {
        success: false,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "r2dev",
      });

      // アカウントIDベースのフォールバックURLが返される
      expect(result).toBe(
        `https://pub-test-account.r2.dev/${encodeURIComponent(testS3Key)}`,
      );
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "Cloudflare APIからエラーレスポンスを受信しました",
      );
    });

    test("パブリック開発URLが無効化されている場合", async () => {
      const testS3Key = "test/file.pdf";
      const mockValidatedCredentials = {
        credentials: { provider: "r2" },
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };

      mockR2Settings.validateR2Credentials.mockReturnValue(
        mockValidatedCredentials,
      );

      const mockApiResponse = {
        success: true,
        result: {
          bucketId: "bucket-123",
          domain: "pub-123.r2.dev",
          enabled: false,
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result = await R2UrlGenerator.generateUrl(testS3Key, {
        type: "r2dev",
      });

      // アカウントIDベースのフォールバックURLが返される
      expect(result).toBe(
        `https://pub-test-account.r2.dev/${encodeURIComponent(testS3Key)}`,
      );
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "パブリック開発URLが有効化されていません",
      );
    });
  });
});
