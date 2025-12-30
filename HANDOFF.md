# Lecture Site 交接说明（内容编排 + MinIO 资产 + k8s 部署）

本文档面向 **接手维护/使用本项目** 的同学：你可以用它来快速理解现状、正确地添加内容与资源、并把服务部署到自托管 k8s（k3s + Traefik + cert-manager + Flux）。

> TL;DR：  
> - 课程结构在 `content/`（Git 版本化）  
> - 大文件与归档在 MinIO（bucket 内的 object key）  
> - 站点通过同域 `/assets/*` 访问 MinIO（Go 资产网关）  
> - 前端是 Next.js（默认 SSG），内容更新通常意味着 **重新构建并发布 web 镜像**

---

## 0. 适用范围 & 目标

这个 lecture site 是一个 **学习路径驱动的资料展示站**（不是 wiki；内部资料继续放 Notion）。它解决的问题是：

- 以「Track → Module → Lesson」组织学习路径，面向新人 SOP/培训
- 支持多种资料形态：PDF、网页链接、网页归档（HTML/PDF）、以及讲解文本（Markdown/HTML）
- 面向公网访问（当前没有 SSO），通过同域 `/assets` 网关 + Traefik 中间件做基本防护
- 可扩展：后续可在 `/api` 下扩展用户/进度/测验等能力，但当前以展示为主

---

## 1. 架构总览

### 1.1 组件

- `web/`：Next.js 前端（React 19 / Next 16）
  - 负责页面渲染与 UI
  - 默认偏静态：使用 `generateStaticParams` 预渲染 lesson 页面（SSG）
- `api/`：Go 服务（资产网关）
  - 负责对外提供同域 `/assets/*`（从 MinIO 私有桶读取）
  - 支持 Range（对 PDF 翻页/快进很关键）
  - 提供 `/healthz`（k8s 探针）和 `/api/v1/ping`（占位）
- `content/`：课程结构与课时内容（YAML）
  - `content/tracks/*.yaml`：Track/Module 的组织结构
  - `content/lessons/*.yaml`：Lesson 内容（items 列表等）
- `tools/`：离线归档工具
  - `archive-url-to-pdf.mjs`：URL → PDF → 上传 MinIO
  - `archive-url-to-html.mjs`：URL → **自包含单文件 HTML**（内联 CSS/图片/字体）→ 上传 MinIO
- `deploy/`：Helm Chart + Flux 示例
  - `deploy/helm/lecture/`：Helm Chart（web/api + ingress + /assets 保护）
  - `deploy/flux/examples/`：Flux 的 OCIRepository/HelmRelease 示例

### 1.2 请求路径（生产）

同一个域名下（例如 `https://lecture.example.com`）：

- `/`、`/tracks/...`：Ingress → `web` Service → Next.js
- `/assets/...`：Ingress → `api` Service → Go 网关 → MinIO（bucket/object）
- `/api/...`：Ingress → `api` Service（目前仅 `GET /api/v1/ping`）

> 设计动机：  
> 资源都走同域 `/assets/*`，从而避免 CORS、便于统一缓存/限流，并让站点对学习者“更自包含”。

---

## 2. 内容编排：如何添加 Track / Lesson

### 2.1 Track：学习路径

目录：`content/tracks/`

基本结构：

```yaml
id: agent-dev
title: Agent 开发入门
description: |
  （可选）对这个 track 的介绍
modules:
  - id: basics
    title: 基础
    lessons:
      - intro
      - prompt-basics
```

注意事项：

- `lessons` 填的是 lesson 的 `id`，必须在 `content/lessons/*.yaml` 存在，否则构建会 fail fast

### 2.2 Lesson：课时

目录：`content/lessons/`

一个 lesson 主要由：

- `summary`（可选）：简介
- `body`（可选）：课时叙事（Markdown）
- `items`（必填）：条目列表（资料、归档、讲解块等）

#### 2.2.1 支持的 item 类型

目前支持：

1) `pdf`：站内 PDF（MinIO object）

```yaml
- type: pdf
  title: 归档 PDF
  assetKey: pdf/agent/sop/intro.v20251227T120102Z.pdf
  note: （可选）说明
```

2) `url`：外部网页

```yaml
- type: url
  title: OpenAI Docs
  url: https://platform.openai.com/docs
  mode: open   # open | embed
  note: （可选）说明
```

`url` 的增强字段（可选）：

- `archiveHtml.assetKey`：网页归档 HTML（建议自包含）
- `archivePdf.assetKey`：网页归档 PDF（打印版）

```yaml
- type: url
  title: 一篇会更新的网页
  url: https://example.com/post
  mode: embed
  archiveHtml:
    title: 固定版本（HTML）
    assetKey: archive/example-com/post.v20251227T120102Z.html
  archivePdf:
    title: 固定版本（PDF）
    assetKey: archive/example-com/post.v20251227T120102Z.pdf
```

重要：`mode` 的行为差异

- `mode: open`：站内只展示链接（不尝试 iframe，不展示归档 tab）
- `mode: embed`：站内显示一个“观看模式”切换（网页嵌入/归档 HTML/归档 PDF），并保留“站外打开”

> 为什么默认不对 `mode: open` 展示归档 tab？  
> 这是刻意的“更强语义”：`open` 表示你就是不想在站内看/不想嵌入；要站内看请用 `embed`。
> 如果后续希望 `open` 也能看到归档入口，可以再改 UI 逻辑。

3) `md`：Markdown 讲解块（推荐）

```yaml
- type: md
  title: 课前准备（可选）
  note: （可选）说明
  layout: card   # card | inline（默认 card）
  body: |
    支持 GFM（表格/任务列表/代码块）。

    ```bash
    mc ls myminio/lecture/pdf/
    ```
```

4) `html`：HTML 片段（可选）

```yaml
- type: html
  title: 注意事项（可选）
  note: （可选）
  layout: inline # card | inline（默认 card）
  body: |
    <div style="border:1px solid rgba(0,0,0,.12); border-radius:12px; padding:12px;">
      <b>提示：</b>这里是 HTML 片段。
    </div>
```

安全说明（非常重要）：

- `type: html` 会 **直接渲染到页面 DOM**，但会经过 `sanitize-html` 做安全清洗：`<script>` 等危险内容会被移除、style 也会被限制。
- 这意味着：适合用于 callout/富文本提醒；不适合嵌入复杂 JS 小应用。

#### 2.2.2 `layout: card | inline`（适用于 md/html）

- `layout: card`（默认）：像 callout 卡片，有边框和背景，适合强调/提醒/结构化讲解
- `layout: inline`：无框、流式插入，更像正文段落，适合穿插解释

---

## 3. 资源管理：MinIO object key / /assets 网关

### 3.1 关键概念：bucket vs object key

在 MinIO 控制台里你会看到类似：

`lecture/pdf/Introduction_to_Agents.pdf`

其中：

- `lecture` 是 **bucket**
- `pdf/Introduction_to_Agents.pdf` 是 **object key**（在 YAML 里写 `assetKey` 的就是它）

站点访问路径为：

- `https://<域名>/assets/<assetKey>`
- 例如：`/assets/pdf/Introduction_to_Agents.pdf`

### 3.2 最大坑：MinIO endpoint 填错（Console vs S3 API）

后端 Go 网关需要的是 **MinIO S3 API endpoint**（通常 `:9000` 或你们的 `minio-api.xxx`），不是 MinIO Console（通常 `:9001` 或域名带 `console`）。

典型现象：

- 填错 Console endpoint：访问 `/assets/...` 返回 **502**
- 填对 S3 API endpoint：`/assets/...` 正常 200/206

### 3.3 前缀白名单：`ASSET_ALLOWED_PREFIXES`

Go 网关可限制仅允许某些 prefix 被公网访问（推荐开启）：

- 默认 Helm values：`pdf/,archive/`
- 环境变量：`ASSET_ALLOWED_PREFIXES=pdf/,archive/`

典型现象：

- object 存在但返回 **403**：通常是 key 不在允许前缀里

### 3.4 缓存策略（强烈建议用不可变 key）

推荐把对象 key 设计为不可变（带时间戳版本），例如：

- `pdf/foo.v20251227T120102Z.pdf`
- `archive/example-com/post.v20251227T120102Z.html`

好处：

- 你更新内容时上传新 key，并改 YAML 指向新 key，浏览器缓存不会“阴魂不散”
- Go 网关会把带 `.v<数字>` 的 key 视为“不可变”，默认给更激进的 Cache-Control（见 `deploy/helm/lecture/values.yaml`）

---

## 4. 网页归档工具（tools/）

目录：`tools/`

### 4.1 前置准备

```bash
cd tools
npm install

# 如遇到 Playwright 没装浏览器：
# npx playwright install chromium
```

MinIO 相关环境变量（示例）：

```bash
export MINIO_ENDPOINT="https://minio.example.com:9000"   # 或 http://minio-api.xxx:9000
export MINIO_USE_SSL="true"
export MINIO_ACCESS_KEY_ID="..."
export MINIO_SECRET_ACCESS_KEY="..."
export MINIO_BUCKET="lecture"
export MINIO_REGION="us-east-1"
```

### 4.2 URL → PDF（打印版归档）

```bash
npm run archive-url -- --url "https://example.com/" --out "archive/example-com/example.v20251227T120102Z.pdf"
```

适用：

- 网页可打印、内容以文字为主
- 你希望“固定版本”且在任何浏览器都稳定渲染

### 4.3 URL → HTML（自包含离线单文件）

```bash
npm run archive-url-html -- --url "https://example.com/" --out "archive/example-com/example.v20251227T120102Z.html"
```

实现要点（best-effort）：

- Playwright 打开页面后抓取最终 DOM（对 SPA 更友好）
- 移除脚本/iframe/object 等（安全 + 更稳定）
- 尝试把 CSS/图片/字体内联为 data URI（让 HTML 打开时尽量不依赖外网）
- 视频等大资源默认不内联（避免单文件过大）

潜在坑：

- 有些站点资源带鉴权/cookie/防盗链，可能无法抓全；归档 HTML 依然可能缺图或样式不完整
- 单文件可能很大（尤其图片很多的页面），请关注对象大小与加载速度

---

## 5. 本地开发（开发集快速预览）

### 5.1 启动后端（Go /assets 网关）

```bash
cd api
export MINIO_ENDPOINT="minio-api.xxx:9000"
export MINIO_USE_SSL="true"
export MINIO_ACCESS_KEY_ID="..."
export MINIO_SECRET_ACCESS_KEY="..."
export MINIO_BUCKET="lecture"
go run ./cmd/lecture-api
```

默认监听：`0.0.0.0:8080`（见 `LISTEN_ADDR`）

### 5.2 启动前端（Next.js）

推荐用 rewrite 把 `/assets` 代理到后端，保持同域路径（避免 CORS）：

```bash
cd web
export LECTURE_API_BASE_URL="http://localhost:8080"
npm run dev
```

### 5.3 我改了 YAML，为什么页面没变？

`content/*.yaml` 会被编译成 `web/src/generated/content.json`。

- `npm run dev` 在启动时会执行 `predev`，自动生成一次
- 如果你在 dev server 运行期间改 YAML：
  - 最稳妥：重启 `npm run dev`
  - 或手动执行：`node web/scripts/build-content.mjs` 后刷新页面

---

## 6. k8s 部署（k3s + Traefik + cert-manager + Flux）

### 6.0 项目约定（Harbor / Flux / Ingress 配置时需要匹配）

这里列的是“项目本身写死/内建”的接口约定；这些信息会直接影响你如何在 Harbor/Flux/Ingress 中落地。

**A) 站内路径约定（同域名）**

- 前端页面路径：`/`、`/tracks/...`
- 资产网关路径：`/assets/*`（强约定）
  - 前端的 PDF/HTML 归档、PDF Viewer 都依赖 `/assets/...` 这个同域路径
  - 如果你想改成别的域名/路径，需要同步修改前端生成 URL 的逻辑（见 `web/src/lib/assets.ts`）
- API 路径（目前仅占位）：`/api/*`

**B) 端口约定（容器内部）**

- `web` 容器：`3000`
- `api` 容器：`8080`

Chart 的 Service/Ingress 默认也按这两个端口配置；如果你要改端口，需要同时改 values + 模板（当前 Chart 未提供端口可配置到任意值的完整抽象）。

**C) Helm Chart 的 fail-fast 校验**

Chart 在渲染阶段会校验必要字段（缺失会直接 `helm install`/`helm upgrade` 失败），见 `deploy/helm/lecture/templates/_validate.tpl`。因此在 Flux 中，你必须至少设置：

- `web.image.repository` + `web.image.tag`
- `api.image.repository` + `api.image.tag`
- `api.minio.endpoint`
- MinIO 凭据：`api.minio.existingSecret` **或** `api.minio.accessKeyId + api.minio.secretAccessKey`
- `ingress.hosts`（当 `ingress.enabled=true`）
- `ingress.certManager.clusterIssuer`（当 `ingress.certManager.enabled=true`）

**D) MinIO Secret 约定（默认 key 名）**

当你使用 `api.minio.existingSecret` 时，默认会从 Secret 中读取：

- `accessKeyId`（可通过 `api.minio.accessKeyIdKey` 改名）
- `secretAccessKey`（可通过 `api.minio.secretAccessKeyKey` 改名）

如果你们集群里已有统一的 Secret key 命名规范，可以通过 values 把这两个 key 映射到你们的命名。

**E) 资源访问前缀白名单（默认约定）**

为了避免误把 bucket 里的其它对象暴露到公网，Chart 默认：

- `api.env.assetAllowedPrefixes: "pdf/,archive/"`

这意味着：

- 你的 `assetKey` 最好都放在 `pdf/...` 或 `archive/...`
- 否则 `/assets/...` 会直接 403（即使 object 在 bucket 中确实存在）

**F) Harbor / 镜像 tag 约定**

项目本身 **不强制** 你使用某种 Harbor repo 命名或 tag 规则；Chart 只要求你提供 `repository` 和 `tag`。

唯一与“如何构建镜像”强相关的约定是：

- **web 镜像构建上下文必须包含 `content/`**（见 `web/Dockerfile`），所以需要在仓库根目录 build（见下文 6.1）

**G) Flux / Chart 发布方式**

项目同样 **不强制** 你必须用哪种 Flux Source（GitRepository / OCIRepository / HelmRepository）。
但仓库提供的例子是用 OCI Chart（Harbor 作为 OCI Registry）：

- `deploy/flux/examples/ocirepository.yaml`
- `deploy/flux/examples/helmrelease.yaml`

如果你们更习惯用 Git source 或 Helm repo，也可以改用自己的方式；只要最终 `HelmRelease.values` 能填齐上面 C) 的必填项即可。

**H) 私有 Harbor 拉镜像的坑（Chart 当前没有内建 imagePullSecrets）**

Helm Chart 当前没有 `imagePullSecrets` 的 values/模板（也没有 serviceAccount 抽象）。
如果你们 Harbor 是私有的，你需要在集群侧保证 Pod 能拉镜像，例如：

- 在 namespace 里配置默认的 `imagePullSecret`（或给默认 ServiceAccount patch）
- 或者你们内部已有全局镜像拉取策略

### 6.1 构建并推送镜像（Harbor）

Web 镜像构建上下文需要包含 `content/`，所以在仓库根目录执行：

```bash
docker build -f web/Dockerfile -t harbor.example.com/lecture/web:<tag> .
docker push harbor.example.com/lecture/web:<tag>
```

API（可用 `api/` 作为 build context）：

```bash
docker build -f api/Dockerfile -t harbor.example.com/lecture/api:<tag> api
docker push harbor.example.com/lecture/api:<tag>
```

### 6.2 Helm values（必须配置项）

Chart：`deploy/helm/lecture/`

至少要填：

- `web.image.repository/tag`
- `api.image.repository/tag`
- `api.minio.endpoint/bucket` + MinIO Secret（推荐 existingSecret）
- `ingress.hosts` + `ingress.tls.secretName`

参考：`deploy/helm/lecture/values.yaml`

### 6.3 MinIO Secret（推荐 existingSecret）

Chart 支持引用已有 Secret（推荐），例如：

```bash
kubectl -n lecture create secret generic lecture-minio \
  --from-literal=accessKeyId="..." \
  --from-literal=secretAccessKey="..."
```

values 中配置：

```yaml
api:
  minio:
    existingSecret: lecture-minio
```

### 6.4 Flux（示例）

示例清单在：`deploy/flux/examples/`

- `namespace.yaml`：命名空间
- `ocirepository.yaml`：从 Harbor 拉 chart（OCI）
- `helmrelease.yaml`：HelmRelease（配置 values）

Traefik CRD 的坑：

- 有些集群使用 `traefik.containo.us/v1alpha1`
- 有些使用 `traefik.io/v1alpha1`

values 里通过 `ingress.traefik.crdApiVersion` 适配。

---

## 7. 常见故障排查（强烈建议先看这里）

### 7.1 `/assets/...` 返回 502

优先检查：

- `MINIO_ENDPOINT` 是否填成了 **Console**（9001 / 域名带 console）而不是 **S3 API**（9000 / minio-api）

### 7.2 `/assets/...` 返回 404

优先检查：

- object key 写错（是否把 bucket 名也写进了 `assetKey`？）
- 是否真的上传到了对应 bucket（例如 `lecture`）
- key 大小写是否一致（MinIO object key 区分大小写）

### 7.3 `/assets/...` 返回 403

优先检查：

- `ASSET_ALLOWED_PREFIXES` 是否限制了前缀（默认只允许 `pdf/,archive/`）
- 你的对象 key 是否落在允许前缀下（例如 `tmp/...` 会被拒绝）

### 7.4 URL item 看不到「归档 HTML」tab

需要同时满足：

- 该 item 是 `type: url` 且 `mode: embed`
- YAML 配了 `archiveHtml.assetKey`

### 7.5 HTML 片段样式/功能不生效

原因通常是：

- `type: html` 会被安全清洗：脚本/危险属性会被移除；`style` 也只允许一小部分安全 CSS

如果你确实需要复杂交互：

- 建议做成一个独立页面/组件，而不是放进 `type: html` 里

---

## 8. 修改点导航（新人维护者从这里找入口）

- 课程结构：`content/tracks/`、`content/lessons/`
- 前端 UI：`web/src/app/`、`web/src/components/`
- /assets 网关：`api/internal/assets/handler.go`
- 归档工具：`tools/archive-url-to-pdf.mjs`、`tools/archive-url-to-html.mjs`
- k8s/Helm：`deploy/helm/lecture/`
- Flux 示例：`deploy/flux/examples/`
