/**
 * アイテム削除処理専用ハンドラー
 * ガードクラウズパターンを使用してネストを削減し、可読性を向上
 */
import { AttachmentHandler } from "./attachmentHandler";
import { Notifier } from "./notifier";
import { S3AttachmentInfo, S3AttachmentMapping } from "./s3AttachmentMapping";
import { extractS3KeyFromUrl } from "./s3Types";

export class DeletionHandler {
  private attachmentHandler: AttachmentHandler;

  constructor(attachmentHandler: AttachmentHandler) {
    this.attachmentHandler = attachmentHandler;
  }

  /**
   * アイテム削除・ゴミ箱移動イベントの処理
   * @param event イベント種別（delete または trash）
   * @param numericId アイテムID
   * @param extraData 追加データ
   */
  async handleDeletionEvent(
    event: string,
    numericId: number,
    extraData: { [key: string]: any },
  ): Promise<void> {
    ztoolkit.log(
      `アイテム${event === "delete" ? "削除" : "ゴミ箱移動"}イベント: ${numericId}`,
      "DeletionHandler.handleDeletionEvent",
    );

    const cacheManager = Notifier.getCacheManager();
    if (!cacheManager) {
      ztoolkit.log(
        "キャッシュマネージャーが初期化されていません",
        "DeletionHandler.handleDeletionEvent",
      );
      await this.handleExtraDataFallback(event, numericId, extraData);
      return;
    }

    // デバッグ: キャッシュの現在の状態を確認
    const cacheStats = cacheManager.getStatistics();
    ztoolkit.log(
      `キャッシュ状態: サイズ=${cacheStats.size}, ヒット率=${cacheStats.hitRate}%`,
      "DeletionHandler.handleDeletionEvent",
    );

    // デバッグ: 対象アイテムがキャッシュに存在するかチェック
    const hasInCache = cacheManager.has(numericId);
    ztoolkit.log(
      `アイテム${numericId}のキャッシュ存在チェック: ${hasInCache}`,
      "DeletionHandler.handleDeletionEvent",
    );

    // 1. キャッシュからS3添付ファイル情報を取得（削除はしない）
    const cachedInfo = cacheManager.get(numericId, false);
    if (cachedInfo) {
      ztoolkit.log(
        `キャッシュからS3情報を取得: ${cachedInfo.s3Key}`,
        "DeletionHandler.handleDeletionEvent",
      );
      await this.handleCachedS3Attachment(event, numericId, cachedInfo);

      // deleteイベントの場合のみキャッシュから削除
      if (event === "delete") {
        await this.removePersistentCacheEntry(numericId, cacheManager);
      }
      return;
    }

    ztoolkit.log(
      `メモリキャッシュにアイテム${numericId}の情報なし`,
      "DeletionHandler.handleDeletionEvent",
    );

    // 2. deleteイベントの場合、永続キャッシュも確認（削除はしない）
    if (event === "delete") {
      ztoolkit.log(
        `deleteイベントのため永続キャッシュを確認: ${numericId}`,
        "DeletionHandler.handleDeletionEvent",
      );

      const persistentInfo = cacheManager.get(numericId, false);
      if (persistentInfo) {
        ztoolkit.log(
          `永続キャッシュからS3情報を取得: ${persistentInfo.s3Key}`,
          "DeletionHandler.handleDeletionEvent",
        );
        await this.handleCachedS3Attachment(event, numericId, persistentInfo);

        // 永続キャッシュからも削除（deleteイベントの場合のみ）
        await this.removePersistentCacheEntry(numericId, cacheManager);
        return;
      }

      ztoolkit.log(
        `永続キャッシュにもアイテム${numericId}の情報なし`,
        "DeletionHandler.handleDeletionEvent",
      );
    }

    // 3. extraDataから情報を取得（最後の手段）
    ztoolkit.log(
      `キャッシュにS3情報なし、extraDataを確認: ${numericId}`,
      "DeletionHandler.handleDeletionEvent",
    );

    // デバッグ: extraDataの内容を確認
    if (extraData && extraData[numericId]) {
      ztoolkit.log(
        `extraDataにアイテム${numericId}の情報あり`,
        "DeletionHandler.handleDeletionEvent",
      );
    } else {
      ztoolkit.log(
        `extraDataにもアイテム${numericId}の情報なし`,
        "DeletionHandler.handleDeletionEvent",
      );
    }

    await this.handleExtraDataFallback(event, numericId, extraData);
  }

  /**
   * 永続キャッシュからエントリを削除
   * @param itemID アイテムID
   * @param cacheManager キャッシュマネージャーのインスタンス
   */
  private async removePersistentCacheEntry(
    itemID: number,
    cacheManager: S3AttachmentMapping,
  ): Promise<void> {
    try {
      await cacheManager.delete(itemID);
      ztoolkit.log(
        `永続キャッシュからエントリを削除: ${itemID}`,
        "DeletionHandler.removePersistentCacheEntry",
      );
    } catch (error) {
      ztoolkit.log(
        `永続キャッシュエントリ削除に失敗: ${itemID} - ${String(error)}`,
        "DeletionHandler.removePersistentCacheEntry",
      );
    }
  }

  /**
   * キャッシュされたS3添付ファイル情報の処理
   */
  private async handleCachedS3Attachment(
    event: string,
    numericId: number,
    cachedInfo: S3AttachmentInfo,
  ): Promise<void> {
    ztoolkit.log(
      `キャッシュからS3添付ファイル情報を取得: ${cachedInfo.s3Key}`,
      "DeletionHandler.handleCachedS3Attachment",
    );

    if (event === "delete") {
      await this.deleteS3Attachment(numericId, cachedInfo.s3Key);
    } else {
      ztoolkit.log(
        `ゴミ箱移動のため、S3ファイルは保持: ${cachedInfo.s3Key}`,
        "DeletionHandler.handleCachedS3Attachment",
      );
    }
  }

  /**
   * extraDataからの情報取得（フォールバック処理）
   */
  private async handleExtraDataFallback(
    event: string,
    numericId: number,
    extraData: { [key: string]: any },
  ): Promise<void> {
    // extraDataが存在しない場合は早期リターン
    if (!extraData || !extraData[numericId]) {
      ztoolkit.log(
        `extraDataにアイテム情報なし: ${numericId}`,
        "DeletionHandler.handleExtraDataFallback",
      );
      return;
    }

    const itemData = extraData[numericId];
    ztoolkit.log(
      `削除されたアイテムのextraData: ${JSON.stringify(itemData)}`,
      "DeletionHandler.handleExtraDataFallback",
    );

    // アイテムタイプに応じて処理を分岐
    if (itemData.itemType === "attachment") {
      await this.handleAttachmentDeletion(event, numericId, itemData);
    } else {
      await this.handleRegularItemDeletion(event, numericId, itemData);
    }
  }

  /**
   * 添付ファイルアイテムの削除処理
   */
  private async handleAttachmentDeletion(
    event: string,
    numericId: number,
    itemData: any,
  ): Promise<void> {
    const s3Info = this.extractS3InfoFromAttachment(itemData);

    // S3添付ファイルでない場合は早期リターン
    if (!s3Info.isS3Attachment) {
      return;
    }

    // S3キーが取得できない場合は早期リターン
    if (!s3Info.s3Key) {
      ztoolkit.log(
        `S3キー取得に失敗: ${numericId}`,
        "DeletionHandler.handleAttachmentDeletion",
      );
      return;
    }

    // deleteイベントの場合のみS3から削除
    if (event === "delete") {
      ztoolkit.log(
        `extraDataからS3添付ファイル削除を実行: ${s3Info.s3Key}`,
        "DeletionHandler.handleAttachmentDeletion",
      );
      await this.deleteS3Attachment(numericId, s3Info.s3Key);
    } else {
      ztoolkit.log(
        `ゴミ箱移動のため、S3ファイルは保持: ${s3Info.s3Key}`,
        "DeletionHandler.handleAttachmentDeletion",
      );
    }
  }

  /**
   * 通常アイテムの削除処理（子添付ファイルをチェック）
   */
  private async handleRegularItemDeletion(
    event: string,
    numericId: number,
    itemData: any,
  ): Promise<void> {
    ztoolkit.log(
      `通常アイテムのextraDataをチェック: ${numericId}`,
      "DeletionHandler.handleRegularItemDeletion",
    );

    // 子アイテムが存在しない場合は早期リターン
    if (!itemData.childItems || !Array.isArray(itemData.childItems)) {
      return;
    }

    // 各子添付ファイルを処理
    for (const childData of itemData.childItems) {
      await this.handleChildAttachmentDeletion(event, childData);
    }
  }

  /**
   * 子添付ファイルの削除処理
   */
  private async handleChildAttachmentDeletion(
    event: string,
    childData: any,
  ): Promise<void> {
    const s3Info = this.extractS3InfoFromAttachment(childData);

    // S3添付ファイルでない場合はスキップ
    if (!s3Info.isS3Attachment || !s3Info.s3Key) {
      return;
    }

    ztoolkit.log(
      `子S3添付ファイル削除を実行: ${s3Info.s3Key}`,
      "DeletionHandler.handleChildAttachmentDeletion",
    );

    // deleteイベントの場合のみS3から削除
    if (event === "delete") {
      await this.deleteS3Attachment(childData.id || 0, s3Info.s3Key);
    }
  }

  /**
   * 添付ファイルデータからS3情報を抽出
   * TypeScriptタイプガードパターンを適用
   */
  private extractS3InfoFromAttachment(itemData: any): {
    isS3Attachment: boolean;
    s3Key: string | null;
  } {
    // 添付ファイルでない場合
    if (!this.isAttachmentData(itemData)) {
      return { isS3Attachment: false, s3Key: null };
    }

    // web linkアタッチメントでない場合
    if (!this.isWebLinkAttachment(itemData)) {
      return { isS3Attachment: false, s3Key: null };
    }

    // タイトルに[S3]が含まれていない場合
    if (!this.hasS3Title(itemData)) {
      return { isS3Attachment: false, s3Key: null };
    }

    // URLが存在しない場合
    if (!itemData.url) {
      return { isS3Attachment: true, s3Key: null };
    }

    // URLからS3キーを抽出
    const s3Key = extractS3KeyFromUrl(itemData.url);
    return { isS3Attachment: true, s3Key };
  }

  /**
   * アイテムデータが添付ファイルかチェック（タイプガード）
   */
  private isAttachmentData(itemData: any): boolean {
    return itemData && itemData.itemType === "attachment";
  }

  /**
   * web linkアタッチメントかチェック（タイプガード）
   */
  private isWebLinkAttachment(itemData: any): boolean {
    return itemData.linkMode === Zotero.Attachments.LINK_MODE_LINKED_URL;
  }

  /**
   * S3タイトルを持つかチェック（タイプガード）
   */
  private hasS3Title(itemData: any): boolean {
    return itemData.title && itemData.title.includes("[S3]");
  }

  /**
   * S3添付ファイルの削除実行
   */
  private async deleteS3Attachment(
    itemID: number,
    s3Key: string,
  ): Promise<void> {
    try {
      // 変換中のアイテムかチェック
      if (this.attachmentHandler.isConverting(itemID)) {
        ztoolkit.log(
          `変換中のため、S3ファイル削除をスキップ: ${itemID} -> ${s3Key}`,
          "DeletionHandler.deleteS3Attachment",
        );
        return;
      }

      await this.attachmentHandler.deleteS3File(itemID, s3Key);
      ztoolkit.log(
        `削除処理完了: ${itemID}`,
        "DeletionHandler.deleteS3Attachment",
      );
    } catch (error) {
      ztoolkit.log(
        `削除処理エラー: ${itemID} - ${String(error)}`,
        "DeletionHandler.deleteS3Attachment",
      );
    }
  }
}
