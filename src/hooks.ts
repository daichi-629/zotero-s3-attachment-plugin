import { AttachmentHandler } from "./modules/attachmentHandler";
import { getString, initLocale } from "./utils/locale";
import {
  registerPrefsScripts,
  registerPrefs,
  openS3SettingsDialog,
} from "./modules/preferenceScript";
import { Commands } from "./modules/commands";
import { createZToolkit } from "./utils/ztoolkit";
import { Notifier } from "./modules/notifier";
import { S3StorageManager } from "./modules/s3StorageManager";
import { DeletionHandler } from "./modules/deletionHandler";
// S3機能のインスタンス
let attachmentHandler: AttachmentHandler;
let deletionHandler: DeletionHandler;

/**
 * プラグインの起動時に呼ばれる初期化関数
 *
 * - Zoteroの初期化・UI準備・アンロックを待機
 * - ロケール（国際化）初期化
 * - S3機能（添付ファイルハンドラ・認証マネージャ）を初期化
 * - Zotero Notifierを登録し、添付ファイルの変更を監視
 * - 設定画面を登録
 * - すべてのメインウィンドウでonMainWindowLoadを実行
 *
 * @returns {Promise<void>}
 */
async function onStartup(): Promise<void> {
  ztoolkit.log("Plugin startup");
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // AttachmentHandlerを作成（静的メソッドを使用）
  attachmentHandler = new AttachmentHandler();

  // DeletionHandlerを作成
  deletionHandler = new DeletionHandler(attachmentHandler);

  // コマンドとショートカットを登録
  Commands.registerCommands(attachmentHandler);

  // Zotero Notifierを登録（添付ファイルの変更を監視）
  Notifier.registerNotifier();

  // 設定画面を登録
  registerPrefs();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  ztoolkit.log("Plugin startup completed");
}

/**
 * メインウィンドウのロード時に呼ばれる関数
 * 各ウィンドウごとにztoolkitを初期化し、FTLリソースを挿入する
 * @param { _ZoteroTypes.MainWindow } win - メインウィンドウオブジェクト
 * @returns {Promise<void>}
 */
async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // 各ウィンドウごとにztoolkitを作成
  addon.data.ztoolkit = createZToolkit();

  // @ts-ignore This is a moz feature
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  ztoolkit.log("Main window loaded");
}

/**
 * メインウィンドウのアンロード時に呼ばれる関数
 * ztoolkitの登録解除とダイアログのクローズを行う
 * @param {Window} win - ウィンドウオブジェクト
 * @returns {Promise<void>}
 */
async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}
/**
 * プラグインのシャットダウン時に呼ばれる関数
 * Notifierの解除、ztoolkitの登録解除、ダイアログのクローズ、addonオブジェクトの削除を行う
 * @returns {void}
 */
function onShutdown(): void {
  ztoolkit.unregisterAll();
  ztoolkit.Prompt.unregister("s3UploadSelectedAttachments");
  ztoolkit.Prompt.unregister("s3DownloadSelectedAttachments");
  ztoolkit.Prompt.unregister("s3ConnectionTest");
  ztoolkit.Prompt.unregister("s3Settings");
  addon.data.dialog?.window?.close();

  // Addonオブジェクトを削除
  addon.data.alive = false;
  // @ts-ignore - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];

  ztoolkit.log("Plugin shutdown completed");
}

/**
 * Zotero Notifierイベントのディスパッチャー
 * 添付ファイルの追加・削除・変更を監視
 * @param {string} event - イベント種別（add, delete等）
 * @param {string} type - イベントタイプ（item等）
 * @param {Array<string | number>} ids - 対象ID配列
 * @param {{ [key: string]: any }} extraData - 追加データ
 * @returns {Promise<void>}
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
): Promise<void> {
  if (type !== "item") {
    return;
  }

  for (const id of ids) {
    const numericId = typeof id === "string" ? parseInt(id, 10) : id;

    try {
      if (event === "add") {
        await handleAddEvent(numericId);
      } else if (event === "delete" || event === "trash") {
        await deletionHandler.handleDeletionEvent(event, numericId, extraData);
      }
    } catch (error) {
      ztoolkit.log(`Failed to handle notify event for ${numericId}:`, error);
    }
  }
}

/**
 * アイテム追加イベントの処理
 * @param numericId アイテムID
 */
async function handleAddEvent(numericId: number): Promise<void> {
  const item = await Zotero.Items.getAsync(numericId);
  if (!item || !item.isAttachment()) {
    return;
  }

  ztoolkit.log(`New attachment detected: ${numericId}`);

  // 少し遅延してからアップロード（ファイル保存完了を待つ）
  setTimeout(() => {
    attachmentHandler.onAttachmentAdded(numericId).catch((error) => {
      ztoolkit.log(`Failed to handle new attachment ${numericId}:`, error);
    });
  }, 1000);
}

/**
 * 設定ウィンドウイベントのディスパッチャー
 * @param {string} type - イベント種別
 * @param {{ [key: string]: any }} data - イベントデータ
 * @returns {Promise<void>}
 */
async function onPrefsEvent(
  type: string,
  data: { [key: string]: any },
): Promise<void> {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

/**
 * ショートカットイベントのディスパッチャー
 * @param {string} type - ショートカット種別
 * @returns {void}
 */
function onShortcuts(type: string): void {
  switch (type) {
    case "s3Upload":
      // 手動S3アップロードショートカット
      Commands.manualUploadSelectedAttachments(attachmentHandler);
      break;
    case "s3Download":
      // 手動S3ダウンロードショートカット
      Commands.manualDownloadSelectedS3Attachments(attachmentHandler);
      break;
    case "s3Settings":
      // S3設定ウィンドウを開く
      openS3SettingsDialog();
      break;
    case "s3ConnectionTest":
      Commands.testS3Connection(attachmentHandler);
      break;
    default:
      break;
  }
}

/**
 * ダイアログイベントのディスパッチャー
 * @param {string} type - ダイアログイベント種別
 * @returns {void}
 */
function onDialogEvents(type: string): void {
  switch (type) {
    case "s3SettingsDialog":
      openS3SettingsDialog();
      break;
    case "s3TestConnection":
      Commands.testS3Connection(attachmentHandler);
      break;
    default:
      break;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
