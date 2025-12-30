import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  children: string;
};

export function Markdown({ children }: MarkdownProps) {
  return (
    <div
      className={[
        "space-y-4 text-sm leading-7 text-zinc-700 dark:text-zinc-300",
        "[&_a]:underline [&_a]:decoration-zinc-300 [&_a]:underline-offset-4 hover:[&_a]:decoration-zinc-500 dark:[&_a]:decoration-zinc-600 dark:hover:[&_a]:decoration-zinc-400",
        "[&_code]:font-mono",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-black/5 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.95em] [&_:not(pre)>code]:text-zinc-800 dark:[&_:not(pre)>code]:bg-white/10 dark:[&_:not(pre)>code]:text-zinc-200",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-6 [&_pre]:text-zinc-100 dark:[&_pre]:bg-black/60",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
        "[&_li]:marker:text-zinc-400",
        "[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-black/10 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-black/10 [&_td]:px-2 [&_td]:py-1 dark:[&_th]:border-white/15 dark:[&_td]:border-white/15",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-black/10 [&_blockquote]:pl-4 [&_blockquote]:text-zinc-600 dark:[&_blockquote]:border-white/15 dark:[&_blockquote]:text-zinc-300",
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
