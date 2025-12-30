import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webRoot = path.resolve(__dirname, '..');
const nodeModules = path.join(webRoot, 'node_modules');
const publicDir = path.join(webRoot, 'public');
const targetDir = path.join(publicDir, 'pdfjs');

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyFileOrDie(source, dest) {
  if (!(await exists(source))) {
    throw new Error(`pdf.js asset not found: ${source}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
}

async function copyDirIfExists(source, dest) {
  if (!(await exists(source))) return false;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(source, dest, { recursive: true });
  return true;
}

async function main() {
  const pdfjsDist = path.join(nodeModules, 'pdfjs-dist');

  const pdfMin = path.join(pdfjsDist, 'build', 'pdf.min.mjs');
  const pdfWorkerMin = path.join(pdfjsDist, 'build', 'pdf.worker.min.mjs');
  const cmaps = path.join(pdfjsDist, 'cmaps');
  const standardFonts = path.join(pdfjsDist, 'standard_fonts');
  const imageDecoders = path.join(pdfjsDist, 'image_decoders');
  const iccs = path.join(pdfjsDist, 'iccs');
  const wasm = path.join(pdfjsDist, 'wasm');

  await fs.mkdir(targetDir, { recursive: true });

  await copyFileOrDie(pdfMin, path.join(targetDir, 'pdf.min.mjs'));
  await copyFileOrDie(pdfWorkerMin, path.join(targetDir, 'pdf.worker.min.mjs'));

  const copiedCmaps = await copyDirIfExists(cmaps, path.join(targetDir, 'cmaps'));
  const copiedFonts = await copyDirIfExists(standardFonts, path.join(targetDir, 'standard_fonts'));
  const copiedImageDecoders = await copyDirIfExists(imageDecoders, path.join(targetDir, 'image_decoders'));
  const copiedIccs = await copyDirIfExists(iccs, path.join(targetDir, 'iccs'));
  const copiedWasm = await copyDirIfExists(wasm, path.join(targetDir, 'wasm'));

  console.log(
    [
      `Copied pdf.js assets -> ${path.relative(webRoot, targetDir)}`,
      `- pdf.min.mjs`,
      `- pdf.worker.min.mjs`,
      copiedCmaps ? `- cmaps/` : `- cmaps/ (skipped)`,
      copiedFonts ? `- standard_fonts/` : `- standard_fonts/ (skipped)`,
      copiedImageDecoders ? `- image_decoders/` : `- image_decoders/ (skipped)`,
      copiedIccs ? `- iccs/` : `- iccs/ (skipped)`,
      copiedWasm ? `- wasm/` : `- wasm/ (skipped)`,
    ].join('\n'),
  );
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
