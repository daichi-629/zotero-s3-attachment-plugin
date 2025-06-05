import { R2Utils } from "../../../modules/r2/r2Utils";
import { S3AuthManager } from "../../../modules/s3AuthManager";

// S3AuthManagerをモック
jest.mock("../../../modules/s3AuthManager");

// ztoolkitのログ関数をモック
const mockZtoolkitLog = jest.fn();
(global as any).ztoolkit = {
  log: mockZtoolkitLog,
};

describe("R2Utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZtoolkitLog.mockClear();

    // グローバルztoolkitを確実に設定
    (global as any).ztoolkit = {
      log: mockZtoolkitLog,
    };
  });

  describe("extractAccountIdFromEndpoint", () => {
    test("有効なR2エンドポイントからアカウントIDを抽出する", () => {
      const endpoint =
        "https://abcdef0123456789abcdef0123456789.r2.cloudflarestorage.com";
      const result = R2Utils.extractAccountIdFromEndpoint(endpoint);
      expect(result).toBe("abcdef0123456789abcdef0123456789");
    });

    test("32文字の16進文字列アカウントIDを正しく抽出する", () => {
      const endpoint =
        "https://abcdef0123456789abcdef0123456789.r2.cloudflarestorage.com";
      const result = R2Utils.extractAccountIdFromEndpoint(endpoint);
      expect(result).toBe("abcdef0123456789abcdef0123456789");
    });

    test("無効なエンドポイント形式の場合nullを返す", () => {
      const invalidEndpoints = [
        "https://invalid-endpoint.com",
        "https://short.r2.cloudflarestorage.com",
        "https://toolongaccountid12345678901234567890.r2.cloudflarestorage.com",
        "https://invalid-chars@#$.r2.cloudflarestorage.com",
        "not-a-url",
        "",
      ];

      invalidEndpoints.forEach((endpoint) => {
        const result = R2Utils.extractAccountIdFromEndpoint(endpoint);
        expect(result).toBeNull();
      });
    });

    test("無効なURL形式の場合nullを返す", () => {
      const result = R2Utils.extractAccountIdFromEndpoint("invalid-url");
      expect(result).toBeNull();
    });
  });

  describe("validateR2Credentials", () => {
    const mockGetApiToken = jest.fn();
    const mockCredentials = {
      provider: "r2",
      endpoint:
        "https://abcdef0123456789abcdef0123456789.r2.cloudflarestorage.com",
      bucketName: "test-bucket",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
    };

    beforeEach(() => {
      mockGetApiToken.mockReset();
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockReset();
    });

    test("有効な認証情報で正しい結果を返す", () => {
      mockGetApiToken.mockReturnValue("test-api-token");
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockReturnValue(
        mockCredentials,
      );

      const result = R2Utils.validateR2Credentials(mockGetApiToken);

      expect(result).toEqual({
        credentials: mockCredentials,
        apiToken: "test-api-token",
        accountId: "abcdef0123456789abcdef0123456789",
        bucketName: "test-bucket",
      });
    });

    test("認証情報が取得できない場合nullを返す", () => {
      mockGetApiToken.mockReturnValue("test-api-token");
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockReturnValue(null);

      const result = R2Utils.validateR2Credentials(mockGetApiToken);

      expect(result).toBeNull();
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "R2認証情報が設定されていません",
      );
    });

    test("プロバイダーがR2でない場合nullを返す", () => {
      mockGetApiToken.mockReturnValue("test-api-token");
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockReturnValue({
        ...mockCredentials,
        provider: "aws",
      });

      const result = R2Utils.validateR2Credentials(mockGetApiToken);

      expect(result).toBeNull();
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "R2認証情報が設定されていません",
      );
    });

    test("APIトークンが取得できない場合nullを返す", () => {
      mockGetApiToken.mockReturnValue(null);
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockReturnValue(
        mockCredentials,
      );

      const result = R2Utils.validateR2Credentials(mockGetApiToken);

      expect(result).toBeNull();
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "Cloudflare APIトークンが設定されていません",
      );
    });

    test("エンドポイントからアカウントIDが抽出できない場合nullを返す", () => {
      mockGetApiToken.mockReturnValue("test-api-token");
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockReturnValue({
        ...mockCredentials,
        endpoint: "https://invalid-endpoint.com",
      });

      const result = R2Utils.validateR2Credentials(mockGetApiToken);

      expect(result).toBeNull();
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "エンドポイントからアカウントIDを取得できませんでした",
      );
    });

    test("バケット名が設定されていない場合nullを返す", () => {
      mockGetApiToken.mockReturnValue("test-api-token");
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockReturnValue({
        ...mockCredentials,
        bucketName: "",
      });

      const result = R2Utils.validateR2Credentials(mockGetApiToken);

      expect(result).toBeNull();
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "バケット名が設定されていません",
      );
    });
  });

  describe("savePublicUrlToItem", () => {
    const mockItem = {
      isAttachment: jest.fn(),
      setField: jest.fn(),
      save: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("添付ファイルアイテムに公開URLを保存する", async () => {
      mockItem.isAttachment.mockReturnValue(true);
      mockItem.save.mockResolvedValue(undefined);

      await R2Utils.savePublicUrlToItem(
        mockItem,
        "https://example.com/file.pdf",
      );

      expect(mockItem.setField).toHaveBeenCalledWith(
        "url",
        "https://example.com/file.pdf",
      );
      expect(mockItem.save).toHaveBeenCalled();
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "公開URLをアイテムに保存しました: https://example.com/file.pdf",
      );
    });

    test("添付ファイル以外のアイテムの場合エラーを投げる", async () => {
      mockItem.isAttachment.mockReturnValue(false);

      await expect(
        R2Utils.savePublicUrlToItem(mockItem, "https://example.com/file.pdf"),
      ).rejects.toThrow(
        "添付ファイル以外のアイテムには公開URLを保存できません",
      );

      expect(mockItem.setField).not.toHaveBeenCalled();
      expect(mockItem.save).not.toHaveBeenCalled();
    });

    test("保存に失敗した場合エラーを投げる", async () => {
      mockItem.isAttachment.mockReturnValue(true);
      mockItem.save.mockRejectedValue(new Error("Save failed"));

      await expect(
        R2Utils.savePublicUrlToItem(mockItem, "https://example.com/file.pdf"),
      ).rejects.toThrow("公開URLの保存に失敗しました: Save failed");

      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "公開URLの保存に失敗: Error: Save failed",
      );
    });
  });

  describe("extractS3KeyFromR2Url", () => {
    beforeEach(() => {
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockReturnValue({
        bucketName: "test-bucket",
      });
    });

    test("R2開発URLからS3キーを抽出する", () => {
      const url = "https://pub-accountid.r2.dev/path/to/file.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("path/to/file.pdf");
    });

    test("カスタムドメインのR2開発URLからS3キーを抽出する", () => {
      const url = "https://custom-domain.r2.dev/folder/document.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("folder/document.pdf");
    });

    test("R2標準URLからS3キーを抽出する（バケット名を除去）", () => {
      const url =
        "https://accountid.r2.cloudflarestorage.com/bucket-name/path/to/file.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("path/to/file.pdf");
    });

    test("カスタムドメインURLからS3キーを抽出する", () => {
      const url = "https://custom-domain.com/path/to/file.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("path/to/file.pdf");
    });

    test("カスタムドメインURLでバケット名プレフィックスを除去する", () => {
      const url = "https://custom-domain.com/test-bucket/path/to/file.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("path/to/file.pdf");
    });

    test("URLエンコードされたS3キーを正しくデコードする", () => {
      const url =
        "https://pub-accountid.r2.dev/folder%20with%20spaces/file%20name.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("folder with spaces/file name.pdf");
    });

    test("空のURLの場合nullを返す", () => {
      const result = R2Utils.extractS3KeyFromR2Url("");
      expect(result).toBeNull();
    });

    test("無効なURLの場合nullを返す", () => {
      const result = R2Utils.extractS3KeyFromR2Url("invalid-url");
      expect(result).toBeNull();
    });

    test("パスが存在しないURLの場合nullを返す", () => {
      const url = "https://pub-accountid.r2.dev/";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBeNull();
    });

    test("R2標準URLでバケット名のみの場合nullを返す", () => {
      const url = "https://accountid.r2.cloudflarestorage.com/bucket-name/";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBeNull();
    });

    test("デコードに失敗した場合元の値を返す", () => {
      // 無効なURLエンコーディングをテスト
      const url = "https://pub-accountid.r2.dev/invalid%encoding";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("invalid%encoding");
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "R2 S3キーのデコードに失敗、元の値を使用:",
        "invalid%encoding",
      );
    });

    test("設定情報の取得に失敗した場合の処理", () => {
      (S3AuthManager.getCompleteCredentials as jest.Mock).mockImplementation(
        () => {
          throw new Error("Auth error");
        },
      );

      const url = "https://custom-domain.com/test-bucket/path/to/file.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("test-bucket/path/to/file.pdf");
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "設定情報の取得に失敗、バケット名除去をスキップ:",
        expect.any(Error),
      );
    });
  });
});
