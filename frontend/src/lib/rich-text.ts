/** The plain-text format the admin writes in (FORMAT_HELP and ARTICLE_FORMAT_HELP in the
 * backend). Nothing here is ever treated as HTML: unsafe links and other sites' photos stay text. */
export type RichBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "image"; alt: string; src: string };

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(href) || (href.startsWith("/") && !href.startsWith("//"));
}

/** This site's photos: local media, or the media service it is set up with (Plan 6A). */
function isOwnPhoto(src: string): boolean {
  if (src.includes("..")) return false;
  const service = process.env.NEXT_PUBLIC_MEDIA_ORIGIN?.replace(/\/*$/, "/");
  return src.startsWith("/media/") || Boolean(service?.startsWith("https://") && src.startsWith(service));
}

export function parseRichText(source: string): RichBlock[] {
  return source
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): RichBlock => {
      if (chunk.startsWith("## ")) return { type: "heading", text: chunk.slice(3).trim() };
      const lines = chunk.split("\n").map((line) => line.trim());
      if (lines.every((line) => line.startsWith("- "))) {
        return { type: "list", items: lines.map((line) => line.slice(2).trim()) };
      }
      if (lines.every((line) => line.startsWith(">"))) {
        return { type: "quote", text: lines.map((line) => line.replace(/^>\s?/, "")).join(" ") };
      }
      const image = chunk.match(IMAGE);
      if (image && isOwnPhoto(image[2])) return { type: "image", alt: image[1], src: image[2] };
      return { type: "paragraph", text: lines.join(" ") };
    });
}

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const add = (part: Inline) => {
    const last = parts.at(-1);
    if (part.type === "text" && last?.type === "text") last.text += part.text;
    else if (part.type !== "text" || part.text) parts.push(part);
  };
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    add({ type: "text", text: text.slice(at, match.index) });
    if (match[1] !== undefined) add({ type: "bold", text: match[1] });
    else if (isSafeHref(match[3])) add({ type: "link", text: match[2], href: match[3] });
    else add({ type: "text", text: match[0] });
    at = match.index + match[0].length;
  }
  add({ type: "text", text: text.slice(at) });
  return parts;
}

const plainInline = (text: string) => parseInline(text).map((part) => part.text).join("");

/** The words alone, e.g. for search engines' structured data. */
export function plainText(source: string): string {
  return parseRichText(source)
    .map((block) => {
      if (block.type === "list") return block.items.map(plainInline).join("; ");
      if (block.type === "image") return block.alt;
      return plainInline(block.text);
    })
    .join(" ");
}
