/**
 * Cloudflare R2 共通ユーティリティ
 * 認証チェックやアカウントID抽出などの基本機能
 */

import { S3AuthManager } from "../s3AuthManager";

/**
 * R2認証情報の検証結果
 */
export interface ValidatedR2Credentials {
  credentials: any;
  apiToken: string;
  accountId: string;
  bucketName: string;
}

/**
 * R2共通ユーティリティクラス
 */
export class R2Utils {
  /**
   * エンドポイントからアカウントIDを抽出
   * @param endpoint R2エンドポイントURL
   * @returns アカウントIDまたはnull
   */
  static extractAccountIdFromEndpoint(endpoint: string): string | null {
    try {
      // R2エンドポイントの形式: https://{ACCOUNT_ID}.r2.cloudflarestorage.com
      const url = new URL(endpoint);
      const match = url.hostname.match(
        /^([a-f0-9]{32})\.r2\.cloudflarestorage\.com$/,
      );
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * R2認証情報を検証する共通メソッド
   * @param getApiToken APIトークン取得関数（循環依存回避）
   * @returns 認証情報またはnull（失敗時）
   */
  static validateR2Credentials(
    getApiToken: () => string | null,
  ): ValidatedR2Credentials | null {
    const credentials = S3AuthManager.getCompleteCredentials();
    if (!credentials || credentials.provider !== "r2") {
      ztoolkit.log("R2認証情報が設定されていません");
      return null;
    }

    const apiToken = getApiToken();
    if (!apiToken) {
      ztoolkit.log("Cloudflare APIトークンが設定されていません");
      return null;
    }

    const accountId = R2Utils.extractAccountIdFromEndpoint(
      credentials.endpoint || "",
    );
    if (!accountId) {
      ztoolkit.log("エンドポイントからアカウントIDを取得できませんでした");
      return null;
    }

    const bucketName = credentials.bucketName;
    if (!bucketName) {
      ztoolkit.log("バケット名が設定されていません");
      return null;
    }

    return { credentials, apiToken, accountId, bucketName };
  }

  /**
   * 公開URLをZoteroアイテムに保存
   * @param item Zoteroアイテム
   * @param publicUrl 公開URL
   */
  static async savePublicUrlToItem(
    item: any,
    publicUrl: string,
  ): Promise<void> {
    try {
      if (!item.isAttachment()) {
        throw new Error(
          "添付ファイル以外のアイテムには公開URLを保存できません",
        );
      }

      item.setField("url", publicUrl);
      await item.save();

      ztoolkit.log(`公開URLをアイテムに保存しました: ${publicUrl}`);
    } catch (error) {
      ztoolkit.log(`公開URLの保存に失敗: ${String(error)}`);
      throw new Error(
        `公開URLの保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * R2 URLからS3キーを抽出（R2専用・設定ベース処理を含む）
   * @param url R2 URL
   * @returns S3キーまたはnull（失敗時）
   */
  static extractS3KeyFromR2Url(url: string): string | null {
    if (!url) {
      return null;
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const pathParts = urlObj.pathname
        .split("/")
        .filter((part) => part !== "");

      if (pathParts.length === 0) {
        return null;
      }

      let s3Key: string;

      if (hostname.includes("r2.dev")) {
        // R2開発URL: https://pub-{accountId}.r2.dev/{s3Key}
        // または https://{domain}.r2.dev/{s3Key}
        s3Key = pathParts.join("/");
      } else if (hostname.endsWith(".r2.cloudflarestorage.com")) {
        // R2標準URL: https://{accountId}.r2.cloudflarestorage.com/{bucketName}/{s3Key}
        if (pathParts.length >= 2) {
          // 最初のパスパートはバケット名なので除去
          s3Key = pathParts.slice(1).join("/");
        } else {
          // バケット名しかない場合はS3キーが存在しない
          return null;
        }
      } else {
        // カスタムドメインの場合
        s3Key = pathParts.join("/");

        // カスタムドメインでの設定ベース処理
        try {
          const credentials = S3AuthManager.getCompleteCredentials();
          if (
            credentials?.bucketName &&
            s3Key.startsWith(credentials.bucketName + "/")
          ) {
            s3Key = s3Key.substring(credentials.bucketName.length + 1);
            ztoolkit.log(
              `カスタムドメインでバケット名 '${credentials.bucketName}' を除去: ${url}`,
            );
          }
        } catch (authError) {
          ztoolkit.log(
            "設定情報の取得に失敗、バケット名除去をスキップ:",
            authError,
          );
        }
      }

      // URLデコード
      try {
        const decodedS3Key = decodeURIComponent(s3Key);
        ztoolkit.log("R2 S3キー抽出:", url, "->", s3Key, "->", decodedS3Key);
        return decodedS3Key;
      } catch (decodeError) {
        ztoolkit.log("R2 S3キーのデコードに失敗、元の値を使用:", s3Key);
        return s3Key;
      }
    } catch (error) {
      ztoolkit.log("R2 URL解析に失敗:", url, error);
      return null;
    }
  }
}
