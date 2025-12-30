import Link from "next/link";
import { notFound } from "next/navigation";

import { HtmlBlock } from "@/components/HtmlBlock";
import { Markdown } from "@/components/Markdown";
import { PdfViewer } from "@/components/PdfViewer";
import { UrlItemCard } from "@/components/UrlItemCard";
import { toAssetUrl } from "@/lib/assets";
import {
  getAllTracks,
  getLessonById,
  getPrevNextLesson,
  getTrackById,
  trackHasLesson,
} from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  const tracks = getAllTracks();
  const params: Array<{ trackId: string; lessonId: string }> = [];
  for (const t of tracks) {
    for (const mod of t.modules) {
      for (const lessonId of mod.lessons) {
        params.push({ trackId: t.id, lessonId });
      }
    }
  }
  return params;
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ trackId: string; lessonId: string }>;
}) {
  const { trackId, lessonId } = await params;

  const track = getTrackById(trackId);
  if (!track) notFound();
  if (!trackHasLesson(track, lessonId)) notFound();

  const lesson = getLessonById(lessonId);
  if (!lesson) notFound();

  const { prev, next } = getPrevNextLesson(track, lesson.id);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            <Link href="/" className="hover:underline">
              Tracks
            </Link>{" "}
            /{" "}
            <Link href={`/tracks/${track.id}`} className="hover:underline">
              {track.title}
            </Link>{" "}
            / <span className="text-zinc-700 dark:text-zinc-300">{lesson.id}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {prev ? (
              <Link
                href={`/tracks/${track.id}/lessons/${prev.id}`}
                className="rounded-full border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                ← 上一课
              </Link>
            ) : null}
            {next ? (
              <Link
                href={`/tracks/${track.id}/lessons/${next.id}`}
                className="rounded-full border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                下一课 →
              </Link>
            ) : null}
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">{lesson.title}</h1>
        {lesson.summary ? (
          <p className="max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {lesson.summary}
          </p>
        ) : null}
      </header>

      {lesson.body ? (
        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950">
          <Markdown>{lesson.body}</Markdown>
        </section>
      ) : null}

      <section className="space-y-6">
        {lesson.items.map((item, idx) => {
          if (item.type === "pdf") {
            const url = toAssetUrl(item.assetKey);
            return (
              <div
                key={`${item.type}:${item.assetKey}:${idx}`}
                className="space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold tracking-tight">
                      {item.title ?? "PDF"}
                    </h2>
                    {item.note ? (
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">
                        {item.note}
                      </p>
                    ) : null}
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  >
                    新标签打开
                  </a>
                </div>
                <PdfViewer fileUrl={url} title={item.title ?? "PDF"} />
              </div>
            );
          }

          if (item.type === "url") {
            return (
              <UrlItemCard key={`${item.type}:${item.url}:${idx}`} item={item} />
            );
          }

          if (item.type === "md") {
            const header = item.title ? (
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight">
                  {item.title}
                </h2>
                {item.note ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {item.note}
                  </p>
                ) : null}
              </div>
            ) : item.note ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {item.note}
              </p>
            ) : null;

            if (item.layout === "inline") {
              return (
                <div key={`${item.type}:${idx}`} className="max-w-4xl">
                  {header}
                  <div className={header ? "mt-4" : ""}>
                    <Markdown>{item.body}</Markdown>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${item.type}:${idx}`}
                className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950"
              >
                {header}
                <div className={header ? "mt-4" : ""}>
                  <Markdown>{item.body}</Markdown>
                </div>
              </div>
            );
          }

          if (item.type === "html") {
            const header = item.title ? (
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight">
                  {item.title}
                </h2>
                {item.note ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {item.note}
                  </p>
                ) : null}
              </div>
            ) : item.note ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {item.note}
              </p>
            ) : null;

            if (item.layout === "inline") {
              return (
                <div key={`${item.type}:${idx}`} className="max-w-4xl">
                  {header}
                  <div className={header ? "mt-4" : ""}>
                    <HtmlBlock html={item.body} />
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${item.type}:${idx}`}
                className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950"
              >
                {header}
                <div className={header ? "mt-4" : ""}>
                  <HtmlBlock html={item.body} />
                </div>
              </div>
            );
          }

          return null;
        })}
      </section>
    </div>
  );
}
