import { Markdown } from "@/components/Markdown";

const guide = `
# 维护者指南（内容编排 & 部署）

这个站点的核心资产是 **\`content/\` 下的课程结构（Git 版本化）** 和 **MinIO 里的资源文件（私有桶）**。
站点对外公开访问时，资源通过 **同域名 \`/assets/*\`** 输出（Go 资产网关），并对 \`/assets\` 做了 Traefik 中间件限流/并发保护。

---

## 1) 内容编排：Track / Module / Lesson

### 1.1 Track（学习路径）

目录：\`content/tracks/\`

示例：\`content/tracks/agent-dev.yaml\`

一个 Track 由若干 Module 组成，每个 Module 引用若干 Lesson（按顺序）。

最小示例：

\`\`\`yaml
id: agent-dev
title: Agent 开发入门
modules:
  - id: basics
    title: 基础
    lessons:
      - intro
\`\`\`

> 注意：\`lessons\` 里写的是 lesson 的 **id**，必须在 \`content/lessons/*.yaml\` 存在，否则构建会失败（fail fast）。

---

### 1.2 Lesson（课时）

目录：\`content/lessons/\`

示例：\`content/lessons/intro.yaml\`

一个 Lesson 的核心是 \`items\`（资源条目）。\`body\`（教学叙事）是可选的 —— 你完全可以让某节课“只有一个 PDF 或一个 URL”。

除了 PDF/URL 之外，你也可以在 \`items\` 里插入**解释性文字块**（推荐 Markdown），用于 SOP、讲解、作业说明等。

最小示例（只有 PDF）：

\`\`\`yaml
id: prompt-basics
title: Prompt 基础
items:
  - type: pdf
    title: Prompt Engineering 入门（归档版）
    assetKey: pdf/prompt/prompt-engineering.v20251227T120102Z.pdf
\`\`\`

最小示例（只有 URL，站外打开）：

\`\`\`yaml
id: refs
title: 参考资料
items:
  - type: url
    title: OpenAI Docs
    url: https://platform.openai.com/docs
    mode: open
\`\`\`

URL + 站内嵌入（可选，若被原站禁止会显示空白/报错）：

\`\`\`yaml
items:
  - type: url
    title: Example (embed)
    url: https://example.com/
    mode: embed
\`\`\`

URL + 归档 PDF（推荐，用于避免原站更新/404）：

\`\`\`yaml
items:
  - type: url
    title: 一篇会更新的网页
    url: https://example.com/some-post
    mode: open
    archiveHtml:
      title: 固定版本（HTML）
      assetKey: archive/example-com/some-post.v20251227T120102Z.html
    archivePdf:
      title: 固定版本（PDF）
      assetKey: archive/example-com/some-post.v20251227T120102Z.pdf
\`\`\`

插入 Markdown 讲解块（推荐）：

\`\`\`yaml
items:
  - type: md
    title: 课前准备
    layout: card   # 可选：card | inline（默认 card）
    body: |
      - 安装 MinIO Client：\`mc\`
      - 配置集群访问（如有）

      \`\`\`bash
      mc alias set myminio https://minio.example.com MINIO_ACCESS_KEY MINIO_SECRET_KEY
      \`\`\`
\`\`\`

插入 HTML 片段（可选）：

\`\`\`yaml
items:
  - type: html
    title: 注意事项
    layout: inline # 可选：card | inline（默认 card）
    body: |
      <div style="padding:12px;border:1px solid rgba(0,0,0,.12);border-radius:12px;">
        <b>提示：</b>HTML 片段会直接渲染（服务端会做安全清洗，脚本/危险属性会被移除）。
      </div>
\`\`\`

---

## 2) 资源管理：MinIO 私有桶 + /assets 网关

### 2.1 object key 命名（强烈建议不可变）

为了让浏览器缓存“大胆一点”但又不踩坑，建议 **永远使用不可变 key**：

- ✅ 新版本：上传到新 key（带版本号/时间戳），再改 YAML 指向新 key
- ❌ 不建议：覆盖同一个 key（会导致缓存不一致、难排查）

推荐约定（任一即可）：

- \`*.vYYYYMMDDTHHMMSSZ.pdf\`（例如 \`hello.v20251227T120102Z.pdf\`）
- \`*.vYYYY-MM-DD.pdf\`（粒度更粗，但也行）

Go 网关会对 \`*.v<数字>...\` 这种 key 自动使用更激进的缓存策略（见下文）。

---

### 2.2 上传资源到 MinIO

你可以用 MinIO Console 上传，也可以用 \`mc\`（MinIO Client）：

> 小提醒：请确认你用的是 **MinIO S3 API endpoint**，不是 Console endpoint。  
>（Console 通常是 \`:9001\` 或域名里带 \`console\`；把它填进后端会导致 \`/assets\` 返回 502。）  
> 再提醒一个常见误会：MinIO UI 里你看到的 \`lecture/pdf/xxx.pdf\` 中，\`lecture\` 是 bucket，\`pdf/xxx.pdf\` 才是 object key（也就是 YAML 里的 \`assetKey\`）。  
> 站点里访问会变成 \`/assets/pdf/xxx.pdf\`（\`/assets\` 是网关路径，不是 MinIO 的目录）。

\`\`\`bash
mc alias set myminio https://minio.example.com MINIO_ACCESS_KEY MINIO_SECRET_KEY
mc cp ./local.pdf myminio/lecture/pdf/agent/sop/intro.v20251227T120102Z.pdf
\`\`\`

在 lesson YAML 里引用：

\`\`\`yaml
assetKey: pdf/agent/sop/intro.v20251227T120102Z.pdf
\`\`\`

浏览器访问实际走：\`https://<你的域名>/assets/pdf/agent/sop/intro.v20251227T120102Z.pdf\`

---

### 2.3 网页归档：URL → PDF → 上传 MinIO（半自动）

工具在 \`tools/\`：

\`\`\`bash
cd tools
npm install

# 如遇到 Playwright 未安装浏览器：
# npx playwright install chromium

export MINIO_ENDPOINT="https://minio.example.com:9000"
export MINIO_ACCESS_KEY_ID="..."
export MINIO_SECRET_ACCESS_KEY="..."
export MINIO_BUCKET="lecture"

npm run archive-url -- --url "https://example.com/" --out "archive/example-com/example.v20251227T120102Z.pdf"
\`\`\`

工具会输出可直接粘贴到 lesson YAML 的 \`archivePdf.assetKey\`。

---

## 2.4 网页归档：URL → HTML → 上传 MinIO（半自动）

当原网站禁止 iframe 嵌入（几乎是常态）时，归档 HTML 往往比“站内直接 embed 原站”更可靠。

当前实现会尽量产出**真正自包含（offline）的单文件 HTML**：

- Playwright 渲染后抓取 DOM（best-effort）
- 移除页面里的脚本/iframe/object 等（安全 + 更稳定）
- 尝试把 CSS/图片/字体内联为 data URI，使归档版本打开时不依赖外网
- 视频等大资源默认不会内联（避免单文件过大）

\`\`\`bash
cd tools
npm install

# 如遇到 Playwright 未安装浏览器：
# npx playwright install chromium

export MINIO_ENDPOINT="https://minio.example.com:9000"
export MINIO_ACCESS_KEY_ID="..."
export MINIO_SECRET_ACCESS_KEY="..."
export MINIO_BUCKET="lecture"

npm run archive-url-html -- --url "https://example.com/" --out "archive/example-com/example.v20251227T120102Z.html"
\`\`\`

工具会输出可直接粘贴到 lesson YAML 的 \`archiveHtml.assetKey\`。

---

## 3) /assets 保护：前缀限制 + 缓存策略 + Traefik Middleware

### 3.1 前缀限制（ASSET_ALLOWED_PREFIXES）

为了避免 MinIO bucket 里“误放其它对象”导致被公网读到，Go 网关支持：

- \`ASSET_ALLOWED_PREFIXES=pdf/,archive/\`

Helm values 对应：

- \`api.env.assetAllowedPrefixes\`

---

### 3.2 缓存策略（Cache-Control）

网关提供两类 Cache-Control：

- **默认（可变 key）**：\`ASSET_CACHE_CONTROL_DEFAULT\`（默认 1 小时）
- **不可变 key（\`*.v<数字>\`）**：\`ASSET_CACHE_CONTROL_IMMUTABLE\`（默认 1 年 + immutable）

如果你想“一刀切”，可设置：

- \`ASSET_CACHE_CONTROL\`（覆盖全部）

Helm values 对应：

- \`api.env.assetCacheControlDefault\`
- \`api.env.assetCacheControlImmutable\`
- \`api.env.assetCacheControl\`

---

### 3.3 Traefik 保护 /assets：限流 + 并发

Chart 会为 \`/assets\` 配置 Traefik Middleware：

- \`rateLimit\`：限制单位时间请求数
- \`inFlightReq\`：限制同一来源的并发请求数

Helm values 对应：

- \`ingress.assetsProtection\`
- \`ingress.traefik.crdApiVersion\`（集群若使用旧 CRD 组，改成 \`traefik.containo.us/v1alpha1\`）

---

## 4) 发布与部署：镜像、Chart、Flux

### 4.1 构建并推送镜像到 Harbor

Web（Next.js）Docker build 上下文需要包含 \`content/\`，所以在仓库根目录执行：

\`\`\`bash
docker build -f web/Dockerfile -t harbor.example.com/lecture/web:$(git rev-parse --short HEAD) .
docker push harbor.example.com/lecture/web:$(git rev-parse --short HEAD)
\`\`\`

API（Go 资产网关）：

\`\`\`bash
docker build -f api/Dockerfile -t harbor.example.com/lecture/api:$(git rev-parse --short HEAD) api
docker push harbor.example.com/lecture/api:$(git rev-parse --short HEAD)
\`\`\`

---

### 4.2 配置 Helm values（核心）

你至少需要配置：

- web/api 镜像地址与 tag
- MinIO endpoint / bucket / Secret
- ingress.hosts / tls.secretName

示例（片段）：

\`\`\`yaml
web:
  image:
    repository: harbor.example.com/lecture/web
    tag: "abc1234"

api:
  image:
    repository: harbor.example.com/lecture/api
    tag: "abc1234"
  minio:
    endpoint: "minio.example.com:9000"
    bucket: "lecture"
    existingSecret: "lecture-minio"
\`\`\`

创建 MinIO Secret（示例）：

\`\`\`bash
kubectl -n lecture create secret generic lecture-minio \\
  --from-literal=accessKeyId="..." \\
  --from-literal=secretAccessKey="..."
\`\`\`

---

### 4.3 推送 Helm Chart + Flux 部署

Chart 路径：\`deploy/helm/lecture/\`

推荐把 chart 作为 OCI artifact 推到 Harbor（命令仅示例）：

\`\`\`bash
helm package deploy/helm/lecture
helm push lecture-0.1.0.tgz oci://harbor.example.com/charts
\`\`\`

Flux 示例清单可参考：\`deploy/flux/examples/\`
`;

export default function MaintainerPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">维护者指南</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          面向维护内容与部署的说明（内容编排 / MinIO / 归档 / Helm / Flux）。
        </p>
      </header>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950">
        <Markdown>{guide}</Markdown>
      </section>
    </div>
  );
}
