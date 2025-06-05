import { getElement, getElementUnsafe } from "../../utils/prefs";
import { getPref, setPref, clearPref } from "../../utils/prefs";
import { R2PublicUrlManager } from "../r2";
import { SettingHandler } from "./settingHandler";

export class R2SpecificSetting implements SettingHandler {
  initializePrefsUI(): void {
    if (!addon.data.prefs?.window) return;

    this.updateAPIKey();
    this.updateR2PublicUrlUI();
  }

  updatePrefsUI(): void {
    if (!addon.data.prefs?.window) return;

    const providerSelect = getElement("provider") as XUL.MenuList;
    const provider = providerSelect?.value || "aws";

    this.updateR2DevUrlVisibility(provider);
    this.updateAPIKey();
    this.updateR2PublicUrlUI();
  }

  saveSettings(): void {
    if (!addon.data.prefs?.window) return;

    // R2固有の設定は保存ボタンで個別に保存される
    // 公開URL設定とCloudflare APIトークンは独自のボタンで管理
    this.savePublicUrlSettings();
  }

  clearSettings(): void {
    if (!addon.data.prefs?.window) return;

    try {
      // Cloudflare APIトークンもクリア
      R2PublicUrlManager.clearCloudflareApiToken();

      // R2公開URL設定もクリア
      R2PublicUrlManager.clearCustomDomain();
      R2PublicUrlManager.setAutoSavePublicUrl(false);
      clearPref("r2.urlType");

      // Cloudflare APIトークン入力欄もクリア
      const cloudflareTokenInput = getElement(
        "cloudflare-api-token",
      ) as HTMLInputElement;
      if (cloudflareTokenInput) {
        cloudflareTokenInput.value = "";
      }

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
    } catch (error) {
      ztoolkit.log(
        `R2設定クリア時のエラー: ${String(error)}`,
        "warn",
        "R2SpecificSetting.clearSettings",
      );
    }
  }

  bindPrefEvents(): void {
    if (!addon.data.prefs?.window) return;

    // Cloudflare APIトークン保存ボタン
    const saveCloudflareTokenButton = getElement("save-cloudflare-token");
    saveCloudflareTokenButton?.addEventListener("command", async () => {
      await this.saveCloudflareApiToken();
    });

    // Cloudflare APIトークンクリアボタン
    const clearCloudflareTokenButton = getElement("clear-cloudflare-token");
    clearCloudflareTokenButton?.addEventListener("command", async () => {
      await this.clearCloudflareApiToken();
    });

    // パブリック開発URL有効化ボタン
    const enablePublicUrlButton = getElement("enable-public-url");
    enablePublicUrlButton?.addEventListener("command", async () => {
      await this.enablePublicDevelopmentUrl();
    });

    // 公開URL設定関連のイベント
    this.bindPublicUrlEvents();
  }

  /**
   * R2公開URL設定のUIを更新する
   * @returns {Promise<void>}
   */

  private async updateAPIKey() {
    const cloudflareApiTokenInput = getElement("cloudflare-api-token");

    // Cloudflare APIトークンの値を設定
    if (cloudflareApiTokenInput) {
      try {
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
  }

  private async updateR2PublicUrlUI(): Promise<void> {
    try {
      ztoolkit.log(
        "公開URL設定UI更新開始",
        "R2SpecificSetting.updateR2PublicUrlUI",
      );

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

      // 表示制御を実行
      this.updatePublicUrlVisibility(urlType);

      ztoolkit.log(
        "公開URL設定UI更新完了",
        "R2SpecificSetting.updateR2PublicUrlUI",
      );
    } catch (error) {
      ztoolkit.log(
        `公開URL設定UI更新エラー: ${String(error)}`,
        "error",
        "updateR2PublicUrlUI",
      );
    }
  }

  private updatePublicUrlVisibility(urlType: string) {
    try {
      ztoolkit.log(
        `公開URL表示制御を実行: ${urlType}`,
        "info",
        "updatePublicUrlVisibility",
      );

      const customDomainSettings = getElementUnsafe(
        "custom-domain-settings",
      ) as HTMLElement;
      const r2devSettings = getElementUnsafe("r2dev-settings") as HTMLElement;

      if (customDomainSettings) {
        customDomainSettings.style.display =
          urlType === "custom" ? "block" : "none";
      }

      if (r2devSettings) {
        r2devSettings.style.display = urlType === "r2dev" ? "block" : "none";
      }

      ztoolkit.log(
        `表示制御完了: カスタム=${urlType === "custom"}, R2開発=${urlType === "r2dev"}`,
        "info",
        "updatePublicUrlVisibility",
      );
    } catch (error) {
      ztoolkit.log(
        `表示制御エラー: ${String(error)}`,
        "error",
        "updatePublicUrlVisibility",
      );
    }
  }

  async updateR2DevUrlVisibility(provider: string) {
    const r2Settings = getElementUnsafe("r2-settings") as HTMLElement;
    if (r2Settings) {
      r2Settings.style.display = provider === "r2" ? "block" : "none";
    }

    // R2でない場合、r2dev URLタイプを無効に設定
    if (provider !== "r2") {
      const urlTypeRadioGroup = getElementUnsafe(
        "public-url-type",
      ) as unknown as XUL.RadioGroup;
      if (urlTypeRadioGroup && urlTypeRadioGroup.value === "r2dev") {
        urlTypeRadioGroup.value = "disabled";
        this.updatePublicUrlVisibility("disabled");
      }
    }
  }

  private async savePublicUrlSettings() {
    if (!addon.data.prefs?.window) return;

    try {
      const urlTypeRadioGroup = getElementUnsafe(
        "public-url-type",
      ) as unknown as XUL.RadioGroup;
      const customDomainInput = getElementUnsafe(
        "custom-domain",
      ) as HTMLInputElement;
      const autoSaveCheckbox = getElementUnsafe(
        "auto-save-public-url",
      ) as unknown as XUL.Checkbox;

      if (!urlTypeRadioGroup) {
        this.showCustomDomainStatus(
          "エラー: 公開URL設定フォームが見つかりません",
          "error",
        );
        return;
      }

      const urlType = urlTypeRadioGroup.value;
      const customDomain = customDomainInput?.value?.trim() || "";
      const autoSave = autoSaveCheckbox?.checked || false;

      // プロバイダーがR2でない場合のr2dev URLタイプ警告
      const currentProvider =
        (getElement("provider") as XUL.MenuList)?.value || "aws";
      if (urlType === "r2dev" && currentProvider !== "r2") {
        this.showCustomDomainStatus(
          "エラー: r2.dev開発URLはCloudflare R2でのみ利用可能です",
          "error",
        );
        return;
      }

      // カスタムドメイン形式検証
      if (urlType === "custom" && customDomain) {
        if (!R2PublicUrlManager.isValidCustomDomain(customDomain)) {
          this.showCustomDomainStatus(
            "エラー: 無効なカスタムドメイン形式です",
            "error",
          );
          return;
        }
      }

      // 設定を保存
      setPref("r2.urlType", urlType);

      if (urlType === "custom") {
        R2PublicUrlManager.saveCustomDomain(customDomain);
      } else {
        R2PublicUrlManager.clearCustomDomain();
      }

      R2PublicUrlManager.setAutoSavePublicUrl(autoSave);

      this.showCustomDomainStatus("公開URL設定を保存しました", "success");
      this.notify("公開URL設定保存完了", "R2公開URL設定を保存しました");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.showCustomDomainStatus(
        "公開URL設定の保存に失敗: " + errorMessage,
        "error",
      );
      ztoolkit.log(
        `公開URL設定保存エラー: ${errorMessage}`,
        "error",
        "savePublicUrlSettings",
      );
    }
  }

  private showCustomDomainStatus(
    message: string,
    type: "success" | "error" | "info",
  ) {
    const customDomainStatus = getElementUnsafe(
      "custom-domain-status",
    ) as HTMLDivElement;
    if (!customDomainStatus) return;

    customDomainStatus.textContent = message;

    // タイプに応じてスタイルを適用
    customDomainStatus.className = "";
    switch (type) {
      case "success":
        customDomainStatus.style.backgroundColor = "#d4edda";
        customDomainStatus.style.borderColor = "#c3e6cb";
        customDomainStatus.style.color = "#155724";
        break;
      case "error":
        customDomainStatus.style.backgroundColor = "#f8d7da";
        customDomainStatus.style.borderColor = "#f5c6cb";
        customDomainStatus.style.color = "#721c24";
        break;
      case "info":
        customDomainStatus.style.backgroundColor = "#d1ecf1";
        customDomainStatus.style.borderColor = "#bee5eb";
        customDomainStatus.style.color = "#0c5460";
        break;
    }

    customDomainStatus.style.display = "block";

    ztoolkit.log(
      `カスタムドメイン状態更新: ${message} (${type})`,
      "info",
      "showCustomDomainStatus",
    );
  }

  /**
   * カスタムドメインの接続テストを実行
   * @returns {Promise<void>}
   */
  private async testCustomDomain() {
    try {
      const customDomainInput = getElementUnsafe(
        "custom-domain",
      ) as HTMLInputElement;

      const customDomain = customDomainInput?.value?.trim();
      if (!customDomain) {
        this.showCustomDomainStatus(
          "カスタムドメインを入力してください",
          "error",
        );
        return;
      }

      // 形式検証
      if (!R2PublicUrlManager.isValidCustomDomain(customDomain)) {
        this.showCustomDomainStatus("無効なドメイン形式です", "error");
        return;
      }

      this.showCustomDomainStatus("接続確認中...", "info");

      // ドメイン状態確認
      const result =
        await R2PublicUrlManager.checkCustomDomainConnectivity(customDomain);

      if (result.connected) {
        this.showCustomDomainStatus(
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
        this.showCustomDomainStatus(`❌ ${message}`, "error");
      }
    } catch (error) {
      ztoolkit.log(
        `カスタムドメインテスト失敗: ${String(error)}`,
        "error",
        "testCustomDomain",
      );
      this.showCustomDomainStatus(
        `❌ テストに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }

  /**
   * R2バケットのパブリック開発URLを有効化
   * @returns {Promise<void>}
   */
  private async enablePublicDevelopmentUrl() {
    if (!addon.data.prefs?.window) return;

    try {
      // バケット名を取得
      const bucketInput = getElement("bucket") as HTMLInputElement;

      if (!bucketInput || !bucketInput.value.trim()) {
        this.showCustomDomainStatus(
          "エラー: バケット名を入力してください",
          "error",
        );
        return;
      }

      this.showCustomDomainStatus("パブリック開発URLを有効化中...", "info");

      // APIトークンの確認
      if (!R2PublicUrlManager.hasCloudflareApiToken()) {
        this.showCustomDomainStatus(
          "エラー: Cloudflare APIトークンが設定されていません",
          "error",
        );
        return;
      }

      // パブリック開発URLを有効化
      const success = await R2PublicUrlManager.enablePublicDevelopmentUrl(
        bucketInput.value.trim(),
      );

      if (success) {
        this.showCustomDomainStatus(
          "パブリック開発URLを有効化しました",
          "success",
        );
        this.notify(
          "パブリック開発URL有効化完了",
          "R2バケットのパブリック開発URLを有効化しました",
        );
      } else {
        this.showCustomDomainStatus(
          "パブリック開発URLの有効化に失敗しました",
          "error",
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.showCustomDomainStatus(
        "パブリック開発URL有効化エラー: " + errorMessage,
        "error",
      );
      ztoolkit.log(
        `パブリック開発URL有効化エラー: ${errorMessage}`,
        "error",
        "enablePublicDevelopmentUrl",
      );
    }
  }

  /**
   * Cloudflare APIトークンをクリア
   * @returns {Promise<void>}
   */
  private async clearCloudflareApiToken() {
    if (!addon.data.prefs?.window) return;

    try {
      R2PublicUrlManager.clearCloudflareApiToken();

      // 入力欄をクリア
      const tokenInput = getElement("cloudflare-api-token") as HTMLInputElement;
      if (tokenInput) {
        tokenInput.value = "";
      }

      this.showCustomDomainStatus(
        "Cloudflare APIトークンをクリアしました",
        "success",
      );
      this.notify(
        "Cloudflare APIトークンクリア完了",
        "APIトークンを削除しました",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.showCustomDomainStatus(
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
   * Cloudflare APIトークンを保存
   * @returns {Promise<void>}
   */
  private async saveCloudflareApiToken() {
    if (!addon.data.prefs?.window) return;

    try {
      const tokenInput = getElement("cloudflare-api-token") as HTMLInputElement;

      if (!tokenInput || !tokenInput.value.trim()) {
        this.showCustomDomainStatus(
          "エラー: Cloudflare APIトークンを入力してください",
          "error",
        );
        return;
      }

      // トークンの保存（"****"の場合は既存のトークンをそのまま使用）
      if (tokenInput.value.trim() !== "****") {
        R2PublicUrlManager.saveCloudflareApiToken(tokenInput.value.trim());
      }

      this.showCustomDomainStatus(
        "Cloudflare APIトークンを保存しました",
        "success",
      );
      this.notify(
        "Cloudflare APIトークン保存完了",
        "APIトークンを安全に保存しました",
      );

      // 入力欄をマスク表示に変更
      tokenInput.value = "****";
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.showCustomDomainStatus(
        "Cloudflare APIトークンの保存に失敗: " + errorMessage,
        "error",
      );
      ztoolkit.log(
        `Cloudflare APIトークン保存エラー: ${errorMessage}`,
        "error",
        "saveCloudflareApiToken",
      );
    }
  }

  /**
   * 公開URL設定のイベントをバインドする
   * @returns {void}
   */
  private bindPublicUrlEvents() {
    // URLタイプ選択の変更イベント
    const urlTypeRadioGroup = getElementUnsafe(
      "public-url-type",
    ) as unknown as XUL.RadioGroup;
    urlTypeRadioGroup?.addEventListener("command", (e: Event) => {
      const radioGroup = e.target as XUL.RadioGroup;
      this.updatePublicUrlVisibility(radioGroup.value);

      // プロバイダーがR2でない場合の警告
      const currentProvider =
        (getElement("provider") as XUL.MenuList)?.value || "aws";
      if (radioGroup.value === "r2dev" && currentProvider !== "r2") {
        this.showCustomDomainStatus(
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
      await this.testCustomDomain();
    });

    // 公開URL設定保存ボタン
    const savePublicUrlSettingsButton = getElementUnsafe(
      "save-public-url-settings",
    ) as unknown as XUL.Button;
    savePublicUrlSettingsButton?.addEventListener("command", async () => {
      await this.savePublicUrlSettings();
    });
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

  private notify(title: string, message: string): void {
    try {
      new ztoolkit.ProgressWindow(title, {
        closeOtherProgressWindows: false,
        closeTime: 3000,
      })
        .createLine({
          text: message,
          type: "success",
        })
        .show();
    } catch (error) {
      ztoolkit.log(`通知表示エラー: ${String(error)}`, "warn", "notify");
    }
  }
}
