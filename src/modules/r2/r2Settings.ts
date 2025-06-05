/**
 * Cloudflare R2 設定管理
 * APIトークン、カスタムドメイン、公開URL設定などの管理
 */

import { getPref, setPref, clearPref } from "../../utils/prefs";
import { R2Utils, type ValidatedR2Credentials } from "./r2Utils";

/**
 * R2設定管理クラス
 */
export class R2Settings {
  // 設定キー定義
  private static readonly PREF_KEYS = {
    CLOUDFLARE_API_TOKEN: "cloudflare.apiToken",
    CUSTOM_DOMAIN: "r2.customDomain",
    AUTO_SAVE_PUBLIC_URL: "r2.autoSavePublicUrl",
  } as const;

  /**
   * Cloudflare APIトークンを保存
   * @param token APIトークン
   */
  static saveCloudflareApiToken(token: string): void {
    if (!token || token.trim() === "") {
      throw new Error("有効なAPIトークンを入力してください");
    }
    setPref(R2Settings.PREF_KEYS.CLOUDFLARE_API_TOKEN, token.trim());
    ztoolkit.log("Cloudflare APIトークンを保存しました");
  }

  /**
   * Cloudflare APIトークンを取得
   * @returns APIトークンまたはnull
   */
  static getCloudflareApiToken(): string | null {
    return getPref(R2Settings.PREF_KEYS.CLOUDFLARE_API_TOKEN) as string | null;
  }

  /**
   * Cloudflare APIトークンが設定されているかチェック
   * @returns トークンが設定されているかどうか
   */
  static hasCloudflareApiToken(): boolean {
    const token = R2Settings.getCloudflareApiToken();
    return token !== null && token.trim() !== "";
  }

  /**
   * Cloudflare APIトークンをクリア
   */
  static clearCloudflareApiToken(): void {
    clearPref(R2Settings.PREF_KEYS.CLOUDFLARE_API_TOKEN);
    ztoolkit.log("Cloudflare APIトークンをクリアしました");
  }

  /**
   * カスタムドメインを保存
   * @param domain カスタムドメイン
   */
  static saveCustomDomain(domain: string): void {
    if (!R2Settings.isValidCustomDomainFormat(domain)) {
      throw new Error("有効なドメイン形式を入力してください");
    }
    setPref(R2Settings.PREF_KEYS.CUSTOM_DOMAIN, domain.trim());
    ztoolkit.log(`カスタムドメインを保存しました: ${domain}`);
  }

  /**
   * カスタムドメインを取得
   * @returns カスタムドメインまたはnull
   */
  static getCustomDomain(): string | null {
    return getPref(R2Settings.PREF_KEYS.CUSTOM_DOMAIN) as string | null;
  }

  /**
   * カスタムドメインをクリア
   */
  static clearCustomDomain(): void {
    clearPref(R2Settings.PREF_KEYS.CUSTOM_DOMAIN);
    ztoolkit.log("カスタムドメインをクリアしました");
  }

  /**
   * カスタムドメインの形式を検証（形式チェックのみ）
   * @param domain ドメイン文字列
   * @returns 形式が有効かどうか
   */
  static isValidCustomDomainFormat(domain: string): boolean {
    if (!domain || domain.trim() === "") {
      return false;
    }

    try {
      // httpまたはhttpsプロトコルが必要
      const url = new URL(
        domain.startsWith("http") ? domain : `https://${domain}`,
      );

      // ホスト名が有効かチェック
      const hostname = url.hostname;
      if (!hostname || hostname === "localhost") {
        return false;
      }

      // 基本的なドメイン形式チェック
      const domainRegex =
        /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      return domainRegex.test(hostname);
    } catch {
      return false;
    }
  }

  /**
   * 公開URL自動保存設定を更新
   * @param enabled 有効かどうか
   */
  static setAutoSavePublicUrl(enabled: boolean): void {
    setPref(R2Settings.PREF_KEYS.AUTO_SAVE_PUBLIC_URL, enabled);
    ztoolkit.log(`公開URL自動保存を${enabled ? "有効" : "無効"}にしました`);
  }

  /**
   * 公開URL自動保存設定を取得
   * @returns 設定値（デフォルト: false）
   */
  static getAutoSavePublicUrl(): boolean {
    return (
      (getPref(R2Settings.PREF_KEYS.AUTO_SAVE_PUBLIC_URL) as boolean) ?? false
    );
  }

  /**
   * R2認証情報を検証（内部使用）
   * @returns 認証情報またはnull
   */
  static validateR2Credentials(): ValidatedR2Credentials | null {
    return R2Utils.validateR2Credentials(() =>
      R2Settings.getCloudflareApiToken(),
    );
  }

  /**
   * カスタムドメインのステータスをチェック（形式チェックのみ）
   * @returns ステータス情報
   */
  static async checkCustomDomainStatus(): Promise<{
    isValid: boolean;
    domain: string | null;
    error?: string;
  }> {
    const domain = R2Settings.getCustomDomain();

    if (!domain) {
      return { isValid: false, domain: null };
    }

    if (!R2Settings.isValidCustomDomainFormat(domain)) {
      return {
        isValid: false,
        domain,
        error: "ドメイン形式が無効です",
      };
    }

    // 形式チェックのみ - 実際の接続チェックには checkCustomDomainConnectivity() を使用
    return { isValid: true, domain };
  }

  /**
   * カスタムドメインの実際の接続状態をチェック
   * Cloudflare for SaaS Custom Hostnames APIを使用して実際の接続状態を確認
   * @param customDomain チェックするカスタムドメイン（省略時は設定済みドメインを使用）
   * @returns 接続状態の詳細情報
   */
  static async checkCustomDomainConnectivity(customDomain?: string): Promise<{
    connected: boolean;
    status: string;
    details?: {
      hostname?: string;
      certificateStatus?: string;
      validationStatus?: string;
      ownership?: string;
      ssl?: string;
      errors?: string[];
    };
  }> {
    try {
      const domain = customDomain || R2Settings.getCustomDomain();
      if (!domain) {
        return { connected: false, status: "no_domain_configured" };
      }

      // 形式チェック
      if (!R2Settings.isValidCustomDomainFormat(domain)) {
        return { connected: false, status: "invalid_domain_format" };
      }

      const validated = R2Settings.validateR2Credentials();
      if (!validated) {
        return { connected: false, status: "no_r2_credentials" };
      }

      // Cloudflare for SaaS Custom Hostnames APIを使用
      // 参考: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/
      const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${validated.accountId}/r2/buckets/${validated.bucketName}/domains/custom`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${validated.apiToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        ztoolkit.log(
          `Cloudflare Custom Hostnames API エラー: ${response.status} ${response.statusText}`,
        );
        return {
          connected: false,
          status: "api_error",
          details: {
            errors: [`HTTP ${response.status}: ${response.statusText}`],
          },
        };
      }

      interface CustomHostnamesResponse {
        success: boolean;
        errors?: Array<{ message?: string; code?: number }>;
        messages?: Array<string>;
        result: {
          domains: Array<{
            domain: string;
            enabled: boolean;
            status: {
              ownership: "pending" | "active" | "deactivated" | string;
              ssl: "initializing" | "pending" | "active" | string;
              certificate?:
                | "pending_validation"
                | "active"
                | "pending"
                | string;
            };
            validation_records?: Array<{
              status: "pending" | "active" | string;
              txt_name?: string;
              txt_value?: string;
              http_url?: string;
              http_body?: string;
            }>;
            minTLS?: "1.0" | "1.1" | "1.2" | string;
            zoneId?: string;
            zoneName?: string;
          }>;
        };
      }

      const data =
        (await response.json()) as unknown as CustomHostnamesResponse;

      if (!data.success) {
        const errorMessage = data.errors
          ? data.errors
              .map((e) => e.message || `Error code: ${e.code || "unknown"}`)
              .join(", ")
          : "Unknown API error";
        ztoolkit.log(`Cloudflare API エラー: ${errorMessage}`);
        return {
          connected: false,
          status: "api_error",
          details: { errors: [errorMessage] },
        };
      }

      // カスタムドメインを検索
      const cleanDomain = domain.replace(/^https?:\/\//, "");
      const domainInfo = data.result.domains.find(
        (d) => d.domain === cleanDomain,
      );

      if (!domainInfo) {
        ztoolkit.log(`カスタムドメイン '${cleanDomain}' が見つかりません`);
        return {
          connected: false,
          status: "not_found",
          details: { hostname: cleanDomain },
        };
      }

      // 接続状態をチェック（enabled、ownership、ssl、certificateの全てをチェック）
      const isConnected =
        domainInfo.enabled === true &&
        domainInfo.status.ownership === "active" &&
        domainInfo.status.ssl === "active" &&
        (!domainInfo.status.certificate ||
          domainInfo.status.certificate === "active");

      // ステータス文字列を生成（デバッグ用に詳細情報を含める）
      const statusString = `enabled:${domainInfo.enabled}, ownership:${domainInfo.status.ownership}, ssl:${domainInfo.status.ssl}, certificate:${domainInfo.status.certificate || "N/A"}`;

      ztoolkit.log("Custom Domain info:", domainInfo);
      ztoolkit.log(
        `カスタムドメイン接続状態: ${statusString}, connected:${isConnected}`,
      );

      return {
        connected: isConnected,
        status: statusString,
        details: {
          hostname: domainInfo.domain,
          certificateStatus: domainInfo.status.certificate,
          validationStatus: domainInfo.validation_records?.[0]?.status,
          ownership: domainInfo.status.ownership,
          ssl: domainInfo.status.ssl,
        },
      };
    } catch (error) {
      ztoolkit.log(`カスタムドメイン接続状態確認に失敗: ${String(error)}`);
      return {
        connected: false,
        status: "error",
        details: { errors: [String(error)] },
      };
    }
  }

  /**
   * R2バケットのパブリック開発URLを有効化
   * @param bucketName バケット名
   * @returns 成功したかどうか
   */
  static async enablePublicDevelopmentUrl(
    bucketName: string,
  ): Promise<boolean> {
    try {
      const validated = R2Settings.validateR2Credentials();
      if (!validated) {
        return false;
      }

      // Cloudflare API経由でパブリック開発URLを有効化
      const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${validated.accountId}/r2/buckets/${bucketName}/domains/managed`;

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${validated.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: true,
        }),
      });

      if (!response.ok) {
        // エラーの詳細情報を取得
        let errorDetails = "";
        try {
          const errorBody = await response.text();
          errorDetails = ` レスポンス内容: ${errorBody}`;
        } catch {
          // レスポンスボディの読み取りに失敗した場合は無視
        }

        ztoolkit.log(
          `パブリック開発URL有効化に失敗: ${response.status} ${response.statusText}${errorDetails}`,
        );
        return false;
      }

      interface R2ManagedDomainResponse {
        success: boolean;
        result: {
          bucketId: string;
          domain: string;
          enabled: boolean;
        };
      }

      const data =
        (await response.json()) as unknown as R2ManagedDomainResponse;

      if (!data.success) {
        ztoolkit.log("パブリック開発URL有効化でエラーレスポンスを受信しました");
        return false;
      }

      ztoolkit.log(`パブリック開発URLを有効化しました: ${data.result.domain}`);
      return true;
    } catch (error) {
      ztoolkit.log(`パブリック開発URL有効化に失敗: ${String(error)}`);
      return false;
    }
  }
}
