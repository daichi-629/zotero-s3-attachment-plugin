/**
 * Cloudflare R2 URL生成
 * 公開URL、開発URL、カスタムドメインURLの生成
 */

import { S3AuthManager } from "../s3AuthManager";
import { generateS3Url, encodeS3KeyForUrl } from "../s3Types";
import { R2Settings } from "./r2Settings";
import { R2Utils } from "./r2Utils";

/**
 * R2パブリック開発URLレスポンス
 */
interface R2ManagedDomainResponse {
  success: boolean;
  result: {
    bucketId: string;
    domain: string;
    enabled: boolean;
  };
}

/**
 * URL生成タイプ
 */
export type UrlType = "custom" | "r2dev" | "disabled" | "auto";

/**
 * URL生成オプション
 */
export interface GenerateUrlOptions {
  type?: UrlType;
  allowFallback?: boolean;
}

/**
 * R2 URL生成クラス
 */
export class R2UrlGenerator {
  /**
   * 統一されたURL生成メソッド
   * @param s3Key S3オブジェクトキー
   * @param options URL生成オプション
   * @returns 生成されたURL
   */
  static async generateUrl(
    s3Key: string,
    options: GenerateUrlOptions = {},
  ): Promise<string> {
    const { type = "auto", allowFallback = true } = options;

    ztoolkit.log(
      `URL生成開始: key=${s3Key}, type=${type}, fallback=${allowFallback}`,
    );

    // 優先順位付きフォールバック
    const strategies = R2UrlGenerator.getUrlStrategies(type);

    for (const strategy of strategies) {
      try {
        const url = await R2UrlGenerator.generateUrlByStrategy(s3Key, strategy);
        if (url) {
          ztoolkit.log(`URL生成成功 (${strategy}): ${url}`);
          return url;
        }
      } catch (error) {
        ztoolkit.log(`URL生成失敗 (${strategy}): ${String(error)}`);
        if (!allowFallback) {
          throw error;
        }
        // フォールバックを続行
      }
    }

    // 最終フォールバック: 標準のS3 URL
    const fallbackUrl = R2UrlGenerator.generateFallbackUrl(s3Key);
    ztoolkit.log(`フォールバックURL: ${fallbackUrl}`);
    return fallbackUrl;
  }

  /**
   * URL生成戦略の優先順位を取得
   * @param type URL生成タイプ
   * @returns 戦略リスト
   */
  private static getUrlStrategies(type: UrlType): UrlType[] {
    switch (type) {
      case "custom":
        return ["custom"];
      case "r2dev":
        return ["r2dev"];
      case "disabled":
        return ["disabled"];
      case "auto":
      default:
        return ["custom", "r2dev", "disabled"];
    }
  }

  /**
   * 指定された戦略でURLを生成
   * @param s3Key S3オブジェクトキー
   * @param strategy URL生成戦略
   * @returns 生成されたURLまたはnull
   */
  private static async generateUrlByStrategy(
    s3Key: string,
    strategy: UrlType,
  ): Promise<string | null> {
    switch (strategy) {
      case "custom":
        return R2UrlGenerator.generateCustomDomainUrl(s3Key);
      case "r2dev":
        return await R2UrlGenerator.generateR2DevUrl(s3Key);
      case "disabled":
        return R2UrlGenerator.generateStandardUrl(s3Key);
      default:
        return null;
    }
  }

  /**
   * カスタムドメインURL生成
   * @param s3Key S3オブジェクトキー
   * @returns カスタムドメインURLまたはnull
   */
  private static generateCustomDomainUrl(s3Key: string): string | null {
    const customDomain = R2Settings.getCustomDomain();
    if (!customDomain || !R2Settings.isValidCustomDomainFormat(customDomain)) {
      return null;
    }

    // カスタムドメインURLを構築
    const baseUrl = customDomain.startsWith("http")
      ? customDomain
      : `https://${customDomain}`;

    return `${baseUrl.replace(/\/$/, "")}/${s3Key}`;
  }

  /**
   * R2開発URLの生成（Cloudflare APIを使用したマネージドドメイン）
   * @param s3Key S3オブジェクトキー
   * @returns R2開発URLまたはnull
   */
  private static async generateR2DevUrl(s3Key: string): Promise<string | null> {
    try {
      const validated = R2Settings.validateR2Credentials();
      if (!validated) {
        return null;
      }

      // Cloudflare API経由でパブリック開発URLドメインを取得
      const managedDomainUrl = await R2UrlGenerator.getManagedDomainUrl(
        validated.bucketName,
        validated.apiToken,
        validated.accountId,
      );
      if (!managedDomainUrl) {
        // フォールバック: アカウントIDベースの標準的なpub-*.r2.dev形式
        ztoolkit.log(
          "Cloudflare API失敗、アカウントIDベースのURLにフォールバック",
        );
        return `https://pub-${validated.accountId}.r2.dev/${encodeS3KeyForUrl(s3Key)}`;
      }

      return `${managedDomainUrl}/${encodeS3KeyForUrl(s3Key)}`;
    } catch (error) {
      ztoolkit.log(`R2開発URL生成でエラー: ${String(error)}`);

      // エラー時のフォールバック：アカウントIDベースのURL
      const validated = R2Settings.validateR2Credentials();
      if (validated) {
        return `https://pub-${validated.accountId}.r2.dev/${encodeS3KeyForUrl(s3Key)}`;
      }

      return null;
    }
  }

  /**
   * R2バケットのパブリック開発URLドメインを取得
   * @param bucketName バケット名
   * @param apiToken APIトークン
   * @param accountId アカウントID
   * @returns パブリック開発URLドメインまたはnull
   */
  private static async getManagedDomainUrl(
    bucketName: string,
    apiToken: string,
    accountId: string,
  ): Promise<string | null> {
    try {
      // Cloudflare API経由でパブリック開発URLを取得
      const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/domains/managed`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        ztoolkit.log(
          `Cloudflare API呼び出しに失敗: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data =
        (await response.json()) as unknown as R2ManagedDomainResponse;

      if (!data.success) {
        ztoolkit.log("Cloudflare APIからエラーレスポンスを受信しました");
        return null;
      }

      if (!data.result.enabled) {
        ztoolkit.log("パブリック開発URLが有効化されていません");
        return null;
      }

      // パブリック開発URLを構築
      const publicUrl = `https://${data.result.domain}`;
      ztoolkit.log(`パブリック開発URLドメインを取得しました: ${publicUrl}`);

      return publicUrl;
    } catch (error) {
      ztoolkit.log(`パブリック開発URLドメイン取得に失敗: ${String(error)}`);
      return null;
    }
  }

  /**
   * 標準S3 URL生成
   * @param s3Key S3オブジェクトキー
   * @returns 標準S3 URLまたはnull
   */
  private static generateStandardUrl(s3Key: string): string | null {
    const credentials = S3AuthManager.getCompleteCredentials();
    if (!credentials || !credentials.endpoint || !credentials.bucketName) {
      return null;
    }

    return `${credentials.endpoint.replace(/\/$/, "")}/${credentials.bucketName}/${s3Key}`;
  }

  /**
   * フォールバックURL生成（最終手段）
   * @param s3Key S3オブジェクトキー
   * @returns フォールバックURL
   */
  private static generateFallbackUrl(s3Key: string): string {
    const credentials = S3AuthManager.getCompleteCredentials();
    if (credentials?.endpoint && credentials?.bucketName) {
      return `${credentials.endpoint.replace(/\/$/, "")}/${credentials.bucketName}/${s3Key}`;
    }

    // 最終フォールバック: 汎用的なS3 URL
    const bucketName = credentials?.bucketName || "unknown-bucket";
    return `https://s3.amazonaws.com/${bucketName}/${s3Key}`;
  }

  /**
   * @deprecated 代わりに generateUrl() を使用してください
   */
  static async generatePublicUrl(s3Key: string): Promise<string> {
    return R2UrlGenerator.generateUrl(s3Key, { type: "auto" });
  }

  /**
   * @deprecated 代わりに generateUrl() を使用してください
   */
  static async generateUrlByType(
    s3Key: string,
    urlType?: "custom" | "r2dev" | "disabled",
  ): Promise<string> {
    return R2UrlGenerator.generateUrl(s3Key, { type: urlType || "auto" });
  }

  /**
   * R2開発URLを取得（既存の設定で有効化されている場合）
   * @param s3Key S3オブジェクトキー
   * @returns R2開発URLまたはnull
   */
  static async getPublicDevelopmentUrl(s3Key: string): Promise<string | null> {
    try {
      return await R2UrlGenerator.generateUrl(s3Key, {
        type: "r2dev",
        allowFallback: false,
      });
    } catch {
      return null;
    }
  }

  /**
   * R2開発URLを有効化（必要な設定があることを確認）
   * @param s3Key S3オブジェクトキー
   * @returns 有効化されたR2開発URL
   */
  static async enablePublicDevelopmentUrl(s3Key: string): Promise<string> {
    const validated = R2Settings.validateR2Credentials();
    if (!validated) {
      throw new Error(
        "R2開発URLを有効化するにはCloudflare APIトークンと正しいR2設定が必要です",
      );
    }

    // Cloudflare API呼び出しでR2開発URLを有効化
    const enableResult = await R2Settings.enablePublicDevelopmentUrl(
      validated.bucketName,
    );
    if (!enableResult) {
      throw new Error("R2開発URLの有効化に失敗しました");
    }

    // 有効化後、URLを生成
    const url = await R2UrlGenerator.generateUrl(s3Key, {
      type: "r2dev",
      allowFallback: false,
    });

    if (!url) {
      throw new Error("R2開発URLの生成に失敗しました");
    }

    return url;
  }
}
