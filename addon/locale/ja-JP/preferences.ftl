pref-title = Zotero S3 Sync 設定
pref-enable =
    .label = S3同期を有効にする
pref-input = 設定値
pref-help = { $name } バージョン { $version } ビルド日時 { $time }

# 設定画面の基本項目
pref-storage-provider = ストレージプロバイダー:
pref-access-key = Access Key ID:
pref-secret-key = Secret Access Key:
pref-endpoint = エンドポイント:
pref-region = リージョン:
pref-bucket = バケット名:

# プレースホルダー
pref-access-key-placeholder =
    .placeholder = アクセスキーIDを入力
pref-secret-key-placeholder =
    .placeholder = シークレットアクセスキーを入力
pref-endpoint-placeholder =
    .placeholder = https://example.r2.cloudflarestorage.com
pref-region-placeholder =
    .placeholder = us-east-1
pref-bucket-placeholder =
    .placeholder = my-zotero-bucket

# 公開URL設定
pref-public-url-title = 🌐 公開URL設定
pref-public-url-type = 公開URLタイプ:
pref-url-disabled = 公開URLを使用しない
pref-url-custom = カスタムドメインを使用
pref-url-r2dev = r2.dev開発URLを使用（R2のみ）
pref-custom-domain = カスタムドメイン:
pref-custom-domain-placeholder = files.example.com
pref-test-custom-domain = 接続確認
pref-enable-public-url = r2.dev開発URLを有効化
pref-auto-save-public-url = ファイルアップロード時に公開URLを自動保存

# 除外設定
pref-exclude-title = S3アップロード除外設定
pref-ignore-content-types = 除外コンテンツタイプ:
pref-ignore-placeholder = application/pdf&#10;text/html&#10;image/jpeg

# S3キー生成設定
pref-s3-key-title = S3キー生成設定
pref-use-collection-hierarchy = コレクション階層をS3キーに使用

# Cloudflare設定
pref-cloudflare-title = Cloudflare R2設定
pref-cloudflare-api-token = Cloudflare APIトークン:
pref-cloudflare-api-token-placeholder = Cloudflare APIトークンを入力
pref-save-cloudflare-token = APIトークンを保存
pref-clear-cloudflare-token = APIトークンをクリア

# ボタン
pref-test-connection = 接続テスト
pref-save-settings = 設定を保存
pref-clear-settings = 設定をクリア

# ヘルプテキスト
pref-help-description = S3互換ストレージに添付ファイルを保存します。設定を変更した後は接続テストを実行してください。

# プロバイダー選択肢
pref-provider-aws = Amazon S3
pref-provider-r2 = Cloudflare R2
pref-provider-minio = MinIO
pref-provider-custom = カスタムS3互換

# ラジオボタンラベル
pref-r2dev-url-setting = r2.dev開発URL設定:
pref-save-public-url-settings = 公開URL設定を保存

# 説明テキスト
pref-r2dev-info = r2.dev開発URLを有効化すると、Cloudflare R2バケットに対して認証不要でのアクセスが可能になります。
pref-public-url-info-title = 💡 公開URL機能について:
pref-public-url-info-custom = • カスタムドメイン: 独自ドメインで高速・ブランド化されたファイル配信
pref-public-url-info-r2dev = • r2.dev開発URL: 開発・テスト用途向けのCloudflare管理URL（R2のみ）
pref-public-url-info-storage = • 公開URLは添付ファイルのURLフィールドに保存されます
pref-public-url-info-setup = • カスタムドメインの設定方法:
pref-public-url-info-docs = Cloudflare R2ドキュメント

# 除外設定説明
pref-exclude-info-title = 除外設定について:
pref-exclude-info-line1 = • 1行に1つのコンテンツタイプを入力してください
pref-exclude-info-line2 = • 例: application/pdf, text/html, image/jpeg, video/mp4
pref-exclude-info-line3 = • 指定されたコンテンツタイプの添付ファイルはS3にアップロードされません
pref-exclude-info-line4 = • 空白行は無視されます

# S3キー生成設定説明
pref-s3key-info-title = S3キー生成方式について:
pref-s3key-info-default = • 従来方式（デフォルト）: zotero-attachments/YYYY-MM-DD/[itemID]-[fileName]
pref-s3key-info-hierarchy = • コレクション階層: zotero-attachments/[親コレクション]/[子コレクション]/[itemID]-[fileName]
pref-s3key-info-benefit = • コレクション階層を使用すると、ファイルが組織化されて管理しやすくなります
pref-s3key-info-uncategorized = • コレクションに所属していないアイテムは「uncategorized」フォルダに配置されます

# API トークン説明
pref-api-token-info-title = APIトークンについて:
pref-api-token-info-create = • Cloudflareダッシュボードで「Admin Read & Write」権限のAPIトークンを作成
pref-api-token-info-benefit = • パブリック開発URLを有効化すると、認証不要で高速アクセスが可能
pref-api-token-info-link = • 詳細:
pref-api-token-docs = https://developers.cloudflare.com/r2/api/tokens/

# R2権限設定
pref-r2-permission-title = ⚠️ R2削除権限の重要な設定:
pref-r2-permission-desc = R2でファイル削除を正常に動作させるには、以下の権限設定が必要です：
pref-r2-permission-required = 必要な権限:
pref-r2-permission-delete = • s3:DeleteObject - オブジェクト削除権限
pref-r2-permission-list = • s3:ListBucket - バケット一覧権限（削除確認のため）
pref-r2-permission-policy = IAMポリシー例:
pref-r2-permission-important = 重要:
pref-r2-permission-resource = ResourceにはバケットとオブジェクトのARN両方を含めてください。
pref-r2-permission-detail = 詳細:
pref-r2-permission-example = DirectusのR2削除問題解決例

# 新しい追加要素
pref-public-url-type = 公開URLタイプ:
pref-url-disabled = 公開URLを使用しない
pref-url-custom = カスタムドメインを使用
pref-url-r2dev = r2.dev開発URLを使用（R2のみ）
pref-custom-domain = カスタムドメイン:
pref-custom-domain-placeholder = files.example.com
pref-test-custom-domain = 接続確認
pref-enable-public-url = r2.dev開発URLを有効化
pref-auto-save-public-url = ファイルアップロード時に公開URLを自動保存
pref-exclude-title = S3アップロード除外設定
pref-exclude-content-types = 除外コンテンツタイプ:
pref-exclude-placeholder = application/pdf\ntext/html\nimage/jpeg
pref-s3key-title = S3キー生成設定
pref-use-collection-hierarchy = コレクション階層をS3キーに使用
pref-cloudflare-r2-title = Cloudflare R2設定
pref-cloudflare-api-token = Cloudflare APIトークン:
pref-cloudflare-api-token-placeholder = Cloudflare APIトークンを入力
pref-save-cloudflare-token = APIトークンを保存
pref-clear-cloudflare-token = APIトークンをクリア