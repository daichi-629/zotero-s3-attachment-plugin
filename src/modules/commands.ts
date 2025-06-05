import { AttachmentHandler } from "./attachmentHandler";
import { S3StorageManager } from "./s3StorageManager";
import { getString } from "../utils/locale";
import {
  getIgnoreContentTypes,
  shouldIgnoreFile,
  getFileName,
} from "./s3Types";
import { isS3StoredAttachment } from "./zoteroItemUtils";

/**
 * ユーザーコマンドとZotero統合を管理するクラス
 */
export class Commands {
  /**
   * Zoteroにコマンドとショートカットを登録
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   */
  static registerCommands(attachmentHandler: AttachmentHandler): void {
    try {
      // ショートカットキーの登録
      Commands.registerShortcuts(attachmentHandler);
      // Promptコマンドの登録（ztoolkit標準方式）
      Commands.registerPromptCommands(attachmentHandler);
      // 右クリックメニューの登録
      Commands.registerContextMenus(attachmentHandler);
      ztoolkit.log(
        "コマンドとショートカットを登録しました",
        "success",
        "registerCommands",
      );
    } catch (error) {
      ztoolkit.log(
        `コマンド登録に失敗: ${String(error)}`,
        "error",
        "registerCommands",
      );
    }
  }

  /**
   * ショートカットキーの登録
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   */
  private static registerShortcuts(attachmentHandler: AttachmentHandler): void {
    // Ctrl+Shift+T: S3接続テスト
    ztoolkit.Keyboard.register((ev, KeyOptions) => {
      if (ev.key === "T" && ev.shiftKey && ev.ctrlKey) {
        addon.hooks.onShortcuts("s3ConnectionTest");
      }
    });

    // Ctrl+Shift+D: S3ダウンロード
    ztoolkit.Keyboard.register((ev, KeyOptions) => {
      if (ev.key === "D" && ev.shiftKey && ev.ctrlKey) {
        addon.hooks.onShortcuts("s3Download");
      }
    });

    ztoolkit.log(
      "ショートカットキーを登録しました",
      "info",
      "registerShortcuts",
    );
  }

  /**
   * Promptコマンドの登録（ztoolkit標準方式）
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   */
  private static registerPromptCommands(
    attachmentHandler: AttachmentHandler,
  ): void {
    ztoolkit.Prompt.unregister("s3UploadSelectedAttachments");
    ztoolkit.Prompt.unregister("s3DownloadSelectedAttachments");
    ztoolkit.Prompt.unregister("s3ConnectionTest");
    ztoolkit.Prompt.unregister("s3Settings");
    ztoolkit.Prompt.register([
      {
        name: "S3 Upload Selected Attachments",
        label: "S3 Sync",
        id: "s3UploadSelectedAttachments",
        callback: (prompt) => {
          Commands.manualUploadSelectedAttachments(attachmentHandler);
        },
      },
      {
        name: "S3 Download Selected Attachments",
        label: "S3 Sync",
        id: "s3DownloadSelectedAttachments",
        callback: (prompt) => {
          Commands.manualDownloadSelectedS3Attachments(attachmentHandler);
        },
      },
      {
        name: "S3 Connection Test",
        label: "S3 Sync",
        id: "s3ConnectionTest",
        callback: (prompt) => {
          Commands.testS3Connection(attachmentHandler);
        },
      },
      {
        name: "S3 Settings",
        label: "S3 Sync",
        id: "s3Settings",
        callback: (prompt) => {
          Commands.openS3SettingsDialog();
        },
      },
    ]);

    ztoolkit.log(
      "Promptコマンドを登録しました",
      "info",
      "registerPromptCommands",
    );
  }

  /**
   * S3設定ダイアログを開く
   */
  private static openS3SettingsDialog(): void {
    try {
      // Zotero 7の設定画面を開く
      // @ts-ignore: Zotero.Prefs.openWindowは型定義に存在しないが、実行時には利用可能な内部APIのため無視
      Zotero.Prefs.openWindow("zotero-prefs");
      ztoolkit.log("設定画面を開きました", "Commands.openSettingsDialog");
    } catch (error) {
      ztoolkit.log(
        `設定画面の表示に失敗: ${String(error)}`,
        "error",
        "openSettingsDialog",
      );
    }
  }

  /**
   * 選択された添付ファイルを手動でS3にアップロード
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   * @returns {Promise<void>}
   */
  static async manualUploadSelectedAttachments(
    attachmentHandler: AttachmentHandler,
  ): Promise<void> {
    try {
      const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
      const attachments = selectedItems.filter((item: Zotero.Item) =>
        item.isAttachment(),
      );

      if (attachments.length === 0) {
        new ztoolkit.ProgressWindow("S3アップロード", {
          closeOnClick: true,
          closeTime: 3000,
        })
          .createLine({
            text: "添付ファイルが選択されていません",
            type: "default",
            progress: 100,
          })
          .show();
        return;
      }

      // 除外コンテンツタイプの設定を取得
      const ignoreContentTypes = getIgnoreContentTypes();
      let uploadedCount = 0;
      let skippedCount = 0;

      for (const attachment of attachments) {
        try {
          const filePath = await attachment.getFilePathAsync();
          if (!filePath) {
            continue;
          }

          // 除外コンテンツタイプのチェック
          if (shouldIgnoreFile(filePath, ignoreContentTypes)) {
            const fileName = getFileName(filePath);
            ztoolkit.log(
              `除外コンテンツタイプのため、手動アップロードをスキップ: ${fileName}`,
              "info",
              "manualUploadSelectedAttachments",
            );
            skippedCount++;
            continue;
          }

          await attachmentHandler.uploadAttachmentToS3(attachment);
          uploadedCount++;
        } catch (error) {
          ztoolkit.log(
            `添付ファイルのアップロードに失敗: ${attachment.id} - ${String(error)}`,
            "error",
            "manualUploadSelectedAttachments",
          );
        }
      }

      // 結果を表示
      const resultMessage =
        `アップロード完了: ${uploadedCount}件` +
        (skippedCount > 0 ? `, スキップ: ${skippedCount}件` : "");

      new ztoolkit.ProgressWindow("S3アップロード結果", {
        closeOnClick: true,
        closeTime: 5000,
      })
        .createLine({
          text: resultMessage,
          type: "success",
          progress: 100,
        })
        .show();
    } catch (error) {
      ztoolkit.log(
        `手動アップロードに失敗: ${String(error)}`,
        "error",
        "manualUploadSelectedAttachments",
      );
    }
  }

  /**
   * 選択されたS3添付ファイルを手動でローカルにダウンロード
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   * @returns {Promise<void>}
   */
  static async manualDownloadSelectedS3Attachments(
    attachmentHandler: AttachmentHandler,
  ): Promise<void> {
    try {
      const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
      const s3Attachments = selectedItems.filter((item: Zotero.Item) => {
        if (!item.isAttachment()) return false;
        // S3添付ファイルかチェック（zoteroItemUtilsから関数をインポート）
        return isS3StoredAttachment(item);
      });

      if (s3Attachments.length === 0) {
        new ztoolkit.ProgressWindow("S3ダウンロード", {
          closeOnClick: true,
          closeTime: 3000,
        })
          .createLine({
            text: "S3添付ファイルが選択されていません",
            type: "default",
            progress: 100,
          })
          .show();
        return;
      }

      let downloadedCount = 0;
      let failedCount = 0;

      for (const attachment of s3Attachments) {
        try {
          await attachmentHandler.downloadS3AttachmentToLocal(attachment);
          downloadedCount++;
        } catch (error) {
          ztoolkit.log(
            `添付ファイルのダウンロードに失敗: ${attachment.id} - ${String(error)}`,
            "error",
            "manualDownloadSelectedS3Attachments",
          );
          failedCount++;
        }
      }

      // 結果を表示
      const resultMessage =
        `ダウンロード完了: ${downloadedCount}件` +
        (failedCount > 0 ? `, 失敗: ${failedCount}件` : "");

      new ztoolkit.ProgressWindow("S3ダウンロード結果", {
        closeOnClick: true,
        closeTime: 5000,
      })
        .createLine({
          text: resultMessage,
          type: downloadedCount > 0 ? "success" : "fail",
          progress: 100,
        })
        .show();
    } catch (error) {
      ztoolkit.log(
        `手動ダウンロードに失敗: ${String(error)}`,
        "error",
        "manualDownloadSelectedS3Attachments",
      );
    }
  }

  /**
   * S3接続テストを行う
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   * @returns {Promise<void>}
   */
  static async testS3Connection(
    attachmentHandler: AttachmentHandler,
  ): Promise<void> {
    try {
      const progressWindow = new ztoolkit.ProgressWindow("S3接続テスト", {
        closeOnClick: false,
        closeTime: -1,
      });

      progressWindow.createLine({
        text: "S3への接続をテスト中...",
        type: "default",
        progress: 0,
      });
      progressWindow.show();

      const success = await S3StorageManager.testConnection();

      progressWindow.changeLine({
        text: success ? "S3接続成功" : "S3接続失敗",
        type: success ? "success" : "fail",
        progress: 100,
      });
      progressWindow.startCloseTimer(3000);
    } catch (error) {
      ztoolkit.log(
        `S3接続テストに失敗: ${String(error)}`,
        "error",
        "testS3Connection",
      );
    }
  }

  /**
   * 右クリックメニューの登録
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   */
  static registerContextMenus(attachmentHandler: AttachmentHandler): void {
    try {
      // 既存のメニューを削除
      ztoolkit.Menu.unregister("zotero-s3-manual-upload");
      ztoolkit.Menu.unregister("zotero-s3-download");

      // S3アップロードメニュー（ローカル添付ファイル用）
      ztoolkit.Menu.register("item", {
        tag: "menuitem",
        id: "zotero-s3-manual-upload",
        label: getString("menuitem-s3-manual-upload"),
        commandListener: (ev) => {
          Commands.handleContextMenuUpload(attachmentHandler);
        },
        // ローカル添付ファイルが選択されている場合のみ表示
        getVisibility: () => {
          const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
          return selectedItems.some(
            (item: Zotero.Item) =>
              item.isAttachment() && !isS3StoredAttachment(item),
          );
        },
      });

      // S3ダウンロードメニュー（S3添付ファイル用）
      ztoolkit.Menu.register("item", {
        tag: "menuitem",
        id: "zotero-s3-download",
        label: getString("menuitem-s3-download"),
        commandListener: (ev) => {
          Commands.handleContextMenuDownload(attachmentHandler);
        },
        // S3添付ファイルが選択されている場合のみ表示
        getVisibility: () => {
          const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
          return selectedItems.some(
            (item: Zotero.Item) =>
              item.isAttachment() && isS3StoredAttachment(item),
          );
        },
      });

      ztoolkit.log(
        "添付ファイル右クリックメニューを登録しました",
        "success",
        "registerContextMenus",
      );
    } catch (error) {
      ztoolkit.log(
        `右クリックメニュー登録に失敗: ${String(error)}`,
        "error",
        "registerContextMenus",
      );
    }
  }

  /**
   * 右クリックメニューからのアップロード処理
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   */
  static handleContextMenuUpload(attachmentHandler: AttachmentHandler): void {
    const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
    const attachments = selectedItems.filter((item: Zotero.Item) =>
      item.isAttachment(),
    );

    if (attachments.length > 0) {
      Commands.manualUploadSelectedAttachments(attachmentHandler);
    } else {
      new ztoolkit.ProgressWindow("S3アップロード", {
        closeOnClick: true,
        closeTime: 3000,
      })
        .createLine({
          text: "添付ファイルが選択されていません",
          type: "default",
          progress: 100,
        })
        .show();
    }
  }

  /**
   * 右クリックメニューからのダウンロード処理
   * @param {AttachmentHandler} attachmentHandler - 添付ファイルハンドラ
   */
  static handleContextMenuDownload(attachmentHandler: AttachmentHandler): void {
    const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
    const s3Attachments = selectedItems.filter(
      (item: Zotero.Item) => item.isAttachment() && isS3StoredAttachment(item),
    );

    if (s3Attachments.length > 0) {
      Commands.manualDownloadSelectedS3Attachments(attachmentHandler);
    } else {
      new ztoolkit.ProgressWindow("S3ダウンロード", {
        closeOnClick: true,
        closeTime: 3000,
      })
        .createLine({
          text: "S3添付ファイルが選択されていません",
          type: "default",
          progress: 100,
        })
        .show();
    }
  }
}
