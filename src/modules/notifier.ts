/**
 * Zotero Notifierの管理クラス
 * アイテムの追加・削除・変更を監視し、S3添付ファイルの情報をキャッシュ
 */
import { S3AttachmentMapping, S3AttachmentInfo } from "./s3AttachmentMapping";
import { extractS3KeyFromUrl } from "./s3Types";

export class Notifier {
  private static notifierID: string | null = null;
  private static cacheManager: S3AttachmentMapping | null = null;

  static registerNotifier() {
    // キャッシュマネージャーを初期化
    this.cacheManager = S3AttachmentMapping.getInstance(
      `${addon.data.config.addonRef}.s3AttachmentCache`,
    );

    const callback = {
      notify: async (
        event: string,
        type: string,
        ids: number[] | string[],
        extraData: { [key: string]: any },
      ) => {
        if (!addon?.data.alive) {
          this.unregisterNotifier(this.notifierID!);
          return;
        }

        // S3添付ファイル情報のキャッシュ戦略
        if (type === "item") {
          if (event === "trash") {
            // trashイベント: 削除前にキャッシュ（アイテムはまだ存在）
            ztoolkit.log(
              `trashイベント検出: ${ids.length}件のアイテムをキャッシュ`,
              "info",
              "notify",
            );
            await this.cacheS3AttachmentInfo(ids);
          } else if (event === "modify" || event === "add") {
            // modify/addイベント: S3添付ファイルの変更/追加を監視
            await this.updateS3AttachmentCache(ids);
          } else if (event === "delete") {
            // deleteイベント: キャッシュ済み情報のみ使用（アイテムは既に削除済み）
            ztoolkit.log(
              `deleteイベント検出: ${ids.length}件のアイテム削除`,
              "info",
              "notify",
            );
          }
        }

        // hooksを呼び出し
        addon.hooks.onNotify(event, type, ids, extraData);
      },
    };

    // Register the callback in Zotero as an item observer
    this.notifierID = Zotero.Notifier.registerObserver(callback, ["item"]);

    Zotero.Plugins.addObserver({
      shutdown: ({ id }) => {
        if (id === addon.data.config.addonID)
          this.unregisterNotifier(this.notifierID!);
      },
    });

    // 起動時に既存のS3添付ファイルをキャッシュ
    this.initializeS3AttachmentCache();
  }

  /**
   * 起動時のS3添付ファイルキャッシュ初期化
   */
  private static async initializeS3AttachmentCache(): Promise<void> {
    try {
      if (!this.cacheManager) return;

      ztoolkit.log(
        "S3添付ファイルキャッシュを初期化中...",
        "info",
        "initializeS3AttachmentCache",
      );

      // キャッシュマネージャーを初期化（永続キャッシュから復元）
      await this.cacheManager.initialize();

      // 現在のライブラリをスキャンしてS3添付ファイルを検出
      const libraryID = Zotero.Libraries.userLibraryID;
      const items = await Zotero.Items.getAll(libraryID);

      const batchItems: Array<{ itemID: number; info: S3AttachmentInfo }> = [];

      for (const item of items) {
        if (
          item &&
          typeof item.isAttachment === "function" &&
          item.isAttachment()
        ) {
          const info = await this.extractS3AttachmentInfo(item);
          if (info) {
            batchItems.push({ itemID: item.id, info });
          }
        }
      }

      // バッチでキャッシュに追加
      if (batchItems.length > 0) {
        await this.cacheManager.setBatch(batchItems);
      }

      ztoolkit.log(
        `S3添付ファイルキャッシュ初期化完了: ${batchItems.length}件`,
        "success",
        "initializeS3AttachmentCache",
      );
    } catch (error) {
      ztoolkit.log(
        `S3添付ファイルキャッシュ初期化に失敗: ${String(error)}`,
        "error",
        "initializeS3AttachmentCache",
      );
    }
  }

  /**
   * S3添付ファイルキャッシュの更新（modify/addイベント用）
   */
  private static async updateS3AttachmentCache(
    ids: (number | string)[],
  ): Promise<void> {
    if (!this.cacheManager) return;

    for (const id of ids) {
      const numericId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(numericId) || numericId <= 0) {
        continue;
      }

      try {
        const item = await Zotero.Items.getAsync(numericId);
        if (!item) {
          continue;
        }

        // S3添付ファイルの場合のみキャッシュ更新
        if (item.isAttachment()) {
          const info = await this.extractS3AttachmentInfo(item);
          if (info) {
            await this.cacheManager.set(numericId, info);
          }
        }
      } catch (error) {
        // エラーは無視（modify/addイベントは頻繁に発生するため）
      }
    }
  }

  /**
   * 削除前にS3添付ファイルの情報をキャッシュ
   * @param ids 削除対象のアイテムID配列
   */
  private static async cacheS3AttachmentInfo(
    ids: (number | string)[],
  ): Promise<void> {
    if (!this.cacheManager) return;

    try {
      ztoolkit.log(
        `S3添付ファイル情報キャッシュ開始: ${ids}`,
        "debug",
        "cacheS3AttachmentInfo",
      );
      const batchItems: Array<{ itemID: number; info: S3AttachmentInfo }> = [];

      for (const id of ids) {
        const numericId = typeof id === "string" ? parseInt(id, 10) : id;

        // 無効なIDの場合はスキップ
        if (isNaN(numericId) || numericId <= 0) {
          ztoolkit.log(
            `無効なアイテムID: ${id}`,
            "warn",
            "cacheS3AttachmentInfo",
          );
          continue;
        }

        try {
          ztoolkit.log(
            `S3添付ファイル情報キャッシュ開始: ${numericId}`,
            "debug",
            "cacheS3AttachmentInfo",
          );
          const item = await Zotero.Items.getAsync(numericId);

          // アイテムが存在しない場合はスキップ
          if (!item) {
            ztoolkit.log(
              `アイテムが見つからない: ${numericId}`,
              "warn",
              "cacheS3AttachmentInfo",
            );
            continue;
          }

          // 添付ファイルの場合の処理
          if (typeof item.isAttachment === "function" && item.isAttachment()) {
            const info = await this.processSingleAttachment(item, numericId);
            if (info) {
              batchItems.push({ itemID: numericId, info });
            }
            continue;
          }

          // 通常アイテムの場合、子添付ファイルをチェック
          const childInfos = await this.processRegularItemAttachments(
            item,
            numericId,
          );
          batchItems.push(...childInfos);
        } catch (error) {
          // アイテムが既に削除されている場合は無視
          ztoolkit.log(
            `アイテム取得に失敗（既に削除済み？）: ${numericId} - ${String(error)}`,
            "warn",
            "cacheS3AttachmentInfo",
          );
        }
      }

      // バッチでキャッシュに追加
      if (batchItems.length > 0) {
        await this.cacheManager.setBatch(batchItems);
      }
    } catch (error) {
      ztoolkit.log(
        `S3添付ファイル情報のキャッシュに失敗: ${String(error)}`,
        "error",
        "cacheS3AttachmentInfo",
      );
    }
  }

  /**
   * 単一添付ファイルの処理
   */
  private static async processSingleAttachment(
    item: Zotero.Item,
    numericId: number,
  ): Promise<S3AttachmentInfo | null> {
    ztoolkit.log(
      `添付ファイル検出: ${numericId}, linkMode: ${item.attachmentLinkMode}`,
      "debug",
      "processSingleAttachment",
    );

    // web linkアタッチメントでない場合はスキップ
    if (item.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL) {
      ztoolkit.log(
        `web linkアタッチメントではない: ${numericId} (linkMode: ${item.attachmentLinkMode})`,
        "debug",
        "processSingleAttachment",
      );
      return null;
    }

    return await this.extractS3AttachmentInfo(item);
  }

  /**
   * 通常アイテムの子添付ファイル処理
   */
  private static async processRegularItemAttachments(
    item: Zotero.Item,
    numericId: number,
  ): Promise<Array<{ itemID: number; info: S3AttachmentInfo }>> {
    ztoolkit.log(
      `通常アイテム検出: ${numericId}, 子添付ファイルをチェック`,
      "debug",
      "processRegularItemAttachments",
    );
    const results: Array<{ itemID: number; info: S3AttachmentInfo }> = [];

    try {
      // getAttachments関数が存在しない場合はスキップ
      if (typeof item.getAttachments !== "function") {
        ztoolkit.log(
          `getAttachments関数が存在しない: ${numericId}`,
          "warn",
          "processRegularItemAttachments",
        );
        return results;
      }

      const attachmentIDs = item.getAttachments();

      // 添付ファイルIDが配列でない場合はスキップ
      if (!Array.isArray(attachmentIDs)) {
        ztoolkit.log(
          `添付ファイルIDが配列ではない: ${numericId}`,
          "warn",
          "processRegularItemAttachments",
        );
        return results;
      }

      for (const attachmentID of attachmentIDs) {
        try {
          const attachment = await Zotero.Items.getAsync(attachmentID);

          // 添付ファイルが存在し、適切なオブジェクトの場合のみ処理
          if (
            attachment &&
            typeof attachment.isAttachment === "function" &&
            attachment.isAttachment()
          ) {
            const info = await this.extractS3AttachmentInfo(attachment);
            if (info) {
              results.push({ itemID: attachmentID, info });
            }
          }
        } catch (error) {
          ztoolkit.log(
            `子添付ファイル取得に失敗: ${attachmentID} - ${String(error)}`,
            "error",
            "processRegularItemAttachments",
          );
        }
      }
    } catch (error) {
      ztoolkit.log(
        `添付ファイル一覧取得に失敗: ${numericId} - ${String(error)}`,
        "error",
        "processRegularItemAttachments",
      );
    }

    return results;
  }

  /**
   * アイテムからS3添付ファイル情報を抽出
   */
  private static async extractS3AttachmentInfo(
    item: Zotero.Item,
  ): Promise<S3AttachmentInfo | null> {
    // アイテムが存在しない場合はスキップ
    if (!item) {
      ztoolkit.log(
        "アイテムがnullまたはundefined",
        "warn",
        "extractS3AttachmentInfo",
      );
      return null;
    }

    // 添付ファイルでない場合はスキップ
    if (!item.isAttachment()) {
      return null;
    }

    // web linkアタッチメントでない場合はスキップ
    if (item.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL) {
      return null;
    }

    const title = item.getDisplayTitle();
    let attachmentURL: string | null = null;

    try {
      attachmentURL = item.getField("url") as string;
    } catch (error) {
      ztoolkit.log(
        `URL取得に失敗: ${item.id} - ${String(error)}`,
        "error",
        "extractS3AttachmentInfo",
      );
      return null;
    }

    // S3添付ファイルでない場合はスキップ
    if (!title || !title.includes("[S3]") || !attachmentURL) {
      return null;
    }

    // S3キーを抽出
    const s3Key = extractS3KeyFromUrl(attachmentURL);
    if (!s3Key) {
      return null;
    }

    ztoolkit.log(
      `S3添付ファイル情報を抽出: ${item.id} -> ${s3Key}`,
      "debug",
      "extractS3AttachmentInfo",
    );
    return { s3Key, title };
  }

  /**
   * キャッシュマネージャーのインスタンスを取得
   * @returns キャッシュマネージャーのインスタンスまたはnull
   */
  static getCacheManager(): S3AttachmentMapping | null {
    return this.cacheManager;
  }

  private static unregisterNotifier(notifierID: string) {
    if (notifierID) {
      Zotero.Notifier.unregisterObserver(notifierID);
      this.notifierID = null;
    }
    // キャッシュマネージャーをクリア
    if (this.cacheManager) {
      this.cacheManager.clear();
      this.cacheManager = null;
    }
  }
}
