"use client";

import { useMemo, useState } from "react";

import { HtmlViewer } from "@/components/HtmlViewer";
import { PdfViewer } from "@/components/PdfViewer";
import { toAssetUrl } from "@/lib/assets";
import type { UrlItem } from "@/lib/content";

type UrlView = "embed" | "archiveHtml" | "archivePdf";

function initialViewFor(item: UrlItem): UrlView | null {
  if (item.mode !== "embed") return null;
  return "embed";
}

function viewLabel(view: UrlView): string {
  switch (view) {
    case "embed":
      return "网页嵌入";
    case "archiveHtml":
      return "归档 HTML";
    case "archivePdf":
      return "归档 PDF";
  }
}

export function UrlItemCard({ item }: { item: UrlItem }) {
  const initialView = useMemo(() => initialViewFor(item), [item]);
  const [view, setView] = useState<UrlView | null>(initialView);

  const hasArchivePdf = !!item.archivePdf?.assetKey;
  const hasArchiveHtml = !!item.archiveHtml?.assetKey;
  const canEmbed = item.mode === "embed";

  const availableViews: UrlView[] = useMemo(() => {
    if (!canEmbed) return [];
    const views: UrlView[] = ["embed"];
    if (hasArchiveHtml) views.push("archiveHtml");
    if (hasArchivePdf) views.push("archivePdf");
    return views;
  }, [canEmbed, hasArchiveHtml, hasArchivePdf]);

  const activeView = canEmbed ? (view ?? initialView ?? "embed") : null;

  const tabClass = (active: boolean) =>
    [
      "rounded-full px-3 py-1.5 text-sm transition",
      active
        ? "bg-black/5 font-medium text-zinc-900 dark:bg-white/10 dark:text-white"
        : "text-zinc-600 hover:bg-black/5 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white",
    ].join(" ");

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight">{item.title}</h2>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-zinc-950 dark:hover:text-white"
            >
              {item.url}
            </a>
          </div>
          {item.note ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{item.note}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {availableViews.length >= 2 ? (
            <div className="flex items-center rounded-full border border-black/10 bg-white/60 p-0.5 dark:border-white/15 dark:bg-white/5">
              {availableViews.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={tabClass(activeView === v)}
                >
                  {viewLabel(v)}
                </button>
              ))}
            </div>
          ) : null}

          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            站外打开
          </a>
        </div>
      </div>

      {canEmbed && activeView === "embed" ? (
        <div className="mt-4 space-y-2">
          <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            <iframe
              title={item.title}
              src={item.url}
              className="h-[70vh] w-full"
              referrerPolicy="no-referrer"
              // Most sites block embedding; keep this as a best-effort view only.
              sandbox="allow-forms allow-popups allow-scripts"
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            若显示为空白或提示被阻止，通常是原网站禁止被嵌入（CSP/X-Frame-Options）。
            更稳定的做法是：归档为 HTML（同域名渲染）或归档为 PDF。
          </p>
        </div>
      ) : null}

      {canEmbed && activeView === "archiveHtml" && item.archiveHtml ? (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
              {item.archiveHtml.title ?? "归档版本（HTML）"}
            </h3>
            <a
              href={toAssetUrl(item.archiveHtml.assetKey)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              新标签打开
            </a>
          </div>
          <HtmlViewer
            fileUrl={toAssetUrl(item.archiveHtml.assetKey)}
            title={item.archiveHtml.title ?? "归档 HTML"}
          />
        </div>
      ) : null}

      {canEmbed && activeView === "archivePdf" && item.archivePdf ? (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
              {item.archivePdf.title ?? "归档版本（PDF）"}
            </h3>
            <a
              href={toAssetUrl(item.archivePdf.assetKey)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              新标签打开
            </a>
          </div>
          <PdfViewer
            fileUrl={toAssetUrl(item.archivePdf.assetKey)}
            title={item.archivePdf.title ?? "归档 PDF"}
          />
        </div>
      ) : null}
    </div>
  );
}
