# Tools

## `archive-url-to-pdf`

把一个网页归档为 PDF，然后上传到 MinIO（S3 兼容）。

### 安装

在 `tools/` 目录：

```bash
npm install
```

> Playwright 会下载 Chromium（体积较大），属于正常现象。

### 环境变量

```bash
MINIO_ENDPOINT="minio.example.com:9000" # 或 https://minio.example.com:9000
MINIO_USE_SSL="true"                   # 当 MINIO_ENDPOINT 不带 scheme 时生效
MINIO_ACCESS_KEY_ID="..."
MINIO_SECRET_ACCESS_KEY="..."
MINIO_BUCKET="lecture"
MINIO_REGION="us-east-1"
```

### 使用

```bash
npm run archive-url -- --url "https://example.com/" --out "archive/example-com/example.v2025-12-27.pdf"
```

如果不提供 `--out`，工具会根据 URL 与当前时间自动生成一个 key，并把 key 打印出来，方便复制到 lesson YAML 里。

---

## `archive-url-to-html`

把一个网页归档为 **自包含（offline）** 的单文件 HTML，然后上传到 MinIO（S3 兼容）。

适用场景：

- 目标网站禁止 iframe 嵌入（CSP / X-Frame-Options），但你仍希望在本站稳定渲染
- 你希望“归档版本”在原站更新/下线后依然可读

当前实现特点：

- 会在 Playwright 打开页面后抓取最终 DOM（因此 SPA 也能抓到渲染后的内容，best-effort）
- 会移除页面中的脚本/iframe/object 等（安全 + 更稳定）
- 会尝试把 CSS / 图片 / 字体等资源内联成 data URI，使 HTML **打开时不再依赖外网**
- 视频等大资源默认不会内联（会移除 `<video src>` 与 `<source>`），避免产出过大的单文件

### 使用

```bash
npm run archive-url-html -- --url "https://example.com/" --out "archive/example-com/example.v2025-12-27.html"
```

输出会包含 `assetKey` 和可粘贴到 lesson YAML 的片段（`archiveHtml.assetKey`）。
