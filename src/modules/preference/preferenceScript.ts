import { S3AuthManager, STORAGE_PROVIDERS } from "../s3AuthManager";
import { S3StorageManager } from "../s3StorageManager";
import { getString } from "../../utils/locale";
import {
  clearPref,
  getElement,
  getPref,
  setPref,
  getElementUnsafe,
} from "../../utils/prefs";
import { R2SpecificSetting } from "./r2Specificsetting";
import { CommonSettings } from "./commonSettings";
import { SettingHandler } from "./settingHandler";

type providers = "r2";

const commonSettings = new CommonSettings();
const providerSpecificSettings: Record<providers, SettingHandler> = {
  r2: new R2SpecificSetting(),
};

const providerSpecificSettingElementIds: Record<providers, string[]> = {
  r2: ["r2-settings"],
};

/**
 * 設定画面スクリプトを初期化する
 * @param {Window} _window - 設定ウィンドウオブジェクト
 * @returns {Promise<void>}
 */
export async function registerPrefsScripts(_window: Window) {
  // この関数は設定ウィンドウが開かれたときに呼ばれる
  // addon/content/preferences.xhtml の onpaneload 参照
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
    };
  } else {
    addon.data.prefs.window = _window;
  }

  await initializePrefsUI();
  bindPrefEvents();
}

/**
 * 設定画面のUIを初期化する
 * @returns {Promise<void>}
 */
async function initializePrefsUI() {
  if (!addon.data.prefs?.window) return;

  // 共通設定の初期化
  commonSettings.initializePrefsUI();

  // プロバイダー固有設定の初期化
  for (const setting of Object.values(providerSpecificSettings)) {
    setting.initializePrefsUI();
  }

  // UI の表示・非表示制御
  updatePrefsUI();
}

/**
 * 設定画面のUIを現在の設定値で更新する
 * @returns {Promise<void>}
 */
async function updatePrefsUI() {
  if (!addon.data.prefs?.window) return;

  // 現在のプロバイダーを取得
  const providerSelect = getElement("provider") as XUL.MenuList;
  const selectedProvider = providerSelect?.value || "aws";

  // 共通設定の UI 更新
  commonSettings.updatePrefsUI();

  // プロバイダー固有設定の UI 更新
  for (const setting of Object.values(providerSpecificSettings)) {
    setting.updatePrefsUI();
  }

  // プロバイダー固有セクションの表示・非表示制御
  updateProviderSpecificSettingVisibility(selectedProvider as providers);
}

/**
 * プロバイダーに応じてフォームフィールドの表示・非表示を切り替える
 * @param {string} provider - ストレージプロバイダー名
 * @returns {void}
 */
function updateProviderSpecificSettingVisibility(selectedProvider: providers) {
  if (!addon.data.prefs?.window) return;

  for (const provider of Object.keys(providerSpecificSettings)) {
    for (const ids of providerSpecificSettingElementIds[
      provider as providers
    ]) {
      const element = getElementUnsafe(ids);
      if (element) {
        element.style.display = provider === selectedProvider ? "" : "none";
      }
    }
  }
}

/**
 * 設定画面の各種イベントをバインドする
 * @returns {void}
 */
function bindPrefEvents() {
  if (!addon.data.prefs?.window) return;

  // プロバイダー選択の変更イベント
  const providerSelect = getElement("provider");
  providerSelect?.addEventListener("command", (e: Event) => {
    const target = e.target as XUL.MenuList;
    const selectedProvider = target.value as providers;

    // UI の更新
    updatePrefsUI();
    updateProviderSpecificSettingVisibility(selectedProvider);

    // デフォルト値の設定
    const providerConfig = S3AuthManager.getProviderInfo(target.value);
    if (providerConfig?.defaultEndpoint) {
      const endpointInput = getElement("endpoint");
      if (endpointInput && !endpointInput.value) {
        endpointInput.value = providerConfig.defaultEndpoint;
      }
    }
  });

  // 保存ボタン
  const saveButton = getElement("save-settings");
  saveButton?.addEventListener("command", async () => {
    await saveSettings();
  });

  // 接続テストボタン
  const testButton = getElement("test-connection");
  testButton?.addEventListener("command", async () => {
    await testConnection();
  });

  // クリアボタン
  const clearButton = getElement("clear-settings");
  clearButton?.addEventListener("command", async () => {
    await clearSettings();
  });

  // 共通設定のイベントをバインド（プロバイダー選択のイベント以外）
  commonSettings.bindPrefEvents();

  // プロバイダー固有設定のイベントをバインド
  for (const setting of Object.values(providerSpecificSettings)) {
    setting.bindPrefEvents();
  }
}

/**
 * 設定画面のフォーム値を保存する
 * @returns {Promise<void>}
 */
async function saveSettings() {
  if (!addon.data.prefs?.window) return;

  try {
    // 共通設定を保存
    commonSettings.saveSettings();

    // プロバイダー固有設定を保存
    const providerSelect = getElement("provider") as XUL.MenuList;
    const selectedProvider = providerSelect?.value || "aws";

    if (selectedProvider in providerSpecificSettings) {
      providerSpecificSettings[selectedProvider as providers].saveSettings();
    }

    // 成功メッセージは各設定クラスで表示される
  } catch (error) {
    ztoolkit.log(`設定保存エラー: ${String(error)}`, "error", "saveSettings");
    showStatus(`設定の保存中にエラーが発生しました: ${String(error)}`, "error");
  }
}

/**
 * 接続テストを実行する
 * @returns {Promise<void>}
 */
async function testConnection() {
  if (!addon.data.prefs?.window) return;

  try {
    showStatus("接続テスト中...", "info");

    // フォームから現在の値を取得
    const provider = (getElement("provider") as XUL.MenuList)?.value || "aws";
    const accessKey =
      (getElement("access-key") as HTMLInputElement)?.value || "";
    const secretKey =
      (getElement("secret-key") as HTMLInputElement)?.value || "";
    let endpoint = (getElement("endpoint") as HTMLInputElement)?.value || "";
    const region = (getElement("region") as HTMLInputElement)?.value || "";
    const bucket = (getElement("bucket") as HTMLInputElement)?.value || "";

    // AWS S3の場合、エンドポイントを自動計算
    if (provider === "aws" && region) {
      const calculatedEndpoint = S3AuthManager.getDefaultEndpoint(
        provider,
        region,
      );
      if (calculatedEndpoint) {
        endpoint = calculatedEndpoint;
      }
    }

    // バリデーション
    const validation = S3AuthManager.validateCredentials({
      provider,
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region,
      bucketName: bucket,
      endpoint,
    });
    if (!validation.isValid) {
      showStatus("エラー: " + validation.errors.join(", "), "error");
      return;
    }

    // 現在の認証情報を一時的に保存
    const currentCredentials = S3AuthManager.getCredentials();

    try {
      // 一時的に新しい認証情報を設定
      S3AuthManager.saveCredentials({
        provider,
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        region,
        bucketName: bucket,
        endpoint,
      });

      // 接続テスト実行
      await S3StorageManager.initializeClient();
      const success = await S3StorageManager.testConnection();

      if (success) {
        showStatus("接続テストに成功しました", "success");
      } else {
        showStatus("接続テストに失敗しました", "error");
      }
    } finally {
      // 元の認証情報を復元（安全に復元）
      if (
        currentCredentials.provider &&
        currentCredentials.accessKeyId &&
        currentCredentials.secretAccessKey &&
        currentCredentials.region &&
        currentCredentials.bucketName
      ) {
        S3AuthManager.saveCredentials(currentCredentials as any);
      } else {
        S3AuthManager.clearCredentials();
      }
    }
  } catch (error) {
    ztoolkit.log(
      `接続テストエラー: ${String(error)}`,
      "error",
      "testConnection",
    );
    showStatus(`接続テストに失敗しました: ${String(error)}`, "error");
  }
}

/**
 * 設定をクリアする
 * @returns {Promise<void>}
 */
async function clearSettings() {
  if (!addon.data.prefs?.window) return;

  try {
    // 共通設定をクリア
    commonSettings.clearSettings();

    // プロバイダー固有設定をクリア
    for (const setting of Object.values(providerSpecificSettings)) {
      setting.clearSettings();
    }

    // UI を更新
    await updatePrefsUI();

    showStatus("設定をクリアしました", "success");
  } catch (error) {
    ztoolkit.log(
      `設定クリアエラー: ${String(error)}`,
      "error",
      "clearSettings",
    );
    showStatus(
      `設定のクリア中にエラーが発生しました: ${String(error)}`,
      "error",
    );
  }
}

/**
 * ステータスメッセージを表示する
 * @param {string} message - 表示するメッセージ
 * @param {"success" | "error" | "info"} type - メッセージタイプ
 * @returns {void}
 */
function showStatus(message: string, type: "success" | "error" | "info") {
  const statusElement = getElementUnsafe("status") as HTMLDivElement;
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.className = "";

  // タイプに応じたスタイルを適用
  switch (type) {
    case "success":
      statusElement.style.backgroundColor = "#d4edda";
      statusElement.style.borderColor = "#c3e6cb";
      statusElement.style.color = "#155724";
      break;
    case "error":
      statusElement.style.backgroundColor = "#f8d7da";
      statusElement.style.borderColor = "#f5c6cb";
      statusElement.style.color = "#721c24";
      break;
    case "info":
      statusElement.style.backgroundColor = "#d1ecf1";
      statusElement.style.borderColor = "#bee5eb";
      statusElement.style.color = "#0c5460";
      break;
  }

  statusElement.style.display = "block";

  // 3秒後に非表示にする
  setTimeout(() => {
    if (statusElement) {
      statusElement.style.display = "none";
    }
  }, 3000);
}

export function registerPrefs(): void {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: `chrome://${addon.data.config.addonRef}/content/preferences.xhtml`,
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

/**
 * S3設定ダイアログを開く
 * @returns {void}
 */
export function openS3SettingsDialog(): void {
  // TODO: 設定ダイアログの実装
  ztoolkit.log(
    "S3設定ダイアログを開く（未実装）",
    "warn",
    "openS3SettingsDialog",
  );
}
