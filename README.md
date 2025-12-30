# Lecture

一个面向工程团队培训的 **web UI 主导** “lecture site”（不是 wiki）：用**学习路径（track）**组织资料（PDF、链接、网页归档等），以现代 UI 展示，并支持在 k3s 上用 Helm + Flux 持续部署。

本仓库按 **Next.js 前端 + Go 后端（资产网关）** 的架构实现：

- `web/`: Next.js（SSR/SSG/ISR 可选；本项目默认偏静态/SSG）
- `api/`: Go 服务，提供 `/assets/*` 资产网关（MinIO 私有桶 → 同域名访问，支持 Range）
- `content/`: 课程结构与课时定义（YAML），由 Git 版本化
- `tools/`: 离线工具（例如：URL → PDF 归档 → 上传 MinIO）
- `deploy/helm/lecture/`: Helm Chart（Traefik Ingress + cert-manager TLS）

项目交接/运维说明（给接手同学）：

- `HANDOFF.md`

## 核心思路

- **内容结构在 Git**：便于 review / 回滚 / 版本化
- **大文件在 MinIO（私有桶）**：PDF/归档文件不污染 repo
- **资产一律走同域名 `/assets/*`**：站点“自包含”，并可统一缓存/限流/审计
- **公网可访问**：默认不做登录（内容主要来自公网）；可通过 Ingress/后端限流 + noindex 降低被扫风险

## 内容结构（示例）

- Track：学习路径（若干模块，每个模块若干 lesson）
- Lesson：一个课时，主要由若干 `items` 组成；`body`（教学叙事）是可选的

示例文件：

- `content/tracks/agent-dev.yaml`
- `content/lessons/intro.yaml`

站内也提供两页自说明（方便“只给链接就能看”）：

- `GET /getting-started`：学习者使用说明
- `GET /maintainer`：维护者指南（内容/归档/部署）

## 如何添加内容（Track / Lesson）

### 1) 新增/修改 Track（学习路径）

1. 在 `content/tracks/` 下创建一个 `*.yaml`
2. 填写：
   - `id`: 唯一 ID（URL 会使用它）
   - `title`: 展示标题
   - `modules`: 模块数组（每个模块有 `id/title/lessons`）
3. `lessons` 里写的是 lesson 的 `id`（必须在 `content/lessons/` 中存在）

示例：

```yaml
id: agent-dev
title: Agent 开发入门
modules:
  - id: basics
    title: 基础
    lessons:
      - intro
      - prompt-basics
```

### 2) 新增/修改 Lesson（课时）

1. 在 `content/lessons/` 下创建一个 `*.yaml`
2. 填写：
   - `id`, `title`
   - `summary`（可选）
   - `body`（可选：用于教学叙事/说明；Markdown 文本）
   - `items`（必须：资源条目列表）

目前支持的 `items` 类型：

- `pdf`: 站内 PDF（MinIO object）
  - `assetKey`: MinIO object key（推荐不可变、带版本号）
- `url`: 外部网页
  - `mode: open | embed`
  - `archivePdf.assetKey`（可选）：该网页的归档 PDF（MinIO object）
  - `archiveHtml.assetKey`（可选）：该网页的归档 HTML（MinIO object；用于规避 iframe 被禁）
- `md`: Markdown 文本块（用于补充讲解、SOP、代码块等）
  - `body`: Markdown 内容
  - `layout`（可选）：`card | inline`，默认 `card`（`inline` 为无框流式插入）
- `html`: HTML 片段（可选；用于少量富文本/告示）
  - `body`: HTML 内容（会直接渲染；服务端会做安全清洗，脚本/危险属性会被移除）
  - `layout`（可选）：`card | inline`，默认 `card`

> 任何一节课都可以“只有一个 PDF”或“只有一个 URL”，不强制写 `body`。

## 本地开发（概览）

先决条件：

- Node.js（建议 20+；仓库默认以 Next.js 为前端运行时）
- Go（用于 `api/`）
- 一个可用的 MinIO（本地或远端）

后端（资产网关）需要的环境变量（示例）：

```bash
MINIO_ENDPOINT="minio.example.com:9000"
MINIO_ACCESS_KEY_ID="..."
MINIO_SECRET_ACCESS_KEY="..."
MINIO_BUCKET="lecture"
MINIO_USE_SSL="true"
```

> 注意：`MINIO_ENDPOINT` 必须是 **MinIO S3 API** 的地址（你用 `mc alias set ... <endpoint>` 时的那个 endpoint），
> 不是 MinIO Console（通常是 `:9001` 或域名里带 `console`）。

前端本地开发建议通过 rewrite 代理到后端（避免 CORS / 保持同域名路径）：

```bash
cd api
go run ./cmd/lecture-api

cd ../web
export LECTURE_API_BASE_URL="http://localhost:8080"
npm run dev
```

## 如何添加/推送资源（PDF / 网页归档）

### 1) 上传本地 PDF 到 MinIO

推荐使用 MinIO Client（`mc`）：

```bash
mc alias set myminio https://minio.example.com MINIO_ACCESS_KEY MINIO_SECRET_KEY
mc cp ./local.pdf myminio/lecture/pdf/agent/sop/intro.v20251227T120102Z.pdf
```

然后在 lesson YAML 里引用：

```yaml
items:
  - type: pdf
    title: SOP（归档版）
    assetKey: pdf/agent/sop/intro.v20251227T120102Z.pdf
```

> 解释一下路径：MinIO 里你通常会看到类似 `lecture/pdf/...` 这样的“路径”，其中：
> - `lecture` 是 **bucket 名**（由 `MINIO_BUCKET` 决定）
> - `pdf/...` 才是 **object key**（也就是 `assetKey`）
>
> 浏览器访问时会变成：`/assets/<assetKey>`，例如：`/assets/pdf/agent/sop/intro.v....pdf`

### 2) 归档网页（URL → PDF/HTML → 上传 MinIO）

工具位于 `tools/`，用 Playwright 打印网页为 PDF，并通过 S3 API 上传到 MinIO：

```bash
cd tools
npm install

# 如遇到 Playwright 未安装浏览器：
# npx playwright install chromium

export MINIO_ENDPOINT="https://minio.example.com:9000"
export MINIO_ACCESS_KEY_ID="..."
export MINIO_SECRET_ACCESS_KEY="..."
export MINIO_BUCKET="lecture"

npm run archive-url -- --url "https://example.com/" --out "archive/example-com/example.v20251227T120102Z.pdf"
```

或归档为 HTML（用于规避 iframe 被禁；会尽量产出自包含的单文件离线版本）：

```bash
npm run archive-url-html -- --url "https://example.com/" --out "archive/example-com/example.v20251227T120102Z.html"
```

工具会输出：

- `assetKey`（可直接写进 YAML）
- 以及 YAML 片段（`archivePdf.assetKey` 或 `archiveHtml.assetKey`）

### 3) object key 命名与缓存（强烈建议）

为了让 PDF **加载/翻页更快**，同时避免缓存踩坑：

- ✅ 建议：object key 不可变（带版本号/时间戳），更新时上传新 key，再改 YAML
- ❌ 不建议：覆盖同一个 key（缓存不可控、排障困难）

Go 网关会对 `*.v<数字>...` 的 key 使用更激进缓存策略（默认 1 年 + `immutable`）。

## 推荐更新流程（内容 / 资源 / 镜像 / 部署）

### 更新资源（PDF/归档）

1. 上传新文件到 MinIO（建议新 key，不覆盖旧 key）
2. 修改 `content/lessons/*.yaml` 引用新的 `assetKey`
3. 提交 Git（内容结构版本化）
4. 触发构建发布（见下）

### 更新站点内容（YAML）

内容在 Git，前端页面是 SSG/静态生成，因此：

- 任何 `content/` 的改动都会进入 web 镜像构建上下文
- 推送新内容一般等价于“构建并发布新的 web 镜像”

### 更新代码（web/api）

- `web/` 变更：构建并推送 web 镜像
- `api/` 变更：构建并推送 api 镜像

### 更新 k8s 部署（Chart/HelmRelease）

两种常见做法：

1) **Chart 版本化**：chart 每次变更 bump `Chart.yaml` 版本，推送到 Harbor；Flux 追踪 chart tag/version  
2) **固定 Chart，更新 values**：chart 不变，Flux 通过 Git 更新 HelmRelease values（镜像 tag、配置等）

你们如果已经有 Flux 自动化（镜像策略/自动更新 tag），可以把 HelmRelease 的 `values.web.image.tag` / `values.api.image.tag` 交给自动化更新。

## 部署（概览）

本项目预期运行于：

- k3s（Ingress: Traefik）
- cert-manager + Let’s Encrypt（TLS 自动签发/续期）
- Flux（检测 Harbor 的镜像与 chart 变更，自动更新）

Helm Chart 位于 `deploy/helm/lecture/`。

### 镜像构建（概览）

> 本环境未内置 Docker，仅给出推荐命令。

- Web（Next.js）：构建上下文需要包含 `content/`，建议在仓库根目录执行：

```bash
docker build -f web/Dockerfile -t lecture-web:dev .
```

- API（Go 资产网关）：上下文为 `api/`：

```bash
docker build -f api/Dockerfile -t lecture-api:dev api
```

## k8s 部署配置（Helm + Flux）

### 1) 准备 MinIO Secret（推荐 existingSecret）

Chart 支持引用现有 Secret（推荐），key 默认是：

- `accessKeyId`
- `secretAccessKey`

示例：

```bash
kubectl -n lecture create secret generic lecture-minio \
  --from-literal=accessKeyId="..." \
  --from-literal=secretAccessKey="..."
```

### 2) Helm values 关键项

你至少需要在 values 中设置：

- `web.image.repository/tag`
- `api.image.repository/tag`
- `api.minio.endpoint/bucket/existingSecret`
- `ingress.hosts[0].host`
- `ingress.tls.secretName`

此外，本 chart 内置了两类“公开站点保护”：

- `ingress.assetsProtection.*`：对 `/assets` 施加 Traefik Middleware（rateLimit + inFlightReq）
- `api.env.assetAllowedPrefixes`：限制可访问的 object key 前缀（防止误公开 bucket 内其它对象）

### 3) Traefik Middleware 说明（/assets 限流/并发）

默认会为 `/assets` 创建两个 Middleware：

- `rateLimit`: 限制请求速率（建议保持较宽松，避免 pdf.js 分段请求被误伤）
- `inFlightReq`: 限制并发（对“防刷带宽”更有效）

如果你的 Traefik CRD 组是旧的（常见于老集群），需要改：

- `ingress.traefik.crdApiVersion: traefik.containo.us/v1alpha1`

### 4) Flux 示例

示例清单在 `deploy/flux/examples/`：

- `deploy/flux/examples/namespace.yaml`
- `deploy/flux/examples/ocirepository.yaml`
- `deploy/flux/examples/helmrelease.yaml`

你只需要把其中的域名、Harbor 地址、chart tag、镜像 tag、MinIO endpoint/secret 改成你们真实值即可。
