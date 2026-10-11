import { describe, expect, it, vi } from "vitest";
import { parseInline, parseRichText } from "./rich-text";

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

  it("reads quotes and this site's own photos", () => {
    expect(parseRichText("> Every child counts.\n> Every day.\n\n![Pupils reading](/media/a.webp)")).toEqual([
      { type: "quote", text: "Every child counts. Every day." },
      { type: "image", alt: "Pupils reading", src: "/media/a.webp" },
    ]);
  });

  it("accepts photos from the media service the site is set up with", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_ORIGIN", "https://res.cloudinary.com/demo");
    expect(parseRichText("![Hall](https://res.cloudinary.com/demo/image/upload/hall.webp)")).toEqual([
      { type: "image", alt: "Hall", src: "https://res.cloudinary.com/demo/image/upload/hall.webp" },
    ]);
    expect(parseRichText("![x](https://res.cloudinary.com/demoevil/a.webp)")[0].type).toBe("paragraph");
    vi.unstubAllEnvs();
  });

  it("keeps photos from other sites as plain text", () => {
    expect(parseRichText("![x](https://other.example/a.png)")).toEqual([
      { type: "paragraph", text: "![x](https://other.example/a.png)" },
    ]);
  });

  it("copes with Windows line endings and empty input", () => {
    expect(parseRichText("One\r\n\r\nTwo")).toHaveLength(2);
    expect(parseRichText("  \n\n ")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("reads bold words and safe links", () => {
    expect(parseInline("Read **this** at [our site](https://example.com) or [call us](tel:+233200000000).")).toEqual([
      { type: "text", text: "Read " },
      { type: "bold", text: "this" },
      { type: "text", text: " at " },
      { type: "link", text: "our site", href: "https://example.com" },
      { type: "text", text: " or " },
      { type: "link", text: "call us", href: "tel:+233200000000" },
      { type: "text", text: "." },
    ]);
  });

  it("keeps unsafe links as plain text", () => {
    for (const source of ["[click](javascript:alert(1))", "[x](//other.example)", "[x](data:text/html,hi)"]) {
      expect(parseInline(source)).toEqual([{ type: "text", text: source }]);
    }
  });

  it("allows links within this website", () => {
    expect(parseInline("[Prices](/#prices)")).toEqual([{ type: "link", text: "Prices", href: "/#prices" }]);
  });
});
