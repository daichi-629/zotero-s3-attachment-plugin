# Zotero S3 Sync

## **注意**: このプラグインはα版です。本番環境での使用前に十分なテストを行ってください。

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![License](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

Zotero 7用のプラグインで、添付ファイルをローカルストレージやZoteroクラウドの代わりにAWS S3互換ストレージに保存します。

[English](README.md) | [日本語](doc/README-ja.md)

## 🌟 主な機能

- **S3互換ストレージ対応**:現在はR2のみテスト済み。
- **自動同期**: 添付ファイルの追加・削除・変更を自動的にS3と同期
- **ファイル整合性**: MD5ハッシュによるファイル整合性チェック
- **重複検出**: 同一ファイルの重複アップロードを防止
- **プログレス表示**: アップロード・ダウンロードの進捗をリアルタイム表示
- **Cloudflare R2対応**: パブリック開発URL機能・カスタムドメインをサポート

## 📋 システム要件

- **Zotero**: 7.0 以降（ベータ版）
- **Node.js**: 18.0 以降（開発時）
- **AWS S3互換ストレージ**: Amazon S3、Cloudflare R2、MinIO等

## 🚀 インストール

### 1. リリース版のインストール（推奨）

1. [Releases](https://github.com/daichi/zotero-s3/releases)から最新の`.xpi`ファイルをダウンロード
2. Zotero 7を開く
3. `ツール` → `アドオン` → `歯車アイコン` → `ファイルからアドオンをインストール`
4. ダウンロードした`.xpi`ファイルを選択

### 2. 開発版のインストール

```bash
# リポジトリをクローン
git clone https://github.com/daichi/zotero-s3.git
cd zotero-s3

# 依存関係をインストール
npm install

# 開発モードでビルド
npm run build:dev

# build/zotero-s3-sync.xpi をZoteroにインストール
```

## ⚙️ 設定

### 1. 基本設定

1. Zotero 7で `編集` → `環境設定` → `S3 Sync` タブを開く
2. S3互換ストレージプロバイダーを選択:
   - **Amazon S3**: 標準のAWS S3サービス
   - **Cloudflare R2**: Cloudflareのオブジェクトストレージ
   - **MinIO**: セルフホスト型S3互換ストレージ
   - **カスタム**: その他のS3互換ストレージ

### 2. 認証情報の設定

#### Amazon S3の場合

```
アクセスキーID: AKIA...
シークレットアクセスキー: ...
リージョン: ap-northeast-1
バケット名: my-zotero-bucket
```

#### Cloudflare R2の場合

```
アクセスキーID: R2のアクセスキー
シークレットアクセスキー: R2のシークレットキー
エンドポイント: https://[アカウントID].r2.cloudflarestorage.com
バケット名: my-zotero-bucket

# パブリック開発URL・カスタムドメインを使用する場合（オプション）
Cloudflare APIトークン: [R2:edit権限のあるトークン]
```

### 3. 接続テスト

設定完了後、`接続テスト`ボタンをクリックして接続を確認してください。

## 📖 使用方法

### アップロード・ダウンロード

1. **アップロード**: Zoteroに添付ファイルを追加すると自動的にS3に保存・ローカルにはURLのみ残す。
2. **ダウンロード**: S3上のファイルを一時ダウンロードして開く
3. **削除**: Zoteroから削除すると対応するS3ファイルも削除

## 🔧 開発者向け情報

### 開発環境のセットアップ

```bash
# 依存関係をインストール
npm install

# 環境変数を設定
cp .env.example .env
# .envファイルを編集してZoteroのパスを設定

# 開発サーバーを起動（ホットリロード付き）
npm start

# 本番ビルド
npm run build

# リリース
npm run release
```

### プロジェクト構造

```
src/
├── modules/                    # コアモジュール
│   ├── s3AuthManager.ts       # S3認証管理
│   ├── s3StorageManager.ts    # S3ストレージ統合管理
│   ├── s3Operations.ts        # S3基本操作
│   ├── attachmentHandler.ts   # 添付ファイル処理
│   ├── notifier.ts           # Zotero通知管理
│   └── preferenceScript.ts   # 設定画面
├── utils/                     # ユーティリティ
├── types/                     # 型定義
├── hooks.ts                   # ライフサイクル管理
└── index.ts                   # エントリーポイント
```

### 主要技術

- **TypeScript**: 型安全な開発
- **AWS SDK v3**: S3操作
- **Zotero Plugin Toolkit**: UI構築
- **ESBuild**: 高速ビルド

## 🐛 トラブルシューティング

### よくある問題

1. **接続エラー**

   - 認証情報が正しいか確認
   - エンドポイントURLが正しいか確認
   - ネットワーク接続を確認

2. **アップロードエラー**

   - バケットの書き込み権限を確認
   - ファイルサイズ制限を確認

3. **Cloudflare R2での削除エラー**
   - R2のアクセスキーに削除権限があるか確認
   - バケットポリシーを確認

### デバッグ

1. Zoteroで `ヘルプ` → `デバッグ出力ログ` → `出力を表示`
2. `S3Sync`でフィルタリング
3. エラーメッセージを確認

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトは [AGPL-3.0](LICENSE) ライセンスの下で公開されています。

## 🙏 謝辞

- [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) - プラグインテンプレート
- [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit) - UI構築ツール
- [Zotero Types](https://github.com/windingwind/zotero-types) - TypeScript型定義

## 📞 サポート

- **Issues**: [GitHub Issues](https://github.com/daichi/zotero-s3/issues)
- **Discussions**: [GitHub Discussions](https://github.com/daichi/zotero-s3/discussions)
- **Documentation**: [Wiki](https://github.com/daichi/zotero-s3/wiki)

---
