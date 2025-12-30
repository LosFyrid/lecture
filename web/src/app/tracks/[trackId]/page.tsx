import Link from "next/link";
import { notFound } from "next/navigation";

import { getAllTracks, getLessonById, getTrackById } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllTracks().map((t) => ({ trackId: t.id }));
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId } = await params;
  const track = getTrackById(trackId);
  if (!track) notFound();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:underline">
            Tracks
          </Link>{" "}
          / <span className="text-zinc-700 dark:text-zinc-300">{track.id}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{track.title}</h1>
        {track.description ? (
          <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {track.description}
          </p>
        ) : null}
      </header>

      <section className="space-y-6">
        {track.modules.map((mod) => (
          <div
            key={mod.id}
            className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{mod.title}</h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {mod.lessons.length} lessons
              </span>
            </div>

            <ul className="mt-4 space-y-2">
              {mod.lessons.map((lessonId) => {
                const lesson = getLessonById(lessonId);
                if (!lesson) return null;

                return (
                  <li key={lessonId}>
                    <Link
                      href={`/tracks/${track.id}/lessons/${lesson.id}`}
                      className="block rounded-xl border border-black/5 px-4 py-3 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                    >
                      <div className="font-medium">{lesson.title}</div>
                      {lesson.summary ? (
                        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                          {lesson.summary}
                        </div>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
