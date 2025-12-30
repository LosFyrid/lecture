import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
  return `archive/${host}/${leaf || "page"}.v${ts}.pdf`;
}

function buildMinioEndpointUrl(minioEndpoint, useSsl) {
  if (minioEndpoint.includes("://")) return minioEndpoint;
  return `${useSsl ? "https" : "http"}://${minioEndpoint}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    // eslint-disable-next-line no-console
    console.log(
      [
        "Usage:",
        "  node archive-url-to-pdf.mjs --url <url> [--out <objectKey>] [--bucket <bucket>] [--save-local <file.pdf>]",
        "",
        "Env:",
        "  MINIO_ENDPOINT, MINIO_USE_SSL, MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY, MINIO_BUCKET, MINIO_REGION",
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
  console.log(`Archiving URL -> PDF\n- url: ${args.url}\n- bucket: ${bucket}\n- key: ${outKey}`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(args.url, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "screen" });

    const pdfBuffer = await page.pdf({
      printBackground: true,
      format: "A4",
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });

    const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    if (args.saveLocal) {
      const abs = path.resolve(args.saveLocal);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, pdfBuffer);
      // eslint-disable-next-line no-console
      console.log(`Saved local PDF: ${abs}`);
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
        Body: pdfBuffer,
        ContentType: "application/pdf",
        Metadata: {
          "x-lecture-source-url": args.url,
          "x-lecture-sha256": sha256,
          "x-lecture-captured-at": new Date().toISOString(),
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
    console.log(`archivePdf:\n  assetKey: ${outKey}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
