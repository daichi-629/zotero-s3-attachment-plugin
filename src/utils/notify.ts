/**
 * Notification utilities for Zotero S3 Sync plugin
 */

type LogLevel = "debug" | "info" | "warn" | "error" | "success";

export const createDebugNotification = (
  message: string,
  level: LogLevel = "info",
  functionName = "unknown",
) => {
  // production buildでは表示しない
  if (typeof __env__ !== "undefined" && __env__ === "production") {
    return;
  }

  // 環境変数による重要度フィルタリング
  const minLevel =
    (Zotero.Prefs.get("extensions.zotero-s3.debugLevel") as LogLevel) || "info";

  const levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    success: 1,
  };

  if (levelPriority[level] < levelPriority[minLevel]) {
    return;
  }

  try {
    // ProgressWindowのアイコン関連を削除し、メッセージのみ表示
    const progressWindow = new Zotero.ProgressWindow();
    progressWindow.changeHeadline(`S3 Plugin Debug [${level.toUpperCase()}]`);
    progressWindow.addDescription(`[${functionName}] ${message}`);
    progressWindow.show();

    // 10秒後に自動的に閉じる
    setTimeout(() => {
      progressWindow.close();
    }, 10000);
  } catch (e) {
    // fallback to Zotero.debug
    const error = e instanceof Error ? e.toString() : String(e);
    console.log("S3 Plugin Debug Error: " + error);
    console.log(`Original message [${level}][${functionName}]: ${message}`);
  }
};

export const createNotification = (title: string, message: string) => {
  try {
    // production buildでも表示する通知
    const progressWindow = new Zotero.ProgressWindow();
    progressWindow.changeHeadline(title);
    progressWindow.addDescription(message);
    progressWindow.show();

    // 5秒後に自動的に閉じる
    setTimeout(() => {
      progressWindow.close();
    }, 5000);
  } catch (e) {
    // fallback to Zotero.debug
    const error = e instanceof Error ? e.toString() : String(e);
    console.log("S3 Plugin Notification Error: " + error);
    console.log(`Original message [${title}]: ${message}`);
  }
};

// グローバル関数として利用できるようにエクスポート
export const debugNotify = createDebugNotification;
export const notify = createNotification;
