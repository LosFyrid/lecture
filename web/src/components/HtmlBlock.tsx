import sanitizeHtml from "sanitize-html";

type HtmlBlockProps = {
  html: string;
  className?: string;
};

const SAFE_STYLE_VALUE = /^(?!.*(?:url\(|expression\(|javascript:)).+$/i;

const htmlSanitizeOptions: sanitizeHtml.IOptions = {
  disallowedTagsMode: "discard",
  allowedTags: [
    "a",
    "blockquote",
    "br",
    "code",
    "details",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "kbd",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "span",
    "strong",
    "summary",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
  ],
  allowedAttributes: {
    "*": ["class", "id", "title", "style"],
    a: ["href", "name", "target", "rel", "title", "class", "id", "style"],
    img: [
      "src",
      "alt",
      "title",
      "width",
      "height",
      "loading",
      "decoding",
      "referrerpolicy",
      "class",
      "id",
      "style",
    ],
    details: ["open", "class", "id", "style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
    a: ["http", "https", "mailto"],
  },
  allowedStyles: {
    "*": {
      background: [SAFE_STYLE_VALUE],
      "background-color": [SAFE_STYLE_VALUE],
      border: [SAFE_STYLE_VALUE],
      "border-color": [SAFE_STYLE_VALUE],
      "border-radius": [SAFE_STYLE_VALUE],
      "border-style": [SAFE_STYLE_VALUE],
      "border-width": [SAFE_STYLE_VALUE],
      color: [SAFE_STYLE_VALUE],
      display: [SAFE_STYLE_VALUE],
      "font-size": [SAFE_STYLE_VALUE],
      "font-weight": [SAFE_STYLE_VALUE],
      height: [SAFE_STYLE_VALUE],
      "line-height": [SAFE_STYLE_VALUE],
      margin: [SAFE_STYLE_VALUE],
      "margin-bottom": [SAFE_STYLE_VALUE],
      "margin-left": [SAFE_STYLE_VALUE],
      "margin-right": [SAFE_STYLE_VALUE],
      "margin-top": [SAFE_STYLE_VALUE],
      "max-width": [SAFE_STYLE_VALUE],
      padding: [SAFE_STYLE_VALUE],
      "padding-bottom": [SAFE_STYLE_VALUE],
      "padding-left": [SAFE_STYLE_VALUE],
      "padding-right": [SAFE_STYLE_VALUE],
      "padding-top": [SAFE_STYLE_VALUE],
      "text-align": [SAFE_STYLE_VALUE],
      width: [SAFE_STYLE_VALUE],
    },
  },
  transformTags: {
    a: (tagName, attribs) => {
      const target = attribs.target === "_blank" ? "_blank" : undefined;
      const rel = target ? "noreferrer" : attribs.rel;
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(target ? { target } : {}),
          ...(rel ? { rel } : {}),
        },
      };
    },
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        loading: attribs.loading ?? "lazy",
        decoding: attribs.decoding ?? "async",
      },
    }),
  },
};

export function HtmlBlock(props: HtmlBlockProps) {
  const safeHtml = sanitizeHtml(props.html, htmlSanitizeOptions);
  const className = [
    "space-y-4 text-sm leading-7 text-zinc-700 dark:text-zinc-300",
    "[&_a]:underline [&_a]:decoration-zinc-300 [&_a]:underline-offset-4 hover:[&_a]:decoration-zinc-500 dark:[&_a]:decoration-zinc-600 dark:hover:[&_a]:decoration-zinc-400",
    "[&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.95em] [&_code]:text-zinc-800 dark:[&_code]:bg-white/10 dark:[&_code]:text-zinc-200",
    "[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-6 [&_pre]:text-zinc-100 dark:[&_pre]:bg-black/60",
    "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
    "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
    "[&_li]:marker:text-zinc-400",
    "[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-black/10 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-black/10 [&_td]:px-2 [&_td]:py-1 dark:[&_th]:border-white/15 dark:[&_td]:border-white/15",
    "[&_blockquote]:border-l-2 [&_blockquote]:border-black/10 [&_blockquote]:pl-4 [&_blockquote]:text-zinc-600 dark:[&_blockquote]:border-white/15 dark:[&_blockquote]:text-zinc-300",
    props.className ?? "",
  ]
    .join(" ")
    .trim();

  return <div className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}

