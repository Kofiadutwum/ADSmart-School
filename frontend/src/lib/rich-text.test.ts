import { describe, expect, it } from "vitest";
import { parseRichText } from "./rich-text";

describe("parseRichText", () => {
  it("splits paragraphs on blank lines and joins wrapped lines", () => {
    expect(parseRichText("First line\ncontinues.\n\nSecond.")).toEqual([
      { type: "paragraph", text: "First line continues." },
      { type: "paragraph", text: "Second." },
    ]);
  });

  it("reads headings and lists", () => {
    expect(parseRichText("## Your rights\n\n- Ask for a copy\n- Correct it")).toEqual([
      { type: "heading", text: "Your rights" },
      { type: "list", items: ["Ask for a copy", "Correct it"] },
    ]);
  });

  it("copes with Windows line endings and empty input", () => {
    expect(parseRichText("One\r\n\r\nTwo")).toHaveLength(2);
    expect(parseRichText("  \n\n ")).toEqual([]);
  });
});
