import {
  getElement,
  getElementUnsafe,
  getPref,
  setPref,
  clearPref,
} from "../../utils/prefs";
import { S3AuthManager } from "../s3AuthManager";
import { SettingHandler } from "./settingHandler";
import { getString } from "../../utils/locale";

export class CommonSettings implements SettingHandler {
  initializePrefsUI(): void {
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

    // 除外コンテンツタイプの設定読み込み
    const ignoreContentTypesTextarea = getElement("ignore-content-types");

    // コレクション階層使用設定の読み込み
    const useCollectionHierarchyCheckbox = getElement(
      "use-collection-hierarchy",
    );

    if (accessKeyInput) accessKeyInput.value = credentials.accessKeyId || "";
    if (secretKeyInput)
      secretKeyInput.value = credentials.secretAccessKey || "";
    if (endpointInput) endpointInput.value = credentials.endpoint || "";
    if (regionInput) regionInput.value = credentials.region || "us-east-1";
    if (bucketInput) bucketInput.value = credentials.bucketName || "";

    // 除外コンテンツタイプの値を設定
    if (ignoreContentTypesTextarea) {
      const ignoreContentTypes =
        (getPref("ignoreContentTypes") as string) || "";
      ignoreContentTypesTextarea.value = ignoreContentTypes;
    }

    // コレクション階層使用設定の値を設定
    if (useCollectionHierarchyCheckbox) {
      const useCollectionHierarchy =
        (getPref("s3.useCollectionHierarchy") as boolean) || false;
      (useCollectionHierarchyCheckbox as unknown as XUL.Checkbox).checked =
        useCollectionHierarchy;
    }
  }

  updatePrefsUI(): void {
    if (!addon.data.prefs?.window) return;

    const providerSelect = getElement("provider") as XUL.MenuList;
    const provider = providerSelect?.value || "aws";
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

    // プロバイダー固有のプレースホルダーを設定
    const endpointInput = getElement("endpoint");
    if (endpointInput && providerConfig?.defaultEndpoint) {
      endpointInput.placeholder = providerConfig.defaultEndpoint;
    }
  }

  saveSettings(): void {
    if (!addon.data.prefs?.window) return;

    // フォームから値を取得
    const provider = (getElement("provider") as XUL.MenuList)?.value || "aws";
    const accessKey =
      (getElement("access-key") as HTMLInputElement)?.value || "";
    const secretKey =
      (getElement("secret-key") as HTMLInputElement)?.value || "";
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
            "CommonSettings.saveSettings",
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
        this.showStatus("エラー: " + validation.errors.join(", "), "error");
        return;
      }

      // 設定を保存
      S3AuthManager.saveCredentials({
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

      this.showStatus("設定を保存しました", "success");
    } catch (error) {
      ztoolkit.log(
        `設定保存エラー: ${String(error)}`,
        "error",
        "CommonSettings.saveSettings",
      );
      this.showStatus(
        `設定の保存中にエラーが発生しました: ${String(error)}`,
        "error",
      );
    }
  }

  clearSettings(): void {
    if (!addon.data.prefs?.window) return;

    try {
      // プリファレンスをクリア
      S3AuthManager.clearCredentials();
      clearPref("ignoreContentTypes");
      clearPref("s3.useCollectionHierarchy");

      // フォームフィールドをクリア
      const fields = [
        "provider",
        "access-key",
        "secret-key",
        "endpoint",
        "region",
        "bucket",
        "ignore-content-types",
      ];

      fields.forEach((fieldId) => {
        const element = getElement(fieldId);
        if (element) {
          if (fieldId === "provider") {
            (element as unknown as XUL.MenuList).value = "aws";
          } else {
            (element as HTMLInputElement | HTMLTextAreaElement).value = "";
          }
        }
      });

      // チェックボックスをクリア
      const useCollectionHierarchyCheckbox = getElement(
        "use-collection-hierarchy",
      );
      if (useCollectionHierarchyCheckbox) {
        (useCollectionHierarchyCheckbox as unknown as XUL.Checkbox).checked =
          false;
      }

      this.showStatus("設定をクリアしました", "success");
    } catch (error) {
      ztoolkit.log(
        `設定クリアエラー: ${String(error)}`,
        "error",
        "CommonSettings.clearSettings",
      );
      this.showStatus(
        `設定のクリア中にエラーが発生しました: ${String(error)}`,
        "error",
      );
    }
  }

  bindPrefEvents(): void {
    if (!addon.data.prefs?.window) return;

    // プロバイダー選択の変更イベント
    const providerSelect = getElement("provider");
    providerSelect?.addEventListener("command", (e: Event) => {
      const target = e.target as XUL.MenuList;
      this.updatePrefsUI();

      // デフォルト値の設定
      const providerConfig = S3AuthManager.getProviderInfo(target.value);
      if (providerConfig?.defaultEndpoint) {
        const endpointInput = getElement("endpoint");
        if (endpointInput && !endpointInput.value) {
          endpointInput.value = providerConfig.defaultEndpoint;
        }
      }
    });
  }

  private async testConnection(): Promise<void> {
    if (!addon.data.prefs?.window) return;

    try {
      this.showStatus("接続テスト中...", "info");

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
        this.showStatus("エラー: " + validation.errors.join(", "), "error");
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
        const { S3StorageManager } = await import("../s3StorageManager");
        await S3StorageManager.initializeClient();
        const success = await S3StorageManager.testConnection();

        if (success) {
          this.showStatus("接続テストに成功しました", "success");
        } else {
          this.showStatus("接続テストに失敗しました", "error");
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
        "CommonSettings.testConnection",
      );
      this.showStatus(`接続テストに失敗しました: ${String(error)}`, "error");
    }
  }

  private showStatus(
    message: string,
    type: "success" | "error" | "info",
  ): void {
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
}
