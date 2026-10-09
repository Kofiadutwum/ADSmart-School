import { cn } from "@/lib/cn";
import { parseRichText } from "@/lib/rich-text";

type Props = { text: string; headingLevel?: 2 | 3; className?: string };

export function RichText({ text, headingLevel = 2, className }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("space-y-4", className)}>
      {parseRichText(text).map((block, index) => {
        if (block.type === "heading") {
          return (
            <Heading key={index} className="pt-2 text-xl font-semibold">
              {block.text}
            </Heading>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-6 marker:text-indigo">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}
