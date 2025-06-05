import { S3MetadataManager } from "../../modules/s3MetadataManager";
import { S3CustomMetadata } from "../../modules/s3Types";

describe("S3MetadataManager", () => {
  describe("encodeForHeader and decodeFromHeader", () => {
    test("should encode and decode ASCII strings correctly", () => {
      const testString = "test-file.pdf";
      const result = S3MetadataManager.testFileNameEncoding(testString);

      expect(result.original).toBe(testString);
      expect(result.decoded).toBe(testString);
      expect(result.isValid).toBe(true);
    });

    test("should encode and decode Unicode strings correctly", () => {
      const testString = "テスト文書.pdf";
      const result = S3MetadataManager.testFileNameEncoding(testString);

      expect(result.original).toBe(testString);
      expect(result.decoded).toBe(testString);
      expect(result.isValid).toBe(true);
    });

    test("should handle special characters", () => {
      const testString = "file-with-émojí-🎯.pdf";
      const result = S3MetadataManager.testFileNameEncoding(testString);

      expect(result.original).toBe(testString);
      expect(result.decoded).toBe(testString);
      expect(result.isValid).toBe(true);
    });

    test("should handle empty string", () => {
      const testString = "";
      const result = S3MetadataManager.testFileNameEncoding(testString);

      expect(result.original).toBe(testString);
      expect(result.decoded).toBe(testString);
      expect(result.isValid).toBe(true);
    });
  });

  describe("createCustomMetadata", () => {
    test("should create valid metadata with all required fields", () => {
      const filePath = "/path/to/test-file.pdf";
      const fileSize = 1024;
      const md5Hash = "d41d8cd98f00b204e9800998ecf8427e";

      const metadata = S3MetadataManager.createCustomMetadata(
        filePath,
        fileSize,
        md5Hash,
      );

      expect(metadata.md5hash).toBe(md5Hash);
      expect(metadata.filesize).toBe(fileSize.toString());
      expect(metadata.uploaddate).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      ); // ISO string format
      expect(metadata.originalfilename).toBeDefined();
    });

    test("should handle unknown filename", () => {
      const filePath = "";
      const fileSize = 0;
      const md5Hash = "test-hash";

      const metadata = S3MetadataManager.createCustomMetadata(
        filePath,
        fileSize,
        md5Hash,
      );

      expect(metadata.md5hash).toBe(md5Hash);
      expect(metadata.filesize).toBe("0");
      expect(S3MetadataManager.getOriginalFileName(metadata)).toBe("unknown");
    });
  });

  describe("getMD5Hash", () => {
    test("should return MD5 hash from metadata", () => {
      const metadata: S3CustomMetadata = {
        md5hash: "test-hash-123",
        originalfilename: "test.pdf",
        uploaddate: "2023-01-01T00:00:00.000Z",
        filesize: "1024",
      };

      expect(S3MetadataManager.getMD5Hash(metadata)).toBe("test-hash-123");
    });

    test("should return undefined for undefined metadata", () => {
      expect(S3MetadataManager.getMD5Hash(undefined)).toBeUndefined();
    });

    test("should handle legacy md5Hash field name", () => {
      const metadata: any = {
        md5Hash: "legacy-hash",
        originalfilename: "test.pdf",
        uploaddate: "2023-01-01T00:00:00.000Z",
        filesize: "1024",
      };

      expect(S3MetadataManager.getMD5Hash(metadata)).toBe("legacy-hash");
    });
  });

  describe("getOriginalFileName", () => {
    test("should decode filename from metadata", () => {
      const filename = "テスト文書.pdf";
      const metadata = S3MetadataManager.createCustomMetadata(
        `/path/to/${filename}`,
        1024,
        "hash",
      );

      expect(S3MetadataManager.getOriginalFileName(metadata)).toBe(filename);
    });

    test("should return undefined for undefined metadata", () => {
      expect(S3MetadataManager.getOriginalFileName(undefined)).toBeUndefined();
    });

    test("should return undefined when filename field is missing", () => {
      const metadata: any = {
        md5hash: "test-hash",
        uploaddate: "2023-01-01T00:00:00.000Z",
        filesize: "1024",
      };

      expect(S3MetadataManager.getOriginalFileName(metadata)).toBeUndefined();
    });
  });

  describe("getUploadDate", () => {
    test("should return upload date from metadata", () => {
      const uploadDate = "2023-01-01T00:00:00.000Z";
      const metadata: S3CustomMetadata = {
        md5hash: "test-hash",
        originalfilename: "test.pdf",
        uploaddate: uploadDate,
        filesize: "1024",
      };

      expect(S3MetadataManager.getUploadDate(metadata)).toBe(uploadDate);
    });

    test("should return undefined for undefined metadata", () => {
      expect(S3MetadataManager.getUploadDate(undefined)).toBeUndefined();
    });
  });

  describe("getFileSize", () => {
    test("should return file size from metadata", () => {
      const metadata: S3CustomMetadata = {
        md5hash: "test-hash",
        originalfilename: "test.pdf",
        uploaddate: "2023-01-01T00:00:00.000Z",
        filesize: "2048",
      };

      expect(S3MetadataManager.getFileSize(metadata)).toBe("2048");
    });

    test("should return undefined for undefined metadata", () => {
      expect(S3MetadataManager.getFileSize(undefined)).toBeUndefined();
    });
  });

  describe("isValidMetadata", () => {
    test("should return true for valid metadata", () => {
      const metadata: S3CustomMetadata = {
        md5hash: "test-hash",
        originalfilename: "dGVzdC5wZGY=", // base64 for "test.pdf"
        uploaddate: "2023-01-01T00:00:00.000Z",
        filesize: "1024",
      };

      expect(S3MetadataManager.isValidMetadata(metadata)).toBe(true);
    });

    test("should return false for metadata with missing fields", () => {
      const metadata: any = {
        md5hash: "test-hash",
        originalfilename: "test.pdf",
      };

      expect(S3MetadataManager.isValidMetadata(metadata)).toBe(false);
    });

    test("should return false for undefined metadata", () => {
      expect(S3MetadataManager.isValidMetadata(undefined)).toBe(false);
    });

    test("should return false for empty metadata", () => {
      expect(S3MetadataManager.isValidMetadata({} as S3CustomMetadata)).toBe(
        false,
      );
    });
  });

  describe("toString", () => {
    test("should format metadata as string", () => {
      const metadata = S3MetadataManager.createCustomMetadata(
        "/path/to/test.pdf",
        1024,
        "hash123",
      );
      const result = S3MetadataManager.toString(metadata);

      expect(result).toContain("test.pdf");
      expect(result).toContain("1024バイト");
      expect(result).toContain("hash123");
    });

    test("should return 'No metadata' for undefined input", () => {
      expect(S3MetadataManager.toString(undefined)).toBe("No metadata");
    });
  });

  describe("areEqual", () => {
    test("should return true for identical metadata", () => {
      const metadata1 = S3MetadataManager.createCustomMetadata(
        "/path/to/test.pdf",
        1024,
        "hash123",
      );
      const metadata2 = S3MetadataManager.createCustomMetadata(
        "/path/to/other.pdf",
        1024,
        "hash123",
      );

      expect(S3MetadataManager.areEqual(metadata1, metadata2)).toBe(true);
    });

    test("should return false for different MD5 hashes", () => {
      const metadata1 = S3MetadataManager.createCustomMetadata(
        "/path/to/test.pdf",
        1024,
        "hash123",
      );
      const metadata2 = S3MetadataManager.createCustomMetadata(
        "/path/to/test.pdf",
        1024,
        "hash456",
      );

      expect(S3MetadataManager.areEqual(metadata1, metadata2)).toBe(false);
    });

    test("should return false for different file sizes", () => {
      const metadata1 = S3MetadataManager.createCustomMetadata(
        "/path/to/test.pdf",
        1024,
        "hash123",
      );
      const metadata2 = S3MetadataManager.createCustomMetadata(
        "/path/to/test.pdf",
        2048,
        "hash123",
      );

      expect(S3MetadataManager.areEqual(metadata1, metadata2)).toBe(false);
    });

    test("should return true for both undefined", () => {
      expect(S3MetadataManager.areEqual(undefined, undefined)).toBe(true);
    });

    test("should return false when one is undefined", () => {
      const metadata = S3MetadataManager.createCustomMetadata(
        "/path/to/test.pdf",
        1024,
        "hash123",
      );

      expect(S3MetadataManager.areEqual(metadata, undefined)).toBe(false);
      expect(S3MetadataManager.areEqual(undefined, metadata)).toBe(false);
    });
  });

  describe("testFileNameEncoding", () => {
    test("should validate encoding/decoding process", () => {
      const testCases = [
        "simple.pdf",
        "テスト文書.pdf",
        "file with spaces.doc",
        "émojí-🎯.txt",
        "file-with-special-chars!@#$%^&*().pdf",
      ];

      testCases.forEach((fileName) => {
        const result = S3MetadataManager.testFileNameEncoding(fileName);
        expect(result.isValid).toBe(true);
        expect(result.original).toBe(fileName);
        expect(result.decoded).toBe(fileName);
      });
    });
  });
});
