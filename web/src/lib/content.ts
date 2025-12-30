import contentData from "@/generated/content.json";

export type UrlMode = "open" | "embed";

export type PdfItem = {
  type: "pdf";
  title?: string;
  note?: string;
  assetKey: string;
};

export type UrlItem = {
  type: "url";
  title: string;
  note?: string;
  url: string;
  mode: UrlMode;
  archivePdf?: {
    assetKey: string;
    title?: string;
  };
  archiveHtml?: {
    assetKey: string;
    title?: string;
  };
};

export type MarkdownItem = {
  type: "md";
  title?: string;
  note?: string;
  body: string;
  layout: "card" | "inline";
};

export type HtmlItem = {
  type: "html";
  title?: string;
  note?: string;
  body: string;
  layout: "card" | "inline";
};

export type LessonItem = PdfItem | UrlItem | MarkdownItem | HtmlItem;

export type Lesson = {
  id: string;
  title: string;
  summary?: string;
  body?: string;
  items: LessonItem[];
};

export type TrackModule = {
  id: string;
  title: string;
  lessons: string[];
};

export type Track = {
  id: string;
  title: string;
  description?: string;
  modules: TrackModule[];
};

export type ContentData = {
  generatedAt: string;
  tracks: Record<string, Track>;
  lessons: Record<string, Lesson>;
};

const content = contentData as unknown as ContentData;

export function getAllTracks(): Track[] {
  return Object.values(content.tracks).sort((a, b) => a.title.localeCompare(b.title));
}

export function getTrackById(id: string): Track | null {
  return content.tracks[id] ?? null;
}

export function getLessonById(id: string): Lesson | null {
  return content.lessons[id] ?? null;
}

export function getTrackLessonIds(track: Track): string[] {
  return track.modules.flatMap((m) => m.lessons);
}

export function trackHasLesson(track: Track, lessonId: string): boolean {
  return track.modules.some((m) => m.lessons.includes(lessonId));
}

export function getPrevNextLesson(
  track: Track,
  lessonId: string,
): {
  prev?: { id: string; title: string };
  next?: { id: string; title: string };
} {
  const sequence = getTrackLessonIds(track);
  const index = sequence.indexOf(lessonId);
  if (index === -1) return {};

  const prevId = sequence[index - 1];
  const nextId = sequence[index + 1];

  const prevLesson = prevId ? getLessonById(prevId) : null;
  const nextLesson = nextId ? getLessonById(nextId) : null;

  return {
    ...(prevLesson ? { prev: { id: prevLesson.id, title: prevLesson.title } } : {}),
    ...(nextLesson ? { next: { id: nextLesson.id, title: nextLesson.title } } : {}),
  };
}
