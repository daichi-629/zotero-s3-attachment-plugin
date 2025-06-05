/**
 * S3エラークラス
 * @extends {Error}
 */
export class S3Error extends Error {
  /**
   * @param {string} message エラーメッセージ
   * @param {string} [code] エラーコード
   * @param {number} [statusCode] ステータスコード
   */
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "S3Error";
  }
}

/**
 * アップロード進捗情報
 * @typedef {Object} UploadProgress
 * @property {number} loaded - 読み込まれたバイト数
 * @property {number} total - 合計バイト数
 * @property {number} percentage - 進捗率（%）
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * ファイル整合性情報
 * @typedef {Object} FileIntegrity
 * @property {string} md5Hash - MD5ハッシュ
 * @property {number} size - ファイルサイズ
 * @property {boolean} isValid - 整合性が有効かどうか
 */
export interface FileIntegrity {
  md5Hash: string;
  size: number;
  isValid: boolean;
}

/**
 * S3カスタムメタデータ（user-defined metadata）
 * アップロード時に設定し、取得時に返される構造
 * HTTPヘッダー仕様により、キーは小文字に正規化される
 * @typedef {Object} S3CustomMetadata
 * @property {string} originalfilename - 元のファイル名（小文字キー）
 * @property {string} uploaddate - アップロード日時（ISO文字列、小文字キー）
 * @property {string} md5hash - MD5ハッシュ（小文字キー）
 * @property {string} filesize - ファイルサイズ（文字列、小文字キー）
 */
export interface S3CustomMetadata extends Record<string, string> {
  originalfilename: string;
  uploaddate: string;
  md5hash: string;
  filesize: string;
}

/**
 * S3カスタムメタデータアクセスヘルパー（下位互換性）
 * R2/S3でのヘッダー正規化に対応した安全なアクセス方法を提供
 * @deprecated S3MetadataManagerを使用してください
 */
export class S3MetadataHelper {
  /**
   * MD5ハッシュを取得
   * @param metadata S3カスタムメタデータ
   * @returns MD5ハッシュまたはundefined
   */
  static getMD5Hash(metadata?: S3CustomMetadata): string | undefined {
    if (!metadata) return undefined;
    // 小文字キーでアクセス（R2/S3の仕様）
    return metadata.md5hash || metadata["md5Hash"]; // 後方互換性のため
  }

  /**
   * 元のファイル名を取得
   * @param metadata S3カスタムメタデータ
   * @returns ファイル名またはundefined
   */
  static getOriginalFileName(metadata?: S3CustomMetadata): string | undefined {
    if (!metadata) return undefined;
    return metadata.originalfilename || metadata["originalFileName"];
  }

  /**
   * アップロード日時を取得
   * @param metadata S3カスタムメタデータ
   * @returns アップロード日時またはundefined
   */
  static getUploadDate(metadata?: S3CustomMetadata): string | undefined {
    if (!metadata) return undefined;
    return metadata.uploaddate || metadata["uploadDate"];
  }

  /**
   * ファイルサイズを取得
   * @param metadata S3カスタムメタデータ
   * @returns ファイルサイズまたはundefined
   */
  static getFileSize(metadata?: S3CustomMetadata): string | undefined {
    if (!metadata) return undefined;
    return metadata.filesize || metadata["fileSize"];
  }
}

/**
 * S3ファイルメタデータ
 * @typedef {Object} S3FileMetadata
 * @property {string} key - S3キー
 * @property {number} size - ファイルサイズ
 * @property {Date} lastModified - 最終更新日時
 * @property {string} etag - ETag
 * @property {string} [contentType] - Content-Type
 * @property {S3CustomMetadata} [metadata] - ユーザーカスタムメタデータ
 */
export interface S3FileMetadata {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  contentType?: string;
  metadata?: S3CustomMetadata;
}

/**
 * パスからファイル名を取得（OS.Path.basenameの代替）
 * @param filePath ファイルパス
 * @returns ファイル名
 */
export function getFileName(filePath: string): string {
  // Windows/Unix両対応のパス区切り文字で分割
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1];
}

/**
 * アイテムのコレクション階層を取得
 * @param itemID アイテム ID
 * @returns コレクション階層のパス（例: "親コレクション/子コレクション"）
 */
export function getCollectionHierarchy(itemID: number): string {
  try {
    const item = Zotero.Items.get(itemID);
    if (!item) {
      ztoolkit.log(
        `アイテムが見つかりません: ${itemID}`,
        "warn",
        "getCollectionHierarchy",
      );
      return "uncategorized";
    }

    // 添付ファイルの場合は親アイテムのコレクションを取得
    const targetItem =
      item.isAttachment() && item.parentItem ? item.parentItem : item;

    // アイテムが所属するコレクションを取得
    const collections = targetItem.getCollections();

    if (collections.length === 0) {
      return "uncategorized";
    }

    // 最初のコレクションの階層を取得（複数コレクションに所属している場合）
    const collectionID = collections[0];
    const collection = Zotero.Collections.get(collectionID);

    if (!collection) {
      return "uncategorized";
    }

    // コレクション階層を再帰的に構築
    const hierarchy = buildCollectionPath(collection);

    // パス区切り文字をS3互換にサニタイズ
    return sanitizeCollectionPath(hierarchy);
  } catch (error) {
    ztoolkit.log(
      `コレクション階層取得エラー: ${String(error)}`,
      "error",
      "getCollectionHierarchy",
    );
    return "uncategorized";
  }
}

/**
 * コレクションの階層パスを再帰的に構築
 * @param collection Zoteroコレクション
 * @returns 階層パス
 */
function buildCollectionPath(collection: Zotero.Collection): string {
  const parts: string[] = [];
  let currentCollection = collection;

  // 親コレクションが存在する限り上へ遡る
  while (currentCollection) {
    parts.unshift(currentCollection.name);

    if (currentCollection.parentID) {
      try {
        currentCollection = Zotero.Collections.get(currentCollection.parentID);
      } catch (error) {
        ztoolkit.log(
          `親コレクション取得エラー: ${String(error)}`,
          "warn",
          "buildCollectionPath",
        );
        break;
      }
    } else {
      break;
    }
  }

  return parts.join("/");
}

/**
 * コレクションパスをS3キー用にサニタイズ
 * @param path コレクションパス
 * @returns サニタイズされたパス
 */
function sanitizeCollectionPath(path: string): string {
  return (
    path
      // 無効な文字を置換
      .replace(/[<>:"|?*]/g, "_")
      // 連続するスラッシュを単一に
      .replace(/\/+/g, "/")
      // 先頭・末尾のスラッシュを除去
      .replace(/^\/+|\/+$/g, "") ||
    // 空の場合はデフォルト値
    "uncategorized"
  );
}

/**
 * S3キーを生成
 * @param itemID アイテム ID
 * @param fileName ファイル名
 * @param useCollectionHierarchy コレクション階層を使用するか（デフォルト: false）
 * @returns S3キー
 */
export function generateS3Key(
  itemID: number,
  fileName: string,
  useCollectionHierarchy: boolean = false,
): string {
  let basePath: string;

  if (useCollectionHierarchy) {
    // コレクション階層ベースのパス生成
    const hierarchy = getCollectionHierarchy(itemID);
    basePath = `zotero-attachments/${hierarchy}`;
  } else {
    // 従来の日付ベースのパス生成
    const timestamp = new Date().toISOString().slice(0, 10);
    basePath = `zotero-attachments/${timestamp}`;
  }

  // AWS SDKが自動的にS3キーをエンコードするため、手動エンコードは不要
  // 日本語ファイル名もそのまま使用可能
  return `${basePath}/${itemID}-${fileName}`;
}

/**
 * S3キーからファイル名を抽出
 * @param s3Key S3キー
 * @returns ファイル名
 */
export function extractFileNameFromS3Key(s3Key: string): string {
  const parts = s3Key.split("/");
  const lastPart = parts[parts.length - 1];

  // アイテムIDプレフィックスを除去（例: "123-filename.pdf" -> "filename.pdf"）
  const match = lastPart.match(/^\d+-(.+)$/);
  if (match) {
    // AWS SDKが自動エンコードするため、S3キー自体は生のファイル名を含む
    return match[1];
  }

  // パターンにマッチしない場合は最後の部分をそのまま返す
  return lastPart;
}

/**
 * S3キーをURL用にエンコード
 * @param s3Key S3キー
 * @returns エンコードされたS3キー
 */
export function encodeS3KeyForUrl(s3Key: string): string {
  // パスの各部分を個別にエンコード（スラッシュは保持）
  return s3Key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

/**
 * URL用にエンコードされたS3キーをデコード
 * @param encodedS3Key エンコードされたS3キー
 * @returns デコードされたS3キー
 */
export function decodeS3KeyFromUrl(encodedS3Key: string): string {
  try {
    // パスの各部分を個別にデコード
    return encodedS3Key
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
  } catch (error) {
    // デコードに失敗した場合は元の文字列を返す
    ztoolkit.log("S3キーのデコードに失敗:", error);
    return encodedS3Key;
  }
}

/**
 * プロバイダーごとのS3 URLを生成する共通関数
 * @param s3Key S3キー
 * @param credentials S3認証情報
 * @returns 生成されたURL
 */
export function generateS3Url(
  s3Key: string,
  credentials: {
    provider: string;
    bucketName: string;
    endpoint?: string;
  },
): string {
  // S3キーを適切にエンコード
  const encodedS3Key = encodeS3KeyForUrl(s3Key);

  switch (credentials.provider) {
    case "aws":
      // AWS S3の場合
      return `https://${credentials.bucketName}.s3.amazonaws.com/${encodedS3Key}`;

    case "r2":
      // Cloudflare R2の場合（パブリック開発URLは別途処理）
      if (credentials.endpoint) {
        const endpointUrl = new URL(credentials.endpoint);
        return `${endpointUrl.protocol}//${endpointUrl.host}/${credentials.bucketName}/${encodedS3Key}`;
      } else {
        // フォールバック: この場合はエンドポイントが必要
        throw new S3Error(
          "Cloudflare R2にはエンドポイントが必要です。標準URL生成には R2UrlGenerator.generateUrl() を使用してください",
        );
      }

    case "minio":
    case "custom":
    default:
      // MinIOやその他のS3互換ストレージの場合
      if (credentials.endpoint) {
        const endpointUrl = new URL(credentials.endpoint);
        return `${endpointUrl.protocol}//${endpointUrl.host}/${credentials.bucketName}/${encodedS3Key}`;
      } else {
        throw new S3Error(
          `プロバイダー '${credentials.provider}' にはエンドポイントが必要です`,
        );
      }
  }
}

/**
 * ファイルのMIMEタイプを推測
 * @param filePath ファイルパス
 * @returns MIMEタイプ
 */
export function guessContentType(filePath: string): string {
  // Windows/Unix両対応のパス処理
  const filename = getFileName(filePath);
  const extension = filename.split(".").pop()?.toLowerCase();

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

  return mimeTypes[extension || ""] || "application/octet-stream";
}

/**
 * 除外コンテンツタイプの設定を解析
 * @param ignoreContentTypesString 設定文字列（改行区切り）
 * @returns 除外コンテンツタイプの配列
 */
export function parseIgnoreContentTypes(
  ignoreContentTypesString: string,
): string[] {
  if (!ignoreContentTypesString || ignoreContentTypesString.trim() === "") {
    return [];
  }

  return ignoreContentTypesString
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.toLowerCase()); // 大文字小文字を統一
}

/**
 * ファイルがS3アップロード除外対象かチェック
 * @param filePath ファイルパス
 * @param ignoreContentTypes 除外コンテンツタイプの配列
 * @returns 除外対象の場合true
 */
export function shouldIgnoreFile(
  filePath: string,
  ignoreContentTypes: string[],
): boolean {
  if (!ignoreContentTypes || ignoreContentTypes.length === 0) {
    return false;
  }

  const contentType = guessContentType(filePath).toLowerCase();
  return ignoreContentTypes.includes(contentType);
}

/**
 * 除外コンテンツタイプの設定を取得
 * @returns 除外コンテンツタイプの配列
 */
export function getIgnoreContentTypes(): string[] {
  const ignoreContentTypesString =
    (Zotero.Prefs.get(
      `${addon.data.config.prefsPrefix}.ignoreContentTypes`,
    ) as string) || "";

  return parseIgnoreContentTypes(ignoreContentTypesString);
}

/**
 * S3キーのエンコーディング/デコーディングをテスト（デバッグ用）
 * @param fileName テストするファイル名
 * @param itemID アイテムID
 * @returns テスト結果
 */
export function testS3KeyEncoding(
  fileName: string,
  itemID: number = 12345,
): {
  originalFileName: string;
  generatedS3Key: string;
  encodedForUrl: string;
  decodedFromUrl: string;
  extractedFileName: string;
  isValid: boolean;
} {
  // S3キー生成（AWS SDKが自動エンコードするため、生のファイル名を使用）
  const s3Key = generateS3Key(itemID, fileName);

  // URL用エンコード（ブラウザ表示用）
  const encodedForUrl = encodeS3KeyForUrl(s3Key);

  // URL用デコード
  const decodedFromUrl = decodeS3KeyFromUrl(encodedForUrl);

  // ファイル名抽出
  const extractedFileName = extractFileNameFromS3Key(s3Key);

  return {
    originalFileName: fileName,
    generatedS3Key: s3Key,
    encodedForUrl: encodedForUrl,
    decodedFromUrl: decodedFromUrl,
    extractedFileName: extractedFileName,
    isValid: fileName === extractedFileName && s3Key === decodedFromUrl,
  };
}

/**
 * URLからプロバイダを判定する
 * @param url 判定対象のURL
 * @returns プロバイダ名または'default'
 */
function identifyProvider(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // R2プロバイダの判定
    if (
      hostname.includes("r2.dev") ||
      hostname.endsWith(".r2.cloudflarestorage.com")
    ) {
      return "r2";
    }

    // 将来的に他のプロバイダーを追加する場合はここに追記
    // if (hostname.includes("other-provider")) {
    //   return "other-provider";
    // }

    return "default";
  } catch (error) {
    return "default";
  }
}

// R2専用処理のためのimport
import { R2Utils } from "./r2/r2Utils";

/**
 * デフォルトプロバイダー（AWS S3など）のS3キー抽出
 * @param url 抽出対象のURL
 * @returns S3キーまたはnull（失敗時）
 */
function extractS3KeyDefault(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathParts = urlObj.pathname.split("/").filter((part) => part !== "");

    if (pathParts.length === 0) {
      return null;
    }

    let s3Key: string;

    if (hostname.endsWith(".s3.amazonaws.com")) {
      // AWS S3 URL: https://{bucketName}.s3.amazonaws.com/{s3Key}
      s3Key = pathParts.join("/");
    } else if (hostname === "s3.amazonaws.com") {
      // AWS S3パススタイル: https://s3.amazonaws.com/{bucketName}/{s3Key}
      if (pathParts.length >= 2) {
        s3Key = pathParts.slice(1).join("/");
      } else {
        return null;
      }
    } else {
      // カスタムドメインまたはその他のS3互換ストレージ
      // パス全体がS3キーと仮定
      s3Key = pathParts.join("/");
    }

    // URLデコード
    try {
      const decodedS3Key = decodeURIComponent(s3Key);
      ztoolkit.log("S3キー抽出:", url, "->", s3Key, "->", decodedS3Key);
      return decodedS3Key;
    } catch (decodeError) {
      ztoolkit.log("S3キーのデコードに失敗、元の値を使用:", s3Key);
      return s3Key;
    }
  } catch (error) {
    ztoolkit.log("S3 URL解析に失敗:", url, error);
    return null;
  }
}

/**
 * URLからS3キーを抽出
 * プロバイダを判定し、適切な抽出関数に振り分ける
 * @param url 抽出対象のURL
 * @returns S3キーまたはnull（失敗時）
 */
export function extractS3KeyFromUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const provider = identifyProvider(url);

    switch (provider) {
      case "r2":
        return R2Utils.extractS3KeyFromR2Url(url);

      case "default":
      default:
        return extractS3KeyDefault(url);
    }
  } catch (error) {
    ztoolkit.log("URL解析に失敗:", url, error);
    return null;
  }
}

/**
 * ファイル名から無効な文字を除去してサニタイズ
 * @param fileName ファイル名
 * @returns サニタイズされたファイル名
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || fileName.trim() === "") {
    ztoolkit.log("Empty filename provided to sanitizeFileName");
    return "untitled";
  }

  // Windowsドライブレター（C:など）の場合はそのまま返す
  if (/^[A-Za-z]:$/.test(fileName)) {
    return fileName;
  }

  // Windows/Zoteroで無効な文字を除去または置換
  const invalidChars = /[<>:"/\\|?*]/g;
  let sanitized = fileName.replace(invalidChars, "_");

  // 制御文字を除去（0x00-0x1F）
  sanitized = sanitized.replace(/./g, (char) => {
    const code = char.charCodeAt(0);
    return code >= 0 && code <= 31 ? "_" : char;
  });

  // 連続するアンダースコアを単一に
  sanitized = sanitized.replace(/_+/g, "_");

  // 先頭・末尾のピリオドとスペースを除去（Windowsの制限）
  sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, "");

  // Windowsの予約語をチェック
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  // 空文字列の場合はデフォルト名を使用
  if (!sanitized) {
    sanitized = "untitled";
  }

  // ファイル名の長さ制限（Windows: 255文字、安全のため200文字に制限）
  if (sanitized.length > 200) {
    const ext = sanitized.lastIndexOf(".");
    if (ext > 0) {
      const name = sanitized.substring(0, ext);
      const extension = sanitized.substring(ext);
      sanitized = name.substring(0, 200 - extension.length) + extension;
    } else {
      sanitized = sanitized.substring(0, 200);
    }
  }

  return sanitized;
}

/**
 * ファイルパスを検証してサニタイズ
 * @param filePath ファイルパス
 * @returns サニタイズされたファイルパス
 */
export function sanitizeFilePath(filePath: string): string {
  if (!filePath) {
    throw new Error("ファイルパスが空です");
  }

  // Windowsパスかどうかを判定
  const isWindowsPath = /^[A-Za-z]:[/\\]/.test(filePath);

  let sanitized: string;

  if (isWindowsPath) {
    // Windowsパスの場合
    const driveLetter = filePath.substring(0, 2); // "C:"
    const pathPart = filePath.substring(2); // "\path\to\file"

    // パス部分のみを正規化（ドライブレターは保持）
    const normalizedPath = pathPart.replace(/[/\\]+/g, "\\");

    // パスの各部分をサニタイズ（ドライブレターは除外）
    const parts = normalizedPath.split("\\");
    const sanitizedParts = parts
      .map((part) => {
        // 空の部分は除去（連続するスラッシュ対策）
        if (!part) {
          return "";
        }
        return sanitizeFileName(part);
      })
      .filter((part) => part !== "");

    // Windowsパスを再構築
    sanitized = driveLetter + "\\" + sanitizedParts.join("\\");
  } else {
    // Unix系パスの場合
    // パス区切り文字を正規化
    sanitized = filePath.replace(/[/\\]+/g, "/");

    // パスの各部分をサニタイズ
    const parts = sanitized.split("/");
    const sanitizedParts = parts
      .map((part) => {
        // 空の部分は除去（連続するスラッシュ対策）
        if (!part) {
          return "";
        }
        return sanitizeFileName(part);
      })
      .filter((part) => part !== "");

    // Unix系パスを再構築
    sanitized = sanitizedParts.join("/");

    // 絶対パスの場合は先頭にスラッシュを追加
    if (filePath.startsWith("/")) {
      sanitized = "/" + sanitized;
    }
  }

  // パス長の制限（Windows: 260文字、安全のため250文字に制限）
  if (sanitized.length > 250) {
    throw new Error(
      `ファイルパスが長すぎます（${sanitized.length}文字）: ${sanitized.substring(0, 100)}...`,
    );
  }

  return sanitized;
}

/**
 * ファイルパスが有効かどうかを検証
 * @param filePath ファイルパス
 * @returns 有効な場合true
 */
export function validateFilePath(filePath: string): boolean {
  try {
    if (!filePath || filePath.trim() === "") {
      return false;
    }

    // Windowsドライブレターの検出
    const isWindowsPath = /^[A-Za-z]:[/\\]/.test(filePath);

    // 無効な文字をチェック（Windowsパスの場合はコロンを除外）
    let invalidChars: RegExp;
    if (isWindowsPath) {
      // Windowsパス: ドライブレター以外のコロンは無効
      const pathWithoutDrive = filePath.substring(2); // "C:\" -> "\"
      invalidChars = /[<>"|?*]/;
      if (invalidChars.test(pathWithoutDrive)) {
        return false;
      }
    } else {
      // Unix系パス: コロンも無効文字として扱う
      invalidChars = /[<>:"|?*]/;
      if (invalidChars.test(filePath)) {
        return false;
      }
    }

    // 制御文字をチェック（0x00-0x1F）
    for (let i = 0; i < filePath.length; i++) {
      const code = filePath.charCodeAt(i);
      if (code >= 0 && code <= 31) {
        return false;
      }
    }

    // パス長をチェック
    if (filePath.length > 250) {
      return false;
    }

    // 相対パス（..）の過度な使用をチェック
    const relativeParts = filePath
      .split(/[/\\]/)
      .filter((part) => part === "..");
    if (relativeParts.length > 5) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 安全なファイル名を生成（S3キーから）
 * @param s3Key S3キー
 * @param fallbackName フォールバック名
 * @returns 安全なファイル名
 */
export function generateSafeFileName(
  s3Key: string,
  fallbackName?: string,
): string {
  try {
    // S3キーからIDプレフィックスを除去したファイル名を取得
    const fileName = extractFileNameFromS3Key(s3Key);
    const sanitized = sanitizeFileName(fileName);

    // サニタイズ後も有効な名前が残っている場合
    if (sanitized && sanitized !== "untitled") {
      return sanitized;
    }

    // フォールバック名を使用
    if (fallbackName) {
      return sanitizeFileName(fallbackName);
    }

    // 最終フォールバック：タイムスタンプ付きの名前
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const extension = s3Key.includes(".") ? s3Key.split(".").pop() : "pdf";
    return `download_${timestamp}.${extension}`;
  } catch (error) {
    // エラーの場合は安全なデフォルト名を返す
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `download_${timestamp}.pdf`;
  }
}
