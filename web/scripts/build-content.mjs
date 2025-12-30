import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..', '..');
const contentDir = path.join(repoRoot, 'content');
const tracksDir = path.join(contentDir, 'tracks');
const lessonsDir = path.join(contentDir, 'lessons');
const outDir = path.join(repoRoot, 'web', 'src', 'generated');
const outFile = path.join(outDir, 'content.json');

const UrlModeSchema = z.enum(['open', 'embed']).catch('open');
const BlockLayoutSchema = z.enum(['card', 'inline']).catch('card');

const LessonItemPdfSchema = z.object({
  type: z.literal('pdf'),
  title: z.string().trim().min(1).optional(),
  assetKey: z.string().trim().min(1),
  note: z.string().optional(),
});

const LessonItemUrlSchema = z.object({
  type: z.literal('url'),
  title: z.string().trim().min(1),
  url: z.string().trim().url(),
  mode: UrlModeSchema.optional(),
  note: z.string().optional(),
  archivePdf: z
    .object({
      assetKey: z.string().trim().min(1),
      title: z.string().trim().min(1).optional(),
    })
    .optional(),
  archiveHtml: z
    .object({
      assetKey: z.string().trim().min(1),
      title: z.string().trim().min(1).optional(),
    })
    .optional(),
});

const LessonItemMarkdownSchema = z.object({
  type: z.literal('md'),
  title: z.string().trim().min(1).optional(),
  body: z.string().min(1),
  note: z.string().optional(),
  layout: BlockLayoutSchema.optional(),
});

const LessonItemHtmlSchema = z.object({
  type: z.literal('html'),
  title: z.string().trim().min(1).optional(),
  body: z.string().min(1),
  note: z.string().optional(),
  layout: BlockLayoutSchema.optional(),
});

const LessonItemSchema = z.discriminatedUnion('type', [
  LessonItemPdfSchema,
  LessonItemUrlSchema,
  LessonItemMarkdownSchema,
  LessonItemHtmlSchema,
]);

const LessonSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().optional(),
  body: z.string().optional(),
  items: z.array(LessonItemSchema).min(1),
});

const TrackModuleSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  lessons: z.array(z.string().trim().min(1)).min(1),
});

const TrackSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  modules: z.array(TrackModuleSchema).min(1),
});

async function readYamlFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseYaml(raw);
}

function listYamlFiles(dir) {
  return fs.readdir(dir).then((entries) =>
    entries
      .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
      .map((name) => path.join(dir, name)),
  );
}

function normalizeLesson(lesson) {
  return {
    ...lesson,
    items: lesson.items.map((item) => {
      if (item.type === 'url') {
        return {
          ...item,
          mode: item.mode ?? 'open',
        };
      }
      if (item.type === 'md' || item.type === 'html') {
        return {
          ...item,
          layout: item.layout ?? 'card',
        };
      }
      return item;
    }),
  };
}

function die(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const [trackFiles, lessonFiles] = await Promise.all([listYamlFiles(tracksDir), listYamlFiles(lessonsDir)]);

  const lessons = {};
  for (const filePath of lessonFiles) {
    const data = await readYamlFile(filePath);
    const parsed = LessonSchema.safeParse(data);
    if (!parsed.success) {
      die(`Invalid lesson YAML: ${filePath}\n${parsed.error}`);
    }
    const normalized = normalizeLesson(parsed.data);
    if (lessons[normalized.id]) {
      die(`Duplicate lesson id "${normalized.id}" (file: ${filePath})`);
    }
    lessons[normalized.id] = normalized;
  }

  const tracks = {};
  for (const filePath of trackFiles) {
    const data = await readYamlFile(filePath);
    const parsed = TrackSchema.safeParse(data);
    if (!parsed.success) {
      die(`Invalid track YAML: ${filePath}\n${parsed.error}`);
    }
    if (tracks[parsed.data.id]) {
      die(`Duplicate track id "${parsed.data.id}" (file: ${filePath})`);
    }

    for (const mod of parsed.data.modules) {
      for (const lessonId of mod.lessons) {
        if (!lessons[lessonId]) {
          die(`Track "${parsed.data.id}" references missing lesson "${lessonId}" (file: ${filePath})`);
        }
      }
    }

    tracks[parsed.data.id] = parsed.data;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    tracks,
    lessons,
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${Object.keys(tracks).length} track(s) and ${Object.keys(lessons).length} lesson(s) to ${outFile}`);
}

main().catch((err) => {
  die(err?.stack ?? String(err));
});
