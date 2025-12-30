import Link from "next/link";

import { getAllTracks } from "@/lib/content";

export default function Home() {
  const tracks = getAllTracks();

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-black/10 bg-gradient-to-b from-zinc-50 to-white p-8 shadow-sm dark:border-white/10 dark:from-zinc-950 dark:to-black">
        <div className="max-w-3xl space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            Lecture：学习路径驱动的资料站
          </h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
            用 Track / Module / Lesson 把零散的 PDF、链接和归档资源组织成可学习的 SOP。
            内容结构由 Git 维护；大文件存 MinIO，并通过同域名{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 text-sm text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
              /assets/*
            </code>{" "}
            提供访问。
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/getting-started"
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              站点使用说明
            </Link>
            {tracks[0] ? (
              <Link
                href={`/tracks/${tracks[0].id}`}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                从第一个 Track 开始
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">学习路径（Tracks）</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            内容由 <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">content/</code> 驱动
          </p>
        </div>

        {tracks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-300">
            还没有 Track。你可以从 <code>content/tracks/*.yaml</code> 开始添加。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {tracks.map((track) => (
              <Link
                key={track.id}
                href={`/tracks/${track.id}`}
                className="group rounded-2xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-zinc-950"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-base font-semibold tracking-tight group-hover:underline">
                      {track.title}
                    </h3>
                    <span className="rounded-full bg-black/5 px-2 py-1 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                      {track.modules.length} modules
                    </span>
                  </div>
                  {track.description ? (
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {track.description}
                    </p>
                  ) : (
                    <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      未填写描述
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

