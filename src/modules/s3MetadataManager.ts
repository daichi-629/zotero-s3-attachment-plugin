import { S3CustomMetadata, getFileName } from "./s3Types";

/**
 * S3メタデータ管理クラス
 * S3カスタムメタデータの作成、アクセス、管理を担当
 */
export class S3MetadataManager {
  /**
   * 文字列をBase64エンコード（HTTPヘッダー対応）
   * @param str エンコードする文字列
   * @returns Base64エンコードされた文字列
   */
  private static encodeForHeader(str: string): string {
    try {
      // UTF-8バイト配列に変換してからBase64エンコード
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      return btoa(String.fromCharCode(...bytes));
    } catch (error) {
      // エンコードに失敗した場合はASCII文字のみを残す（制御文字を除く）
      return str.replace(/[^\u0020-\u007E]/g, "?");
    }
  }

  /**
   * Base64デコード（HTTPヘッダーから復元）
   * @param encodedStr Base64エンコードされた文字列
   * @returns デコードされた文字列
   */
  private static decodeFromHeader(encodedStr: string): string {
    try {
      // Base64文字列かどうかを簡単にチェック
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encodedStr)) {
        // Base64形式でない場合は、そのまま返す（後方互換性）
        return encodedStr;
      }

      // Base64デコードしてUTF-8文字列に変換
      const binaryString = atob(encodedStr);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoder = new TextDecoder();
      const decoded = decoder.decode(bytes);

      // デコード結果が元の文字列と同じ場合は、エンコードされていなかった可能性
      if (decoded === encodedStr) {
        return encodedStr;
      }

      return decoded;
    } catch (error) {
      // デコードに失敗した場合は元の文字列をそのまま返す
      return encodedStr;
    }
  }

  /**
   * S3カスタムメタデータを作成
   * @param filePath ファイルパス
   * @param fileSize ファイルサイズ
   * @param md5Hash MD5ハッシュ
   * @returns S3カスタムメタデータ
   */
  static createCustomMetadata(
    filePath: string,
    fileSize: number,
    md5Hash: string,
  ): S3CustomMetadata {
    const originalFileName = getFileName(filePath) || "unknown";

    return {
      originalfilename: S3MetadataManager.encodeForHeader(originalFileName),
      uploaddate: new Date().toISOString(),
      md5hash: md5Hash,
      filesize: fileSize.toString(),
    };
  }

  /**
   * MD5ハッシュを取得
   * @param metadata S3カスタムメタデータ
   * @returns MD5ハッシュまたはundefined
   */
  static getMD5Hash(metadata?: S3CustomMetadata): string | undefined {
    if (!metadata) return undefined;
    // 小文字キーでアクセス（R2/S3の仕様）
    return metadata.md5hash || metadata["md5Hash"]; // 後方互換性のため
  }

  /**
   * 元のファイル名を取得
   * @param metadata S3カスタムメタデータ
   * @returns ファイル名またはundefined
   */
  static getOriginalFileName(metadata?: S3CustomMetadata): string | undefined {
    if (!metadata) return undefined;

    const encodedFileName =
      metadata.originalfilename || metadata["originalFileName"];
    if (!encodedFileName) return undefined;

    // Base64デコードを試行
    return S3MetadataManager.decodeFromHeader(encodedFileName);
  }

  /**
   * アップロード日時を取得
   * @param metadata S3カスタムメタデータ
   * @returns アップロード日時またはundefined
   */
  static getUploadDate(metadata?: S3CustomMetadata): string | undefined {
    if (!metadata) return undefined;
    return metadata.uploaddate || metadata["uploadDate"];
  }

  /**
   * ファイルサイズを取得
   * @param metadata S3カスタムメタデータ
   * @returns ファイルサイズまたはundefined
   */
  static getFileSize(metadata?: S3CustomMetadata): string | undefined {
    if (!metadata) return undefined;
    return metadata.filesize || metadata["fileSize"];
  }

  /**
   * メタデータが有効かどうかをチェック
   * @param metadata S3カスタムメタデータ
   * @returns 有効かどうか
   */
  static isValidMetadata(metadata?: S3CustomMetadata): boolean {
    if (!metadata) return false;

    const md5Hash = S3MetadataManager.getMD5Hash(metadata);
    const fileName = S3MetadataManager.getOriginalFileName(metadata);
    const uploadDate = S3MetadataManager.getUploadDate(metadata);
    const fileSize = S3MetadataManager.getFileSize(metadata);

    return !!(md5Hash && fileName && uploadDate && fileSize);
  }

  /**
   * メタデータを文字列として表示
   * @param metadata S3カスタムメタデータ
   * @returns 文字列表現
   */
  static toString(metadata?: S3CustomMetadata): string {
    if (!metadata) return "No metadata";

    const fileName = S3MetadataManager.getOriginalFileName(metadata);
    const uploadDate = S3MetadataManager.getUploadDate(metadata);
    const fileSize = S3MetadataManager.getFileSize(metadata);
    const md5Hash = S3MetadataManager.getMD5Hash(metadata);

    return `ファイル: ${fileName}, アップロード日時: ${uploadDate}, サイズ: ${fileSize}バイト, MD5: ${md5Hash}`;
  }

  /**
   * メタデータの差分を比較
   * @param metadata1 メタデータ1
   * @param metadata2 メタデータ2
   * @returns 同じ内容かどうか
   */
  static areEqual(
    metadata1?: S3CustomMetadata,
    metadata2?: S3CustomMetadata,
  ): boolean {
    if (!metadata1 && !metadata2) return true;
    if (!metadata1 || !metadata2) return false;

    const md5_1 = S3MetadataManager.getMD5Hash(metadata1);
    const md5_2 = S3MetadataManager.getMD5Hash(metadata2);
    const size_1 = S3MetadataManager.getFileSize(metadata1);
    const size_2 = S3MetadataManager.getFileSize(metadata2);

    return md5_1 === md5_2 && size_1 === size_2;
  }

  /**
   * ファイル名エンコード・デコードのテスト（デバッグ用）
   * @param fileName テストするファイル名
   * @returns テスト結果
   */
  static testFileNameEncoding(fileName: string): {
    original: string;
    encoded: string;
    decoded: string;
    isValid: boolean;
  } {
    const encoded = S3MetadataManager.encodeForHeader(fileName);
    const decoded = S3MetadataManager.decodeFromHeader(encoded);

    return {
      original: fileName,
      encoded: encoded,
      decoded: decoded,
      isValid: decoded === fileName,
    };
  }
}
