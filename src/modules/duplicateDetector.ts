import { S3Operations } from "./s3Operations";
import { FileIntegrityManager } from "./fileIntegrityManager";
import { S3MetadataManager } from "./s3MetadataManager";

/**
 * 重複ファイル検出クラス（内部使用専用）
 * S3内の重複ファイル検出とマッチング機能を担当
 * このクラスは直接exportされず、createDuplicateDetector関数経由でのみアクセス可能
 */
class DuplicateDetector {
  private s3Operations: S3Operations;

  constructor(s3Operations: S3Operations) {
    this.s3Operations = s3Operations;
  }

  /**
   * 重複ファイルの検出
   * @param filePath ファイルパス
   * @returns 既存のS3キー（重複がある場合）
   */
  async findDuplicateFile(filePath: string): Promise<string | null> {
    try {
      const fileMD5 = await FileIntegrityManager.calculateMD5FromFile(filePath);

      // S3バケット内のファイルを検索
      const files = await this.s3Operations.listFiles("zotero-attachments/");

      for (const file of files) {
        try {
          const metadata = await this.s3Operations.getFileMetadata(file.key);
          const storedMD5 = S3MetadataManager.getMD5Hash(metadata?.metadata);

          if (storedMD5 === fileMD5) {
            ztoolkit.log(`Duplicate file found: ${file.key}`);
            return file.key;
          }
        } catch (error) {
          // メタデータ取得失敗は無視して続行
          continue;
        }
      }

      return null;
    } catch (error) {
      ztoolkit.log("Duplicate file search failed:", error);
      return null;
    }
  }

  /**
   * 高速重複検出（ファイルサイズとMD5を使用）
   * @param filePath ファイルパス
   * @param fileSize ファイルサイズ
   * @returns 既存のS3キー（重複がある場合）
   */
  async findDuplicateFileFast(
    filePath: string,
    fileSize: number,
  ): Promise<string | null> {
    try {
      // まずファイルサイズでフィルタリング
      const files = await this.s3Operations.listFiles("zotero-attachments/");
      const sizeCandidates = files.filter((file) => file.size === fileSize);

      if (sizeCandidates.length === 0) {
        return null; // サイズが一致するファイルがない
      }

      // サイズが一致するファイルに対してMD5チェック
      const fileMD5 = await FileIntegrityManager.calculateMD5FromFile(filePath);

      for (const candidate of sizeCandidates) {
        try {
          const metadata = await this.s3Operations.getFileMetadata(
            candidate.key,
          );
          const storedMD5 = S3MetadataManager.getMD5Hash(metadata?.metadata);

          if (storedMD5 === fileMD5) {
            ztoolkit.log(`Duplicate file found (fast): ${candidate.key}`);
            return candidate.key;
          }
        } catch (error) {
          // メタデータ取得失敗は無視して続行
          continue;
        }
      }

      return null;
    } catch (error) {
      ztoolkit.log("Fast duplicate search failed:", error);
      return null;
    }
  }

  /**
   * 重複ファイルの統計情報を取得
   * @returns 重複ファイル統計
   */
  async getDuplicateStatistics(): Promise<{
    totalFiles: number;
    duplicateGroups: number;
    duplicateFiles: number;
    savedSpace: number; // バイト単位
  }> {
    try {
      const files = await this.s3Operations.listFiles("zotero-attachments/");
      const md5Map = new Map<string, Array<{ key: string; size: number }>>();

      // MD5ハッシュごとにファイルをグループ化
      for (const file of files) {
        try {
          const metadata = await this.s3Operations.getFileMetadata(file.key);
          const md5Hash = S3MetadataManager.getMD5Hash(metadata?.metadata);

          if (md5Hash) {
            if (!md5Map.has(md5Hash)) {
              md5Map.set(md5Hash, []);
            }
            md5Map.get(md5Hash)!.push({ key: file.key, size: file.size });
          }
        } catch (error) {
          // メタデータ取得失敗は無視
          continue;
        }
      }

      // 統計計算
      let duplicateGroups = 0;
      let duplicateFiles = 0;
      let savedSpace = 0;

      for (const [, fileGroup] of md5Map) {
        if (fileGroup.length > 1) {
          duplicateGroups++;
          duplicateFiles += fileGroup.length - 1; // 最初のファイル以外が重複

          // 重複により節約されたスペース
          const fileSize = fileGroup[0].size;
          savedSpace += fileSize * (fileGroup.length - 1);
        }
      }

      return {
        totalFiles: files.length,
        duplicateGroups,
        duplicateFiles,
        savedSpace,
      };
    } catch (error) {
      ztoolkit.log("Failed to get duplicate statistics:", error);
      return {
        totalFiles: 0,
        duplicateGroups: 0,
        duplicateFiles: 0,
        savedSpace: 0,
      };
    }
  }

  /**
   * 重複ファイルリストを取得
   * @returns 重複ファイルのマップ（MD5ハッシュ -> ファイルリスト）
   */
  async getDuplicateFileGroups(): Promise<
    Map<string, Array<{ key: string; size: number; metadata?: any }>>
  > {
    try {
      const files = await this.s3Operations.listFiles("zotero-attachments/");
      const md5Map = new Map<
        string,
        Array<{ key: string; size: number; metadata?: any }>
      >();

      // MD5ハッシュごとにファイルをグループ化
      for (const file of files) {
        try {
          const metadata = await this.s3Operations.getFileMetadata(file.key);
          const md5Hash = S3MetadataManager.getMD5Hash(metadata?.metadata);

          if (md5Hash) {
            if (!md5Map.has(md5Hash)) {
              md5Map.set(md5Hash, []);
            }
            md5Map.get(md5Hash)!.push({
              key: file.key,
              size: file.size,
              metadata: metadata?.metadata,
            });
          }
        } catch (error) {
          // メタデータ取得失敗は無視
          continue;
        }
      }

      // 重複ファイルのみをフィルタリング
      const duplicateGroups = new Map<
        string,
        Array<{ key: string; size: number; metadata?: any }>
      >();
      for (const [md5Hash, fileGroup] of md5Map) {
        if (fileGroup.length > 1) {
          duplicateGroups.set(md5Hash, fileGroup);
        }
      }

      return duplicateGroups;
    } catch (error) {
      ztoolkit.log("Failed to get duplicate file groups:", error);
      return new Map();
    }
  }
}

/**
 * DuplicateDetectorのファクトリー関数
 * S3StorageManagerからのみ呼び出し可能
 * @param s3Operations S3操作インスタンス
 * @returns DuplicateDetectorインスタンス
 * @internal
 */
export function createDuplicateDetector(
  s3Operations: S3Operations,
): DuplicateDetector {
  return new DuplicateDetector(s3Operations);
}
