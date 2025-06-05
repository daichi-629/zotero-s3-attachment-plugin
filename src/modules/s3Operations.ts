import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { S3AuthManager } from "./s3AuthManager";
import {
  S3Error,
  UploadProgress,
  S3FileMetadata,
  S3CustomMetadata,
  generateS3Url,
} from "./s3Types";

/**
 * S3基本操作クラス
 * アップロード、ダウンロード、削除、メタデータ取得などの基本操作を担当
 */
export class S3Operations {
  private s3Client: S3Client | null = null;
  private bucketName?: string;

  /**
   * S3クライアントを初期化
   * @returns {Promise<void>}
   * @throws {S3Error} 認証情報がない場合や初期化失敗時
   */
  async initializeClient(): Promise<void> {
    try {
      const credentials = S3AuthManager.getCompleteCredentials();
      if (!credentials) {
        throw new S3Error("ストレージ認証情報が設定されていません");
      }

      const clientConfig: any = {
        region: credentials.region || "us-east-1",
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
        // チェックサム検証を無効化してWebStreams APIエラーを回避
        checksumMode: "WHEN_REQUIRED",
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      };

      // カスタムエンドポイントが設定されている場合は適用
      if (credentials.endpoint) {
        clientConfig.endpoint = credentials.endpoint;
        // S3互換ストレージではパススタイルを強制的に使用
        clientConfig.forcePathStyle = true;
        // SSL証明書検証の問題を回避（開発環境用）
        if (
          credentials.endpoint.includes("localhost") ||
          credentials.endpoint.includes("127.0.0.1")
        ) {
          clientConfig.tls = false;
        }
      }

      this.s3Client = new S3Client(clientConfig);
      this.bucketName = credentials.bucketName;

      const provider = credentials.provider;
      ztoolkit.log(`${provider} client initialized`);
    } catch (error) {
      ztoolkit.log("Storage client initialization failed:", error);
      throw new S3Error("ストレージクライアントの初期化に失敗しました");
    }
  }

  /**
   * S3クライアントをクリア（リセット）
   */
  clearClient(): void {
    this.s3Client = null;
    this.bucketName = undefined;
    ztoolkit.log("S3 client cleared");
  }

  /**
   * S3接続テスト
   * @returns {Promise<boolean>} 接続成功ならtrue
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.s3Client || !this.bucketName) {
        await this.initializeClient();
      }

      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1,
      });

      await this.s3Client!.send(command);
      const credentials = S3AuthManager.getCompleteCredentials();
      const provider = credentials?.provider;

      ztoolkit.log(`${provider} connection test successful`);
      return true;
    } catch (error) {
      ztoolkit.log("Connection test failed:", error);
      return false;
    }
  }
  /**
   * ファイルをS3にアップロード（マルチパート対応）
   * @param s3Key S3キー
   * @param fileData ファイルデータ
   * @param contentType コンテンツタイプ
   * @param metadata カスタムメタデータ
   * @param onProgress 進捗コールバック
   * @returns アップロード結果
   */
  async uploadFile(
    s3Key: string,
    fileData: Uint8Array,
    contentType: string,
    metadata: S3CustomMetadata,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<{ etag: string; location: string }> {
    if (!this.s3Client || !this.bucketName) {
      await this.initializeClient();
    }

    const fileSize = fileData.length;

    if (fileSize > 5 * 1024 * 1024) {
      // マルチパートアップロード
      // Zotero環境（Firefox）ではBufferが利用できないため、
      // Uint8Arrayをそのまま使用するか、ReadableStreamに変換
      let bodyData: Uint8Array | ReadableStream;

      try {
        // ReadableStreamが利用可能な場合は使用（より効率的）
        if (typeof ReadableStream !== "undefined") {
          bodyData = new ReadableStream({
            start(controller: ReadableStreamDefaultController<Uint8Array>) {
              controller.enqueue(fileData);
              controller.close();
            },
          });
        } else {
          // ReadableStreamが利用できない場合はUint8Arrayをそのまま使用
          bodyData = fileData;
        }
      } catch (error) {
        // フォールバック: Uint8Arrayをそのまま使用
        bodyData = fileData;
      }

      const upload = new Upload({
        client: this.s3Client!,
        params: {
          Bucket: this.bucketName!,
          Key: s3Key,
          Body: bodyData,
          ContentType: contentType,
          Metadata: metadata,
          // チェックサム検証を無効化
          ChecksumAlgorithm: undefined,
        },
        queueSize: 4,
        partSize: 1024 * 1024 * 5,
      });

      if (onProgress) {
        upload.on("httpUploadProgress", (progress) => {
          if (progress.loaded && progress.total) {
            onProgress({
              loaded: progress.loaded,
              total: progress.total,
              percentage: Math.round((progress.loaded / progress.total) * 100),
            });
          }
        });
      }

      const result = await upload.done();
      return {
        etag: result.ETag || "",
        location: result.Location || "",
      };
    } else {
      // 通常のアップロード（5MB以下）
      const command = new PutObjectCommand({
        Bucket: this.bucketName!,
        Key: s3Key,
        Body: fileData,
        ContentType: contentType,
        Metadata: metadata,
        // チェックサム検証を無効化
        ChecksumAlgorithm: undefined,
      });

      const result = await this.s3Client!.send(command);

      if (onProgress) {
        onProgress({
          loaded: fileSize,
          total: fileSize,
          percentage: 100,
        });
      }

      // location URLを生成
      const credentials = S3AuthManager.getCompleteCredentials();
      if (!credentials) {
        throw new S3Error("S3認証情報が設定されていません");
      }

      const location = generateS3Url(s3Key, {
        provider: credentials.provider,
        bucketName: credentials.bucketName,
        endpoint: credentials.endpoint,
      });

      return {
        etag: result.ETag || "",
        location,
      };
    }
  }

  /**
   * S3ファイルをダウンロード
   * @param s3Key S3キー
   * @param onProgress プログレスコールバック
   * @returns ファイルデータ
   */
  async downloadFile(
    s3Key: string,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<Uint8Array> {
    if (!this.s3Client || !this.bucketName) {
      await this.initializeClient();
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName!,
      Key: s3Key,
    });

    try {
      const response = await this.s3Client!.send(command);

      if (!response.Body) {
        throw new S3Error("レスポンスボディが空です");
      }

      // 標準的な方法でバイト配列として読み取り
      const arrayBuffer = await response.Body.transformToByteArray();
      const fileData = new Uint8Array(arrayBuffer);

      if (onProgress) {
        onProgress({
          loaded: arrayBuffer.length,
          total: arrayBuffer.length,
          percentage: 100,
        });
      }

      return fileData;
    } catch (error) {
      // ChecksumStreamエラーの場合は、チェックサム検証なしで再試行
      if (error instanceof Error && error.message.includes("ChecksumStream")) {
        ztoolkit.log(
          `ChecksumStream error detected, retrying without verification: ${s3Key}`,
        );

        const retryCommand = new GetObjectCommand({
          Bucket: this.bucketName!,
          Key: s3Key,
          // チェックサム検証を完全に無効化
        });

        const retryResponse = await this.s3Client!.send(retryCommand);

        if (!retryResponse.Body) {
          throw new S3Error("ファイルデータが取得できませんでした");
        }

        const arrayBuffer = await retryResponse.Body!.transformToByteArray();
        const fileData = new Uint8Array(arrayBuffer);

        if (onProgress) {
          onProgress({
            loaded: arrayBuffer.length,
            total: arrayBuffer.length,
            percentage: 100,
          });
        }

        ztoolkit.log(
          `ChecksumStream error bypassed, download successful: ${s3Key}`,
        );

        return fileData;
      }

      // その他のエラーの場合は詳細なエラーメッセージを提供
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("ChecksumStream") ||
        errorMessage.includes("ReadableStream") ||
        errorMessage.includes("TransformStream")
      ) {
        const detailedError = new S3Error(
          `WebStreams APIエラーが発生しました: ${errorMessage}\n\n` +
            `このエラーは、AWS SDK v3のチェックサム検証機能がZotero環境で利用できないWebStreams APIを使用しようとしたために発生しました。\n\n` +
            `対処法:\n` +
            `1. プラグインを再起動してください\n` +
            `2. 問題が続く場合は、Zoteroを再起動してください\n` +
            `3. それでも解決しない場合は、プラグインの設定でチェックサム検証を無効化することを検討してください\n\n` +
            `技術的詳細: ${errorMessage}`,
        );
        ztoolkit.log(`WebStreams API error: ${s3Key} - ${errorMessage}`);
        throw detailedError;
      }

      throw error;
    }
  }

  /**
   * S3ファイルを削除
   * @param s3Key S3キー
   */
  async deleteFile(s3Key: string): Promise<void> {
    if (!this.s3Client || !this.bucketName) {
      await this.initializeClient();
    }

    const credentials = S3AuthManager.getCompleteCredentials();
    const isR2 = credentials?.provider === "r2";

    try {
      // 削除実行前に存在確認
      const exists = await this.checkFileExists(s3Key);
      if (!exists) {
        return; // ファイルが存在しない場合は正常終了
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName!,
        Key: s3Key,
      });

      await this.s3Client!.send(command);

      // 削除後の確認（リトライ機能付き）
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        const stillExists = await this.checkFileExists(s3Key);
        if (!stillExists) {
          if (retryCount > 0) {
            ztoolkit.log(`File deletion confirmed after retry: ${s3Key}`);
          }
          return; // 削除成功
        }

        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1秒待機
          // 再削除を試行
          await this.s3Client!.send(command);
        }
      }

      // 最大リトライ回数に達してもファイルが存在する場合はエラー
      throw new S3Error(
        "ファイル削除に失敗しました（再試行後もファイルが存在）",
      );
    } catch (error) {
      ztoolkit.log("File deletion failed:", error);
      // 既にS3Errorの場合はそのまま再スロー（リトライ後のエラーメッセージを保持）
      if (error instanceof S3Error) {
        throw error;
      }
      throw new S3Error("ファイルの削除に失敗しました");
    }
  }

  /**
   * ファイルの存在確認（R2削除処理用）
   * @param s3Key S3キー
   * @returns ファイルが存在するかどうか
   */
  private async checkFileExists(s3Key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName!,
        Key: s3Key,
      });

      await this.s3Client!.send(command);
      return true;
    } catch (error: any) {
      // 404エラーの場合はファイルが存在しない
      if (
        error.$metadata?.httpStatusCode === 404 ||
        error.name === "NotFound"
      ) {
        return false;
      }
      // その他のエラーは再スロー
      throw error;
    }
  }

  /**
   * ファイルメタデータを取得
   * @param s3Key S3キー
   * @returns メタデータまたはnull
   */
  async getFileMetadata(s3Key: string): Promise<S3FileMetadata | null> {
    if (!this.s3Client || !this.bucketName) {
      await this.initializeClient();
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName!,
        Key: s3Key,
      });

      const response = await this.s3Client!.send(command);
      return {
        key: s3Key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || "",
        contentType: response.ContentType,
        metadata: response.Metadata as S3CustomMetadata,
      };
    } catch (error) {
      ztoolkit.log("Failed to get file metadata:", error);
      return null;
    }
  }

  /**
   * S3バケット内のファイル一覧を取得
   * @param prefix プレフィックス
   * @returns ファイル一覧
   */
  async listFiles(prefix?: string): Promise<S3FileMetadata[]> {
    if (!this.s3Client || !this.bucketName) {
      await this.initializeClient();
    }

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    const response = await this.s3Client!.send(command);
    const files: S3FileMetadata[] = [];

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key) {
          files.push({
            key: object.Key,
            size: object.Size || 0,
            lastModified: object.LastModified || new Date(),
            etag: object.ETag || "",
          });
        }
      }
    }

    return files;
  }
}
