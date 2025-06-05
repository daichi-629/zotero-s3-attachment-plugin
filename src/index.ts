import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";
import { notify } from "./utils/notify";

const basicTool = new BasicTool();

// @ts-ignore - Plugin instance is not typed
if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  _globalThis.addon = new Addon();
  defineGlobal("ztoolkit", () => {
    return _globalThis.addon.data.ztoolkit;
  });

  // notify関数をグローバルに設定
  defineGlobal("notify", () => notify);
  defineGlobal("console", () => _globalThis._console);
  // @ts-ignore - Plugin instance is not typed
  Zotero[config.addonInstance] = addon;
}

function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void;
function defineGlobal(name: string, getter: () => any): void;
/**
 * defineGlobal関数の詳細説明
 *
 * この関数は、グローバルオブジェクト（_globalThis）に新しいプロパティを定義します。
 * name引数で指定された名前でプロパティを追加し、getterが指定されている場合はそのgetter関数を
 * プロパティのgetterとして使用します。getterが指定されていない場合は、BasicToolのgetGlobalメソッドを
 * 使用してグローバル値を取得します。
 *
 * オーバーロードにより、2つの使い方が可能です：
 * 1. defineGlobal(name: string): void
 *    - nameで指定したグローバル値を_basicTool.getGlobalで取得できるようにします。
 * 2. defineGlobal(name: string, getter: () => any): void
 *    - nameで指定したグローバル値を、getter関数の戻り値として取得できるようにします。
 *
 * これにより、グローバルスコープに安全かつ柔軟に値や機能を公開することができます。
 */

function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter ? getter() : basicTool.getGlobal(name);
    },
  });
}
