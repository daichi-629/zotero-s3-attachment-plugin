import {
  S3AuthManager,
  STORAGE_PROVIDERS,
  S3Credentials,
  ValidationResult,
} from "../../modules/s3AuthManager";

describe("S3AuthManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("STORAGE_PROVIDERS", () => {
    test("すべてのプロバイダーが定義されている", () => {
      expect(STORAGE_PROVIDERS.aws).toBeDefined();
      expect(STORAGE_PROVIDERS.r2).toBeDefined();
      expect(STORAGE_PROVIDERS.minio).toBeDefined();
      expect(STORAGE_PROVIDERS.custom).toBeDefined();
    });

    test("AWSプロバイダーの設定が正しい", () => {
      const aws = STORAGE_PROVIDERS.aws;
      expect(aws.name).toBe("aws");
      expect(aws.displayName).toBe("Amazon S3");
      expect(aws.endpointRequired).toBe(false);
      expect(aws.regionRequired).toBe(true);
      expect(aws.accessKeyFormat).toEqual(/^[A-Z0-9]{20}$/);
      expect(aws.secretKeyMinLength).toBe(40);
      expect(aws.getDefaultEndpoint).toBeDefined();
    });

    test("R2プロバイダーの設定が正しい", () => {
      const r2 = STORAGE_PROVIDERS.r2;
      expect(r2.name).toBe("r2");
      expect(r2.displayName).toBe("Cloudflare R2");
      expect(r2.endpointRequired).toBe(true);
      expect(r2.regionRequired).toBe(false);
      expect(r2.accessKeyFormat).toEqual(/^[a-f0-9]{32}$/);
      expect(r2.secretKeyMinLength).toBe(64);
    });
  });

  describe("validateCredentials", () => {
    test("有効なAWS認証情報を受け入れる", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "aws",
        accessKeyId: "ABCDEFGHIJKLMNOPQRST",
        secretAccessKey: "abcdefghijklmnopqrstuvwxyz1234567890abcdef",
        region: "us-east-1",
        bucketName: "my-test-bucket",
        endpoint: "https://s3.us-east-1.amazonaws.com",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("有効なR2認証情報を受け入れる", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "r2",
        accessKeyId: "abcdef0123456789abcdef0123456789",
        secretAccessKey:
          "abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz12",
        bucketName: "my-r2-bucket",
        endpoint: "https://account-id.r2.cloudflarestorage.com",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("空の認証情報を拒否する", () => {
      const credentials: Partial<S3Credentials> = {};

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain("Access Key IDが入力されていません");
      expect(result.errors).toContain("Secret Access Keyが入力されていません");
      expect(result.errors).toContain("バケット名が入力されていません");
    });

    test("無効なAWS Access Key IDを拒否する", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "aws",
        accessKeyId: "invalid-key",
        secretAccessKey: "abcdefghijklmnopqrstuvwxyz1234567890abcdef",
        region: "us-east-1",
        bucketName: "my-test-bucket",
        endpoint: "https://s3.us-east-1.amazonaws.com",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Access Key IDは20文字の英数字である必要があります",
      );
    });

    test("無効なR2 Access Key IDを拒否する", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "r2",
        accessKeyId: "ABCDEFGHIJKLMNOPQRST",
        secretAccessKey:
          "abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz12",
        bucketName: "my-r2-bucket",
        endpoint: "https://account-id.r2.cloudflarestorage.com",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Access Key IDは32文字の16進文字列である必要があります",
      );
    });

    test("短すぎるSecret Access Keyを拒否する", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "aws",
        accessKeyId: "ABCDEFGHIJKLMNOPQRST",
        secretAccessKey: "short",
        region: "us-east-1",
        bucketName: "my-test-bucket",
        endpoint: "https://s3.us-east-1.amazonaws.com",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Secret Access Keyは40文字以上である必要があります",
      );
    });

    test("無効なリージョンを拒否する (AWS)", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "aws",
        accessKeyId: "ABCDEFGHIJKLMNOPQRST",
        secretAccessKey: "abcdefghijklmnopqrstuvwxyz1234567890abcdef",
        region: "INVALID_REGION",
        bucketName: "my-test-bucket",
        endpoint: "https://s3.us-east-1.amazonaws.com",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("リージョンが無効です");
    });

    test("無効なエンドポイントURLを拒否する", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "aws",
        accessKeyId: "ABCDEFGHIJKLMNOPQRST",
        secretAccessKey: "abcdefghijklmnopqrstuvwxyz1234567890abcdef",
        region: "us-east-1",
        bucketName: "my-test-bucket",
        endpoint: "invalid-url",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("エンドポイントのURLが無効です");
    });

    test("無効なバケット名を拒否する", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "aws",
        accessKeyId: "ABCDEFGHIJKLMNOPQRST",
        secretAccessKey: "abcdefghijklmnopqrstuvwxyz1234567890abcdef",
        region: "us-east-1",
        bucketName: "My-INVALID-Bucket",
        endpoint: "https://s3.us-east-1.amazonaws.com",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "バケット名は3-63文字の小文字英数字、ハイフン、ピリオドである必要があります",
      );
    });

    test("サポートされていないプロバイダーを拒否する", () => {
      const credentials: Partial<S3Credentials> = {
        provider: "unsupported",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        bucketName: "test-bucket",
      };

      const result = S3AuthManager.validateCredentials(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "サポートされていないストレージプロバイダーです",
      );
    });
  });

  describe("getProviderInfo", () => {
    test("有効なプロバイダー情報を返す", () => {
      const awsInfo = S3AuthManager.getProviderInfo("aws");
      expect(awsInfo).toBeDefined();
      expect(awsInfo?.name).toBe("aws");
      expect(awsInfo?.displayName).toBe("Amazon S3");

      const r2Info = S3AuthManager.getProviderInfo("r2");
      expect(r2Info).toBeDefined();
      expect(r2Info?.name).toBe("r2");
      expect(r2Info?.displayName).toBe("Cloudflare R2");
    });

    test("無効なプロバイダーにnullを返す", () => {
      const info = S3AuthManager.getProviderInfo("invalid");
      expect(info).toBeNull();
    });
  });

  describe("getSupportedProviders", () => {
    test("サポートされているプロバイダー一覧を返す", () => {
      const providers = S3AuthManager.getSupportedProviders();
      expect(providers).toHaveLength(4);
      expect(providers.map((p) => p.name)).toContain("aws");
      expect(providers.map((p) => p.name)).toContain("r2");
      expect(providers.map((p) => p.name)).toContain("minio");
      expect(providers.map((p) => p.name)).toContain("custom");
    });
  });

  describe("getDefaultEndpoint", () => {
    test("AWSのデフォルトエンドポイントを生成する", () => {
      const endpoint = S3AuthManager.getDefaultEndpoint("aws", "us-west-2");
      expect(endpoint).toBe("https://s3.us-west-2.amazonaws.com");
    });

    test("R2のデフォルトエンドポイントを返す", () => {
      const endpoint = S3AuthManager.getDefaultEndpoint("r2", "auto");
      expect(endpoint).toBe("https://{ACCOUNT_ID}.r2.cloudflarestorage.com");
    });

    test("getDefaultEndpoint関数がないプロバイダーの場合defaultEndpointを返す", () => {
      const endpoint = S3AuthManager.getDefaultEndpoint("minio", "us-east-1");
      expect(endpoint).toBeNull();
    });

    test("無効なプロバイダーにnullを返す", () => {
      const endpoint = S3AuthManager.getDefaultEndpoint("invalid", "us-east-1");
      expect(endpoint).toBeNull();
    });
  });

  describe("インスタンスメソッド - 認証情報の管理", () => {
    let authManager: S3AuthManager;

    beforeEach(() => {
      authManager = new S3AuthManager();
      jest.clearAllMocks();
    });

    describe("saveCredentials (static)", () => {
      test("認証情報を正しく保存する", () => {
        const credentials: S3Credentials = {
          provider: "aws",
          accessKeyId: "ABCDEFGHIJKLMNOPQRST",
          secretAccessKey: "abcdefghijklmnopqrstuvwxyz1234567890abcdef",
          region: "us-east-1",
          bucketName: "my-test-bucket",
          endpoint: "https://s3.us-east-1.amazonaws.com",
        };

        S3AuthManager.saveCredentials(credentials);

        expect((global as any).Zotero.Prefs.set).toHaveBeenCalledWith(
          expect.stringContaining("provider"),
          credentials.provider,
          true,
        );
        expect((global as any).Zotero.Prefs.set).toHaveBeenCalledWith(
          expect.stringContaining("accessKeyId"),
          credentials.accessKeyId,
          true,
        );
        expect((global as any).Zotero.Prefs.set).toHaveBeenCalledWith(
          expect.stringContaining("secretAccessKey"),
          credentials.secretAccessKey,
          true,
        );
        expect((global as any).Zotero.Prefs.set).toHaveBeenCalledWith(
          expect.stringContaining("region"),
          credentials.region,
          true,
        );
        expect((global as any).Zotero.Prefs.set).toHaveBeenCalledWith(
          expect.stringContaining("bucketName"),
          credentials.bucketName,
          true,
        );
        expect((global as any).Zotero.Prefs.set).toHaveBeenCalledWith(
          expect.stringContaining("endpoint"),
          credentials.endpoint,
          true,
        );
      });
    });

    describe("getCredentials (static)", () => {
      test("保存された認証情報を取得する", () => {
        (global as any).Zotero.Prefs.get.mockImplementation((key: string) => {
          if (key.includes("provider")) return "aws";
          if (key.includes("accessKeyId")) return "ABCDEFGHIJKLMNOPQRST";
          if (key.includes("secretAccessKey")) return "secret-key";
          if (key.includes("region")) return "us-east-1";
          if (key.includes("bucketName")) return "my-test-bucket";
          if (key.includes("endpoint"))
            return "https://s3.us-east-1.amazonaws.com";
          return undefined;
        });

        const credentials = S3AuthManager.getCredentials();
        expect(credentials.provider).toBe("aws");
        expect(credentials.accessKeyId).toBe("ABCDEFGHIJKLMNOPQRST");
        expect(credentials.secretAccessKey).toBe("secret-key");
        expect(credentials.region).toBe("us-east-1");
        expect(credentials.bucketName).toBe("my-test-bucket");
        expect(credentials.endpoint).toBe("https://s3.us-east-1.amazonaws.com");
      });

      test("保存されていない場合は空のオブジェクトを返す", () => {
        (global as any).Zotero.Prefs.get.mockReturnValue(undefined);

        const credentials = S3AuthManager.getCredentials();
        expect(credentials).toEqual({
          provider: undefined,
          accessKeyId: undefined,
          secretAccessKey: undefined,
          region: undefined,
          bucketName: undefined,
          endpoint: undefined,
        });
      });
    });

    describe("getCompleteCredentials (static)", () => {
      test("完全な認証情報がある場合はオブジェクトを返す", () => {
        (global as any).Zotero.Prefs.get.mockImplementation((key: string) => {
          if (key.includes("provider")) return "aws";
          if (key.includes("accessKeyId")) return "ABCDEFGHIJKLMNOPQRST";
          if (key.includes("secretAccessKey")) return "secret-key";
          if (key.includes("region")) return "us-east-1";
          if (key.includes("bucketName")) return "my-test-bucket";
          if (key.includes("endpoint"))
            return "https://s3.us-east-1.amazonaws.com";
          return undefined;
        });

        const credentials = S3AuthManager.getCompleteCredentials();
        expect(credentials).not.toBeNull();
        expect(credentials?.provider).toBe("aws");
      });

      test("不完全な認証情報の場合はnullを返す", () => {
        (global as any).Zotero.Prefs.get.mockImplementation((key: string) => {
          if (key.includes("provider")) return "aws";
          // accessKeyIdが欠けている
          if (key.includes("secretAccessKey")) return "secret-key";
          if (key.includes("region")) return "us-east-1";
          if (key.includes("bucketName")) return "my-test-bucket";
          if (key.includes("endpoint"))
            return "https://s3.us-east-1.amazonaws.com";
          return undefined;
        });

        const credentials = S3AuthManager.getCompleteCredentials();
        expect(credentials).toBeNull();
      });
    });

    describe("hasCredentials (static)", () => {
      test("完全な認証情報がある場合はtrueを返す", () => {
        (global as any).Zotero.Prefs.get.mockImplementation((key: string) => {
          if (key.includes("provider")) return "aws";
          if (key.includes("accessKeyId")) return "ABCDEFGHIJKLMNOPQRST";
          if (key.includes("secretAccessKey")) return "secret-key";
          if (key.includes("region")) return "us-east-1";
          if (key.includes("bucketName")) return "my-test-bucket";
          if (key.includes("endpoint"))
            return "https://s3.us-east-1.amazonaws.com";
          return undefined;
        });

        const hasCredentials = S3AuthManager.hasCredentials();
        expect(hasCredentials).toBe(true);
      });

      test("不完全な認証情報の場合はfalseを返す", () => {
        (global as any).Zotero.Prefs.get.mockReturnValue(undefined);

        const hasCredentials = S3AuthManager.hasCredentials();
        expect(hasCredentials).toBe(false);
      });
    });

    describe("clearCredentials (static)", () => {
      test("認証情報をクリアする", () => {
        S3AuthManager.clearCredentials();

        expect((global as any).Zotero.Prefs.clear).toHaveBeenCalledWith(
          expect.stringContaining("provider"),
          true,
        );
        expect((global as any).Zotero.Prefs.clear).toHaveBeenCalledWith(
          expect.stringContaining("accessKeyId"),
          true,
        );
        expect((global as any).Zotero.Prefs.clear).toHaveBeenCalledWith(
          expect.stringContaining("secretAccessKey"),
          true,
        );
        expect((global as any).Zotero.Prefs.clear).toHaveBeenCalledWith(
          expect.stringContaining("region"),
          true,
        );
        expect((global as any).Zotero.Prefs.clear).toHaveBeenCalledWith(
          expect.stringContaining("bucketName"),
          true,
        );
        expect((global as any).Zotero.Prefs.clear).toHaveBeenCalledWith(
          expect.stringContaining("endpoint"),
          true,
        );
      });
    });
  });
});
