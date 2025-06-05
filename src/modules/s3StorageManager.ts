import { S3Operations } from "./s3Operations";
import { S3AuthManager } from "./s3AuthManager";
import { FileIntegrityManager } from "./fileIntegrityManager";
import { createDuplicateDetector } from "./duplicateDetector";
import { S3MetadataManager } from "./s3MetadataManager";
import {
  S3Error,
  UploadProgress,
  S3FileMetadata,
  FileIntegrity,
  generateS3Key,
  generateS3Url,
  guessContentType,
  sanitizeFilePath,
  validateFilePath,
} from "./s3Types";

/**
 * S3ストレージ管理クラス
 * アップロード、ダウンロード、削除、整合性検証などの高レベル操作を担当
 */
export class S3StorageManager {
  private static instance: S3StorageManager | null = null;
  private s3Operations: S3Operations;
  private duplicateDetector: ReturnType<typeof createDuplicateDetector>;

  /**
   * S3StorageManagerのインスタンスを取得（シングルトンパターン）
   * @returns {S3StorageManager} S3StorageManagerのインスタンス
   */
  static getInstance(): S3StorageManager {
    if (!S3StorageManager.instance) {
      S3StorageManager.instance = new S3StorageManager();
    }
    return S3StorageManager.instance;
  }

  /**
   * コンストラクタ（プライベート）
   */
  private constructor() {
    this.s3Operations = new S3Operations();
    this.duplicateDetector = createDuplicateDetector(this.s3Operations);
  }

  /**
   * インスタンスをリセット（テスト用）
   */
  static resetInstance(): void {
    S3StorageManager.instance = null;
  }

  // === 静的メソッド（外部API） ===

  /**
   * S3クライアントをクリア（静的メソッド）
   */
  static clearClient(): void {
    const instance = S3StorageManager.getInstance();
    instance.s3Operations.clearClient();
  }

  /**
   * S3クライアントを初期化（静的メソッド）
   */
  static async initializeClient(): Promise<void> {
    const instance = S3StorageManager.getInstance();
    return instance.s3Operations.initializeClient();
  }

  /**
   * S3接続テスト（静的メソッド）
   */
  static async testConnection(): Promise<boolean> {
    const instance = S3StorageManager.getInstance();
    return instance.s3Operations.testConnection();
  }

  /**
   * ファイルをS3にアップロード（静的メソッド）
   */
  static async uploadFile(
    filePath: string,
    s3Key: string,
    onProgress?: (progress: UploadProgress) => void,
    checkDuplicates: boolean = true,
  ): Promise<{
    etag: string;
    location: string;
    md5Hash: string;
    isDuplicate: boolean;
    duplicateKey?: string;
  }> {
    const instance = S3StorageManager.getInstance();
    return instance.uploadFile(filePath, s3Key, onProgress, checkDuplicates);
  }

  /**
   * S3からファイルをダウンロード（静的メソッド）
   */
  static async downloadFile(
    s3Key: string,
    downloadPath: string,
    onProgress?: (progress: UploadProgress) => void,
    verifyIntegrity: boolean = true,
  ): Promise<void> {
    const instance = S3StorageManager.getInstance();
    return instance.downloadFile(
      s3Key,
      downloadPath,
      onProgress,
      verifyIntegrity,
    );
  }

  /**
   * S3ファイルを削除（静的メソッド）
   */
  static async deleteFile(s3Key: string): Promise<void> {
    const instance = S3StorageManager.getInstance();
    return instance.s3Operations.deleteFile(s3Key);
  }

  /**
   * ファイルメタデータを取得（静的メソッド）
   */
  static async getFileMetadata(s3Key: string): Promise<S3FileMetadata | null> {
    const instance = S3StorageManager.getInstance();
    return instance.s3Operations.getFileMetadata(s3Key);
  }

  /**
   * ファイルの整合性を検証（静的メソッド）
   */
  static async verifyFileIntegrity(
    filePath: string,
    expectedMD5?: string,
  ): Promise<FileIntegrity> {
    return FileIntegrityManager.verifyFileIntegrity(filePath, expectedMD5);
  }

  /**
   * 重複ファイルの検出（静的メソッド）
   */
  static async findDuplicateFile(filePath: string): Promise<string | null> {
    const instance = S3StorageManager.getInstance();
    return instance.duplicateDetector.findDuplicateFile(filePath);
  }

  /**
   * 重複ファイル統計を取得（静的メソッド）
   */
  static async getDuplicateStatistics(): Promise<{
    totalFiles: number;
    duplicateGroups: number;
    duplicateFiles: number;
    savedSpace: number;
  }> {
    const instance = S3StorageManager.getInstance();
    return instance.duplicateDetector.getDuplicateStatistics();
  }

  // === インスタンスメソッド（内部実装） ===

  /**
   * ファイルをS3にアップロード
   */
  async uploadFile(
    filePath: string,
    s3Key: string,
    onProgress?: (progress: UploadProgress) => void,
    checkDuplicates: boolean = true,
  ): Promise<{
    etag: string;
    location: string;
    md5Hash: string;
    isDuplicate: boolean;
    duplicateKey?: string;
  }> {
    try {
      if (!(await IOUtils.exists(filePath))) {
        throw new S3Error(`ファイルが見つかりません: ${filePath}`);
      }

      // ファイル情報を取得
      const fileInfo = await IOUtils.stat(filePath);
      const fileSize = fileInfo.size || 0;

      // MD5ハッシュを事前計算
      const md5Hash = await FileIntegrityManager.calculateMD5FromFile(filePath);
      ztoolkit.log(`ファイルMD5計算完了: ${md5Hash}`);

      // 重複ファイルチェック
      if (checkDuplicates) {
        const duplicateKey = await this.duplicateDetector.findDuplicateFileFast(
          filePath,
          fileSize,
        );
        if (duplicateKey) {
          ztoolkit.log(
            `重複ファイルが見つかりました: ${duplicateKey}`,
            "info",
            "uploadFile",
          );

          // 重複ファイルの場合は既存のファイル情報を返す
          const metadata =
            await this.s3Operations.getFileMetadata(duplicateKey);
          const location = this.generateLocationUrl(duplicateKey);

          return {
            etag: metadata?.etag || "",
            location,
            md5Hash,
            isDuplicate: true,
            duplicateKey,
          };
        }
      }

      // ファイルデータを読み込み
      const fileData = await IOUtils.read(filePath);
      const contentType = guessContentType(filePath);

      // メタデータを作成
      const metadata = S3MetadataManager.createCustomMetadata(
        filePath,
        fileSize,
        md5Hash,
      );

      // S3にアップロード
      const result = await this.s3Operations.uploadFile(
        s3Key,
        fileData,
        contentType,
        metadata,
        onProgress,
      );

      // アップロード後の整合性検証
      const uploadedMetadata = await this.s3Operations.getFileMetadata(s3Key);
      const storedMD5 = S3MetadataManager.getMD5Hash(
        uploadedMetadata?.metadata,
      );

      // 直接的な整合性検証（verifyUploadIntegrityの代替）
      if (storedMD5 && storedMD5 !== md5Hash) {
        ztoolkit.log(
          `アップロード整合性エラー: 期待値=${md5Hash}, 実際値=${storedMD5}`,
          "error",
          "uploadFile",
        );
        throw new S3Error("アップロードファイルの整合性検証に失敗しました");
      }
      ztoolkit.log("アップロード整合性検証成功");

      return {
        etag: result.etag,
        location: result.location,
        md5Hash,
        isDuplicate: false,
        duplicateKey: undefined,
      };
    } catch (error) {
      ztoolkit.log("ファイルアップロード失敗:");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new S3Error(`ファイルアップロードに失敗しました: ${errorMessage}`);
    }
  }

  /**
   * S3からファイルをダウンロード
   */
  async downloadFile(
    s3Key: string,
    downloadPath: string,
    onProgress?: (progress: UploadProgress) => void,
    verifyIntegrity: boolean = true,
  ): Promise<void> {
    try {
      // ダウンロードパスを検証・サニタイズ
      const sanitizedDownloadPath = sanitizeFilePath(downloadPath);

      if (!validateFilePath(sanitizedDownloadPath)) {
        throw new S3Error(`無効なダウンロードパス: ${downloadPath}`);
      }

      ztoolkit.log(
        `ダウンロードパス検証完了: ${sanitizedDownloadPath}`,
        "debug",
        "downloadFile",
      );

      // ダウンロード前にメタデータを取得（整合性検証用）
      let expectedMD5: string | undefined;
      if (verifyIntegrity) {
        try {
          const metadata = await this.s3Operations.getFileMetadata(s3Key);
          expectedMD5 = S3MetadataManager.getMD5Hash(metadata?.metadata);
          if (expectedMD5) {
            ztoolkit.log(
              `期待されるMD5ハッシュ: ${expectedMD5}`,
              "debug",
              "downloadFile",
            );
          }
        } catch (error) {
          ztoolkit.log(
            "メタデータ取得に失敗（整合性検証をスキップ）:",
            "warn",
            "downloadFile",
          );
        }
      }

      // S3からファイルデータをダウンロード
      let fileData: Uint8Array;
      try {
        fileData = await this.s3Operations.downloadFile(s3Key, onProgress);
      } catch (error) {
        // ChecksumStreamエラーの場合は、整合性検証を無効化して再試行
        if (
          error instanceof Error &&
          error.message.includes("ChecksumStream")
        ) {
          ztoolkit.log(
            `ChecksumStreamエラーを検出、整合性検証を無効化して再試行: ${s3Key}`,
            "warn",
            "downloadFile",
          );

          // 整合性検証を無効化して再試行
          verifyIntegrity = false;
          expectedMD5 = undefined;
          fileData = await this.s3Operations.downloadFile(s3Key, onProgress);
        } else {
          throw error;
        }
      }

      // ローカルファイルに書き込み（サニタイズされたパスを使用）
      await IOUtils.write(sanitizedDownloadPath, fileData);

      // ダウンロード後の整合性検証
      if (verifyIntegrity && expectedMD5) {
        const integrity = await FileIntegrityManager.verifyFileIntegrity(
          sanitizedDownloadPath,
          expectedMD5,
        );

        if (!integrity.isValid) {
          // 整合性エラーの場合はダウンロードファイルを削除
          try {
            await IOUtils.remove(sanitizedDownloadPath);
            ztoolkit.log("破損ファイルを削除しました");
          } catch (removeError) {
            ztoolkit.log(
              `破損ファイル削除に失敗: ${String(removeError)}`,
              "error",
              "downloadFile",
            );
          }
          throw new S3Error(
            `ダウンロードファイルの整合性検証に失敗しました。期待値: ${expectedMD5}, 実際値: ${integrity.md5Hash}`,
          );
        }
        ztoolkit.log(
          "ダウンロードファイル整合性検証成功",
          "success",
          "downloadFile",
        );
      }

      ztoolkit.log(
        `ファイルダウンロード完了: ${s3Key} -> ${sanitizedDownloadPath}`,
        "success",
        "downloadFile",
      );
    } catch (error) {
      ztoolkit.log("ファイルダウンロード失敗:");
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // パス関連のエラーの場合は詳細な情報を提供
      if (
        errorMessage.includes("NS_ERROR_FILE_UNRECOGNIZED_PATH") ||
        errorMessage.includes("Could not parse path") ||
        errorMessage.includes("無効なファイルパス")
      ) {
        throw new S3Error(
          `ファイルパスエラー: ${errorMessage}\n\n` +
            `原因:\n` +
            `1. ファイル名に無効な文字が含まれている可能性があります\n` +
            `2. ファイルパスが長すぎる可能性があります\n` +
            `3. 文字エンコーディングの問題の可能性があります\n\n` +
            `対処法:\n` +
            `1. ファイル名を短くしてください\n` +
            `2. 特殊文字（<>:"/\\|?*）を含まないファイル名を使用してください\n` +
            `3. Zoteroを再起動してみてください`,
        );
      }

      throw new S3Error(`ファイルダウンロードに失敗しました: ${errorMessage}`);
    }
  }

  /**
   * S3 URLを生成（内部用）
   */
  private generateLocationUrl(s3Key: string): string {
    const credentials = S3AuthManager.getCompleteCredentials();
    if (!credentials) {
      throw new Error("S3認証情報が設定されていません");
    }

    return generateS3Url(s3Key, {
      provider: credentials.provider,
      bucketName: credentials.bucketName,
      endpoint: credentials.endpoint,
    });
  }
}
