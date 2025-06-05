pref-title = Zotero S3 Sync Settings
pref-enable =
    .label = Enable S3 Sync
pref-input = Setting Value
pref-help = { $name } Version { $version } Build { $time }

# Basic settings
pref-storage-provider = Storage Provider:
pref-access-key = Access Key ID:
pref-secret-key = Secret Access Key:
pref-endpoint = Endpoint:
pref-region = Region:
pref-bucket = Bucket Name:

# Placeholders
pref-access-key-placeholder =
    .placeholder = Enter Access Key ID
pref-secret-key-placeholder =
    .placeholder = Enter Secret Access Key
pref-endpoint-placeholder =
    .placeholder = https://example.r2.cloudflarestorage.com
pref-region-placeholder =
    .placeholder = us-east-1
pref-bucket-placeholder =
    .placeholder = my-zotero-bucket

# Public URL settings
pref-public-url-title = 🌐 Public URL Settings
pref-public-url-type = Public URL Type:
pref-url-disabled = Don't use public URL
pref-url-custom = Use custom domain
pref-url-r2dev = Use r2.dev development URL (R2 only)
pref-custom-domain = Custom Domain:
pref-custom-domain-placeholder = files.example.com
pref-test-custom-domain = Test Connection
pref-enable-public-url = Enable r2.dev development URL
pref-auto-save-public-url = Auto-save public URL when uploading files

# Exclusion settings
pref-exclude-title = S3 Upload Exclusion Settings
pref-ignore-content-types = Exclude Content Types:
pref-ignore-placeholder = application/pdf&#10;text/html&#10;image/jpeg

# S3 key generation settings
pref-s3-key-title = S3 Key Generation Settings
pref-use-collection-hierarchy = Use collection hierarchy in S3 keys

# Cloudflare settings
pref-cloudflare-title = Cloudflare R2 Settings
pref-cloudflare-api-token = Cloudflare API Token:
pref-cloudflare-api-token-placeholder = Enter Cloudflare API Token
pref-save-cloudflare-token = Save API Token
pref-clear-cloudflare-token = Clear API Token

# Buttons
pref-test-connection = Test Connection
pref-save-settings = Save Settings
pref-clear-settings = Clear Settings

# Help text
pref-help-description = Store attachments in S3-compatible storage. Please run connection test after changing settings.

# Provider options
pref-provider-aws = Amazon S3
pref-provider-r2 = Cloudflare R2
pref-provider-minio = MinIO
pref-provider-custom = Custom S3 Compatible

# Radio button labels
pref-r2dev-url-setting = r2.dev development URL settings:
pref-save-public-url-settings = Save Public URL Settings

# Description texts
pref-r2dev-info = Enabling r2.dev development URL allows authentication-free access to Cloudflare R2 buckets.
pref-public-url-info-title = 💡 About Public URL Features:
pref-public-url-info-custom = • Custom Domain: High-speed, branded file delivery with your own domain
pref-public-url-info-r2dev = • r2.dev Development URL: Cloudflare-managed URL for development/testing purposes (R2 only)
pref-public-url-info-storage = • Public URLs are saved in the attachment URL field
pref-public-url-info-setup = • Custom domain setup guide:
pref-public-url-info-docs = Cloudflare R2 Documentation

# Exclusion settings description
pref-exclude-info-title = About Exclusion Settings:
pref-exclude-info-line1 = • Enter one content type per line
pref-exclude-info-line2 = • Example: application/pdf, text/html, image/jpeg, video/mp4
pref-exclude-info-line3 = • Attachments with specified content types will not be uploaded to S3
pref-exclude-info-line4 = • Empty lines are ignored

# S3 key generation settings description
pref-s3key-info-title = About S3 Key Generation Methods:
pref-s3key-info-default = • Traditional method (default): zotero-attachments/YYYY-MM-DD/[itemID]-[fileName]
pref-s3key-info-hierarchy = • Collection hierarchy: zotero-attachments/[parentCollection]/[childCollection]/[itemID]-[fileName]
pref-s3key-info-benefit = • Using collection hierarchy organizes files and makes management easier
pref-s3key-info-uncategorized = • Items not belonging to collections are placed in the "uncategorized" folder

# API token description
pref-api-token-info-title = About API Token:
pref-api-token-info-create = • Create an API token with "Admin Read & Write" permissions in Cloudflare Dashboard
pref-api-token-info-benefit = • Enabling public development URL allows authentication-free high-speed access
pref-api-token-info-link = • Details:
pref-api-token-docs = https://developers.cloudflare.com/r2/api/tokens/

# R2 permission settings
pref-r2-permission-title = ⚠️ Important R2 Delete Permission Settings:
pref-r2-permission-desc = To make file deletion work properly in R2, the following permission settings are required:
pref-r2-permission-required = Required permissions:
pref-r2-permission-delete = • s3:DeleteObject - Object deletion permission
pref-r2-permission-list = • s3:ListBucket - Bucket listing permission (for deletion confirmation)
pref-r2-permission-policy = IAM Policy Example:
pref-r2-permission-important = Important:
pref-r2-permission-resource = Resource must include both bucket and object ARNs.
pref-r2-permission-detail = Details:
pref-r2-permission-example = Directus R2 Deletion Issue Resolution Example

# New additional elements
pref-public-url-type = Public URL Type:
pref-url-disabled = Don't use public URL
pref-url-custom = Use custom domain
pref-url-r2dev = Use r2.dev development URL (R2 only)
pref-custom-domain = Custom Domain:
pref-custom-domain-placeholder = files.example.com
pref-test-custom-domain = Test Connection
pref-enable-public-url = Enable r2.dev Development URL
pref-auto-save-public-url = Automatically save public URL when uploading files
pref-exclude-title = S3 Upload Exclusion Settings
pref-exclude-content-types = Exclude Content Types:
pref-exclude-placeholder = application/pdf\ntext/html\nimage/jpeg
pref-s3key-title = S3 Key Generation Settings
pref-use-collection-hierarchy = Use collection hierarchy for S3 keys
pref-cloudflare-r2-title = Cloudflare R2 Settings
pref-cloudflare-api-token = Cloudflare API Token:
pref-cloudflare-api-token-placeholder = Enter Cloudflare API token
pref-save-cloudflare-token = Save API Token
pref-clear-cloudflare-token = Clear API Token