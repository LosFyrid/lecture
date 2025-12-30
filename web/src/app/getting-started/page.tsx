import Link from "next/link";

export default function GettingStartedPage() {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">使用说明</h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
          这个站点是一个“学习路径驱动”的资料站：把 PDF、网页链接、以及网页归档（PDF）组织成
          可学习的 SOP。遇到外部网页无法站内展示时，你可以切换到“归档 HTML / 归档 PDF”继续学习。你只需要一个链接即可开始学习。
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">如何学习</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          <li>
            先从首页选择一个 Track，按 Module / Lesson 的顺序学习。
          </li>
          <li>
            每个 Lesson 通常由若干条目组成（PDF / URL / 归档 HTML / 归档 PDF / 讲解文字）。
          </li>
          <li>
            遇到外部网页无法站内嵌入（被网站策略阻止）时，优先切换到归档版本；必要时使用“站外打开”。
          </li>
          <li>
            若希望“固定版本，避免原站更新/失效”，请使用归档 PDF（见下文）。
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">如何贡献内容</h2>
        <div className="space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          <p>
            内容由 Git 仓库中的 <code>content/</code> 驱动：
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <code>content/tracks/*.yaml</code>：定义 Track / Module / Lesson 的组织结构
            </li>
            <li>
              <code>content/lessons/*.yaml</code>：定义 Lesson 的标题、摘要、以及资源条目（items）
            </li>
          </ul>
          <p>
            资源文件（PDF / 归档）建议存放在 MinIO 的私有 bucket 中，并通过站内{" "}
            <code>/assets/*</code> 访问（由 Go 资产网关提供）。
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          网页归档（URL → PDF / HTML）
        </h2>
        <div className="space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          <p>
            有些网页会随时间更新、改版甚至 404。建议把关键网页归档成 PDF 存入 MinIO，然后在
            Lesson 中引用归档版本。
          </p>
          <p>
            本仓库会提供离线工具（<code>tools/</code>）实现“URL → PDF/HTML → 上传 MinIO”。归档后你可以在 lesson 的 URL item 中配置{" "}
            <code>archiveHtml.assetKey</code> 和/或 <code>archivePdf.assetKey</code>。
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
        <div className="space-y-2">
          <div>
            下一步：回到首页选择一个 Track。
          </div>
          <Link
            href="/"
            className="inline-flex rounded-full bg-zinc-950 px-4 py-2 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            返回首页
          </Link>
        </div>
      </section>
    </div>
  );
}
