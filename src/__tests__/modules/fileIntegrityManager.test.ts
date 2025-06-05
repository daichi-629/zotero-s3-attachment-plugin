import { FileIntegrityManager } from "../../modules/fileIntegrityManager";
import { S3Error } from "../../modules/s3Types";

// IOUtilsのモック
const mockIOUtils = {
  read: jest.fn(),
  exists: jest.fn(),
  stat: jest.fn(),
};
(global as any).IOUtils = mockIOUtils;

// debugNotifyのモック
const mockDebugNotify = jest.fn();
(global as any).debugNotify = mockDebugNotify;

// js-md5のモック
jest.mock("js-md5", () => ({
  md5: jest.fn(),
}));

import { md5 } from "js-md5";
const mockMd5 = md5 as jest.MockedFunction<typeof md5>;

describe("FileIntegrityManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("calculateMD5FromFile", () => {
    it("ファイルのMD5ハッシュを正常に計算する", async () => {
      const mockFileData = new Uint8Array([1, 2, 3, 4, 5]);
      const expectedHash = "7cfdd07889b3295d6a550914ab35e068";

      mockIOUtils.read.mockResolvedValue(mockFileData);
      mockMd5.mockReturnValue(expectedHash);

      const result =
        await FileIntegrityManager.calculateMD5FromFile("/test/file.pdf");

      expect(mockIOUtils.read).toHaveBeenCalledWith("/test/file.pdf");
      expect(mockMd5).toHaveBeenCalledWith(mockFileData);
      expect(result).toBe(expectedHash);
    });

    it("ファイル読み込みに失敗した場合はS3Errorをスローする", async () => {
      const readError = new Error("ファイルが見つかりません");
      mockIOUtils.read.mockRejectedValue(readError);

      await expect(
        FileIntegrityManager.calculateMD5FromFile("/nonexistent/file.pdf"),
      ).rejects.toThrow(S3Error);
    });

    it("MD5計算に失敗した場合はS3Errorをスローする", async () => {
      const mockFileData = new Uint8Array([1, 2, 3]);
      mockIOUtils.read.mockResolvedValue(mockFileData);
      mockMd5.mockImplementation(() => {
        throw new Error("MD5計算エラー");
      });

      await expect(
        FileIntegrityManager.calculateMD5FromFile("/test/file.pdf"),
      ).rejects.toThrow(S3Error);
    });
  });

  describe("calculateMD5FromBytes", () => {
    it("バイト配列のMD5ハッシュを正常に計算する", async () => {
      const testData = new Uint8Array([10, 20, 30, 40]);
      const expectedHash = "d85b1213473c2fd7c2045020a6b9c62b";

      mockMd5.mockReturnValue(expectedHash);

      const result = await FileIntegrityManager.calculateMD5FromBytes(testData);

      expect(mockMd5).toHaveBeenCalledWith(testData);
      expect(result).toBe(expectedHash);
    });

    it("空のバイト配列でもMD5ハッシュを計算する", async () => {
      const emptyData = new Uint8Array([]);
      const expectedHash = "d41d8cd98f00b204e9800998ecf8427e";

      mockMd5.mockReturnValue(expectedHash);

      const result =
        await FileIntegrityManager.calculateMD5FromBytes(emptyData);

      expect(mockMd5).toHaveBeenCalledWith(emptyData);
      expect(result).toBe(expectedHash);
    });

    it("MD5計算に失敗した場合はS3Errorをスローする", async () => {
      const testData = new Uint8Array([1, 2, 3]);
      mockMd5.mockImplementation(() => {
        throw new Error("MD5計算エラー");
      });

      await expect(
        FileIntegrityManager.calculateMD5FromBytes(testData),
      ).rejects.toThrow(S3Error);
    });
  });

  describe("verifyFileIntegrity", () => {
    it("ファイルが存在し、期待されるMD5ハッシュと一致する場合", async () => {
      const filePath = "/test/document.pdf";
      const expectedMD5 = "abc123def456";
      const mockFileData = new Uint8Array([1, 2, 3, 4, 5]);
      const mockFileInfo = { size: 1024 };

      mockIOUtils.exists.mockResolvedValue(true);
      mockIOUtils.stat.mockResolvedValue(mockFileInfo);
      mockIOUtils.read.mockResolvedValue(mockFileData);
      mockMd5.mockReturnValue(expectedMD5);

      const result = await FileIntegrityManager.verifyFileIntegrity(
        filePath,
        expectedMD5,
      );

      expect(result).toEqual({
        md5Hash: expectedMD5,
        size: 1024,
        isValid: true,
      });
      expect(mockIOUtils.exists).toHaveBeenCalledWith(filePath);
      expect(mockIOUtils.stat).toHaveBeenCalledWith(filePath);
      expect(mockIOUtils.read).toHaveBeenCalledWith(filePath);
    });

    it("ファイルが存在し、期待されるMD5ハッシュと一致しない場合", async () => {
      const filePath = "/test/document.pdf";
      const expectedMD5 = "abc123def456";
      const actualMD5 = "different123hash";
      const mockFileData = new Uint8Array([1, 2, 3, 4, 5]);
      const mockFileInfo = { size: 2048 };

      mockIOUtils.exists.mockResolvedValue(true);
      mockIOUtils.stat.mockResolvedValue(mockFileInfo);
      mockIOUtils.read.mockResolvedValue(mockFileData);
      mockMd5.mockReturnValue(actualMD5);

      const result = await FileIntegrityManager.verifyFileIntegrity(
        filePath,
        expectedMD5,
      );

      expect(result).toEqual({
        md5Hash: actualMD5,
        size: 2048,
        isValid: false,
      });
    });

    it("期待されるMD5ハッシュが指定されていない場合はisValidをtrueにする", async () => {
      const filePath = "/test/document.pdf";
      const actualMD5 = "computed123hash";
      const mockFileData = new Uint8Array([5, 4, 3, 2, 1]);
      const mockFileInfo = { size: 512 };

      mockIOUtils.exists.mockResolvedValue(true);
      mockIOUtils.stat.mockResolvedValue(mockFileInfo);
      mockIOUtils.read.mockResolvedValue(mockFileData);
      mockMd5.mockReturnValue(actualMD5);

      const result = await FileIntegrityManager.verifyFileIntegrity(filePath);

      expect(result).toEqual({
        md5Hash: actualMD5,
        size: 512,
        isValid: true,
      });
    });

    it("ファイルが存在しない場合は無効な結果を返す", async () => {
      const filePath = "/nonexistent/file.pdf";

      mockIOUtils.exists.mockResolvedValue(false);

      const result = await FileIntegrityManager.verifyFileIntegrity(filePath);

      expect(result).toEqual({
        md5Hash: "",
        size: 0,
        isValid: false,
      });
      expect(mockIOUtils.exists).toHaveBeenCalledWith(filePath);
      expect(mockIOUtils.stat).not.toHaveBeenCalled();
      expect(mockIOUtils.read).not.toHaveBeenCalled();
    });

    it("ファイル情報のサイズがundefinedの場合は0を使用する", async () => {
      const filePath = "/test/document.pdf";
      const actualMD5 = "test123hash";
      const mockFileData = new Uint8Array([1, 2, 3]);
      const mockFileInfo = { size: undefined };

      mockIOUtils.exists.mockResolvedValue(true);
      mockIOUtils.stat.mockResolvedValue(mockFileInfo);
      mockIOUtils.read.mockResolvedValue(mockFileData);
      mockMd5.mockReturnValue(actualMD5);

      const result = await FileIntegrityManager.verifyFileIntegrity(filePath);

      expect(result).toEqual({
        md5Hash: actualMD5,
        size: 0,
        isValid: true,
      });
    });

    it("ファイル操作でエラーが発生した場合は無効な結果を返す", async () => {
      const filePath = "/test/error.pdf";

      mockIOUtils.exists.mockResolvedValue(true);
      mockIOUtils.stat.mockRejectedValue(new Error("ファイル情報取得エラー"));

      const result = await FileIntegrityManager.verifyFileIntegrity(filePath);

      expect(result).toEqual({
        md5Hash: "",
        size: 0,
        isValid: false,
      });
    });

    it("MD5計算でエラーが発生した場合は無効な結果を返す", async () => {
      const filePath = "/test/document.pdf";
      const mockFileInfo = { size: 1024 };

      mockIOUtils.exists.mockResolvedValue(true);
      mockIOUtils.stat.mockResolvedValue(mockFileInfo);
      mockIOUtils.read.mockRejectedValue(new Error("ファイル読み込みエラー"));

      const result = await FileIntegrityManager.verifyFileIntegrity(filePath);

      expect(result).toEqual({
        md5Hash: "",
        size: 0,
        isValid: false,
      });
    });

    it("複数のファイルで連続して整合性検証を実行する", async () => {
      const files = [
        { path: "/test/file1.pdf", hash: "hash1", size: 100 },
        { path: "/test/file2.pdf", hash: "hash2", size: 200 },
        { path: "/test/file3.pdf", hash: "hash3", size: 300 },
      ];

      mockIOUtils.exists.mockResolvedValue(true);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        mockIOUtils.stat.mockResolvedValueOnce({ size: file.size });
        mockIOUtils.read.mockResolvedValueOnce(new Uint8Array([i + 1]));
        mockMd5.mockReturnValueOnce(file.hash);
      }

      const results = await Promise.all(
        files.map((file) =>
          FileIntegrityManager.verifyFileIntegrity(file.path, file.hash),
        ),
      );

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result).toEqual({
          md5Hash: files[index].hash,
          size: files[index].size,
          isValid: true,
        });
      });
    });
  });
});
