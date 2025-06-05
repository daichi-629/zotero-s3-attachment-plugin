import {
  S3Error,
  getFileName,
  generateS3Key,
  extractFileNameFromS3Key,
  encodeS3KeyForUrl,
  decodeS3KeyFromUrl,
  guessContentType,
  parseIgnoreContentTypes,
  shouldIgnoreFile,
  sanitizeFileName,
  validateFilePath,
  generateSafeFileName,
  S3MetadataHelper,
} from "../../modules/s3Types";

// グローバル変数のモック

describe("S3Types - Utility Functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("S3Error", () => {
    it("エラーメッセージでS3Errorを作成する", () => {
      const error = new S3Error("テストエラー");
      expect(error.message).toBe("テストエラー");
      expect(error.name).toBe("S3Error");
      expect(error.code).toBeUndefined();
      expect(error.statusCode).toBeUndefined();
    });

    it("エラーコードとステータスコード付きでS3Errorを作成する", () => {
      const error = new S3Error("テストエラー", "TEST_ERROR", 404);
      expect(error.message).toBe("テストエラー");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.statusCode).toBe(404);
    });
  });

  describe("getFileName", () => {
    it("Windowsパスからファイル名を取得する", () => {
      expect(getFileName("C:\\Users\\test\\file.pdf")).toBe("file.pdf");
    });

    it("Unixパスからファイル名を取得する", () => {
      expect(getFileName("/home/user/file.pdf")).toBe("file.pdf");
    });

    it("混在するパス区切り文字からファイル名を取得する", () => {
      expect(getFileName("C:/Users\\test/file.pdf")).toBe("file.pdf");
    });

    it("ファイル名のみの場合はそのまま返す", () => {
      expect(getFileName("file.pdf")).toBe("file.pdf");
    });
  });

  describe("generateS3Key", () => {
    beforeEach(() => {
      // 固定の日付をモック
      jest
        .spyOn(Date.prototype, "toISOString")
        .mockReturnValue("2023-01-01T00:00:00.000Z");
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("S3キーを正常に生成する", () => {
      const result = generateS3Key(12345, "test.pdf");
      expect(result).toBe("zotero-attachments/2023-01-01/12345-test.pdf");
    });

    it("日本語ファイル名でもS3キーを生成する", () => {
      const result = generateS3Key(67890, "テスト.pdf");
      expect(result).toBe("zotero-attachments/2023-01-01/67890-テスト.pdf");
    });

    it("コレクション階層を使用してS3キーを生成する", () => {
      // Zotero APIのモック
      const mockItem = {
        isAttachment: () => false,
        getCollections: () => [123],
      };
      const mockCollection = {
        name: "研究論文",
        parentID: 456,
      };
      const mockParentCollection = {
        name: "学術資料",
        parentID: null,
      };

      (global as any).Zotero = {
        Items: {
          get: jest.fn().mockReturnValue(mockItem),
        },
        Collections: {
          get: jest
            .fn()
            .mockReturnValueOnce(mockCollection)
            .mockReturnValueOnce(mockParentCollection),
        },
      };

      const result = generateS3Key(12345, "論文.pdf", true);
      expect(result).toBe(
        "zotero-attachments/学術資料/研究論文/12345-論文.pdf",
      );
    });

    it("コレクションに所属していないアイテムの場合uncategorizedを使用する", () => {
      // Zotero APIのモック
      const mockItem = {
        isAttachment: () => false,
        getCollections: () => [],
      };

      (global as any).Zotero = {
        Items: {
          get: jest.fn().mockReturnValue(mockItem),
        },
      };

      const result = generateS3Key(12345, "ファイル.pdf", true);
      expect(result).toBe(
        "zotero-attachments/uncategorized/12345-ファイル.pdf",
      );
    });
  });

  describe("extractFileNameFromS3Key", () => {
    it("S3キーからファイル名を抽出する", () => {
      const s3Key = "zotero-attachments/2023-01-01/12345-test.pdf";
      expect(extractFileNameFromS3Key(s3Key)).toBe("test.pdf");
    });

    it("IDプレフィックスがない場合は最後の部分を返す", () => {
      const s3Key = "folder/subfolder/file.pdf";
      expect(extractFileNameFromS3Key(s3Key)).toBe("file.pdf");
    });

    it("日本語ファイル名を正しく抽出する", () => {
      const s3Key = "zotero-attachments/2023-01-01/12345-テスト.pdf";
      expect(extractFileNameFromS3Key(s3Key)).toBe("テスト.pdf");
    });
  });

  describe("encodeS3KeyForUrl", () => {
    it("S3キーをURL用にエンコードする", () => {
      const s3Key = "folder/file with spaces.pdf";
      const encoded = encodeS3KeyForUrl(s3Key);
      expect(encoded).toBe("folder/file%20with%20spaces.pdf");
    });

    it("日本語を含むS3キーをエンコードする", () => {
      const s3Key = "folder/テストファイル.pdf";
      const encoded = encodeS3KeyForUrl(s3Key);
      expect(encoded).toBe(
        "folder/%E3%83%86%E3%82%B9%E3%83%88%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB.pdf",
      );
    });
  });

  describe("decodeS3KeyFromUrl", () => {
    it("エンコードされたS3キーをデコードする", () => {
      const encoded = "folder/file%20with%20spaces.pdf";
      const decoded = decodeS3KeyFromUrl(encoded);
      expect(decoded).toBe("folder/file with spaces.pdf");
    });

    it("デコードに失敗した場合は元の文字列を返す", () => {
      const invalid = "folder/%%invalid%%";
      const result = decodeS3KeyFromUrl(invalid);
      expect(result).toBe(invalid);
    });
  });

  describe("guessContentType", () => {
    it("PDFファイルの場合はapplication/pdfを返す", () => {
      expect(guessContentType("document.pdf")).toBe("application/pdf");
    });

    it("JPEGファイルの場合はimage/jpegを返す", () => {
      expect(guessContentType("image.jpg")).toBe("image/jpeg");
      expect(guessContentType("image.jpeg")).toBe("image/jpeg");
    });

    it("不明な拡張子の場合はapplication/octet-streamを返す", () => {
      expect(guessContentType("file.unknown")).toBe("application/octet-stream");
    });

    it("拡張子がない場合はapplication/octet-streamを返す", () => {
      expect(guessContentType("file")).toBe("application/octet-stream");
    });

    it("パス付きファイルでも正しくコンテンツタイプを判定する", () => {
      expect(guessContentType("/path/to/document.pdf")).toBe("application/pdf");
    });
  });

  describe("parseIgnoreContentTypes", () => {
    it("改行区切りの文字列を配列に変換する", () => {
      const input = "application/pdf\nimage/jpeg\ntext/plain";
      const result = parseIgnoreContentTypes(input);
      expect(result).toEqual(["application/pdf", "image/jpeg", "text/plain"]);
    });

    it("空行やスペースのみの行を除去する", () => {
      const input = "application/pdf\n\n  \nimage/jpeg\n   ";
      const result = parseIgnoreContentTypes(input);
      expect(result).toEqual(["application/pdf", "image/jpeg"]);
    });

    it("空文字列の場合は空配列を返す", () => {
      expect(parseIgnoreContentTypes("")).toEqual([]);
      expect(parseIgnoreContentTypes("   ")).toEqual([]);
    });

    it("大文字小文字を統一する", () => {
      const input = "APPLICATION/PDF\nImage/JPEG";
      const result = parseIgnoreContentTypes(input);
      expect(result).toEqual(["application/pdf", "image/jpeg"]);
    });
  });

  describe("shouldIgnoreFile", () => {
    it("除外対象のコンテンツタイプの場合はtrueを返す", () => {
      const ignoreTypes = ["application/pdf", "image/jpeg"];
      expect(shouldIgnoreFile("document.pdf", ignoreTypes)).toBe(true);
      expect(shouldIgnoreFile("image.jpg", ignoreTypes)).toBe(true);
    });

    it("除外対象外のコンテンツタイプの場合はfalseを返す", () => {
      const ignoreTypes = ["application/pdf"];
      expect(shouldIgnoreFile("document.txt", ignoreTypes)).toBe(false);
    });

    it("除外リストが空の場合はfalseを返す", () => {
      expect(shouldIgnoreFile("document.pdf", [])).toBe(false);
    });
  });

  describe("sanitizeFileName", () => {
    it("無効な文字をアンダースコアに置換する", () => {
      expect(sanitizeFileName('file<>:"/\\|?*.pdf')).toBe("file_.pdf");
    });

    it("連続するアンダースコアを単一にする", () => {
      expect(sanitizeFileName("file___name.pdf")).toBe("file_name.pdf");
    });

    it("先頭と末尾のピリオドとスペースを除去する", () => {
      expect(sanitizeFileName("  .filename.  ")).toBe("filename");
    });

    it("Windowsの予約語にプレフィックスを追加する", () => {
      expect(sanitizeFileName("CON")).toBe("_CON");
      expect(sanitizeFileName("PRN")).toBe("_PRN");
    });

    it("空文字列の場合はuntitledを返す", () => {
      expect(sanitizeFileName("")).toBe("untitled");
      expect(sanitizeFileName("   ")).toBe("untitled");
    });

    it("長いファイル名を200文字に制限する", () => {
      const longName = "a".repeat(250) + ".pdf";
      const result = sanitizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result.endsWith(".pdf")).toBe(true);
    });
  });

  describe("validateFilePath", () => {
    it("有効なWindowsパスの場合はtrueを返す", () => {
      expect(validateFilePath("C:\\Users\\test\\file.pdf")).toBe(true);
    });

    it("有効なUnixパスの場合はtrueを返す", () => {
      expect(validateFilePath("/home/user/file.pdf")).toBe(true);
    });

    it("空文字列の場合はfalseを返す", () => {
      expect(validateFilePath("")).toBe(false);
      expect(validateFilePath("   ")).toBe(false);
    });

    it("無効な文字を含む場合はfalseを返す", () => {
      expect(validateFilePath("/path/file<>.pdf")).toBe(false);
    });

    it("長すぎるパスの場合はfalseを返す", () => {
      const longPath = "/path/" + "a".repeat(300);
      expect(validateFilePath(longPath)).toBe(false);
    });
  });

  describe("generateSafeFileName", () => {
    it("S3キーから安全なファイル名を生成する", () => {
      const s3Key = "folder/12345-test.pdf";
      expect(generateSafeFileName(s3Key)).toBe("test.pdf");
    });

    it("無効な文字を含むファイル名をサニタイズする", () => {
      const s3Key = "folder/12345-test<>:.pdf";
      expect(generateSafeFileName(s3Key)).toBe("test_.pdf");
    });

    it("フォールバック名を使用する場合", () => {
      // extractFileNameFromS3Keyで空文字列を返すケース
      const s3Key = "folder/"; // 末尾がスラッシュで終わる
      const result = generateSafeFileName(s3Key, "fallback.pdf");
      // サニタイズされた結果が"untitled"の場合はフォールバックを使用
      expect(result).toBe("fallback.pdf");
    });

    it("エラーの場合はタイムスタンプ付きファイル名を返す", () => {
      const result = generateSafeFileName("");
      expect(result).toMatch(
        /^download_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.pdf$/,
      );
    });
  });

  describe("S3MetadataHelper", () => {
    const mockMetadata = {
      originalfilename: "test.pdf",
      uploaddate: "2023-01-01T00:00:00.000Z",
      md5hash: "abc123",
      filesize: "1024",
    };

    it("MD5ハッシュを正しく取得する", () => {
      expect(S3MetadataHelper.getMD5Hash(mockMetadata)).toBe("abc123");
      expect(S3MetadataHelper.getMD5Hash(undefined)).toBeUndefined();
    });

    it("元のファイル名を正しく取得する", () => {
      expect(S3MetadataHelper.getOriginalFileName(mockMetadata)).toBe(
        "test.pdf",
      );
      expect(S3MetadataHelper.getOriginalFileName(undefined)).toBeUndefined();
    });

    it("アップロード日時を正しく取得する", () => {
      expect(S3MetadataHelper.getUploadDate(mockMetadata)).toBe(
        "2023-01-01T00:00:00.000Z",
      );
      expect(S3MetadataHelper.getUploadDate(undefined)).toBeUndefined();
    });

    it("ファイルサイズを正しく取得する", () => {
      expect(S3MetadataHelper.getFileSize(mockMetadata)).toBe("1024");
      expect(S3MetadataHelper.getFileSize(undefined)).toBeUndefined();
    });
  });
});
