import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { parseInline, parseRichText } from "@/lib/rich-text";

type Props = { text: string; headingLevel?: 2 | 3; className?: string };

function Inlines({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, index) => {
        if (part.type === "bold") return <strong key={index}>{part.text}</strong>;
        if (part.type === "link") {
          const external = /^https?:/i.test(part.href);
          return (
            <a key={index} href={part.href} className="link" rel={external ? "noopener noreferrer" : undefined}>
              {part.text}
            </a>
          );
        }
        return <Fragment key={index}>{part.text}</Fragment>;
      })}
    </>
  );
}

export function RichText({ text, headingLevel = 2, className }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("space-y-4", className)}>
      {parseRichText(text).map((block, index) => {
        if (block.type === "heading") {
          return (
            <Heading key={index} className="pt-2 text-xl font-semibold">
              <Inlines text={block.text} />
            </Heading>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-6 marker:text-indigo">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inlines text={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={index} className="border-l-4 border-indigo/40 pl-4 text-lg italic">
              <p>
                <Inlines text={block.text} />
              </p>
            </blockquote>
          );
        }
        if (block.type === "image") {
          return (
            <figure key={index}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a WebP rendition from Django */}
              <img src={block.src} alt={block.alt} loading="lazy" decoding="async" className="h-auto w-full rounded-card" />
            </figure>
          );
        }
        return (
          <p key={index}>
            <Inlines text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
