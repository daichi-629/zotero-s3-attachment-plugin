import { AttachmentHandler } from "../../modules/attachmentHandler";

// S3AuthManagerのモック
jest.mock("../../modules/s3AuthManager", () => ({
  S3AuthManager: {
    getCompleteCredentials: jest.fn().mockReturnValue({
      provider: "r2",
      endpoint: "https://example.com",
      bucketName: "test-bucket",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    }),
  },
}));

describe("AttachmentHandler", () => {
  beforeEach(() => {
    // ztoolkitのモック
    (global as any).ztoolkit = {
      log: jest.fn(),
    };
  });
  describe("generateAndSavePublicUrl", () => {
    it("should set the public URL correctly for an item with S3 key", async () => {
      // Zoteroアイテムのモック（S3に保存済み）
      const mockItem = {
        id: 123,
        isAttachment: () => true,
        getField: jest.fn().mockReturnValue("s3:123/test-file.pdf"), // S3キー
        setField: jest.fn(),
        save: jest.fn(),
      };

      const attachmentHandler = new AttachmentHandler();
      await attachmentHandler.generateAndSavePublicUrl(mockItem);

      expect(mockItem.setField).toHaveBeenCalledWith(
        "url",
        "https://example.com/test-bucket/123/test-file.pdf",
      );
      expect(mockItem.save).toHaveBeenCalled();
    });
  });
});
