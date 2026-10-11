"use client";

import type { RefObject } from "react";

type Wrap = { before: string; after?: string; block?: boolean };
type Insert = Wrap & { label: string };

const BUTTONS: Insert[] = [
  { label: "Heading", before: "## ", block: true },
  { label: "List", before: "- ", block: true },
  { label: "Bold", before: "**", after: "**" },
  { label: "Link", before: "[", after: "](https://)" },
  { label: "Quote", before: "> ", block: true },
];

/** Wraps the selection (or adds at the cursor) and returns the new text and cursor place. */
export function insertAt(value: string, start: number, end: number, { before, after = "", block = false }: Wrap) {
  const lead = block && start > 0 && value[start - 1] !== "\n" ? "\n\n" : "";
  const text = value.slice(0, start) + lead + before + value.slice(start, end) + after + value.slice(end);
  return { text, cursor: end + lead.length + before.length + after.length };
}

type Props = { target: RefObject<HTMLTextAreaElement | null>; onChange: (text: string) => void };

/** Buttons that write the house text format, so nobody has to remember it. */
export function TextToolbar({ target, onChange }: Props) {
  function apply(insert: Insert) {
    const area = target.current;
    if (!area) return;
    const { text, cursor } = insertAt(area.value, area.selectionStart, area.selectionEnd, insert);
    onChange(text);
    queueMicrotask(() => {
      area.focus();
      area.setSelectionRange(cursor, cursor);
    });
  }
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-2">
      {BUTTONS.map((insert) => (
        <button
          key={insert.label}
          type="button"
          onClick={() => apply(insert)}
          className="press inline-flex min-h-11 cursor-pointer items-center rounded-control border border-line px-3 text-sm font-semibold hover:bg-ink/5"
        >
          {insert.label}
        </button>
      ))}
    </div>
  );
}
