/**
 * S3キー抽出機能のテスト
 * fallback URLからのバケット名除去を含む
 */

import { extractS3KeyFromUrl } from "../../modules/s3Types";
import { R2Utils } from "../../modules/r2/r2Utils";
import { S3AuthManager } from "../../modules/s3AuthManager";

// Mock ztoolkit
(global as any).ztoolkit = {
  log: jest.fn(),
};

// Mock S3AuthManager
jest.mock("../../modules/s3AuthManager", () => ({
  S3AuthManager: {
    getCompleteCredentials: jest.fn(),
  },
}));

// Type assertion for the mocked module
const mockedS3AuthManager = S3AuthManager as jest.Mocked<typeof S3AuthManager>;

describe("S3キー抽出機能", () => {
  describe("extractS3KeyFromUrl", () => {
    test("R2開発URL: pub-{accountId}.r2.dev形式", () => {
      const url = "https://pub-12345abcdef.r2.dev/123-test-file.pdf";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBe("123-test-file.pdf");
    });

    test("R2標準URL: {accountId}.r2.cloudflarestorage.com形式（バケット名除去）", () => {
      const url =
        "https://12345abcdef.r2.cloudflarestorage.com/my-bucket/123-test-file.pdf";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBe("123-test-file.pdf");
    });

    test("AWS S3バケットサブドメイン形式", () => {
      const url = "https://my-bucket.s3.amazonaws.com/123-test-file.pdf";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBe("123-test-file.pdf");
    });

    test("AWS S3パススタイル形式（バケット名除去）", () => {
      const url = "https://s3.amazonaws.com/my-bucket/123-test-file.pdf";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBe("123-test-file.pdf");
    });

    test("カスタムドメイン形式", () => {
      const url = "https://files.example.com/123-test-file.pdf";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBe("123-test-file.pdf");
    });

    test("複雑なS3キー（フォルダ構造）", () => {
      const url =
        "https://pub-12345abcdef.r2.dev/folder/subfolder/123-test-file.pdf";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBe("folder/subfolder/123-test-file.pdf");
    });

    test("URLエンコードされたS3キー", () => {
      const url =
        "https://pub-12345abcdef.r2.dev/123-test%20file%20with%20spaces.pdf";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBe("123-test file with spaces.pdf");
    });

    test("無効なURL", () => {
      const url = "invalid-url";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBeNull();
    });

    test("パスが空のURL", () => {
      const url = "https://pub-12345abcdef.r2.dev/";
      const result = extractS3KeyFromUrl(url);
      expect(result).toBeNull();
    });
  });

  describe("R2Utils.extractS3KeyFromR2Url", () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // S3AuthManagerのモックを設定
      mockedS3AuthManager.getCompleteCredentials.mockReturnValue({
        bucketName: "my-bucket",
        provider: "r2",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        region: "auto",
        endpoint: "https://test.r2.cloudflarestorage.com",
      });
    });

    test("R2開発URL", () => {
      const url = "https://pub-12345abcdef.r2.dev/123-test-file.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("123-test-file.pdf");
    });

    test("R2標準URL（バケット名除去）", () => {
      const url =
        "https://12345abcdef.r2.cloudflarestorage.com/my-bucket/123-test-file.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("123-test-file.pdf");
    });

    test("カスタムドメインURL（バケット名がパスに含まれる場合）", () => {
      const url = "https://files.example.com/my-bucket/123-test-file.pdf";

      // S3AuthManagerのモックを設定
      // モックは既にセットアップ済み

      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("123-test-file.pdf");
    });

    test("カスタムドメインURL（バケット名がパスに含まれない場合）", () => {
      const url = "https://files.example.com/123-test-file.pdf";
      const result = R2Utils.extractS3KeyFromR2Url(url);
      expect(result).toBe("123-test-file.pdf");
    });
  });

  describe("バグ修正の検証: fallback URLからのバケット名除去", () => {
    test("以前のバグ: バケット名が含まれていた場合", () => {
      const url =
        "https://12345abcdef.r2.cloudflarestorage.com/my-bucket/123-test-file.pdf";
      const result = extractS3KeyFromUrl(url);

      // バグ修正前: "my-bucket/123-test-file.pdf" が返される（誤り）
      // バグ修正後: "123-test-file.pdf" が返される（正しい）
      expect(result).toBe("123-test-file.pdf");
      expect(result).not.toBe("my-bucket/123-test-file.pdf");
    });

    test("複数レベルのフォルダ構造でもバケット名のみ除去", () => {
      const url =
        "https://12345abcdef.r2.cloudflarestorage.com/my-bucket/folder/subfolder/123-test-file.pdf";
      const result = extractS3KeyFromUrl(url);

      expect(result).toBe("folder/subfolder/123-test-file.pdf");
      expect(result).not.toBe("my-bucket/folder/subfolder/123-test-file.pdf");
    });
  });
});
