import { S3AuthManager, STORAGE_PROVIDERS } from "./s3AuthManager";
import { S3StorageManager } from "./s3StorageManager";
import { getString } from "../utils/locale";
import {
  clearPref,
  getElement,
  getPref,
  setPref,
  getElementUnsafe,
} from "../utils/prefs";

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

  await updatePrefsUI();
  bindPrefEvents();
}

/**
 * 設定画面のUIを現在の設定値で更新する
 * @returns {Promise<void>}
 */
async function updatePrefsUI() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  // 保存された設定を読み込み
  const credentials = S3AuthManager.getCredentialsForUI();

  // プロバイダー選択の設定
  const providerSelect = getElement("provider");
  if (providerSelect && credentials.provider) {
    providerSelect.value = credentials.provider;
  }

  // フォームフィールドの値を設定
  const accessKeyInput = getElement("access-key");
  const secretKeyInput = getElement("secret-key");
  const endpointInput = getElement("endpoint");
  const regionInput = getElement("region");
  const bucketInput = getElement("bucket");

  // Cloudflare APIトークンの設定読み込み
  const cloudflareApiTokenInput = getElement("cloudflare-api-token");

  // 除外コンテンツタイプの設定読み込み
  const ignoreContentTypesTextarea = getElement("ignore-content-types");

  // コレクション階層使用設定の読み込み
  const useCollectionHierarchyCheckbox = getElement("use-collection-hierarchy");

  if (accessKeyInput) accessKeyInput.value = credentials.accessKeyId || "";
  if (secretKeyInput) secretKeyInput.value = credentials.secretAccessKey || "";
  if (endpointInput) endpointInput.value = credentials.endpoint || "";
  if (regionInput) regionInput.value = credentials.region || "us-east-1";
  if (bucketInput) bucketInput.value = credentials.bucketName || "";

  // 除外コンテンツタイプの値を設定
  if (ignoreContentTypesTextarea) {
    const ignoreContentTypes = (getPref("ignoreContentTypes") as string) || "";
    ignoreContentTypesTextarea.value = ignoreContentTypes;
  }

  // コレクション階層使用設定の値を設定
  if (useCollectionHierarchyCheckbox) {
    const useCollectionHierarchy =
      (getPref("s3.useCollectionHierarchy") as boolean) || false;
    (useCollectionHierarchyCheckbox as unknown as XUL.Checkbox).checked =
      useCollectionHierarchy;
  }

  // Cloudflare APIトークンの値を設定
  if (cloudflareApiTokenInput) {
    try {
      const { R2PublicUrlManager } = await import("./r2");
      const hasToken = R2PublicUrlManager.hasCloudflareApiToken();
      cloudflareApiTokenInput.value = hasToken ? "****" : "";
    } catch (error) {
      ztoolkit.log(
        `Cloudflare APIトークンの読み込みエラー: ${String(error)}`,
        "error",
        "updatePrefsUI",
      );
    }
  }

  // R2公開URL設定の読み込み
  await updateR2PublicUrlUI();

  // プロバイダーに応じてフィールドの表示制御
  updateFieldVisibility(credentials.provider ?? "aws");
}

/**
 * R2公開URL設定のUIを更新する
 * @returns {Promise<void>}
 */
async function updateR2PublicUrlUI() {
  try {
    ztoolkit.log(
      "公開URL設定UI更新開始",
      "PreferenceScript.updateR2PublicUrlUI",
    );

    const { R2PublicUrlManager } = await import("./r2");

    // URLタイプの設定
    const urlTypeRadioGroup = getElementUnsafe(
      "public-url-type",
    ) as unknown as XUL.RadioGroup;
    const customDomainInput = getElementUnsafe(
      "custom-domain",
    ) as HTMLInputElement;
    const autoSaveCheckbox = getElementUnsafe(
      "auto-save-public-url",
    ) as unknown as XUL.Checkbox;

    ztoolkit.log(
      `要素の存在確認: radioGroup=${!!urlTypeRadioGroup}, customDomainInput=${!!customDomainInput}, autoSaveCheckbox=${!!autoSaveCheckbox}`,
      "info",
      "updateR2PublicUrlUI",
    );

    // 現在の設定を取得
    const customDomain = R2PublicUrlManager.getCustomDomain();
    const autoSaveEnabled = R2PublicUrlManager.getAutoSavePublicUrl();

    ztoolkit.log(
      `現在の設定: customDomain=${customDomain}, autoSaveEnabled=${autoSaveEnabled}`,
      "info",
      "updateR2PublicUrlUI",
    );

    // URLタイプの判定と設定（プリファレンスから直接取得）
    let urlType = (getPref("r2.urlType") as string) || "disabled";

    // 後方互換性：プリファレンスにr2.urlTypeが設定されていない場合の推定
    if (urlType === "disabled") {
      if (customDomain && customDomain.trim()) {
        urlType = "custom";
      } else if (autoSaveEnabled) {
        urlType = "r2dev";
      }
    }

    // ラジオボタンの設定
    if (urlTypeRadioGroup) {
      try {
        // XULラジオグループでは、valueプロパティを設定するだけで適切なラジオボタンが自動選択される
        urlTypeRadioGroup.value = urlType;

        ztoolkit.log(
          `ラジオグループの値を設定しました: ${urlType}`,
          "info",
          "updateR2PublicUrlUI",
        );
      } catch (radioError) {
        ztoolkit.log(
          `ラジオボタン設定エラー: ${String(radioError)}`,
          "error",
          "updateR2PublicUrlUI",
        );
      }
    } else {
      ztoolkit.log(
        "ラジオグループが見つかりません",
        "warn",
        "updateR2PublicUrlUI",
      );
    }

    // カスタムドメインの設定（input要素）
    if (customDomainInput) {
      customDomainInput.value = customDomain || "";
    } else {
      ztoolkit.log(
        "カスタムドメイン入力欄が見つかりません",
        "warn",
        "updateR2PublicUrlUI",
      );
    }

    // 自動保存チェックボックスの設定
    if (autoSaveCheckbox) {
      autoSaveCheckbox.checked = autoSaveEnabled;
    } else {
      ztoolkit.log(
        "自動保存チェックボックスが見つかりません",
        "warn",
        "updateR2PublicUrlUI",
      );
    }

    // UIの表示・非表示制御
    updatePublicUrlVisibility(urlType);

    ztoolkit.log(
      `公開URL設定UI更新完了: urlType=${urlType}, customDomain=${customDomain}, autoSave=${autoSaveEnabled}`,
      "info",
      "updateR2PublicUrlUI",
    );
  } catch (error) {
    ztoolkit.log(
      `公開URL設定の読み込みエラー: ${String(error)}`,
      "error",
      "updateR2PublicUrlUI",
    );
  }
}

/**
 * 公開URL設定のUIの表示・非表示を制御する
 * @param {string} urlType - URLタイプ
 */
function updatePublicUrlVisibility(urlType: string) {
  const customDomainSettings = getElementUnsafe(
    "custom-domain-settings",
  ) as HTMLElement;
  const r2devSettings = getElementUnsafe("r2dev-settings") as HTMLElement;
  const autoSaveSettings = getElementUnsafe(
    "auto-save-settings",
  ) as HTMLElement;

  if (customDomainSettings) {
    customDomainSettings.style.display = urlType === "custom" ? "" : "none";
  }

  if (r2devSettings) {
    r2devSettings.style.display = urlType === "r2dev" ? "" : "none";
  }

  if (autoSaveSettings) {
    autoSaveSettings.style.display = urlType !== "disabled" ? "" : "none";
  }

  ztoolkit.log(
    `公開URL表示制御: urlType=${urlType}`,
    "info",
    "updatePublicUrlVisibility",
  );
}

/**
 * プロバイダーに応じてフォームフィールドの表示・非表示を切り替える
 * @param {string} provider - ストレージプロバイダー名
 * @returns {void}
 */
function updateFieldVisibility(provider: string) {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;
  const providerConfig = S3AuthManager.getProviderInfo(provider);

  // エンドポイントフィールドの表示制御
  const endpointContainer = getElementUnsafe(
    "endpoint-container",
  ) as HTMLElement;
  if (endpointContainer) {
    endpointContainer.style.display = providerConfig?.endpointRequired
      ? ""
      : "none";
  }

  // リージョンフィールドの表示制御
  const regionContainer = getElementUnsafe("region-container") as HTMLElement;
  if (regionContainer) {
    regionContainer.style.display = providerConfig?.regionRequired
      ? ""
      : "none";
  }

  // Cloudflare APIトークンフィールドの表示制御（R2の場合のみ表示）
  const cloudflareTokenContainer = getElementUnsafe(
    "cloudflare-token-container",
  ) as HTMLElement;
  if (cloudflareTokenContainer) {
    const isR2Provider = provider === "r2";
    cloudflareTokenContainer.style.display = isR2Provider ? "" : "none";

    ztoolkit.log(
      `プロバイダー表示制御: ${provider}, R2設定表示=${isR2Provider}`,
      "info",
      "updateFieldVisibility",
    );
  }

  // R2開発URL設定の表示制御（R2以外では無効化メッセージを表示）
  updateR2DevUrlVisibility(provider);

  // プロバイダー固有のプレースホルダーを設定
  const endpointInput = getElement("endpoint");
  if (endpointInput && providerConfig?.defaultEndpoint) {
    endpointInput.placeholder = providerConfig.defaultEndpoint;
  }
}

/**
 * R2開発URL設定の表示制御（プロバイダーに応じて）
 * @param {string} provider - ストレージプロバイダー名
 */
function updateR2DevUrlVisibility(provider: string) {
  const r2devSettings = getElementUnsafe("r2dev-settings") as HTMLElement;
  const urlTypeRadioGroup = getElementUnsafe(
    "public-url-type",
  ) as unknown as XUL.RadioGroup;

  if (!r2devSettings || !urlTypeRadioGroup) return;

  const isR2Provider = provider === "r2";
  const currentUrlType = urlTypeRadioGroup.value;

  if (!isR2Provider && currentUrlType === "r2dev") {
    // R2以外のプロバイダーでr2dev選択されている場合は無効に変更
    urlTypeRadioGroup.value = "disabled";
    updatePublicUrlVisibility("disabled");
    showStatus("警告: r2.dev開発URLはCloudflare R2でのみ利用可能です", "error");
  }

  // r2dev選択肢の無効化/有効化
  const r2devRadio = getElementUnsafe("url-r2dev") as unknown as XUL.Radio;
  if (r2devRadio) {
    r2devRadio.disabled = !isR2Provider;
    if (!isR2Provider) {
      r2devRadio.setAttribute("tooltiptext", "Cloudflare R2でのみ利用可能です");
    } else {
      r2devRadio.removeAttribute("tooltiptext");
    }
  }

  ztoolkit.log(
    `R2開発URL表示制御: ${provider}, isR2=${isR2Provider}`,
    "info",
    "updateR2DevUrlVisibility",
  );
}

/**
 * 設定画面の各種イベントをバインドする
 * @returns {void}
 */
function bindPrefEvents() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  // プロバイダー選択の変更イベント
  const providerSelect = getElement("provider");
  providerSelect?.addEventListener("command", (e: Event) => {
    const target = e.target as XUL.MenuList;
    updateFieldVisibility(target.value);

    // デフォルト値の設定
    const providerConfig = S3AuthManager.getProviderInfo(target.value);
    if (providerConfig?.defaultEndpoint) {
      const endpointInput = getElement("endpoint");
      if (endpointInput && !endpointInput.value) {
        endpointInput.value = providerConfig.defaultEndpoint;
      }
    }

    // プロバイダー変更時に公開URL設定の表示も更新
    updateR2DevUrlVisibility(target.value);
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

  // Cloudflare APIトークン保存ボタン
  const saveCloudflareTokenButton = getElement("save-cloudflare-token");
  saveCloudflareTokenButton?.addEventListener("command", async () => {
    await saveCloudflareApiToken();
  });

  // Cloudflare APIトークンクリアボタン
  const clearCloudflareTokenButton = getElement("clear-cloudflare-token");
  clearCloudflareTokenButton?.addEventListener("command", async () => {
    await clearCloudflareApiToken();
  });

  // パブリック開発URL有効化ボタン
  const enablePublicUrlButton = getElement("enable-public-url");
  enablePublicUrlButton?.addEventListener("command", async () => {
    await enablePublicDevelopmentUrl();
  });

  // R2公開URL設定関連のイベント
  bindPublicUrlEvents();
}

/**
 * 公開URL設定のイベントをバインドする
 * @returns {void}
 */
function bindPublicUrlEvents() {
  // URLタイプ選択の変更イベント
  const urlTypeRadioGroup = getElementUnsafe(
    "public-url-type",
  ) as unknown as XUL.RadioGroup;
  urlTypeRadioGroup?.addEventListener("command", (e: Event) => {
    const radioGroup = e.target as XUL.RadioGroup;
    updatePublicUrlVisibility(radioGroup.value);

    // プロバイダーがR2でない場合の警告
    const currentProvider =
      (getElement("provider") as XUL.MenuList)?.value || "aws";
    if (radioGroup.value === "r2dev" && currentProvider !== "r2") {
      showStatus(
        "警告: r2.dev開発URLはCloudflare R2でのみ利用可能です",
        "error",
      );
    }
  });

  // カスタムドメインテストボタン
  const testCustomDomainButton = getElementUnsafe(
    "test-custom-domain",
  ) as unknown as XUL.Button;
  testCustomDomainButton?.addEventListener("command", async () => {
    await testCustomDomain();
  });

  // 公開URL設定保存ボタン
  const savePublicUrlSettingsButton = getElementUnsafe(
    "save-public-url-settings",
  ) as unknown as XUL.Button;
  savePublicUrlSettingsButton?.addEventListener("command", async () => {
    await savePublicUrlSettings();
  });
}

/**
 * 設定画面のフォーム値を保存する
 * @returns {Promise<void>}
 */
async function saveSettings() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  // フォームから値を取得
  const provider = (getElement("provider") as XUL.MenuList)?.value || "aws";
  const accessKey = (getElement("access-key") as HTMLInputElement)?.value || "";
  const secretKey = (getElement("secret-key") as HTMLInputElement)?.value || "";
  let endpoint = (getElement("endpoint") as HTMLInputElement)?.value || "";
  const region = (getElement("region") as HTMLInputElement)?.value || "";
  const bucket = (getElement("bucket") as HTMLInputElement)?.value || "";

  // 除外コンテンツタイプの取得
  const ignoreContentTypes =
    (getElement("ignore-content-types") as HTMLTextAreaElement)?.value || "";

  // コレクション階層使用設定の取得
  const useCollectionHierarchy =
    (getElement("use-collection-hierarchy") as unknown as XUL.Checkbox)
      ?.checked || false;

  try {
    // AWS S3の場合、エンドポイントを自動計算
    if (provider === "aws" && region) {
      const calculatedEndpoint = S3AuthManager.getDefaultEndpoint(
        provider,
        region,
      );
      if (calculatedEndpoint) {
        endpoint = calculatedEndpoint;
        ztoolkit.log(
          `AWS S3のエンドポイントを計算しました: ${endpoint}`,
          "info",
          "saveSettings",
        );
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

    // 設定を保存
    await S3AuthManager.saveCredentials({
      provider,
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region,
      bucketName: bucket,
      endpoint,
    });

    // 除外コンテンツタイプを保存
    setPref("ignoreContentTypes", ignoreContentTypes);

    // コレクション階層使用設定を保存
    setPref("s3.useCollectionHierarchy", useCollectionHierarchy);

    // 設定保存後、S3クライアントを新しい認証情報で再初期化
    try {
      await S3StorageManager.initializeClient();
      ztoolkit.log(
        "S3クライアントを新しい設定で再初期化しました",
        "info",
        "saveSettings",
      );
    } catch (error) {
      ztoolkit.log(
        `S3クライアント再初期化に失敗: ${String(error)}`,
        "warn",
        "saveSettings",
      );
      // 初期化失敗は警告として扱う（設定自体は保存済み）
    }

    showStatus("設定を保存しました", "success");
    notify("設定保存完了", "S3認証情報を保存しました");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showStatus("保存に失敗しました: " + errorMessage, "error");
    ztoolkit.log(`設定保存エラー: ${errorMessage}`, "error", "saveSettings");
  }
}

/**
 * S3ストレージへの接続テストを行う
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

    // 一時的に現在のフォーム値でクライアントを初期化
    const tempCredentials = {
      provider,
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region,
      bucketName: bucket,
      endpoint,
    };

    // バリデーション
    const validation = S3AuthManager.validateCredentials(tempCredentials);
    if (!validation.isValid) {
      showStatus("エラー: " + validation.errors.join(", "), "error");
      return;
    }

    await S3StorageManager.initializeClient();
    const result = await S3StorageManager.testConnection();

    if (result) {
      showStatus("接続テストに成功しました", "success");
      notify("接続テスト成功", "S3ストレージへの接続が確認できました");
    } else {
      showStatus("接続テストに失敗しました", "error");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showStatus("接続テストエラー: " + errorMessage, "error");
    ztoolkit.log(
      `接続テストエラー: ${errorMessage}`,
      "error",
      "testConnection",
    );
  }
}

/**
 * 設定画面のフォーム値と保存済み設定をクリアする
 * @returns {Promise<void>}
 */
async function clearSettings() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  try {
    // 設定をクリア
    S3AuthManager.clearCredentials();

    // Cloudflare APIトークンもクリア
    try {
      const { R2PublicUrlManager } = await import("./r2");
      R2PublicUrlManager.clearCloudflareApiToken();

      // R2公開URL設定もクリア
      R2PublicUrlManager.clearCustomDomain();
      R2PublicUrlManager.setAutoSavePublicUrl(false);
    } catch (error) {
      ztoolkit.log(
        `Cloudflare APIトークンクリア時のエラー: ${String(error)}`,
        "warn",
        "clearSettings",
      );
    }

    // S3クライアントもクリア（認証情報がなくなったため）
    try {
      S3StorageManager.clearClient();
    } catch (error) {
      ztoolkit.log(
        `S3クライアントクリア時のエラー: ${String(error)}`,
        "warn",
        "clearSettings",
      );
    }

    // フォームをクリア
    (getElement("provider") as XUL.MenuList).value = "aws";
    (getElement("access-key") as HTMLInputElement).value = "";
    (getElement("secret-key") as HTMLInputElement).value = "";
    (getElement("endpoint") as HTMLInputElement).value = "";
    (getElement("region") as HTMLInputElement).value = "us-east-1";
    (getElement("bucket") as HTMLInputElement).value = "";

    // Cloudflare APIトークン入力欄もクリア
    const cloudflareTokenInput = getElement(
      "cloudflare-api-token",
    ) as HTMLInputElement;
    if (cloudflareTokenInput) {
      cloudflareTokenInput.value = "";
    }

    // 除外コンテンツタイプもクリア
    const ignoreContentTypesTextarea = getElement(
      "ignore-content-types",
    ) as HTMLTextAreaElement;
    if (ignoreContentTypesTextarea) {
      ignoreContentTypesTextarea.value = "";
    }
    clearPref("ignoreContentTypes");

    // コレクション階層使用設定もクリア
    const useCollectionHierarchyCheckbox = getElement(
      "use-collection-hierarchy",
    );
    if (useCollectionHierarchyCheckbox) {
      (useCollectionHierarchyCheckbox as unknown as XUL.Checkbox).checked =
        false;
    }
    clearPref("s3.useCollectionHierarchy");

    // R2公開URL設定をクリア（プリファレンス）
    const { R2PublicUrlManager } = await import("./r2");
    R2PublicUrlManager.clearCustomDomain();
    R2PublicUrlManager.setAutoSavePublicUrl(false);
    R2PublicUrlManager.clearCloudflareApiToken();
    clearPref("r2.urlType");

    // R2公開URL設定フォームもクリア
    const urlTypeRadioGroup = getElementUnsafe(
      "public-url-type",
    ) as unknown as XUL.RadioGroup;
    const customDomainInput = getElementUnsafe(
      "custom-domain",
    ) as HTMLInputElement;
    const autoSaveCheckbox = getElementUnsafe(
      "auto-save-public-url",
    ) as unknown as XUL.Checkbox;
    const customDomainStatus = getElementUnsafe(
      "custom-domain-status",
    ) as HTMLDivElement;

    if (urlTypeRadioGroup) {
      urlTypeRadioGroup.value = "disabled";
    }
    if (customDomainInput) {
      customDomainInput.value = "";
    }
    if (autoSaveCheckbox) {
      autoSaveCheckbox.checked = false;
    }
    if (customDomainStatus) {
      customDomainStatus.textContent = "";
      customDomainStatus.style.display = "none";
    }

    // UIの表示状態をリセット
    updatePublicUrlVisibility("disabled");

    showStatus("すべての設定をクリアしました", "success");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showStatus(`設定のクリアに失敗: ${errorMessage}`, "error");
    ztoolkit.log(`設定クリア失敗: ${errorMessage}`, "error", "clearSettings");
  }
}

/**
 * 設定画面下部のステータスメッセージを表示する
 * @param {string} message - 表示するメッセージ
 * @param {"success" | "error" | "info"} type - メッセージの種類
 * @returns {void}
 */
function showStatus(message: string, type: "success" | "error" | "info") {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;
  const statusDiv = getElement("status") as HTMLDivElement;

  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.style.backgroundColor =
      type === "success" ? "#d4edda" : type === "error" ? "#f8d7da" : "#d1ecf1";
    statusDiv.style.color =
      type === "success" ? "#155724" : type === "error" ? "#721c24" : "#0c5460";
    statusDiv.style.border = `1px solid ${
      type === "success" ? "#c3e6cb" : type === "error" ? "#f5c6cb" : "#bee5eb"
    }`;

    // 3秒後にクリア（成功メッセージの場合のみ）
    if (type === "success") {
      setTimeout(() => {
        if (statusDiv) {
          statusDiv.textContent = "";
          statusDiv.style.backgroundColor = "";
          statusDiv.style.color = "";
          statusDiv.style.border = "";
        }
      }, 3000);
    }
  }
}

/**
 * 設定画面を登録
 * @returns {void}
 */
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

/**
 * Cloudflare APIトークンを保存
 * @returns {Promise<void>}
 */
async function saveCloudflareApiToken() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  try {
    const tokenInput = getElement("cloudflare-api-token") as HTMLInputElement;

    if (!tokenInput || !tokenInput.value.trim()) {
      showStatus("エラー: Cloudflare APIトークンを入力してください", "error");
      return;
    }

    // トークンの保存（"****"の場合は既存のトークンをそのまま使用）
    if (tokenInput.value.trim() !== "****") {
      const { R2PublicUrlManager } = await import("./r2");
      R2PublicUrlManager.saveCloudflareApiToken(tokenInput.value.trim());
    }

    showStatus("Cloudflare APIトークンを保存しました", "success");
    notify("Cloudflare APIトークン保存完了", "APIトークンを安全に保存しました");

    // 入力欄をマスク表示に変更
    tokenInput.value = "****";
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showStatus("Cloudflare APIトークンの保存に失敗: " + errorMessage, "error");
    ztoolkit.log(
      `Cloudflare APIトークン保存エラー: ${errorMessage}`,
      "error",
      "saveCloudflareApiToken",
    );
  }
}

/**
 * Cloudflare APIトークンをクリア
 * @returns {Promise<void>}
 */
async function clearCloudflareApiToken() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  try {
    const { R2PublicUrlManager } = await import("./r2");
    R2PublicUrlManager.clearCloudflareApiToken();

    // 入力欄をクリア
    const tokenInput = getElement("cloudflare-api-token") as HTMLInputElement;
    if (tokenInput) {
      tokenInput.value = "";
    }

    showStatus("Cloudflare APIトークンをクリアしました", "success");
    notify("Cloudflare APIトークンクリア完了", "APIトークンを削除しました");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showStatus(
      "Cloudflare APIトークンのクリアに失敗: " + errorMessage,
      "error",
    );
    ztoolkit.log(
      `Cloudflare APIトークンクリアエラー: ${errorMessage}`,
      "error",
      "clearCloudflareApiToken",
    );
  }
}

/**
 * R2バケットのパブリック開発URLを有効化
 * @returns {Promise<void>}
 */
async function enablePublicDevelopmentUrl() {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  try {
    // バケット名を取得
    const bucketInput = getElement("bucket") as HTMLInputElement;

    if (!bucketInput || !bucketInput.value.trim()) {
      showStatus("エラー: バケット名を入力してください", "error");
      return;
    }

    showStatus("パブリック開発URLを有効化中...", "info");

    const { R2PublicUrlManager } = await import("./r2");

    // APIトークンの確認
    if (!R2PublicUrlManager.hasCloudflareApiToken()) {
      showStatus("エラー: Cloudflare APIトークンが設定されていません", "error");
      return;
    }

    // パブリック開発URLを有効化
    const success = await R2PublicUrlManager.enablePublicDevelopmentUrl(
      bucketInput.value.trim(),
    );

    if (success) {
      showStatus("パブリック開発URLを有効化しました", "success");
      notify(
        "パブリック開発URL有効化完了",
        "R2バケットのパブリック開発URLを有効化しました",
      );
    } else {
      showStatus("パブリック開発URLの有効化に失敗しました", "error");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showStatus("パブリック開発URL有効化エラー: " + errorMessage, "error");
    ztoolkit.log(
      `パブリック開発URL有効化エラー: ${errorMessage}`,
      "error",
      "enablePublicDevelopmentUrl",
    );
  }
}

/**
 * カスタムドメインの接続テストを実行
 * @returns {Promise<void>}
 */
async function testCustomDomain() {
  try {
    const customDomainInput = getElementUnsafe(
      "custom-domain",
    ) as HTMLInputElement;
    const customDomainStatus = getElementUnsafe(
      "custom-domain-status",
    ) as HTMLDivElement;

    const customDomain = customDomainInput?.value?.trim();
    if (!customDomain) {
      showCustomDomainStatus("カスタムドメインを入力してください", "error");
      return;
    }

    // 形式検証
    const { R2PublicUrlManager } = await import("./r2");
    if (!R2PublicUrlManager.isValidCustomDomain(customDomain)) {
      showCustomDomainStatus("無効なドメイン形式です", "error");
      return;
    }

    showCustomDomainStatus("接続確認中...", "info");

    // ドメイン状態確認
    const result =
      await R2PublicUrlManager.checkCustomDomainConnectivity(customDomain);

    if (result.connected) {
      showCustomDomainStatus(
        "✅ カスタムドメインは正常に接続されています",
        "success",
      );
    } else {
      const statusMessages: { [key: string]: string } = {
        no_r2_credentials: "R2認証情報が設定されていません",
        no_api_token: "Cloudflare APIトークンが設定されていません",
        invalid_endpoint: "無効なR2エンドポイントです",
        no_bucket_name: "バケット名が設定されていません",
        not_found: "カスタムドメインが見つかりません",
        api_error: "Cloudflare APIエラーが発生しました",
        error: "接続確認でエラーが発生しました",
      };
      const message =
        statusMessages[result.status] || `接続エラー: ${result.status}`;
      showCustomDomainStatus(`❌ ${message}`, "error");
    }
  } catch (error) {
    ztoolkit.log(
      `カスタムドメインテスト失敗: ${String(error)}`,
      "error",
      "testCustomDomain",
    );
    showCustomDomainStatus(
      `❌ テストに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

/**
 * カスタムドメインの状態表示を更新
 * @param {string} message - 表示メッセージ
 * @param {"success" | "error" | "info"} type - メッセージタイプ
 */
function showCustomDomainStatus(
  message: string,
  type: "success" | "error" | "info",
) {
  const customDomainStatus = getElementUnsafe(
    "custom-domain-status",
  ) as HTMLDivElement;
  if (!customDomainStatus) {
    ztoolkit.log(
      "カスタムドメイン状態表示要素が見つかりません",
      "warn",
      "showCustomDomainStatus",
    );
    return;
  }

  customDomainStatus.textContent = message;
  customDomainStatus.style.backgroundColor =
    type === "success" ? "#d4edda" : type === "error" ? "#f8d7da" : "#d1ecf1";
  customDomainStatus.style.color =
    type === "success" ? "#155724" : type === "error" ? "#721c24" : "#0c5460";
  customDomainStatus.style.border = `1px solid ${
    type === "success" ? "#c3e6cb" : type === "error" ? "#f5c6cb" : "#bee5eb"
  }`;
  customDomainStatus.style.display = "block";

  ztoolkit.log(
    `カスタムドメイン状態更新: ${message} (${type})`,
    "info",
    "showCustomDomainStatus",
  );
}

/**
 * R2公開URL設定を保存
 * @returns {Promise<void>}
 */
async function savePublicUrlSettings() {
  try {
    const { R2PublicUrlManager } = await import("./r2");

    // フォームから値を取得
    const urlTypeRadioGroup = getElementUnsafe(
      "public-url-type",
    ) as unknown as XUL.RadioGroup;
    const customDomainInput = getElementUnsafe(
      "custom-domain",
    ) as HTMLInputElement;
    const autoSaveCheckbox = getElementUnsafe(
      "auto-save-public-url",
    ) as unknown as XUL.Checkbox;

    const urlType = urlTypeRadioGroup?.value || "disabled";
    const customDomain = customDomainInput?.value?.trim() || "";
    const autoSaveEnabled = autoSaveCheckbox?.checked || false;

    // URLタイプをプリファレンスに保存
    setPref("r2.urlType", urlType);
    ztoolkit.log(
      `URLタイプを保存: ${urlType}`,
      "info",
      "savePublicUrlSettings",
    );

    // 設定の保存
    if (urlType === "custom" && customDomain) {
      // カスタムドメインの検証
      if (!R2PublicUrlManager.isValidCustomDomain(customDomain)) {
        showStatus("無効なカスタムドメイン形式です", "error");
        return;
      }
      R2PublicUrlManager.saveCustomDomain(customDomain);
      R2PublicUrlManager.setAutoSavePublicUrl(true); // カスタムドメインの場合は自動保存を有効
    } else if (urlType === "r2dev") {
      R2PublicUrlManager.clearCustomDomain(); // カスタムドメインをクリア
      R2PublicUrlManager.setAutoSavePublicUrl(true); // r2.devの場合は自動保存を有効
    } else {
      // 無効の場合はすべてクリア
      R2PublicUrlManager.clearCustomDomain();
      R2PublicUrlManager.setAutoSavePublicUrl(false);
    }

    // 追加で自動保存設定を反映（チェックボックス状態に関係なく）
    if (urlType !== "disabled") {
      R2PublicUrlManager.setAutoSavePublicUrl(autoSaveEnabled);
    }

    showStatus("公開URL設定を保存しました", "success");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showStatus(`公開URL設定の保存に失敗: ${errorMessage}`, "error");
    ztoolkit.log(
      `公開URL設定保存失敗: ${errorMessage}`,
      "error",
      "savePublicUrlSettings",
    );
  }
}
