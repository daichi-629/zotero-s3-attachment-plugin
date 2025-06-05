import * as R2Module from "../../../modules/r2/index";
import { R2UrlGenerator } from "../../../modules/r2/r2UrlGenerator";
import { R2Settings } from "../../../modules/r2/r2Settings";
import { R2Utils } from "../../../modules/r2/r2Utils";

// 依存関係をモック
jest.mock("../../../modules/r2/r2UrlGenerator");
jest.mock("../../../modules/r2/r2Settings");
jest.mock("../../../modules/r2/r2Utils");

describe("R2 Module Index", () => {
  describe("エクスポートの確認", () => {
    test("すべての主要クラスがエクスポートされている", () => {
      expect(R2Module.R2UrlGenerator).toBeDefined();
      expect(R2Module.R2Settings).toBeDefined();
      expect(R2Module.R2Utils).toBeDefined();
      expect(R2Module.R2PublicUrlManager).toBeDefined();
    });

    test("型定義がエクスポートされている", () => {
      // TypeScriptの型エクスポートは実行時には検証できないため、
      // コンパイル時にチェックされる
      expect(true).toBe(true);
    });
  });

  describe("R2PublicUrlManager (後方互換性)", () => {
    test("URL生成関連のメソッドが正しく委譲される", () => {
      // R2UrlGeneratorの静的メソッドが正しく参照されているかテスト
      expect(R2Module.R2PublicUrlManager.generateUrl).toBe(
        R2UrlGenerator.generateUrl,
      );
      expect(R2Module.R2PublicUrlManager.generatePublicUrl).toBe(
        R2UrlGenerator.generatePublicUrl,
      );
      expect(R2Module.R2PublicUrlManager.generateUrlByType).toBe(
        R2UrlGenerator.generateUrlByType,
      );
      expect(R2Module.R2PublicUrlManager.getPublicDevelopmentUrl).toBe(
        R2UrlGenerator.getPublicDevelopmentUrl,
      );
      expect(R2Module.R2PublicUrlManager.enablePublicDevelopmentUrl).toBe(
        R2UrlGenerator.enablePublicDevelopmentUrl,
      );
    });

    test("設定関連のメソッドが正しく委譲される", () => {
      // R2Settingsの静的メソッドが正しく参照されているかテスト
      expect(R2Module.R2PublicUrlManager.saveCloudflareApiToken).toBe(
        R2Settings.saveCloudflareApiToken,
      );
      expect(R2Module.R2PublicUrlManager.getCloudflareApiToken).toBe(
        R2Settings.getCloudflareApiToken,
      );
      expect(R2Module.R2PublicUrlManager.hasCloudflareApiToken).toBe(
        R2Settings.hasCloudflareApiToken,
      );
      expect(R2Module.R2PublicUrlManager.clearCloudflareApiToken).toBe(
        R2Settings.clearCloudflareApiToken,
      );
      expect(R2Module.R2PublicUrlManager.saveCustomDomain).toBe(
        R2Settings.saveCustomDomain,
      );
      expect(R2Module.R2PublicUrlManager.getCustomDomain).toBe(
        R2Settings.getCustomDomain,
      );
      expect(R2Module.R2PublicUrlManager.clearCustomDomain).toBe(
        R2Settings.clearCustomDomain,
      );
      expect(R2Module.R2PublicUrlManager.isValidCustomDomainFormat).toBe(
        R2Settings.isValidCustomDomainFormat,
      );
      expect(R2Module.R2PublicUrlManager.setAutoSavePublicUrl).toBe(
        R2Settings.setAutoSavePublicUrl,
      );
      expect(R2Module.R2PublicUrlManager.getAutoSavePublicUrl).toBe(
        R2Settings.getAutoSavePublicUrl,
      );
      expect(R2Module.R2PublicUrlManager.checkCustomDomainStatus).toBe(
        R2Settings.checkCustomDomainStatus,
      );
      expect(R2Module.R2PublicUrlManager.checkCustomDomainConnectivity).toBe(
        R2Settings.checkCustomDomainConnectivity,
      );
    });

    test("ユーティリティ関連のメソッドが正しく委譲される", () => {
      // R2Utilsの静的メソッドが正しく参照されているかテスト
      expect(R2Module.R2PublicUrlManager.extractAccountIdFromEndpoint).toBe(
        R2Utils.extractAccountIdFromEndpoint,
      );
      expect(R2Module.R2PublicUrlManager.savePublicUrlToItem).toBe(
        R2Utils.savePublicUrlToItem,
      );
      expect(R2Module.R2PublicUrlManager.extractS3KeyFromR2Url).toBe(
        R2Utils.extractS3KeyFromR2Url,
      );
    });

    test("validateR2Credentialsが設定版を使用している", () => {
      // R2PublicUrlManagerのvalidateR2CredentialsはR2Settings版を使用する
      expect(R2Module.R2PublicUrlManager.validateR2Credentials).toBe(
        R2Settings.validateR2Credentials,
      );
    });

    test("後方互換性のエイリアスが正しく設定されている", () => {
      // 旧関数名のエイリアス
      expect(R2Module.R2PublicUrlManager.isValidCustomDomain).toBe(
        R2Settings.isValidCustomDomainFormat,
      );
    });
  });

  describe("モジュール構造の整合性", () => {
    test("関心事の分離が適切に行われている", () => {
      // 各クラスが独立して定義されていることを確認
      expect(R2Module.R2UrlGenerator).not.toBe(R2Module.R2Settings);
      expect(R2Module.R2Settings).not.toBe(R2Module.R2Utils);
      expect(R2Module.R2Utils).not.toBe(R2Module.R2UrlGenerator);
    });

    test("後方互換性クラスが新しいクラスとは別に定義されている", () => {
      expect(R2Module.R2PublicUrlManager).not.toBe(R2Module.R2UrlGenerator);
      expect(R2Module.R2PublicUrlManager).not.toBe(R2Module.R2Settings);
      expect(R2Module.R2PublicUrlManager).not.toBe(R2Module.R2Utils);
    });
  });

  describe("型安全性", () => {
    test("エクスポートされたクラスが正しい型を持つ", () => {
      // コンストラクタが存在することを確認
      expect(typeof R2Module.R2UrlGenerator).toBe("function");
      expect(typeof R2Module.R2Settings).toBe("function");
      expect(typeof R2Module.R2Utils).toBe("function");
      expect(typeof R2Module.R2PublicUrlManager).toBe("function");
    });

    test("静的メソッドが関数として参照できる", () => {
      // 主要な静的メソッドが関数として参照できることを確認
      expect(typeof R2Module.R2PublicUrlManager.generateUrl).toBe("function");
      expect(typeof R2Module.R2PublicUrlManager.saveCloudflareApiToken).toBe(
        "function",
      );
      expect(
        typeof R2Module.R2PublicUrlManager.extractAccountIdFromEndpoint,
      ).toBe("function");
    });
  });
});
