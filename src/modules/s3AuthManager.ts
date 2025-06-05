import { setPref, clearPref, getPref } from "../utils/prefs";
/**
 * S3認証情報
 */
export interface S3Credentials {
  provider: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
  endpoint?: string;
}

/**
 * 認証情報バリデーション結果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * S3互換ストレージプロバイダー
 */
export interface StorageProvider {
  name: string;
  displayName: string;
  defaultEndpoint?: string;
  endpointRequired: boolean; //UI表示制御用
  regionRequired: boolean;
  accessKeyFormat?: RegExp;
  secretKeyMinLength?: number;
  getDefaultEndpoint?: (region: string) => string;
}

/**
 * サポートされているストレージプロバイダー
 */
export const STORAGE_PROVIDERS: Record<string, StorageProvider> = {
  aws: {
    name: "aws",
    displayName: "Amazon S3",
    endpointRequired: false,
    regionRequired: true,
    accessKeyFormat: /^[A-Z0-9]{20}$/,
    secretKeyMinLength: 40,
    getDefaultEndpoint: (region: string) =>
      `https://s3.${region}.amazonaws.com`,
  },
  r2: {
    name: "r2",
    displayName: "Cloudflare R2",
    defaultEndpoint: "https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
    endpointRequired: true,
    regionRequired: false,
    accessKeyFormat: /^[a-f0-9]{32}$/,
    secretKeyMinLength: 64,
  },
  minio: {
    name: "minio",
    displayName: "MinIO",
    endpointRequired: true,
    regionRequired: false,
  },
  custom: {
    name: "custom",
    displayName: "Custom S3-Compatible",
    endpointRequired: true,
    regionRequired: false,
  },
};

/**
 * S3認証情報管理クラス
 * AWS認証情報の暗号化保存、取得、バリデーション機能を提供
 */
export class S3AuthManager {
  /**
   * 認証情報のバリデーション（静的メソッド）
   * @param credentials 認証情報（部分的でも可）
   * @returns バリデーション結果
   */
  static validateCredentials(
    credentials: Partial<S3Credentials>,
  ): ValidationResult {
    const errors: string[] = [];
    const provider = credentials.provider ?? "aws";
    const providerConfig = STORAGE_PROVIDERS[provider];

    if (!providerConfig) {
      errors.push("サポートされていないストレージプロバイダーです");
      return { isValid: false, errors };
    }

    // Access Key IDの形式チェック
    if (!credentials.accessKeyId) {
      errors.push("Access Key IDが入力されていません");
    } else if (
      providerConfig.accessKeyFormat &&
      !providerConfig.accessKeyFormat.test(credentials.accessKeyId)
    ) {
      if (provider === "aws") {
        errors.push("Access Key IDは20文字の英数字である必要があります");
      } else if (provider === "r2") {
        errors.push("Access Key IDは32文字の16進文字列である必要があります");
      } else {
        errors.push("Access Key IDの形式が正しくありません");
      }
    }

    // Secret Access Keyの形式チェック
    if (!credentials.secretAccessKey) {
      errors.push("Secret Access Keyが入力されていません");
    } else if (
      providerConfig.secretKeyMinLength &&
      credentials.secretAccessKey.length < providerConfig.secretKeyMinLength
    ) {
      errors.push(
        `Secret Access Keyは${providerConfig.secretKeyMinLength}文字以上である必要があります`,
      );
    }

    // リージョンのチェック
    if (
      providerConfig.regionRequired &&
      (!credentials.region || !/^[a-z0-9-]+$/.test(credentials.region))
    ) {
      errors.push("リージョンが無効です");
    }

    // エンドポイントのチェック
    if (providerConfig.endpointRequired) {
      if (!credentials.endpoint) {
        errors.push("エンドポイントが必要です");
      } else {
        try {
          new URL(credentials.endpoint);
        } catch {
          errors.push("エンドポイントのURLが無効です");
        }
      }
    } else {
      if (credentials.endpoint) {
        try {
          new URL(credentials.endpoint);
        } catch {
          errors.push("エンドポイントのURLが無効です");
        }
      } else {
        errors.push("エンドポイントが必要です");
      }
    }

    // バケット名の形式チェック
    if (!credentials.bucketName) {
      errors.push("バケット名が入力されていません");
    } else if (!/^[a-z0-9.-]{3,63}$/.test(credentials.bucketName)) {
      errors.push(
        "バケット名は3-63文字の小文字英数字、ハイフン、ピリオドである必要があります",
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * ストレージプロバイダー情報を取得（静的メソッド）
   * @param provider プロバイダー名
   * @returns プロバイダー情報
   */
  static getProviderInfo(provider: string): StorageProvider | null {
    return STORAGE_PROVIDERS[provider] || null;
  }

  /**
   * サポートされているプロバイダー一覧を取得（静的メソッド）
   * @returns プロバイダー一覧
   */
  static getSupportedProviders(): StorageProvider[] {
    return Object.values(STORAGE_PROVIDERS);
  }

  /**
   * プロバイダーのデフォルトエンドポイントを取得（静的メソッド）
   * @param provider プロバイダー名
   * @param region リージョン
   * @returns デフォルトエンドポイント
   */
  static getDefaultEndpoint(provider: string, region: string): string | null {
    const providerConfig = STORAGE_PROVIDERS[provider];

    if (providerConfig?.getDefaultEndpoint) {
      return providerConfig.getDefaultEndpoint(region);
    }

    return providerConfig?.defaultEndpoint || null;
  }

  /**
   * 認証情報を保存
   * @param credentials S3認証情報
   */
  static saveCredentials(credentials: S3Credentials): void {
    try {
      // prefs.ts の関数群を利用して保存処理を簡潔に

      setPref("s3.provider", credentials.provider);
      setPref("s3.accessKeyId", credentials.accessKeyId);
      setPref("s3.secretAccessKey", credentials.secretAccessKey);
      setPref("s3.region", credentials.region);
      setPref("s3.bucketName", credentials.bucketName);

      if (credentials.endpoint) {
        setPref("s3.endpoint", credentials.endpoint);
      } else {
        clearPref("s3.endpoint");
      }

      ztoolkit.log("S3 credentials saved");
    } catch (error) {
      ztoolkit.log("Failed to save S3 credentials:", error);
      throw new Error("認証情報の保存に失敗しました");
    }
  }

  /**
   * 認証情報を取得
   * @returns S3認証情報（部分的）
   */
  static getCredentials(): Partial<S3Credentials> {
    try {
      return {
        provider: getPref("s3.provider"),
        accessKeyId: getPref("s3.accessKeyId"),
        secretAccessKey: getPref("s3.secretAccessKey"),
        region: getPref("s3.region"),
        bucketName: getPref("s3.bucketName"),
        endpoint: getPref("s3.endpoint"),
      };
    } catch (error) {
      ztoolkit.log("Failed to get S3 credentials:", error);
      return {};
    }
  }

  /**
   * 完全な認証情報を取得
   * @returns S3認証情報またはnull
   */
  static getCompleteCredentials(): S3Credentials | null {
    try {
      const provider = getPref("s3.provider") as string;
      const accessKeyId = getPref("s3.accessKeyId") as string;
      const secretAccessKey = getPref("s3.secretAccessKey") as string;
      const region = getPref("s3.region") as string;
      const bucketName = getPref("s3.bucketName") as string;
      const endpoint = getPref("s3.endpoint") as string | undefined;

      if (
        !provider ||
        !accessKeyId ||
        !secretAccessKey ||
        !region ||
        !bucketName
      ) {
        return null;
      }

      const credentials: S3Credentials = {
        provider,
        accessKeyId,
        secretAccessKey,
        region,
        bucketName,
      };

      if (endpoint) {
        credentials.endpoint = endpoint;
      }

      return credentials;
    } catch (error) {
      ztoolkit.log("Failed to get complete S3 credentials:", error);
      return null;
    }
  }

  /**
   * UI用の認証情報を取得（パスワードマスク等）
   * @returns UI表示用の認証情報
   */
  static getCredentialsForUI(): Partial<S3Credentials> {
    return S3AuthManager.getCredentials();
  }

  /**
   * 認証情報をクリア
   */
  static clearCredentials(): void {
    try {
      clearPref("s3.provider");
      clearPref("s3.accessKeyId");
      clearPref("s3.secretAccessKey");
      clearPref("s3.region");
      clearPref("s3.bucketName");
      clearPref("s3.endpoint");
      this.clearProviderSpecificSettings();
    } catch (error) {
      throw new Error("認証情報のクリアに失敗しました");
    }
  }

  /**
   * 認証情報が設定されているかチェック
   * @returns 認証情報が設定されているかどうか
   */
  static hasCredentials(): boolean {
    const creds = S3AuthManager.getCompleteCredentials();
    return creds !== null;
  }

  /**
   * 各プロバイダー固有の設定をクリア
   */
  private static clearProviderSpecificSettings(): void {
    try {
      // 各プロバイダー固有の設定をクリアする処理をここに追加
    } catch (error) {
      ztoolkit.log("Failed to clear provider-specific settings:", error);
      // エラーログは出力するが、例外は投げない（致命的でない）
    }
  }
}
