pref-title = Zotero S3 Sync 设置
pref-enable =
    .label = 启用 S3 同步
pref-input = 设置值
pref-help = { $name } 版本 { $version } 构建时间 { $time }

# 基本设置
pref-storage-provider = 存储服务商:
pref-access-key = Access Key ID:
pref-secret-key = Secret Access Key:
pref-endpoint = 端点:
pref-region = 区域:
pref-bucket = 存储桶名称:

# 占位符
pref-access-key-placeholder =
    .placeholder = 输入 Access Key ID
pref-secret-key-placeholder =
    .placeholder = 输入 Secret Access Key
pref-endpoint-placeholder =
    .placeholder = https://example.r2.cloudflarestorage.com
pref-region-placeholder =
    .placeholder = us-east-1
pref-bucket-placeholder =
    .placeholder = my-zotero-bucket

# 公共URL设置
pref-public-url-title = 🌐 公共URL设置
pref-public-url-type = 公共URL类型:
pref-url-disabled = 不使用公共URL
pref-url-custom = 使用自定义域名
pref-url-r2dev = 使用 r2.dev 开发URL（仅限R2）
pref-custom-domain = 自定义域名:
pref-custom-domain-placeholder = files.example.com
pref-test-custom-domain = 连接测试
pref-enable-public-url = 启用 r2.dev 开发URL
pref-auto-save-public-url = 上传文件时自动保存公共URL

# 排除设置
pref-exclude-title = S3上传排除设置
pref-ignore-content-types = 排除内容类型:
pref-ignore-placeholder = application/pdf&#10;text/html&#10;image/jpeg

# S3键生成设置
pref-s3-key-title = S3键生成设置
pref-use-collection-hierarchy = 在S3键中使用收藏夹层次结构

# Cloudflare设置
pref-cloudflare-title = Cloudflare R2设置
pref-cloudflare-api-token = Cloudflare API令牌:
pref-cloudflare-api-token-placeholder = 输入 Cloudflare API令牌
pref-save-cloudflare-token = 保存API令牌
pref-clear-cloudflare-token = 清除API令牌

# 按钮
pref-test-connection = 连接测试
pref-save-settings = 保存设置
pref-clear-settings = 清除设置

# 帮助文本
pref-help-description = 在S3兼容存储中保存附件。更改设置后请运行连接测试。

# 提供商选项
pref-provider-aws = Amazon S3
pref-provider-r2 = Cloudflare R2
pref-provider-minio = MinIO
pref-provider-custom = 自定义S3兼容

# 单选按钮标签
pref-r2dev-url-setting = r2.dev开发URL设置:
pref-save-public-url-settings = 保存公共URL设置

# 描述文本
pref-r2dev-info = 启用r2.dev开发URL允许对Cloudflare R2存储桶进行无需身份验证的访问。
pref-public-url-info-title = 💡 关于公共URL功能:
pref-public-url-info-custom = • 自定义域名: 使用您自己的域名进行高速、品牌化的文件传输
pref-public-url-info-r2dev = • r2.dev开发URL: 用于开发/测试目的的Cloudflare管理URL（仅限R2）
pref-public-url-info-storage = • 公共URL保存在附件URL字段中
pref-public-url-info-setup = • 自定义域名设置指南:
pref-public-url-info-docs = Cloudflare R2文档

# 排除设置说明
pref-exclude-info-title = 关于排除设置:
pref-exclude-info-line1 = • 每行输入一个内容类型
pref-exclude-info-line2 = • 示例: application/pdf, text/html, image/jpeg, video/mp4
pref-exclude-info-line3 = • 指定内容类型的附件将不会上传到S3
pref-exclude-info-line4 = • 空行将被忽略

# S3键生成设置说明
pref-s3key-info-title = 关于S3键生成方法:
pref-s3key-info-default = • 传统方法（默认）: zotero-attachments/YYYY-MM-DD/[itemID]-[fileName]
pref-s3key-info-hierarchy = • 收藏夹层次结构: zotero-attachments/[父收藏夹]/[子收藏夹]/[itemID]-[fileName]
pref-s3key-info-benefit = • 使用收藏夹层次结构可以组织文件并使管理更容易
pref-s3key-info-uncategorized = • 不属于收藏夹的项目将放置在"uncategorized"文件夹中

# API令牌说明
pref-api-token-info-title = 关于API令牌:
pref-api-token-info-create = • 在Cloudflare仪表板中创建具有"Admin Read & Write"权限的API令牌
pref-api-token-info-benefit = • 启用公共开发URL允许无需身份验证的高速访问
pref-api-token-info-link = • 详细信息:
pref-api-token-docs = https://developers.cloudflare.com/r2/api/tokens/

# R2权限设置
pref-r2-permission-title = ⚠️ 重要的R2删除权限设置:
pref-r2-permission-desc = 要使R2中的文件删除正常工作，需要以下权限设置：
pref-r2-permission-required = 所需权限:
pref-r2-permission-delete = • s3:DeleteObject - 对象删除权限
pref-r2-permission-list = • s3:ListBucket - 存储桶列表权限（用于删除确认）
pref-r2-permission-policy = IAM策略示例:
pref-r2-permission-important = 重要:
pref-r2-permission-resource = Resource必须包含存储桶和对象ARN。
pref-r2-permission-detail = 详细信息:
pref-r2-permission-example = Directus R2删除问题解决示例

# 新增元素
pref-public-url-type = 公共URL类型:
pref-url-disabled = 不使用公共URL
pref-url-custom = 使用自定义域名
pref-url-r2dev = 使用r2.dev开发URL（仅限R2）
pref-custom-domain = 自定义域名:
pref-custom-domain-placeholder = files.example.com
pref-test-custom-domain = 测试连接
pref-enable-public-url = 启用r2.dev开发URL
pref-auto-save-public-url = 上传文件时自动保存公共URL
pref-exclude-title = S3上传排除设置
pref-exclude-content-types = 排除内容类型:
pref-exclude-placeholder = application/pdf\ntext/html\nimage/jpeg
pref-s3key-title = S3键生成设置
pref-use-collection-hierarchy = 使用收藏夹层次结构作为S3键
pref-cloudflare-r2-title = Cloudflare R2设置
pref-cloudflare-api-token = Cloudflare API令牌:
pref-cloudflare-api-token-placeholder = 输入Cloudflare API令牌
pref-save-cloudflare-token = 保存API令牌
pref-clear-cloudflare-token = 清除API令牌