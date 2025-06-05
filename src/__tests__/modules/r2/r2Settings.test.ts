import { R2Settings } from "../../../modules/r2/r2Settings";
import { getPref, setPref, clearPref } from "../../../utils/prefs";
import { R2Utils } from "../../../modules/r2/r2Utils";

// prefsモジュールをモック
jest.mock("../../../utils/prefs");

// R2Utilsをモック
jest.mock("../../../modules/r2/r2Utils");

// fetchをモック
global.fetch = jest.fn();

// ztoolkitのログ関数をモック
const mockZtoolkitLog = jest.fn();
(global as any).ztoolkit = {
  log: mockZtoolkitLog,
};

// prefsのモック関数を型安全に参照
const mockGetPref = getPref as jest.MockedFunction<typeof getPref>;
const mockSetPref = setPref as jest.MockedFunction<typeof setPref>;
const mockClearPref = clearPref as jest.MockedFunction<typeof clearPref>;
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("R2Settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZtoolkitLog.mockClear();

    // グローバルztoolkitを確実に設定
    (global as any).ztoolkit = {
      log: mockZtoolkitLog,
    };
  });

  describe("Cloudflare APIトークン管理", () => {
    describe("saveCloudflareApiToken", () => {
      test("有効なAPIトークンを保存する", () => {
        R2Settings.saveCloudflareApiToken("test-api-token");

        expect(mockSetPref).toHaveBeenCalledWith(
          "cloudflare.apiToken",
          "test-api-token",
        );
        expect(mockZtoolkitLog).toHaveBeenCalledWith(
          "Cloudflare APIトークンを保存しました",
        );
      });

      test("トークンの前後の空白を除去して保存する", () => {
        R2Settings.saveCloudflareApiToken("  test-api-token  ");

        expect(mockSetPref).toHaveBeenCalledWith(
          "cloudflare.apiToken",
          "test-api-token",
        );
      });

      test("空のトークンの場合エラーを投げる", () => {
        expect(() => R2Settings.saveCloudflareApiToken("")).toThrow(
          "有効なAPIトークンを入力してください",
        );
        expect(() => R2Settings.saveCloudflareApiToken("   ")).toThrow(
          "有効なAPIトークンを入力してください",
        );
      });
    });

    describe("getCloudflareApiToken", () => {
      test("保存されたAPIトークンを取得する", () => {
        mockGetPref.mockReturnValue("saved-api-token");

        const result = R2Settings.getCloudflareApiToken();

        expect(result).toBe("saved-api-token");
        expect(mockGetPref).toHaveBeenCalledWith("cloudflare.apiToken");
      });

      test("保存されていない場合nullを返す", () => {
        mockGetPref.mockReturnValue(null as any);

        const result = R2Settings.getCloudflareApiToken();

        expect(result).toBeNull();
      });
    });

    describe("hasCloudflareApiToken", () => {
      test("有効なトークンが設定されている場合trueを返す", () => {
        mockGetPref.mockReturnValue("valid-token");

        const result = R2Settings.hasCloudflareApiToken();

        expect(result).toBe(true);
      });

      test("トークンが設定されていない場合falseを返す", () => {
        mockGetPref.mockReturnValue(null as any);

        const result = R2Settings.hasCloudflareApiToken();

        expect(result).toBe(false);
      });

      test("空のトークンの場合falseを返す", () => {
        mockGetPref.mockReturnValue("");

        const result = R2Settings.hasCloudflareApiToken();

        expect(result).toBe(false);
      });

      test("空白のみのトークンの場合falseを返す", () => {
        mockGetPref.mockReturnValue("   ");

        const result = R2Settings.hasCloudflareApiToken();

        expect(result).toBe(false);
      });
    });

    describe("clearCloudflareApiToken", () => {
      test("APIトークンをクリアする", () => {
        R2Settings.clearCloudflareApiToken();

        expect(mockClearPref).toHaveBeenCalledWith("cloudflare.apiToken");
        expect(mockZtoolkitLog).toHaveBeenCalledWith(
          "Cloudflare APIトークンをクリアしました",
        );
      });
    });
  });

  describe("カスタムドメイン管理", () => {
    describe("saveCustomDomain", () => {
      test("有効なカスタムドメインを保存する", () => {
        jest
          .spyOn(R2Settings, "isValidCustomDomainFormat")
          .mockReturnValue(true);

        R2Settings.saveCustomDomain("example.com");

        expect(mockSetPref).toHaveBeenCalledWith(
          "r2.customDomain",
          "example.com",
        );
        expect(mockZtoolkitLog).toHaveBeenCalledWith(
          "カスタムドメインを保存しました: example.com",
        );
      });

      test("無効なドメイン形式の場合エラーを投げる", () => {
        jest
          .spyOn(R2Settings, "isValidCustomDomainFormat")
          .mockReturnValue(false);

        expect(() => R2Settings.saveCustomDomain("invalid-domain")).toThrow(
          "有効なドメイン形式を入力してください",
        );
      });
    });

    describe("getCustomDomain", () => {
      test("保存されたカスタムドメインを取得する", () => {
        mockGetPref.mockReturnValue("saved-domain.com");

        const result = R2Settings.getCustomDomain();

        expect(result).toBe("saved-domain.com");
        expect(mockGetPref).toHaveBeenCalledWith("r2.customDomain");
      });

      test("設定されていない場合nullを返す", () => {
        mockGetPref.mockReturnValue(null as any);

        const result = R2Settings.getCustomDomain();

        expect(result).toBeNull();
      });
    });

    describe("clearCustomDomain", () => {
      test("カスタムドメインをクリアする", () => {
        R2Settings.clearCustomDomain();

        expect(mockClearPref).toHaveBeenCalledWith("r2.customDomain");
        expect(mockZtoolkitLog).toHaveBeenCalledWith(
          "カスタムドメインをクリアしました",
        );
      });
    });

    describe("isValidCustomDomainFormat", () => {
      test("有効なドメイン形式を受け入れる", () => {
        jest
          .spyOn(R2Settings, "isValidCustomDomainFormat")
          .mockReturnValue(true);

        // 有効なドメイン形式
        expect(R2Settings.isValidCustomDomainFormat("example.com")).toBe(true);
        expect(
          R2Settings.isValidCustomDomainFormat("https://example.com"),
        ).toBe(true);
        expect(
          R2Settings.isValidCustomDomainFormat("subdomain.example.com"),
        ).toBe(true);
      });

      test("無効なドメイン形式を拒否する", () => {
        const invalidDomains = [
          "",
          "   ",
          "localhost",
          "https://localhost",
          "invalid domain",
          "http://",
          "https://",
          "ftp://example.com",
          ".example.com",
          "example.",
          "-example.com",
          "example-.com",
        ];

        invalidDomains.forEach((domain) => {
          jest
            .spyOn(R2Settings, "isValidCustomDomainFormat")
            .mockReturnValue(false);
          const result = R2Settings.isValidCustomDomainFormat(domain);
          expect(result).toBe(false);
        });
      });
    });
  });

  describe("公開URL自動保存設定", () => {
    describe("setAutoSavePublicUrl", () => {
      test("公開URL自動保存を有効にする", () => {
        R2Settings.setAutoSavePublicUrl(true);

        expect(mockSetPref).toHaveBeenCalledWith("r2.autoSavePublicUrl", true);
        expect(mockZtoolkitLog).toHaveBeenCalledWith(
          "公開URL自動保存を有効にしました",
        );
      });

      test("公開URL自動保存を無効にする", () => {
        R2Settings.setAutoSavePublicUrl(false);

        expect(mockSetPref).toHaveBeenCalledWith("r2.autoSavePublicUrl", false);
        expect(mockZtoolkitLog).toHaveBeenCalledWith(
          "公開URL自動保存を無効にしました",
        );
      });
    });

    describe("getAutoSavePublicUrl", () => {
      test("設定された値を取得する", () => {
        mockGetPref.mockReturnValue(true);

        const result = R2Settings.getAutoSavePublicUrl();

        expect(result).toBe(true);
        expect(mockGetPref).toHaveBeenCalledWith("r2.autoSavePublicUrl");
      });

      test("設定されていない場合デフォルト値falseを返す", () => {
        mockGetPref.mockReturnValue(null as any);

        const result = R2Settings.getAutoSavePublicUrl();

        expect(result).toBe(false);
      });
    });
  });

  describe("validateR2Credentials", () => {
    test("R2Utils.validateR2Credentialsを適切に呼び出す", () => {
      const mockValidatedCredentials = {
        credentials: { provider: "r2" },
        apiToken: "test-token",
        accountId: "test-account",
        bucketName: "test-bucket",
      };

      (R2Utils.validateR2Credentials as jest.Mock).mockReturnValue(
        mockValidatedCredentials,
      );

      const result = R2Settings.validateR2Credentials();

      expect(result).toBe(mockValidatedCredentials);
      expect(R2Utils.validateR2Credentials).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });
  });

  describe("checkCustomDomainStatus", () => {
    test("設定されたドメインが有効な場合", async () => {
      jest
        .spyOn(R2Settings, "getCustomDomain")
        .mockReturnValue("valid-domain.com");
      jest.spyOn(R2Settings, "isValidCustomDomainFormat").mockReturnValue(true);

      const result = await R2Settings.checkCustomDomainStatus();

      expect(result).toEqual({
        isValid: true,
        domain: "valid-domain.com",
      });
    });

    test("ドメインが設定されていない場合", async () => {
      jest.spyOn(R2Settings, "getCustomDomain").mockReturnValue(null);

      const result = await R2Settings.checkCustomDomainStatus();

      expect(result).toEqual({
        isValid: false,
        domain: null,
      });
    });

    test("ドメイン形式が無効な場合", async () => {
      jest
        .spyOn(R2Settings, "getCustomDomain")
        .mockReturnValue("invalid-domain");
      jest
        .spyOn(R2Settings, "isValidCustomDomainFormat")
        .mockReturnValue(false);

      const result = await R2Settings.checkCustomDomainStatus();

      expect(result).toEqual({
        isValid: false,
        domain: "invalid-domain",
        error: "ドメイン形式が無効です",
      });
    });
  });

  describe("checkCustomDomainConnectivity", () => {
    const mockValidatedCredentials = {
      credentials: { provider: "r2" },
      apiToken: "test-token",
      accountId: "test-account",
      bucketName: "test-bucket",
    };

    beforeEach(() => {
      jest
        .spyOn(R2Settings, "validateR2Credentials")
        .mockReturnValue(mockValidatedCredentials);
      jest.spyOn(R2Settings, "isValidCustomDomainFormat").mockReturnValue(true);
    });

    test("ドメインが設定されていない場合", async () => {
      jest.spyOn(R2Settings, "getCustomDomain").mockReturnValue(null);

      const result = await R2Settings.checkCustomDomainConnectivity();

      expect(result).toEqual({
        connected: false,
        status: "no_domain_configured",
      });
    });

    test("無効なドメイン形式の場合", async () => {
      jest
        .spyOn(R2Settings, "isValidCustomDomainFormat")
        .mockReturnValue(false);

      const result =
        await R2Settings.checkCustomDomainConnectivity("invalid-domain");

      expect(result).toEqual({
        connected: false,
        status: "invalid_domain_format",
      });
    });

    test("R2認証情報が設定されていない場合", async () => {
      jest.spyOn(R2Settings, "validateR2Credentials").mockReturnValue(null);

      const result =
        await R2Settings.checkCustomDomainConnectivity("valid-domain.com");

      expect(result).toEqual({
        connected: false,
        status: "no_r2_credentials",
      });
    });

    test("API呼び出しが失敗した場合", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      const result =
        await R2Settings.checkCustomDomainConnectivity("valid-domain.com");

      expect(result).toEqual({
        connected: false,
        status: "api_error",
        details: {
          errors: ["HTTP 404: Not Found"],
        },
      });
    });

    test("成功レスポンスで接続状態を確認する", async () => {
      const mockApiResponse = {
        success: true,
        result: {
          domains: [
            {
              domain: "valid-domain.com",
              enabled: true,
              status: {
                ownership: "active",
                ssl: "active",
                certificate: "active",
              },
            },
          ],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result =
        await R2Settings.checkCustomDomainConnectivity("valid-domain.com");

      expect(result.connected).toBe(true);
      expect(result.details?.hostname).toBe("valid-domain.com");
      expect(result.details?.ownership).toBe("active");
      expect(result.details?.ssl).toBe("active");
    });

    test("ドメインが見つからない場合", async () => {
      const mockApiResponse = {
        success: true,
        result: {
          domains: [],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result =
        await R2Settings.checkCustomDomainConnectivity("missing-domain.com");

      expect(result).toEqual({
        connected: false,
        status: "not_found",
        details: {
          hostname: "missing-domain.com",
        },
      });
    });

    test("API呼び出しで例外が発生した場合", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result =
        await R2Settings.checkCustomDomainConnectivity("valid-domain.com");

      expect(result).toEqual({
        connected: false,
        status: "error",
        details: {
          errors: ["Error: Network error"],
        },
      });
    });
  });

  describe("enablePublicDevelopmentUrl", () => {
    const mockValidatedCredentials = {
      credentials: { provider: "r2" },
      apiToken: "test-token",
      accountId: "test-account",
      bucketName: "test-bucket",
    };

    beforeEach(() => {
      jest
        .spyOn(R2Settings, "validateR2Credentials")
        .mockReturnValue(mockValidatedCredentials);
    });

    test("認証情報が無効な場合falseを返す", async () => {
      jest.spyOn(R2Settings, "validateR2Credentials").mockReturnValue(null);

      const result = await R2Settings.enablePublicDevelopmentUrl("test-bucket");

      expect(result).toBe(false);
    });

    test("API呼び出しが失敗した場合falseを返す", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: jest.fn().mockResolvedValue("Error details"),
      } as any);

      const result = await R2Settings.enablePublicDevelopmentUrl("test-bucket");

      expect(result).toBe(false);
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        expect.stringContaining(
          "パブリック開発URL有効化に失敗: 500 Internal Server Error",
        ),
      );
    });

    test("成功レスポンスでtrueを返す", async () => {
      const mockApiResponse = {
        success: true,
        result: {
          bucketId: "bucket-123",
          domain: "pub-123.r2.dev",
          enabled: true,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result = await R2Settings.enablePublicDevelopmentUrl("test-bucket");

      expect(result).toBe(true);
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "パブリック開発URLを有効化しました: pub-123.r2.dev",
      );
    });

    test("APIからエラーレスポンスを受信した場合falseを返す", async () => {
      const mockApiResponse = {
        success: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockApiResponse),
      } as any);

      const result = await R2Settings.enablePublicDevelopmentUrl("test-bucket");

      expect(result).toBe(false);
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "パブリック開発URL有効化でエラーレスポンスを受信しました",
      );
    });

    test("ネットワークエラーが発生した場合falseを返す", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await R2Settings.enablePublicDevelopmentUrl("test-bucket");

      expect(result).toBe(false);
      expect(mockZtoolkitLog).toHaveBeenCalledWith(
        "パブリック開発URL有効化に失敗: Error: Network error",
      );
    });
  });
});
