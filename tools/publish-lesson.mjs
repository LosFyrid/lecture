import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const backupContentRoot = path.join(repoRoot, '.backup', 'content');
const contentRoot = path.join(repoRoot, 'content');
const publishedTrackPath = path.join(contentRoot, 'tracks', 'published.yaml');

function usage(exitCode = 1) {
  const msg = `Usage:
  node tools/publish-lesson.mjs <path-to-lesson-yaml> [--no-build]

Examples:
  node tools/publish-lesson.mjs .backup/content/lessons/intro.yaml
  node tools/publish-lesson.mjs .backup/content/2-dev-blogs/lessons/devblog-2026-02-26-you-dont-know-what-your-agent-will-do-until-its.yaml
`;
  console.error(msg);
  process.exit(exitCode);
}

function stripQuotes(s) {
  const t = String(s ?? '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function isInside(childAbs, parentAbs) {
  const rel = path.relative(parentAbs, childAbs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readLessonMeta(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  let id = null;
  let title = null;

  for (const line of raw.split(/\r?\n/)) {
    if (!id) {
      const m = line.match(/^id:\s*(.+)\s*$/);
      if (m) id = stripQuotes(m[1]);
    }
    if (!title) {
      const m = line.match(/^title:\s*(.+)\s*$/);
      if (m) title = stripQuotes(m[1]);
    }
    if (id && title) break;
  }

  if (!id) {
    throw new Error(`Cannot find "id:" in lesson YAML: ${filePath}`);
  }
  return { id, title };
}

function renderPublishedTrackYaml(lessonRefs) {
  if (!Array.isArray(lessonRefs) || lessonRefs.length === 0) {
    throw new Error('renderPublishedTrackYaml requires at least 1 lesson');
  }

  const lines = [];
  lines.push('id: published');
  lines.push('title: 已校对内容');
  lines.push('description: "逐课发布：每校对一个 lesson 就把它加入这个 track。"');
  lines.push('modules:');
  lines.push('  - id: main');
  lines.push('    title: 已发布');
  lines.push('    lessons:');
  for (const ref of lessonRefs) {
    lines.push(`      - ${ref}`);
  }
  lines.push('');
  return lines.join('\n');
}

function parseLessonRefsFromPublishedTrackYaml(raw) {
  // Very small, format-aware parser for the track file we generate.
  // If you hand-edit the file into a different structure, this may fail fast.
  const lines = raw.split(/\r?\n/);
  const idLine = lines.find((l) => l.trim() === 'id: published');
  if (!idLine) {
    throw new Error('Refusing to edit track: content/tracks/published.yaml does not look like an auto-managed published track');
  }

  const lessonsIdx = lines.findIndex((l) => l.trim() === 'lessons:');
  if (lessonsIdx === -1) {
    throw new Error('Cannot find lessons: in published track YAML');
  }

  const baseIndent = lines[lessonsIdx].match(/^\s*/)?.[0]?.length ?? 0;
  const itemIndent = baseIndent + 2;
  const itemPrefix = ' '.repeat(itemIndent) + '- ';

  const refs = [];
  for (let i = lessonsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(itemPrefix)) {
      const v = line.slice(itemPrefix.length).trim();
      if (v) refs.push(v);
      continue;
    }

    // Stop when indentation drops (next key) or at end.
    const indent = line.match(/^\s*/)?.[0]?.length ?? 0;
    if (line.trim() !== '' && indent <= baseIndent) break;
  }

  return refs;
}

async function main() {
  const args = process.argv.slice(2);
  const noBuild = args.includes('--no-build');
  const positional = args.filter((a) => !a.startsWith('--'));
  const inputPath = positional[0];

  if (!inputPath) usage(1);

  const srcAbs = path.resolve(repoRoot, inputPath);
  if (!(await exists(srcAbs))) {
    throw new Error(`File not found: ${inputPath}`);
  }
  if (!srcAbs.toLowerCase().endsWith('.yaml') && !srcAbs.toLowerCase().endsWith('.yml')) {
    throw new Error(`Expected a .yaml/.yml file, got: ${inputPath}`);
  }

  let destAbs;
  if (isInside(srcAbs, backupContentRoot)) {
    const rel = path.relative(backupContentRoot, srcAbs);
    destAbs = path.join(contentRoot, rel);
  } else if (isInside(srcAbs, contentRoot) || srcAbs === contentRoot) {
    destAbs = srcAbs;
  } else {
    throw new Error(`Input file must be under .backup/content/ or content/: ${inputPath}`);
  }

  if (!destAbs.includes(`${path.sep}lessons${path.sep}`)) {
    throw new Error(`Refusing to publish: expected lesson YAML under a lessons/ directory, got: ${inputPath}`);
  }

  await fs.mkdir(path.dirname(destAbs), { recursive: true });
  if (srcAbs !== destAbs) {
    await fs.copyFile(srcAbs, destAbs);
  }

  const meta = await readLessonMeta(destAbs);
  const lessonRef = meta.id;

  let lessonRefs = [];
  if (await exists(publishedTrackPath)) {
    const raw = await fs.readFile(publishedTrackPath, 'utf8');
    lessonRefs = parseLessonRefsFromPublishedTrackYaml(raw);
  }

  if (!lessonRefs.includes(lessonRef)) {
    lessonRefs.push(lessonRef);
    const out = renderPublishedTrackYaml(lessonRefs);
    await fs.mkdir(path.dirname(publishedTrackPath), { recursive: true });
    await fs.writeFile(publishedTrackPath, out, 'utf8');
  }

  console.log(`Published lesson: ${lessonRef}${meta.title ? ` (${meta.title})` : ''}`);
  console.log(`- Lesson YAML: ${path.relative(repoRoot, destAbs)}`);
  console.log(`- Track YAML:  ${path.relative(repoRoot, publishedTrackPath)}`);

  if (!noBuild) {
    const res = spawnSync('node', ['web/scripts/build-content.mjs'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      process.exit(res.status ?? 1);
    }
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
