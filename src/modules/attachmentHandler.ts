import { S3StorageManager } from "./s3StorageManager";
import { S3AuthManager } from "./s3AuthManager";
import {
  UploadProgress,
  getFileName,
  generateS3Key,
  encodeS3KeyForUrl,
  getIgnoreContentTypes,
  shouldIgnoreFile,
  sanitizeFilePath,
  validateFilePath,
  generateSafeFileName,
  S3Error,
  guessContentType,
  generateS3Url,
} from "./s3Types";
import { getSafeAbortController, AbortControllerPolyfill } from "./polyfills";
import {
  isS3StoredAttachment,
  getS3KeyFromItem,
  convertToS3Attachment,
  convertToLocalAttachment,
} from "./zoteroItemUtils";
import { config } from "../../package.json";
import { getPref } from "../utils/prefs";

/**
 * Zotero添付ファイルとS3の連携を管理するクラス
 */
export class AttachmentHandler {
  private activeUploads: Map<
    number,
    AbortControllerPolyfill | AbortController
  > = new Map();

  // 最近作成されたローカル添付ファイルを追跡（再アップロード防止用）
  private recentlyCreatedAttachments: Map<
    number,
    {
      timestamp: number;
      s3Key: string;
      fileName: string;
    }
  > = new Map();

  // ダウンロード中のファイルを一時的に追跡（再アップロード防止用）
  private downloadingFiles: Set<string> = new Set();

  // 変換中のアイテムを追跡（S3削除防止用）
  private convertingItems: Set<number> = new Set();

  // 再アップロード防止の有効期間（ミリ秒）
  private readonly REUPLOAD_PREVENTION_DURATION = 30000; // 30秒

  constructor() {
    // 静的メソッドを使用するため、s3Managerのインスタンス化は不要

    // 定期的に古いエントリをクリーンアップ
    setInterval(() => {
      this.cleanupRecentlyCreatedAttachments();
    }, 60000); // 1分ごと
  }

  /**
   * 新規添付ファイル追加時のハンドラー
   * @param itemID Zoteroアイテム ID
   */
  async onAttachmentAdded(itemID: number): Promise<void> {
    try {
      // 最近ダウンロードから作成されたファイルかチェック
      const recentEntry = this.recentlyCreatedAttachments.get(itemID);
      if (recentEntry) {
        const timeSinceCreation = Date.now() - recentEntry.timestamp;
        if (timeSinceCreation < this.REUPLOAD_PREVENTION_DURATION) {
          ztoolkit.log(
            `Reupload skipped - recently downloaded: ${recentEntry.fileName} (${Math.round(timeSinceCreation / 1000)}s ago)`,
          );
          return;
        } else {
          // 期限切れのエントリを削除
          this.recentlyCreatedAttachments.delete(itemID);
        }
      }

      // 認証情報の確認
      if (!S3AuthManager.hasCredentials()) {
        ztoolkit.log("S3 credentials not configured, skipping upload");
        return;
      }

      const item = await Zotero.Items.getAsync(itemID);
      if (!item || !item.isAttachment()) {
        return;
      }

      // ファイルの存在確認
      const filePath = await item.getFilePathAsync();
      if (!filePath || !(await IOUtils.exists(filePath))) {
        ztoolkit.log(`Attachment file not found: ${filePath}`);
        return;
      }

      // 既にアップロード中かチェック
      if (this.activeUploads.has(itemID)) {
        ztoolkit.log(`Upload already in progress, skipping: ${itemID}`);
        return;
      }

      // 除外コンテンツタイプのチェック
      const fileName = getFileName(filePath);

      // ダウンロード中のファイルかチェック（ファイル名ベース）
      if (this.downloadingFiles.has(fileName)) {
        ztoolkit.log(
          `File currently downloading, skipping upload: ${fileName}`,
        );
        return;
      }

      const ignoreContentTypes = getIgnoreContentTypes();
      if (shouldIgnoreFile(filePath, ignoreContentTypes)) {
        ztoolkit.log(`Ignored content type, skipping upload: ${fileName}`);
        return;
      }

      // 既にS3に保存済みかチェック
      if (isS3StoredAttachment(item)) {
        ztoolkit.log(`Attachment already stored in S3: ${itemID}`);
        return;
      }

      // S3にアップロード
      await this.uploadAttachmentToS3(item);
    } catch (error) {
      ztoolkit.log("Attachment handling failed:", error);
      // エラーの場合は通知を表示
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.showErrorNotification(
        "添付ファイルのS3アップロードに失敗しました",
        errorMessage,
      );
    }
  }

  /**
   * 添付ファイルをS3にアップロード
   * @param item Zotero添付アイテム
   */
  async uploadAttachmentToS3(item: Zotero.Item): Promise<void> {
    const itemID = item.id;
    const filePath = await item.getFilePathAsync();

    if (!filePath) {
      throw new Error("ファイルパスが取得できません");
    }

    // アップロードキャンセル用のAbortController
    const abortController = getSafeAbortController();
    this.activeUploads.set(itemID, abortController);

    try {
      // S3キー生成（アイテムIDとファイル名を使用）
      const fileName = getFileName(filePath);
      const useCollectionHierarchy = getPref(
        "s3.useCollectionHierarchy",
      ) as boolean;
      const s3Key = generateS3Key(itemID, fileName, useCollectionHierarchy);

      // プログレス表示
      const progressWindow = new ztoolkit.ProgressWindow("S3アップロード", {
        closeOnClick: false,
        closeTime: -1,
      });

      const progressLine = progressWindow.createLine({
        text: `アップロード中: ${fileName}`,
        type: "default",
        progress: 0,
      });
      progressWindow.show();

      // アップロード実行（重複チェック有効）
      const result = await S3StorageManager.uploadFile(
        filePath,
        s3Key,
        (progress: UploadProgress) => {
          progressWindow.changeLine({
            progress: progress.percentage,
            text: `アップロード中: ${fileName} (${progress.percentage}%)`,
          });
        },
        true, // 重複チェックを有効化
      );

      let s3KeyToUse: string;
      let finalS3Url: string;

      // 重複ファイルの場合の処理
      if (result.isDuplicate) {
        progressWindow.changeLine({
          text: `重複ファイル検出: ${fileName}（既存ファイルを使用）`,
          type: "success",
          progress: 100,
        });

        // 重複ファイルのキーを直接取得
        s3KeyToUse = result.duplicateKey!; // isDuplicateがtrueの場合、duplicateKeyは必ず存在
      } else {
        // 新規アップロードの場合
        s3KeyToUse = s3Key;
      }

      // URL生成（URLタイプに基づく統合処理）
      try {
        const { R2PublicUrlManager } = await import("./r2");

        // ユーザーが設定したURLタイプを取得
        const urlType = (getPref("r2.urlType") as string) || "disabled";
        const autoSaveEnabled = R2PublicUrlManager.getAutoSavePublicUrl();
        ztoolkit.log(`URLタイプ: ${urlType}, 自動保存: ${autoSaveEnabled}`);

        // URLタイプと自動保存設定に基づいてURLを生成
        if ((urlType === "custom" || urlType === "r2dev") && autoSaveEnabled) {
          // 公開URL使用（カスタムドメインまたはr2.dev）
          finalS3Url = await R2PublicUrlManager.generateUrlByType(
            s3KeyToUse,
            urlType,
          );

          const urlTypeLabel =
            urlType === "custom" ? "カスタムドメイン" : "r2.dev開発URL";
          progressWindow.changeLine({
            text: `${fileName} をS3に移動完了（${urlTypeLabel}使用）`,
            type: "success",
            progress: 100,
          });

          ztoolkit.log(`URL generated: ${urlTypeLabel} -> ${finalS3Url}`);
        } else {
          // 標準S3 URL使用（urlType === "disabled" または自動保存無効）
          finalS3Url = await R2PublicUrlManager.generateUrl(s3KeyToUse, {
            type: "disabled",
          });
          ztoolkit.log(`Standard S3 URL used: ${urlType}/${autoSaveEnabled}`);
        }
      } catch (urlError) {
        // URL生成でエラーが発生した場合はフォールバック
        ztoolkit.log(`URL generation error, fallback: ${String(urlError)}`);
        const { R2PublicUrlManager } = await import("./r2");
        finalS3Url = await R2PublicUrlManager.generateUrl(s3KeyToUse, {
          type: "disabled",
        });
      }

      // 添付ファイルをS3リンクモードに変換
      await convertToS3Attachment(item, finalS3Url, fileName);

      if (!result.isDuplicate) {
        progressWindow.changeLine({
          text: `アップロード完了: ${fileName}`,
          type: "success",
          progress: 100,
        });
      }

      // ローカルファイルを削除（デフォルト動作）
      if (this.shouldDeleteLocalFile()) {
        await this.deleteLocalAttachmentFile(item);

        progressWindow.changeLine({
          text: `${fileName} をS3に移動完了`,
          type: "success",
          progress: 100,
        });
      }

      // R2公開URL自動保存機能は既にfinalS3Urlで処理済みなので不要

      progressWindow.startCloseTimer(3000);

      notify(
        "S3アップロード完了",
        `ファイル: ${s3KeyToUse}\nMD5: ${result.md5Hash}`,
      );
    } catch (error) {
      // AbortErrorのチェック（ポリフィル環境でも動作するよう改善）
      if (
        error instanceof Error &&
        (error.name === "AbortError" || abortController.signal.aborted)
      ) {
        ztoolkit.log("Upload cancelled");
      } else {
        throw error;
      }
    } finally {
      this.activeUploads.delete(itemID);
    }
  }

  /**
   * S3添付ファイルの削除実行（DeletionHandlerから呼び出される）
   * @param itemID Zoteroアイテム ID
   * @param s3Key S3キー（必須）
   */
  async deleteS3File(itemID: number, s3Key: string): Promise<void> {
    try {
      ztoolkit.log(`S3 file deletion: ${s3Key}`);

      await S3StorageManager.deleteFile(s3Key);
      notify("S3ファイル削除完了", `ファイル: ${s3Key}`);

      // 成功通知を表示
      new ztoolkit.ProgressWindow("S3ファイル削除", {
        closeOnClick: true,
        closeTime: 3000,
      })
        .createLine({
          text: `S3ファイルを削除しました: ${s3Key}`,
          type: "success",
          progress: 100,
        })
        .show();
    } catch (error) {
      ztoolkit.log(`S3 file deletion failed: ${s3Key} - ${String(error)}`);

      // エラー通知を表示
      this.showErrorNotification(
        "S3ファイル削除に失敗",
        `ファイル: ${s3Key}\nエラー: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // エラーを再スローして呼び出し元に伝達
    }
  }

  /**
   * アップロードをキャンセル
   * @param itemID Zoteroアイテム ID
   */
  cancelUpload(itemID: number): void {
    const abortController = this.activeUploads.get(itemID);
    if (abortController) {
      abortController.abort();
      this.activeUploads.delete(itemID);
    }
  }

  /**
   * S3添付ファイルをローカルにダウンロード
   * @param item S3添付ファイルアイテム
   */
  async downloadS3AttachmentToLocal(item: Zotero.Item): Promise<void> {
    let safeFileName = "";

    try {
      if (!isS3StoredAttachment(item)) {
        throw new Error("S3に保存された添付ファイルではありません");
      }

      const s3Key = await getS3KeyFromItem(item);
      if (!s3Key) {
        throw new Error("S3キー情報が見つかりません");
      }

      // 親アイテムを取得
      const parentItem = item.parentItem;
      if (!parentItem) {
        throw new Error("親アイテムが見つかりません");
      }

      // 安全なファイル名を生成（IDプレフィックスを除去し、無効文字をサニタイズ）
      const title = item.getDisplayTitle();
      const cleanTitle = title.replace(/\s*\[S3\]\s*$/, "");
      safeFileName = generateSafeFileName(s3Key, cleanTitle);

      ztoolkit.log(`Filename generated: ${s3Key} -> ${safeFileName}`);
      ztoolkit.log(`Download starting: ${s3Key} -> ${safeFileName}`);

      // ダウンロード中のファイルとして追跡開始（再アップロード防止）
      this.downloadingFiles.add(safeFileName);

      try {
        // 一時ディレクトリにダウンロード
        const tempDir = Zotero.getTempDirectory().path;
        const tempFilePath = `${tempDir}/${safeFileName}`;

        // ファイルパスを検証・サニタイズ
        const sanitizedPath = sanitizeFilePath(tempFilePath);

        if (!validateFilePath(sanitizedPath)) {
          throw new Error(`無効なファイルパス: ${sanitizedPath}`);
        }

        ztoolkit.log(`Sanitized path: ${sanitizedPath}`);

        // プログレスウィンドウを表示
        const progressWindow = new ztoolkit.ProgressWindow("S3ダウンロード", {
          closeOnClick: true,
          closeTime: -1,
        });

        const progressLine = progressWindow.createLine({
          text: `ダウンロード中: ${safeFileName}`,
          type: "default",
          progress: 0,
        });

        progressWindow.show();

        // S3からダウンロード
        await S3StorageManager.downloadFile(
          s3Key,
          sanitizedPath,
          (progress) => {
            progressWindow.changeLine({
              text: `ダウンロード中: ${safeFileName} (${progress.percentage}%)`,
              progress: progress.percentage,
            });
          },
        );

        // ダウンロード完了を表示
        progressWindow.changeLine({
          text: `ダウンロード完了: ${safeFileName}`,
          type: "success",
          progress: 100,
        });

        // 3秒後に自動で閉じる
        progressWindow.startCloseTimer(3000);

        // 添付ファイルをローカルファイルに変換
        const originalS3Key = await getS3KeyFromItem(item);

        // 変換開始をマーク（S3削除防止）
        this.markConversionStart(item.id);

        try {
          const newAttachment = await convertToLocalAttachment(
            item,
            sanitizedPath,
            safeFileName,
          );

          // 新しく作成された添付ファイルを正しいIDで追跡（再アップロード防止）
          if (newAttachment && originalS3Key) {
            this.recentlyCreatedAttachments.set(newAttachment.id, {
              timestamp: Date.now(),
              s3Key: originalS3Key,
              fileName: safeFileName,
            });

            ztoolkit.log(
              `New local attachment tracked: ${newAttachment.id} -> ${safeFileName}`,
            );
          }
        } finally {
          // 変換終了をマーク
          this.markConversionEnd(item.id);
        }

        ztoolkit.log(`S3 attachment download completed: ${safeFileName}`);
      } catch (downloadError) {
        const progressWindow = new ztoolkit.ProgressWindow("S3ダウンロード", {
          closeOnClick: true,
          closeTime: 5000,
        });

        progressWindow.createLine({
          text: `ダウンロード失敗: ${safeFileName}`,
          type: "fail",
          progress: 100,
        });

        progressWindow.show();
        progressWindow.startCloseTimer(5000);
        throw downloadError;
      } finally {
        // ダウンロード追跡から除去
        this.downloadingFiles.delete(safeFileName);
        ztoolkit.log(`Download tracking removed: ${safeFileName}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      ztoolkit.log(
        `S3添付ファイルのダウンロードに失敗: ${errorMessage}`,
        "AttachmentHandler.downloadS3AttachmentToLocal",
      );

      new ztoolkit.ProgressWindow("S3ダウンロード", {
        closeOnClick: true,
        closeTime: 5000,
      })
        .createLine({
          text: `ダウンロード失敗: ${errorMessage}`,
          type: "fail",
          progress: 100,
        })
        .show();

      throw new Error(
        `S3添付ファイルのダウンロードに失敗しました: ${errorMessage}`,
      );
    }
  }

  /**
   * ローカル添付ファイルを削除
   * @param item Zotero添付アイテム
   */
  private async deleteLocalAttachmentFile(item: Zotero.Item): Promise<void> {
    try {
      const filePath = await item.getFilePathAsync();
      if (filePath && (await IOUtils.exists(filePath))) {
        // ローカルファイルを削除
        await IOUtils.remove(filePath);
        ztoolkit.log(
          `ローカルファイルを削除: ${filePath}`,
          "AttachmentHandler.deleteLocalAttachmentFile",
        );
      }

      ztoolkit.log(
        `ローカルファイル削除完了: ${item.id}`,
        "AttachmentHandler.deleteLocalAttachmentFile",
      );
    } catch (error) {
      ztoolkit.log(
        "ローカルファイル削除に失敗:",
        "AttachmentHandler.deleteLocalAttachmentFile",
      );
      throw error;
    }
  }

  /**
   * ローカルファイル削除設定を取得
   * デフォルトでS3アップロード後はローカルファイルを削除
   */
  private shouldDeleteLocalFile(): boolean {
    return true;
  }

  /**
   * エラー通知を表示
   * @param title タイトル
   * @param message メッセージ
   */
  private showErrorNotification(title: string, message: string): void {
    new ztoolkit.ProgressWindow(title, {
      closeOnClick: true,
      closeTime: 8000,
    })
      .createLine({
        text: message,
        type: "fail",
        progress: 100,
      })
      .show();
  }

  /**
   * 最近作成された添付ファイルのクリーンアップ
   */
  private cleanupRecentlyCreatedAttachments(): void {
    const now = Date.now();
    this.recentlyCreatedAttachments.forEach((entry, itemID) => {
      if (now - entry.timestamp > this.REUPLOAD_PREVENTION_DURATION) {
        this.recentlyCreatedAttachments.delete(itemID);
      }
    });
  }

  /**
   * 手動で再アップロード防止リストに追加（外部から呼び出し可能）
   * @param itemID アイテムID
   * @param s3Key S3キー
   * @param fileName ファイル名
   */
  public preventReupload(
    itemID: number,
    s3Key: string,
    fileName: string,
  ): void {
    this.recentlyCreatedAttachments.set(itemID, {
      timestamp: Date.now(),
      s3Key: s3Key,
      fileName: fileName,
    });

    ztoolkit.log(
      `手動で再アップロード防止リストに追加: ${itemID} -> ${fileName}`,
      "AttachmentHandler.preventReupload",
    );
  }

  /**
   * 再アップロード防止リストから手動で削除
   * @param itemID アイテムID
   */
  public allowReupload(itemID: number): void {
    if (this.recentlyCreatedAttachments.delete(itemID)) {
      ztoolkit.log(
        `再アップロード防止リストから削除: ${itemID}`,
        "AttachmentHandler.allowReupload",
      );
    }
  }

  /**
   * 現在の再アップロード防止状況を取得（デバッグ用）
   */
  public getReuploadPreventionStatus(): Array<{
    itemID: number;
    s3Key: string;
    fileName: string;
    timeRemaining: number;
  }> {
    const now = Date.now();
    const status: Array<{
      itemID: number;
      s3Key: string;
      fileName: string;
      timeRemaining: number;
    }> = [];

    this.recentlyCreatedAttachments.forEach((entry, itemID) => {
      const timeRemaining =
        this.REUPLOAD_PREVENTION_DURATION - (now - entry.timestamp);
      if (timeRemaining > 0) {
        status.push({
          itemID,
          s3Key: entry.s3Key,
          fileName: entry.fileName,
          timeRemaining: Math.round(timeRemaining / 1000), // 秒単位
        });
      }
    });

    return status;
  }

  /**
   * アイテムが変換中かどうかをチェック（DeletionHandlerから呼び出される）
   * @param itemID アイテムID
   * @returns 変換中の場合true
   */
  public isConverting(itemID: number): boolean {
    return this.convertingItems.has(itemID);
  }

  /**
   * 変換開始をマーク
   * @param itemID アイテムID
   */
  public markConversionStart(itemID: number): void {
    this.convertingItems.add(itemID);
    ztoolkit.log(`Conversion started for item: ${itemID}`);
  }

  /**
   * 変換終了をマーク
   * @param itemID アイテムID
   */
  public markConversionEnd(itemID: number): void {
    this.convertingItems.delete(itemID);
    ztoolkit.log(`Conversion ended for item: ${itemID}`);
  }

  /**
   * 手動で公開URLを生成してアイテムに保存
   * @param item Zoteroアイテム
   */
  public async generateAndSavePublicUrl(item: any): Promise<void> {
    try {
      if (!item.isAttachment()) {
        throw new Error("このアイテムは添付ファイルではありません");
      }

      // S3キーを取得
      const s3Key = item.getField("path");
      if (!s3Key || !s3Key.startsWith("s3:")) {
        ztoolkit.log(
          `S3に保存されていないアイテムの公開URL生成をスキップ: ${item.id}`,
          "AttachmentHandler.generateAndSavePublicUrl",
        );
        throw new Error("このアイテムはS3に保存されていません");
      }

      // "s3:"プレフィックスを削除
      const cleanS3Key = s3Key.replace(/^s3:/, "");

      // R2PublicUrlManagerを使用して公開URLを生成
      const { R2PublicUrlManager } = await import("./r2");
      const publicUrl = await R2PublicUrlManager.generatePublicUrl(cleanS3Key);

      if (!publicUrl) {
        throw new Error("公開URLの生成に失敗しました");
      }

      // アイテムに公開URLを保存
      await R2PublicUrlManager.savePublicUrlToItem(item, publicUrl);

      ztoolkit.log(
        `公開URLを手動で生成・保存しました: ${publicUrl}`,
        "AttachmentHandler.generateAndSavePublicUrl",
      );
    } catch (error) {
      ztoolkit.log(
        `公開URL生成に失敗: ${String(error)}`,
        "error",
        "generateAndSavePublicUrl",
      );
      throw error;
    }
  }
}
