"use client";

type HtmlViewerProps = {
  fileUrl: string;
  className?: string;
  title?: string;
};

export function HtmlViewer(props: HtmlViewerProps) {
  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950",
        props.className ?? "",
      ].join(" ")}
    >
      <iframe
        title={props.title ?? "HTML"}
        src={props.fileUrl}
        className="h-[75vh] w-full"
        referrerPolicy="no-referrer"
        // Archived HTML is untrusted; keep it isolated and script-disabled by default.
        sandbox="allow-popups"
      />
    </div>
  );
}

