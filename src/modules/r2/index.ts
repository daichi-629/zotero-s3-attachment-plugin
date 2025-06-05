/**
 * Cloudflare R2 モジュール統合エクスポート
 * 関心事の分離により機能を分割したR2関連モジュールの統合
 */

// クラスインポート
import { R2UrlGenerator } from "./r2UrlGenerator";
import { R2Settings } from "./r2Settings";
import { R2Utils } from "./r2Utils";

// 型定義
export type { UrlType, GenerateUrlOptions } from "./r2UrlGenerator";
export type { ValidatedR2Credentials } from "./r2Utils";

// クラスエクスポート
export { R2UrlGenerator } from "./r2UrlGenerator";
export { R2Settings } from "./r2Settings";
export { R2Utils } from "./r2Utils";

/**
 * R2PublicUrlManager - 後方互換性のためのレガシーエクスポート
 * @deprecated 新しいコードでは R2UrlGenerator, R2Settings, R2Utils を直接使用してください
 */
export class R2PublicUrlManager {
  // URL生成関連（R2UrlGeneratorに委譲）
  static generateUrl = R2UrlGenerator.generateUrl;
  static generatePublicUrl = R2UrlGenerator.generatePublicUrl;
  static generateUrlByType = R2UrlGenerator.generateUrlByType;
  static getPublicDevelopmentUrl = R2UrlGenerator.getPublicDevelopmentUrl;
  static enablePublicDevelopmentUrl = R2UrlGenerator.enablePublicDevelopmentUrl;

  // 設定関連（R2Settingsに委譲）
  static saveCloudflareApiToken = R2Settings.saveCloudflareApiToken;
  static getCloudflareApiToken = R2Settings.getCloudflareApiToken;
  static hasCloudflareApiToken = R2Settings.hasCloudflareApiToken;
  static clearCloudflareApiToken = R2Settings.clearCloudflareApiToken;
  static saveCustomDomain = R2Settings.saveCustomDomain;
  static getCustomDomain = R2Settings.getCustomDomain;
  static clearCustomDomain = R2Settings.clearCustomDomain;
  static isValidCustomDomainFormat = R2Settings.isValidCustomDomainFormat;
  static setAutoSavePublicUrl = R2Settings.setAutoSavePublicUrl;
  static getAutoSavePublicUrl = R2Settings.getAutoSavePublicUrl;
  static checkCustomDomainStatus = R2Settings.checkCustomDomainStatus;
  static checkCustomDomainConnectivity =
    R2Settings.checkCustomDomainConnectivity;

  // ユーティリティ関連（R2Utilsに委譲）
  static extractAccountIdFromEndpoint = R2Utils.extractAccountIdFromEndpoint;
  static savePublicUrlToItem = R2Utils.savePublicUrlToItem;
  static extractS3KeyFromR2Url = R2Utils.extractS3KeyFromR2Url;

  // validateR2Credentialsは引数が変更されたため、設定版を使用
  static validateR2Credentials = R2Settings.validateR2Credentials;

  // 後方互換性のための旧関数名エイリアス
  /** @deprecated isValidCustomDomainFormat() を使用してください */
  static isValidCustomDomain = R2Settings.isValidCustomDomainFormat;
}
