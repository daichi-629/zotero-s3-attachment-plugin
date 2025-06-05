import { md5 } from "js-md5";
import { S3Error, FileIntegrity } from "./s3Types";

/**
 * ファイル整合性管理クラス
 * MD5ハッシュ計算、整合性検証、重複ファイル検出などを担当
 */
export class FileIntegrityManager {
  /**
   * ファイルのMD5ハッシュを計算
   * @param filePath ファイルパス
   * @returns MD5ハッシュ（16進数文字列）
   * @throws S3Error 計算失敗時
   */
  static async calculateMD5FromFile(filePath: string): Promise<string> {
    try {
      const fileData = await IOUtils.read(filePath);
      return md5(fileData);
    } catch (error) {
      ztoolkit.log(
        `MD5計算に失敗: ${String(error)}`,
        "error",
        "calculateMD5FromFile",
      );
      throw new S3Error("ファイルのMD5ハッシュ計算に失敗しました");
    }
  }

  /**
   * バイト配列のMD5ハッシュを計算
   * @param data バイト配列
   * @returns MD5ハッシュ（16進数文字列）
   * @throws S3Error 計算失敗時
   */
  static async calculateMD5FromBytes(data: Uint8Array): Promise<string> {
    try {
      return md5(data);
    } catch (error) {
      ztoolkit.log(
        `MD5計算に失敗: ${String(error)}`,
        "error",
        "calculateMD5FromBytes",
      );
      throw new S3Error("データのMD5ハッシュ計算に失敗しました");
    }
  }

  /**
   * ファイルの整合性を検証
   * @param filePath ファイルパス
   * @param expectedMD5 期待されるMD5ハッシュ
   * @returns 整合性情報
   */
  static async verifyFileIntegrity(
    filePath: string,
    expectedMD5?: string,
  ): Promise<FileIntegrity> {
    try {
      if (!(await IOUtils.exists(filePath))) {
        return {
          md5Hash: "",
          size: 0,
          isValid: false,
        };
      }

      const fileInfo = await IOUtils.stat(filePath);
      const actualMD5 =
        await FileIntegrityManager.calculateMD5FromFile(filePath);

      ztoolkit.log(
        "ファイル整合性チェック開始",
        "FileIntegrityManager.verifyFileIntegrity",
      );

      return {
        md5Hash: actualMD5,
        size: fileInfo.size || 0,
        isValid: expectedMD5 ? actualMD5 === expectedMD5 : true,
      };
    } catch (error) {
      ztoolkit.log(
        `ファイル整合性検証に失敗: ${String(error)}`,
        "FileIntegrityManager.verifyFileIntegrity",
      );
      return {
        md5Hash: "",
        size: 0,
        isValid: false,
      };
    }
  }
}
