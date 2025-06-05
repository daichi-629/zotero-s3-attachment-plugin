/**
 * S3添付ファイル専用マッピング管理
 * Zotero.Prefsを直接使用したシンプルな実装
 */

export interface S3AttachmentInfo {
  s3Key: string;
  title: string;
}

export interface MappingStatistics {
  size: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

/**
 * S3添付ファイル情報のマッピング管理
 * Zotero.Prefsを直接使用してシンプルに実装
 */
export class S3AttachmentMapping {
  private static instance: S3AttachmentMapping | null = null;
  private persistentCacheKey: string;
  private hitCount: number = 0;
  private missCount: number = 0;

  private constructor(persistentCacheKey: string) {
    this.persistentCacheKey = persistentCacheKey;
  }

  /**
   * シングルトンインスタンスの取得
   */
  static getInstance(persistentCacheKey?: string): S3AttachmentMapping {
    if (!this.instance) {
      if (!persistentCacheKey) {
        throw new Error("初回作成時にはpersistentCacheKeyが必要です");
      }
      this.instance = new S3AttachmentMapping(persistentCacheKey);
    }
    return this.instance;
  }

  /**
   * 初期化（互換性のため残すが、実際には何もしない）
   */
  async initialize(): Promise<void> {
    ztoolkit.log(
      "S3添付ファイルマッピングを初期化（Zotero.Prefs使用）",
      "info",
      "initialize",
    );
  }

  /**
   * S3添付ファイル情報をマッピングに追加
   * @param itemID アイテムID
   * @param info S3添付ファイル情報
   */
  async set(itemID: number, info: S3AttachmentInfo): Promise<void> {
    try {
      const mappingData = this.getMappingData();
      mappingData[itemID.toString()] = info;
      this.saveMappingData(mappingData);

      ztoolkit.log(
        `S3添付ファイル情報をマッピングに追加: ${itemID} -> ${info.s3Key}`,
        "debug",
        "set",
      );
      ztoolkit.log(`マッピング保存成功: ${itemID}`, "S3AttachmentMapping.set");
    } catch (error) {
      ztoolkit.log(
        `マッピング保存失敗: ${itemID} - ${String(error)}`,
        "S3AttachmentMapping.set",
      );
      throw error;
    }
  }

  /**
   * S3添付ファイル情報をマッピングから取得
   * @param itemID アイテムID
   * @param deleteAfterGet 取得後にマッピングから削除するか（デフォルト: false）
   * @returns S3添付ファイル情報またはnull
   */
  get(
    itemID: number,
    deleteAfterGet: boolean = false,
  ): S3AttachmentInfo | null {
    try {
      const mappingData = this.getMappingData();
      const info = mappingData[itemID.toString()];

      // 無効なデータの場合は早期リターン
      if (!info || !this.isValidS3AttachmentInfo(info)) {
        this.missCount++;
        ztoolkit.log(
          `マッピング取得に失敗: ${itemID}`,
          "S3AttachmentMapping.get",
        );
        return null;
      }

      // 有効なデータが見つかった場合の処理
      if (deleteAfterGet) {
        delete mappingData[itemID.toString()];
        this.saveMappingData(mappingData);
        ztoolkit.log(
          `マッピングヒット（削除後）: ${itemID} -> ${info.s3Key}`,
          "debug",
          "get",
        );
      } else {
        ztoolkit.log(
          `マッピングヒット（保持）: ${itemID} -> ${info.s3Key}`,
          "debug",
          "get",
        );
      }

      this.hitCount++;
      ztoolkit.log(
        `マッピング取得成功: ${itemID} -> ${info}`,
        "S3AttachmentMapping.get",
      );
      return info;
    } catch (error) {
      ztoolkit.log(
        `マッピング取得失敗: ${itemID} - ${String(error)}`,
        "S3AttachmentMapping.get",
      );
      this.missCount++;
      return null;
    }
  }

  /**
   * 複数のアイテムをバッチでマッピングに追加
   * @param items アイテムIDとS3情報のペア配列
   */
  async setBatch(
    items: Array<{ itemID: number; info: S3AttachmentInfo }>,
  ): Promise<void> {
    try {
      const mappingData = this.getMappingData();

      for (const { itemID, info } of items) {
        mappingData[itemID.toString()] = info;
      }

      this.saveMappingData(mappingData);
      ztoolkit.log(
        `マッピング一括保存: ${items.length}件`,
        "S3AttachmentMapping.setBatch",
      );
      ztoolkit.log(
        `マッピング一括保存成功: ${items.length}件`,
        "S3AttachmentMapping.setBatch",
      );
    } catch (error) {
      ztoolkit.log(
        `マッピング一括保存失敗: ${String(error)}`,
        "S3AttachmentMapping.setBatch",
      );
      throw error;
    }
  }

  /**
   * 特定のアイテムをマッピングから削除
   * @param itemID アイテムID
   */
  async delete(itemID: number): Promise<void> {
    try {
      const mappingData = this.getMappingData();
      delete mappingData[itemID.toString()];
      this.saveMappingData(mappingData);
      ztoolkit.log(`マッピング削除: ${itemID}`, "S3AttachmentMapping.delete");
      ztoolkit.log(
        `マッピング削除成功: ${itemID}`,
        "S3AttachmentMapping.delete",
      );
    } catch (error) {
      ztoolkit.log(
        `マッピング削除失敗: ${itemID} - ${String(error)}`,
        "S3AttachmentMapping.delete",
      );
      throw error;
    }
  }

  /**
   * マッピングをクリア
   */
  async clear(): Promise<void> {
    try {
      Zotero.Prefs.clear(this.persistentCacheKey);
      this.hitCount = 0;
      this.missCount = 0;
      ztoolkit.log("マッピングをクリア", "S3AttachmentMapping.clear");
    } catch (error) {
      ztoolkit.log(
        `マッピングクリアに失敗: ${String(error)}`,
        "S3AttachmentMapping.clear",
      );
      throw error;
    }
  }

  /**
   * マッピング統計情報を取得
   */
  getStatistics(): MappingStatistics {
    const totalRequests = this.hitCount + this.missCount;
    const hitRate =
      totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

    return {
      size: this.size(),
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: Math.round(hitRate * 100) / 100, // 小数点以下2桁
    };
  }

  /**
   * マッピングにアイテムが存在するかチェック
   * @param itemID アイテムID
   * @returns 存在する場合true
   */
  has(itemID: number): boolean {
    try {
      const mappingData = this.getMappingData();
      const info = mappingData[itemID.toString()];
      return Boolean(info && this.isValidS3AttachmentInfo(info));
    } catch (error) {
      ztoolkit.log(
        `マッピング存在チェックに失敗: ${itemID} - ${String(error)}`,
        "error",
        "has",
      );
      return false;
    }
  }

  /**
   * マッピングのサイズを取得
   */
  size(): number {
    try {
      const mappingData = this.getMappingData();
      return Object.keys(mappingData).length;
    } catch (error) {
      ztoolkit.log(
        `マッピングサイズ取得に失敗: ${String(error)}`,
        "error",
        "size",
      );
      return 0;
    }
  }

  /**
   * マッピングデータを取得
   */
  private getMappingData(): Record<string, S3AttachmentInfo> {
    try {
      const mappingDataString = Zotero.Prefs.get(
        this.persistentCacheKey,
      ) as string;

      if (!mappingDataString) {
        return {};
      }

      const mappingData = JSON.parse(mappingDataString);

      if (typeof mappingData !== "object" || mappingData === null) {
        ztoolkit.log(
          "マッピングデータが無効な形式です",
          "warn",
          "getMappingData",
        );
        return {};
      }

      return mappingData;
    } catch (error) {
      ztoolkit.log(
        `マッピングデータ取得に失敗: ${String(error)}`,
        "error",
        "getMappingData",
      );
      return {};
    }
  }

  /**
   * マッピングデータを保存
   */
  private saveMappingData(mappingData: Record<string, S3AttachmentInfo>): void {
    try {
      const jsonString = JSON.stringify(mappingData);
      Zotero.Prefs.set(this.persistentCacheKey, jsonString);
    } catch (error) {
      ztoolkit.log(
        `マッピングデータ保存に失敗: ${String(error)}`,
        "error",
        "saveMappingData",
      );
      throw error;
    }
  }

  /**
   * S3AttachmentInfoの妥当性チェック
   */
  private isValidS3AttachmentInfo(info: any): info is S3AttachmentInfo {
    return (
      info &&
      typeof info === "object" &&
      typeof info.s3Key === "string" &&
      typeof info.title === "string" &&
      info.s3Key.length > 0 &&
      info.title.length > 0
    );
  }

  /**
   * デバッグ用：マッピングの内容を表示
   */
  debug(): void {
    const stats = this.getStatistics();
    ztoolkit.log("=== S3添付ファイルマッピング統計 ===", "debug", "debug");
    ztoolkit.log(
      `マッピングキー: ${this.persistentCacheKey}`,
      "S3AttachmentMapping.debug",
    );
    ztoolkit.log(
      `マッピングサイズ: ${stats.size}`,
      "S3AttachmentMapping.debug",
    );
    ztoolkit.log(`ヒット数: ${stats.hitCount}`, "S3AttachmentMapping.debug");
    ztoolkit.log(`ミス数: ${stats.missCount}`, "S3AttachmentMapping.debug");
    ztoolkit.log(`ヒット率: ${stats.hitRate}%`, "S3AttachmentMapping.debug");

    // マッピングの実際の内容を確認
    try {
      const mappingData = this.getMappingData();
      const keys = Object.keys(mappingData);
      ztoolkit.log(
        `マッピングキー一覧: [${keys.slice(0, 10).join(", ")}${keys.length > 10 ? "..." : ""}]`,
        "debug",
        "debug",
      );
    } catch (error) {
      ztoolkit.log(
        `マッピングデバッグ情報取得に失敗: ${String(error)}`,
        "error",
        "debug",
      );
    }

    ztoolkit.log("=====================================", "debug", "debug");
  }
}
