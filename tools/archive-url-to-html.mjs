import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { load } from "cheerio";
import { chromium } from "playwright";

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function parseArgs(argv) {
  const args = { url: null, out: null, bucket: null, saveLocal: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--url" && next) {
      args.url = next;
      i += 1;
      continue;
    }
    if (a === "--out" && next) {
      args.out = next;
      i += 1;
      continue;
    }
    if (a === "--bucket" && next) {
      args.bucket = next;
      i += 1;
      continue;
    }
    if (a === "--save-local" && next) {
      args.saveLocal = next;
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      return { ...args, help: true };
    }
  }
  return args;
}

function sanitizeSegment(s) {
  return s
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/(^-+)|(-+$)/g, "");
}

function utcVersionStamp() {
  const d = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

function defaultObjectKeyForUrl(rawUrl) {
  const u = new URL(rawUrl);
  const host = sanitizeSegment(u.hostname);
  const pathname = sanitizeSegment(u.pathname.replaceAll("/", "-"));
  const ts = utcVersionStamp();
  const leaf = [host, pathname].filter(Boolean).join("-");
  return `archive/${host}/${leaf || "page"}.v${ts}.html`;
}

function buildMinioEndpointUrl(minioEndpoint, useSsl) {
  if (minioEndpoint.includes("://")) return minioEndpoint;
  return `${useSsl ? "https" : "http"}://${minioEndpoint}`;
}

function escapeHtmlAttr(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stripHash(u) {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString();
  } catch {
    return u;
  }
}

function guessContentTypeByExt(urlStr) {
  const p = (() => {
    try {
      return new URL(urlStr).pathname;
    } catch {
      return urlStr;
    }
  })();

  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case ".css":
      return "text/css";
    case ".js":
      return "text/javascript";
    case ".mjs":
      return "text/javascript";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    default:
      return "application/octet-stream";
  }
}

function normalizeContentType(contentType) {
  const raw = String(contentType ?? "").trim();
  if (!raw) return "";
  return raw.split(";")[0]?.trim() ?? "";
}

function toDataUri(bytes, contentType) {
  const ct = normalizeContentType(contentType) || "application/octet-stream";
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${ct};base64,${base64}`;
}

function resolveUrlMaybe(ref, baseUrl) {
  const raw = String(ref ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("blob:")) return null;
  if (raw.startsWith("javascript:")) return null;
  if (raw.startsWith("mailto:")) return null;
  if (raw.startsWith("tel:")) return null;
  if (raw.startsWith("#")) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

async function fetchBytes(urlStr, { cache, maxTotalBytes, maxSingleBytes, totalBytesRef }) {
  const key = stripHash(urlStr);
  const cached = cache.get(key);
  if (cached) return cached;
  if (totalBytesRef.value >= maxTotalBytes) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(urlStr, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "lecture-archiver/1.0",
        Accept: "*/*",
      },
    });
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    if (bytes.length <= 0) return null;
    if (bytes.length > maxSingleBytes) return null;
    if (bytes.length + totalBytesRef.value > maxTotalBytes) return null;

    const contentType =
      normalizeContentType(res.headers.get("content-type")) || guessContentTypeByExt(urlStr);

    const value = { bytes, contentType };
    cache.set(key, value);
    totalBytesRef.value += bytes.length;
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function inlineCss(css, baseUrl, { getResource, maxImportDepth = 3 }) {
  let out = String(css ?? "");

  // Inline @import recursively (best-effort).
  const importRe =
    /@import\s+(?:url\(\s*)?(?:'([^']+)'|"([^"]+)"|([^'")\s]+))\s*\)?\s*([^;]*);/gi;

  let depth = 0;
  while (depth < maxImportDepth) {
    const imports = Array.from(out.matchAll(importRe));
    if (imports.length === 0) break;

    for (const match of imports) {
      const full = match[0];
      const ref = match[1] ?? match[2] ?? match[3];
      const media = String(match[4] ?? "").trim();
      const abs = resolveUrlMaybe(ref, baseUrl);
      if (!abs) {
        out = out.replaceAll(full, "");
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const res = await getResource(abs, "text/css");
      if (!res) {
        out = out.replaceAll(full, "");
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const nested = await inlineCss(res.text, abs, { getResource, maxImportDepth: maxImportDepth - 1 });
      const replacement = media ? `@media ${media} {\n${nested}\n}\n` : `\n${nested}\n`;
      out = out.replaceAll(full, replacement);
    }

    depth += 1;
  }

  // Inline url(...) assets (images/fonts).
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  const matches = Array.from(out.matchAll(urlRe));
  for (const match of matches) {
    const full = match[0];
    const ref = match[2];
    const trimmed = String(ref ?? "").trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("#")) {
      continue;
    }

    const abs = resolveUrlMaybe(trimmed, baseUrl);
    if (!abs) {
      out = out.replaceAll(full, `url("")`);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const res = await getResource(abs);
    if (!res) {
      out = out.replaceAll(full, `url("")`);
      continue;
    }

    const dataUri = toDataUri(res.bytes, res.contentType);
    out = out.replaceAll(full, `url("${dataUri}")`);
  }

  return out;
}

function pickBestFromSrcset(srcset) {
  const raw = String(srcset ?? "").trim();
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const scored = parts
    .map((p) => {
      const segs = p.split(/\s+/).filter(Boolean);
      const url = segs[0];
      const desc = segs[1] ?? "";
      const num = parseFloat(desc.replace(/[^\d.]/g, ""));
      const score = Number.isFinite(num) ? num : 0;
      return { url, score };
    })
    .filter((x) => !!x.url);

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].url;
}

async function buildSelfContainedHtml(rawHtml, { sourceUrl, capturedAt, getResource }) {
  const $ = load(String(rawHtml ?? ""), { decodeEntities: false });

  // Remove CSP / XFO and other meta that breaks embedding/offline.
  $('meta[http-equiv="content-security-policy"]').remove();
  $('meta[http-equiv="x-frame-options"]').remove();
  $('meta[http-equiv="refresh"]').remove();
  $("base").remove();

  // Remove scripts (safety + determinism).
  $("script").remove();

  // Remove iframes/frames/objects which often cause external loads.
  $("iframe").remove();
  $("frame").remove();
  $("object").remove();
  $("embed").remove();

  // Process <link> tags:
  // - Inline stylesheets/preloaded styles
  // - Remove resource hints and everything else that could trigger external loads
  const links = $("link[href]").toArray();
  for (const el of links) {
    const href = $(el).attr("href");
    const relTokens = String($(el).attr("rel") ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const as = String($(el).attr("as") ?? "").toLowerCase();

    const isHint =
      relTokens.includes("preconnect") ||
      relTokens.includes("dns-prefetch") ||
      relTokens.includes("modulepreload");
    if (isHint) {
      $(el).remove();
      continue;
    }

    const isStylesheet =
      relTokens.includes("stylesheet") || (relTokens.includes("preload") && as === "style");
    if (!isStylesheet) {
      $(el).remove();
      continue;
    }

    if (!href || String(href).trim().startsWith("data:")) {
      // Already self-contained (or invalid); keep as-is.
      continue;
    }

    const abs = resolveUrlMaybe(href, sourceUrl);
    if (!abs) {
      $(el).remove();
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const res = await getResource(abs, "text/css");
    if (!res) {
      $(el).remove();
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const css = await inlineCss(res.text, abs, { getResource });
    const styleTag = `<style data-lecture-inline="stylesheet" data-lecture-source="${escapeHtmlAttr(abs)}">\n${css}\n</style>`;
    $(el).replaceWith(styleTag);
  }

  // Inline <style> blocks url(...) references.
  const styleTags = $("style").toArray();
  for (const el of styleTags) {
    const css = $(el).html() ?? "";
    // eslint-disable-next-line no-await-in-loop
    const inlined = await inlineCss(css, sourceUrl, { getResource });
    $(el).text(inlined);
  }

  // Inline img[src] (and neutralize srcset to avoid external loads).
  const images = $("img").toArray();
  for (const el of images) {
    const srcset = $(el).attr("srcset");
    const src = $(el).attr("src") ?? pickBestFromSrcset(srcset);
    if (!src) {
      $(el).removeAttr("srcset");
      $(el).removeAttr("sizes");
      continue;
    }
    const abs = resolveUrlMaybe(src, sourceUrl);
    if (!abs) {
      $(el).removeAttr("srcset");
      $(el).removeAttr("sizes");
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const res = await getResource(abs);
    if (!res) {
      $(el).removeAttr("src");
      $(el).removeAttr("srcset");
      $(el).removeAttr("sizes");
      continue;
    }

    $(el).attr("src", toDataUri(res.bytes, res.contentType));
    $(el).removeAttr("srcset");
    $(el).removeAttr("sizes");
  }

  // picture/source often relies on srcset; keep it simple: remove sources once img is inlined.
  $("picture source").remove();

  // Inline poster for videos (best-effort); drop video src to avoid huge downloads.
  const videos = $("video").toArray();
  for (const el of videos) {
    const poster = $(el).attr("poster");
    if (poster) {
      const abs = resolveUrlMaybe(poster, sourceUrl);
      if (abs) {
        // eslint-disable-next-line no-await-in-loop
        const res = await getResource(abs);
        if (res) $(el).attr("poster", toDataUri(res.bytes, res.contentType));
      }
    }
    $(el).removeAttr("src");
    $(el).find("source").remove();
  }

  // Inline url(...) inside style attributes.
  const styleAttrs = $("[style]").toArray();
  for (const el of styleAttrs) {
    const css = $(el).attr("style");
    if (!css || !css.includes("url(")) continue;
    // eslint-disable-next-line no-await-in-loop
    const inlined = await inlineCss(css, sourceUrl, { getResource, maxImportDepth: 0 });
    $(el).attr("style", inlined);
  }

  // Defensive cleanup: remove any leftover non-stylesheet links that might trigger fetches.
  $("link[href]").toArray().forEach((el) => {
    const relTokens = String($(el).attr("rel") ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!relTokens.includes("stylesheet")) $(el).remove();
  });

  const injection = [
    "",
    "<!-- lecture: archived html (self-contained) -->",
    `<meta name="x-lecture-source-url" content="${escapeHtmlAttr(sourceUrl)}">`,
    `<meta name="x-lecture-captured-at" content="${escapeHtmlAttr(capturedAt)}">`,
    "",
  ].join("\n");

  const head = $("head");
  if (head.length) {
    head.prepend(injection);
  } else {
    const html = $("html");
    if (html.length) {
      html.prepend(`<head>${injection}</head>`);
    } else {
      $.root().prepend(`<head>${injection}</head>`);
    }
  }

  let out = $.html();
  if (!/<!doctype/i.test(out)) {
    out = `<!doctype html>\n${out}`;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    // eslint-disable-next-line no-console
    console.log(
      [
        "Usage:",
        "  node archive-url-to-html.mjs --url <url> [--out <objectKey>] [--bucket <bucket>] [--save-local <file.html>]",
        "",
        "Env:",
        "  MINIO_ENDPOINT, MINIO_USE_SSL, MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY, MINIO_BUCKET, MINIO_REGION",
        "",
        "Notes:",
        "  This tool archives a page as a *self-contained* HTML (inlines CSS/images/fonts as data URIs) and removes scripts.",
      ].join("\n"),
    );
    process.exit(args.help ? 0 : 1);
  }

  const minioEndpoint = getEnv("MINIO_ENDPOINT");
  const minioUseSsl = (getEnv("MINIO_USE_SSL") ?? "true").toLowerCase() === "true";
  const accessKeyId = getEnv("MINIO_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("MINIO_SECRET_ACCESS_KEY");
  const region = getEnv("MINIO_REGION") ?? "us-east-1";
  const bucket = args.bucket ?? getEnv("MINIO_BUCKET");
  const outKey = args.out ?? defaultObjectKeyForUrl(args.url);

  if (!minioEndpoint) throw new Error("MINIO_ENDPOINT is required");
  if (!accessKeyId) throw new Error("MINIO_ACCESS_KEY_ID is required");
  if (!secretAccessKey) throw new Error("MINIO_SECRET_ACCESS_KEY is required");
  if (!bucket) throw new Error("MINIO_BUCKET (or --bucket) is required");

  const endpointUrl = buildMinioEndpointUrl(minioEndpoint, minioUseSsl);

  // eslint-disable-next-line no-console
  console.log(`Archiving URL -> HTML\n- url: ${args.url}\n- bucket: ${bucket}\n- key: ${outKey}`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    const MAX_TOTAL_EMBED_BYTES = 60 * 1024 * 1024;
    const MAX_SINGLE_EMBED_BYTES = 12 * 1024 * 1024;
    const totalBytesRef = { value: 0 };
    const resourceCache = new Map();

    // Capture resources as Playwright loads them, so we can reuse (cookies/headers/etc).
    page.on("response", async (resp) => {
      try {
        const req = resp.request();
        const type = req.resourceType();
        if (type !== "stylesheet" && type !== "image" && type !== "font") return;
        if (resp.status() < 200 || resp.status() >= 300) return;
        const url = stripHash(resp.url());
        if (!url || resourceCache.has(url)) return;
        if (totalBytesRef.value >= MAX_TOTAL_EMBED_BYTES) return;

        const bytes = await resp.body();
        if (!bytes || bytes.length <= 0) return;
        if (bytes.length > MAX_SINGLE_EMBED_BYTES) return;
        if (bytes.length + totalBytesRef.value > MAX_TOTAL_EMBED_BYTES) return;

        const headers = resp.headers();
        const contentType =
          normalizeContentType(headers["content-type"]) || guessContentTypeByExt(url);
        resourceCache.set(url, { bytes, contentType });
        totalBytesRef.value += bytes.length;
      } catch {
        // ignore capture failures
      }
    });

    const capturedAt = new Date().toISOString();
    try {
      await page.goto(args.url, { waitUntil: "networkidle", timeout: 60_000 });
    } catch {
      await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(1500);
    }

    // Try to trigger lazy-loaded images.
    try {
      await page.evaluate(async () => {
        const maxSteps = 20;
        const distance = 800;
        for (let i = 0; i < maxSteps; i += 1) {
          window.scrollBy(0, distance);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 200));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(800);
    } catch {
      // ignore
    }

    const rawHtml = await page.content();

    const getResource = async (urlStr, expectContentType) => {
      const abs = stripHash(urlStr);
      const cached = resourceCache.get(abs);
      if (cached) {
        if (expectContentType && !cached.contentType.includes(expectContentType.split(";")[0])) {
          // still usable; caller decides
        }
        if (expectContentType && expectContentType.startsWith("text/")) {
          return { ...cached, text: cached.bytes.toString("utf8") };
        }
        return cached;
      }

      const fetched = await fetchBytes(urlStr, {
        cache: resourceCache,
        maxTotalBytes: MAX_TOTAL_EMBED_BYTES,
        maxSingleBytes: MAX_SINGLE_EMBED_BYTES,
        totalBytesRef,
      });
      if (!fetched) return null;
      if (expectContentType && expectContentType.startsWith("text/")) {
        return { ...fetched, text: fetched.bytes.toString("utf8") };
      }
      return fetched;
    };

    const html = await buildSelfContainedHtml(rawHtml, {
      sourceUrl: args.url,
      capturedAt,
      getResource,
    });
    const htmlBytes = Buffer.from(html, "utf8");
    const sha256 = crypto.createHash("sha256").update(htmlBytes).digest("hex");

    if (args.saveLocal) {
      const abs = path.resolve(args.saveLocal);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, htmlBytes);
      // eslint-disable-next-line no-console
      console.log(`Saved local HTML: ${abs}`);
    }

    const s3 = new S3Client({
      region,
      endpoint: endpointUrl,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: outKey,
        Body: htmlBytes,
        ContentType: "text/html; charset=utf-8",
        Metadata: {
          "x-lecture-source-url": args.url,
          "x-lecture-sha256": sha256,
          "x-lecture-captured-at": capturedAt,
        },
      }),
    );

    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log("Upload OK.");
    // eslint-disable-next-line no-console
    console.log(`assetKey: ${outKey}`);
    // eslint-disable-next-line no-console
    console.log(`sha256:   ${sha256}`);
    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log("Lesson YAML snippet:");
    // eslint-disable-next-line no-console
    console.log(`archiveHtml:\n  assetKey: ${outKey}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
