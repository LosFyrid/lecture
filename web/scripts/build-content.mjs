import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..', '..');
const contentDir = path.join(repoRoot, 'content');
const outDir = path.join(repoRoot, 'web', 'src', 'generated');
const outFile = path.join(outDir, 'content.json');
const catalogFile = path.join(outDir, 'content.catalog.json');

// Reserved namespace token used for "root content/" when addressing lessons by path (e.g. "__root__/intro").
// This must not clash with real directories under content/.
const ROOT_NAMESPACE = '__root__';

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
  // Lesson id is meant to be "short" (referenced by tracks as a plain string).
  // Namespacing is handled in track references (e.g. "ai/v2/intro"), not in lesson.id itself.
  id: z
    .string()
    .trim()
    .min(1)
    .refine((s) => !s.includes('/'), {
      message: 'lesson.id must not include "/" (use namespaced refs in tracks instead)',
    }),
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
  // Track id is part of the URL (/tracks/:trackId), so it must be a single path segment.
  id: z
    .string()
    .trim()
    .min(1)
    .refine((s) => !s.includes('/'), {
      message: 'track.id must not include "/"',
    }),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  modules: z.array(TrackModuleSchema).min(1),
});

async function readYamlFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseYaml(raw);
}

function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

function isYamlFilename(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.yaml') || lower.endsWith('.yml');
}

async function listYamlFilesRecursive(dir) {
  const out = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const ent of entries) {
      // Skip dotfiles / dot-directories (e.g. ".DS_Store").
      if (ent.name.startsWith('.')) continue;

      const abs = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (ent.isFile() && isYamlFilename(ent.name)) {
        out.push(abs);
      }
    }
  }

  await walk(dir);
  out.sort();
  return out;
}

// Find directories named `dirName` anywhere under `rootDir`, but do NOT descend into a matched directory
// for further discovery. (We still recursively scan files *within* each matched directory separately.)
async function findDirsNamed(rootDir, dirName) {
  const matches = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith('.')) continue;

      const abs = path.join(current, ent.name);
      if (ent.name === dirName) {
        matches.push(abs);
        continue;
      }
      await walk(abs);
    }
  }

  await walk(rootDir);
  matches.sort();
  return matches;
}

function getNamespaceTokenForContentRootDir(contentRootDir) {
  // The "namespace" is the parent directory of a `lessons/` or `tracks/` directory, relative to content/.
  // - content/lessons        -> __root__
  // - content/ai/lessons     -> ai
  // - content/ai/v2/lessons  -> ai/v2
  const parentDir = path.dirname(contentRootDir);
  const rel = toPosixPath(path.relative(contentDir, parentDir));
  if (rel === '' || rel === '.') return ROOT_NAMESPACE;

  // Prevent ambiguity between real directories and the reserved root alias.
  if (rel === ROOT_NAMESPACE) {
    die(
      `Reserved namespace "${ROOT_NAMESPACE}" cannot be used as a real directory under content/ (found: ${parentDir})`,
    );
  }

  // This shouldn't happen, but keep the error readable if contentRootDir is outside contentDir.
  if (rel.startsWith('..')) {
    die(`Internal error: content root dir is outside content/: ${contentRootDir}`);
  }

  return rel;
}

function parseLessonRef(ref) {
  const raw = String(ref ?? '').trim();
  if (!raw) {
    return { kind: 'invalid', raw, error: 'empty reference' };
  }

  const idx = raw.lastIndexOf('/');
  if (idx === -1) {
    return { kind: 'id', raw, id: raw };
  }

  const namespaceToken = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (!namespaceToken || !id) {
    return { kind: 'invalid', raw, error: 'invalid namespaced reference (expected "namespace/id")' };
  }
  return { kind: 'namespaced', raw, namespaceToken, id };
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

function relToContent(filePath) {
  return toPosixPath(path.relative(contentDir, filePath));
}

async function main() {
  const [lessonRoots, trackRoots] = await Promise.all([
    findDirsNamed(contentDir, 'lessons'),
    findDirsNamed(contentDir, 'tracks'),
  ]);

  if (lessonRoots.length === 0) {
    die(`No "lessons/" directories found under ${contentDir}`);
  }
  if (trackRoots.length === 0) {
    die(`No "tracks/" directories found under ${contentDir}`);
  }

  const lessonMetas = [];
  for (const lessonsRootDir of lessonRoots) {
    const namespaceToken = getNamespaceTokenForContentRootDir(lessonsRootDir);
    const lessonFiles = await listYamlFilesRecursive(lessonsRootDir);
    for (const filePath of lessonFiles) {
      const data = await readYamlFile(filePath);
      const parsed = LessonSchema.safeParse(data);
      if (!parsed.success) {
        die(`Invalid lesson YAML: ${filePath}\n${parsed.error}`);
      }
      const normalized = normalizeLesson(parsed.data);
      lessonMetas.push({
        filePath,
        namespaceToken,
        lesson: normalized,
      });
    }
  }

  const lessonsById = new Map();
  const lessonsByQualifiedKey = new Map(); // key: `${namespaceToken}/${lessonId}`

  for (const meta of lessonMetas) {
    const id = meta.lesson.id;
    const qualifiedKey = `${meta.namespaceToken}/${id}`;

    const prev = lessonsByQualifiedKey.get(qualifiedKey);
    if (prev) {
      die(
        [
          `Duplicate lesson id "${id}" within namespace "${meta.namespaceToken}" (cannot disambiguate):`,
          `- ${qualifiedKey} from ${prev.filePath}`,
          `- ${qualifiedKey} from ${meta.filePath}`,
        ].join('\n'),
      );
    }
    lessonsByQualifiedKey.set(qualifiedKey, meta);

    const list = lessonsById.get(id) ?? [];
    list.push(meta);
    lessonsById.set(id, list);
  }

  // Canonical lesson key strategy:
  // - If a lesson id is globally unique, its key is just the short id (e.g. "intro").
  // - If multiple lessons share the same id, each lesson key becomes namespaced (e.g. "ai/v2/intro",
  //   with root expressed as "__root__/intro").
  //
  // Track YAML may still reference lessons by either short id or "namespace/id";
  // we canonicalize track->lesson refs during compilation.
  const lessons = {};
  const duplicateLessonIds = [];
  for (const [id, metas] of lessonsById.entries()) {
    if (metas.length <= 1) continue;
    duplicateLessonIds.push({
      id,
      candidates: metas
        .map((m) => ({
          key: `${m.namespaceToken}/${id}`,
          title: m.lesson.title,
          file: relToContent(m.filePath),
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    });
  }

  for (const meta of lessonMetas) {
    const id = meta.lesson.id;
    const group = lessonsById.get(id) ?? [];
    meta.canonicalKey = group.length === 1 ? id : `${meta.namespaceToken}/${id}`;

    if (lessons[meta.canonicalKey]) {
      die(`Internal error: duplicate canonical lesson key "${meta.canonicalKey}" (file: ${meta.filePath})`);
    }
    lessons[meta.canonicalKey] = meta.lesson;
  }

  const tracks = {};
  const trackCatalog = [];

  for (const tracksRootDir of trackRoots) {
    const namespaceToken = getNamespaceTokenForContentRootDir(tracksRootDir);
    const trackFiles = await listYamlFilesRecursive(tracksRootDir);

    for (const filePath of trackFiles) {
      const data = await readYamlFile(filePath);
      const parsed = TrackSchema.safeParse(data);
      if (!parsed.success) {
        die(`Invalid track YAML: ${filePath}\n${parsed.error}`);
      }

      if (tracks[parsed.data.id]) {
        die(`Duplicate track id "${parsed.data.id}" (file: ${filePath})`);
      }

      const resolvedRefs = [];
      const normalizedModules = [];
      for (const mod of parsed.data.modules) {
        const normalizedLessons = [];

        for (const lessonRef of mod.lessons) {
          const parsedRef = parseLessonRef(lessonRef);
          if (parsedRef.kind === 'invalid') {
            die(
              `Track "${parsed.data.id}" has invalid lesson reference "${lessonRef}" (file: ${filePath}): ${parsedRef.error}`,
            );
          }

          if (parsedRef.kind === 'id') {
            const candidates = lessonsById.get(parsedRef.id);
            if (!candidates || candidates.length === 0) {
              die(`Track "${parsed.data.id}" references missing lesson "${parsedRef.id}" (file: ${filePath})`);
            }
            if (candidates.length > 1) {
              const candidatesSorted = candidates
                .map((m) => ({
                  key: `${m.namespaceToken}/${parsedRef.id}`,
                  file: relToContent(m.filePath),
                }))
                .sort((a, b) => a.key.localeCompare(b.key));

              const lines = candidatesSorted.map((c) => `- ${c.key} (${c.file})`);
              die(
                [
                  `Track "${parsed.data.id}" references ambiguous lesson "${parsedRef.id}" (file: ${filePath})`,
                  `Found multiple lessons with the same id. Use a namespaced ref (e.g. "${candidatesSorted[0].key}") to disambiguate:`,
                  ...lines,
                ].join('\n'),
              );
            }

            const meta = candidates[0];
            const resolvedKey = meta.canonicalKey;
            normalizedLessons.push(resolvedKey);
            resolvedRefs.push({
              ref: parsedRef.raw,
              resolvedKey,
              lessonFile: relToContent(meta.filePath),
            });
            continue;
          }

          // namespaced ref
          const qualifiedKey = `${parsedRef.namespaceToken}/${parsedRef.id}`;
          const meta = lessonsByQualifiedKey.get(qualifiedKey);
          if (!meta) {
            die(`Track "${parsed.data.id}" references missing lesson "${qualifiedKey}" (file: ${filePath})`);
          }

          const resolvedKey = meta.canonicalKey;
          normalizedLessons.push(resolvedKey);
          resolvedRefs.push({
            ref: parsedRef.raw,
            resolvedKey,
            lessonFile: relToContent(meta.filePath),
          });
        }

        normalizedModules.push({
          ...mod,
          lessons: normalizedLessons,
        });
      }

      const normalizedTrack = {
        ...parsed.data,
        modules: normalizedModules,
      };

      tracks[normalizedTrack.id] = normalizedTrack;

      trackCatalog.push({
        id: parsed.data.id,
        title: parsed.data.title,
        namespace: namespaceToken,
        file: relToContent(filePath),
        modules: parsed.data.modules.map((m, idx) => ({
          id: m.id,
          title: m.title,
          lessons: m.lessons.slice(),
          normalizedLessons: normalizedModules[idx]?.lessons ?? [],
        })),
        resolvedLessonRefs: resolvedRefs,
      });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    tracks,
    lessons,
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(output, null, 2) + '\n', 'utf8');

  const catalog = {
    generatedAt: output.generatedAt,
    rootNamespaceToken: ROOT_NAMESPACE,
    lessonRoots: lessonRoots.map((dir) => ({
      namespace: getNamespaceTokenForContentRootDir(dir),
      dir: relToContent(dir),
    })),
    trackRoots: trackRoots.map((dir) => ({
      namespace: getNamespaceTokenForContentRootDir(dir),
      dir: relToContent(dir),
    })),
    lessons: lessonMetas
      .map((m) => ({
        id: m.lesson.id,
        title: m.lesson.title,
        namespace: m.namespaceToken,
        key: `${m.namespaceToken}/${m.lesson.id}`,
        canonicalKey: m.canonicalKey,
        file: relToContent(m.filePath),
        shortKey: (lessonsById.get(m.lesson.id)?.length ?? 0) === 1 ? m.lesson.id : null,
      }))
      .sort((a, b) => (a.id === b.id ? a.key.localeCompare(b.key) : a.id.localeCompare(b.id))),
    duplicateLessonIds: duplicateLessonIds.sort((a, b) => a.id.localeCompare(b.id)),
    tracks: trackCatalog.sort((a, b) => a.id.localeCompare(b.id)),
  };

  await fs.writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

  const uniqueLessons = lessonMetas.length;
  const shortLessonKeys = [...lessonsById.values()].filter((m) => m.length === 1).length;
  const namespacedLessonKeys = uniqueLessons - shortLessonKeys;
  console.log(
    `Wrote ${Object.keys(tracks).length} track(s), ${uniqueLessons} lesson(s) (${Object.keys(lessons).length} keys: ${shortLessonKeys} short + ${namespacedLessonKeys} namespaced) to ${outFile}`,
  );
  console.log(`Wrote catalog to ${catalogFile}`);
}

main().catch((err) => {
  die(err?.stack ?? String(err));
});
