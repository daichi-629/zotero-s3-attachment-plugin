import { config } from "../../package.json";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];
type ElementsMap = _ZoteroTypes.Prefs["ElementsMap"];

const PREFS_PREFIX = config.prefsPrefix;

/**
 * Get preference value.
 * Wrapper of `Zotero.Prefs.get`.
 * @param key
 */
export function getPref<K extends keyof PluginPrefsMap>(key: K) {
  ztoolkit.log(`プリファレンス値を取得: ${key}`, "info", "getPref");
  try {
    const value = Zotero.Prefs.get(
      `${PREFS_PREFIX}.${key}`,
      true,
    ) as PluginPrefsMap[K];
    ztoolkit.log(
      `プリファレンス値取得成功: ${key} = ${String(value)}`,
      "info",
      "getPref",
    );
    return value;
  } catch (error) {
    ztoolkit.log(
      `プリファレンス値取得エラー: ${key}, エラー: ${String(error)}`,
      "error",
      "getPref",
    );
    throw error;
  }
}

/**
 * Set preference value.
 * Wrapper of `Zotero.Prefs.set`.
 * @param key
 * @param value
 */
export function setPref<K extends keyof PluginPrefsMap>(
  key: K,
  value: PluginPrefsMap[K],
) {
  ztoolkit.log(
    `プリファレンス値を設定: ${key} = ${String(value)}`,
    "info",
    "setPref",
  );
  try {
    const result = Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
    ztoolkit.log(`プリファレンス値設定成功: ${key}`, "info", "setPref");
    return result;
  } catch (error) {
    ztoolkit.log(
      `プリファレンス値設定エラー: ${key}, エラー: ${String(error)}`,
      "error",
      "setPref",
    );
    throw error;
  }
}

/**
 * Clear preference value.
 * Wrapper of `Zotero.Prefs.clear`.
 * @param key
 */
export function clearPref<K extends keyof PluginPrefsMap>(key: K) {
  ztoolkit.log(`プリファレンス値をクリア: ${key}`, "info", "clearPref");
  try {
    const result = Zotero.Prefs.clear(`${PREFS_PREFIX}.${key}`, true);
    ztoolkit.log(`プリファレンス値クリア成功: ${key}`, "info", "clearPref");
    return result;
  } catch (error) {
    ztoolkit.log(
      `プリファレンス値クリアエラー: ${key}, エラー: ${String(error)}`,
      "error",
      "clearPref",
    );
    throw error;
  }
}

/**
 * 設定画面の要素を取得する（型安全版と非型安全版を統合）
 * @param key - 要素のキー名
 * @returns 要素オブジェクトまたはnull
 */
export function getElement<K extends keyof ElementsMap>(
  key: K,
): _ZoteroTypes.Prefs["ElementsMap"][K];
export function getElement(key: string): HTMLElement | null;
export function getElement<K extends keyof ElementsMap>(key: K | string) {
  const isTypedKey = typeof key === "string" && key in ({} as ElementsMap);
  const logSuffix = isTypedKey ? "" : "（unsafe）";

  ztoolkit.log(`設定画面要素を取得${logSuffix}: ${key}`, "debug", "getElement");

  const element_id = `zotero-prefpane-${config.addonRef}-${key}`;

  try {
    const element =
      addon.data.prefs?.window?.document.getElementById(element_id);

    if (element) {
      ztoolkit.log(
        `設定画面要素取得成功${logSuffix}: ${key}`,
        "debug",
        "getElement",
      );
    } else {
      ztoolkit.log(
        `設定画面要素が見つかりません: ${key} (ID: ${element_id})`,
        "warn",
        "getElement",
      );
    }
    return element as any;
  } catch (error) {
    ztoolkit.log(
      `設定画面要素取得エラー: ${key}, エラー: ${String(error)}`,
      "error",
      "getElement",
    );
    return null as any;
  }
}

/**
 * 型安全でないgetElement（後方互換性のため）
 * @deprecated getElement関数を直接使用してください
 * @param key
 * @returns
 */
export function getElementUnsafe(key: string) {
  return getElement(key);
}
