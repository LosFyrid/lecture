"use client";

type PdfViewerProps = {
  fileUrl: string;
  className?: string;
  title?: string;
};

export function PdfViewer(props: PdfViewerProps) {
  const src = `/pdfjs/viewer.html?file=${encodeURIComponent(props.fileUrl)}`;

  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950",
        props.className ?? "",
      ].join(" ")}
    >
      <iframe
        title={props.title ?? "PDF"}
        src={src}
        className="h-[75vh] w-full"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
