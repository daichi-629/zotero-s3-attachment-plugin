/**
 * Zoteroアイテム操作ユーティリティ
 * 添付ファイルとS3情報の管理に関する共通機能を提供
 */

import { extractS3KeyFromUrl } from "./s3Types";

// ========================================
// S3添付ファイル判定・情報取得機能
// ========================================

/**
 * S3に保存された添付ファイルかどうかを判定
 * @param item 添付ファイルアイテム
 * @returns S3保存の場合true
 */
export function isS3StoredAttachment(item: Zotero.Item): boolean {
  if (!item.isAttachment()) {
    return false;
  }

  // web linkアタッチメントで、タイトルに[S3]が含まれているかチェック
  if (item.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL) {
    return false;
  }

  const title = item.getDisplayTitle();
  if (!title || !title.includes("[S3]")) {
    return false;
  }

  // URLを取得してS3 URLかチェック
  let attachmentURL: string | null = null;
  try {
    attachmentURL = item.getField("url") as string;
  } catch (error) {
    ztoolkit.log(`Failed to get URL for item ${item.id}:`, error);
    return false;
  }

  if (!attachmentURL) {
    return false;
  }

  // S3 URLのパターンをチェック
  return (
    attachmentURL.toLowerCase().includes("s3") ||
    attachmentURL.toLowerCase().includes("r2") ||
    attachmentURL.toLowerCase().includes("amazonaws.com") ||
    // S3互換ストレージのパターンもチェック
    (attachmentURL.startsWith("https://") &&
      attachmentURL.includes("attachments"))
  );
}

/**
 * 添付ファイルアイテムからS3キーを取得
 * @param item 添付ファイルアイテム
 * @returns S3キーまたはnull
 */
export async function getS3KeyFromItem(
  item: Zotero.Item,
): Promise<string | null> {
  if (!isS3StoredAttachment(item)) {
    return null;
  }

  // Zotero 7の正しい方法でURLを取得
  let attachmentURL: string | null = null;
  try {
    attachmentURL = item.getField("url") as string;
  } catch (error) {
    ztoolkit.log(`Failed to get URL for item ${item.id}:`, error);
    return null;
  }

  if (!attachmentURL) {
    return null;
  }

  // R2 URLの場合は専用の関数を使用（バケット名除去対応）
  if (attachmentURL.toLowerCase().includes("r2")) {
    try {
      // R2専用の抽出関数を使用
      const { R2Utils } = await import("./r2");
      const s3Key = R2Utils.extractS3KeyFromR2Url(attachmentURL);
      if (s3Key) {
        return s3Key;
      }
    } catch (error) {
      ztoolkit.log(
        `R2 specific extraction failed, fallback to generic: ${String(error)}`,
      );
    }
  }

  // フォールバック: 共通関数を使用してS3キーを抽出
  return extractS3KeyFromUrl(attachmentURL);
}

// ========================================
// 添付ファイル変換機能
// ========================================

/**
 * 添付ファイルをS3リンクモードに変換
 * @param attachmentItem 添付ファイルアイテム
 * @param s3Url S3 URL
 * @param fileName ファイル名
 * @returns 新しく作成されたS3添付ファイルアイテム
 */
export async function convertToS3Attachment(
  attachmentItem: Zotero.Item,
  s3Url: string,
  fileName: string,
): Promise<Zotero.Item> {
  try {
    // 元の添付ファイルの親アイテムを取得
    const parentItem = attachmentItem.parentItem;
    if (!parentItem) {
      throw new Error("親アイテムが見つかりません");
    }

    // Content-Typeを設定（ファイル拡張子から推測）
    const extension = fileName.split(".").pop()?.toLowerCase();
    const contentType = extension
      ? guessContentTypeFromExtension(extension)
      : null;

    // 新しいweb linkアタッチメントを作成
    const newAttachment = await Zotero.Attachments.linkFromURL({
      url: s3Url,
      parentItemID: parentItem.id,
      title: `${fileName} [S3]`,
      contentType: contentType || undefined,
    });

    // 元の添付ファイルを削除
    await attachmentItem.eraseTx();

    ztoolkit.log(`S3 attachment conversion completed: ${s3Url}`);

    return newAttachment;
  } catch (error) {
    ztoolkit.log("S3 attachment conversion failed:", error);
    throw error;
  }
}

/**
 * S3添付ファイルをローカル添付ファイルに変換
 * @param s3Item S3添付ファイルアイテム
 * @param tempFilePath 一時ファイルパス
 * @param fileName ファイル名
 * @returns 新しく作成されたローカル添付ファイルアイテム
 */
export async function convertToLocalAttachment(
  s3Item: Zotero.Item,
  tempFilePath: string,
  fileName: string,
): Promise<Zotero.Item> {
  try {
    const parentItem = s3Item.parentItem;
    if (!parentItem) {
      throw new Error("親アイテムが見つかりません");
    }

    // 新しいローカル添付ファイルを作成
    const newAttachment = await Zotero.Attachments.importFromFile({
      file: tempFilePath,
      parentItemID: parentItem.id,
      title: fileName,
    });

    // 元のS3添付ファイルを削除
    await s3Item.eraseTx();

    // 一時ファイルを削除
    try {
      await IOUtils.remove(tempFilePath);
    } catch (error) {
      ztoolkit.log(`Failed to delete temp file: ${tempFilePath}`, error);
    }

    ztoolkit.log(`Local attachment conversion completed: ${fileName}`);

    return newAttachment;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ztoolkit.log(`Local attachment conversion failed: ${errorMessage}`);
    throw error;
  }
}

// ========================================
// メタデータ取得・ユーティリティ機能
// ========================================

/**
 * ファイル拡張子からContent-Typeを推測
 * @param extension ファイル拡張子（ドットなし）
 * @returns Content-Type
 */
function guessContentTypeFromExtension(extension: string): string | null {
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    rtf: "application/rtf",
    html: "text/html",
    xml: "application/xml",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
  };

  return mimeTypes[extension] || null;
}
