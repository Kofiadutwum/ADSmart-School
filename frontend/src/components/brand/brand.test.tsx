import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandStyle } from "@/components/site/brand-style";
import { BrandLink } from "./brand-link";
import { initials, SchoolMark } from "./school-mark";

const LOGO = { src: "/media/logo-480w.webp", srcset: "/media/logo-480w.webp 480w", width: 480, height: 480, alt: "x" };

describe("SchoolMark", () => {
  it("shows the uploaded logo, or the school's initials", () => {
    const { container, rerender } = render(<SchoolMark name="AD Smart School" logo={LOGO} />);
    expect(container.querySelector("img")).toHaveAttribute("src", LOGO.src);

    rerender(<SchoolMark name="Bright Future Academy" logo={null} />);
    expect(screen.getByText("BF")).toBeInTheDocument();
  });

  it.each([
    ["Bright Future Academy", "BF"],
    ["St. Mary's School", "SM"],
    ["Ɔdɔ Montessori", "ƆM"],
    ["SchoolSite", "S"],
  ])("takes initials from %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("BrandLink", () => {
  it("links home with the school's name", () => {
    render(<BrandLink name="Bright Future Academy" />);
    expect(screen.getByRole("link", { name: /Bright Future Academy/ })).toHaveAttribute("href", "/");
  });
});

describe("BrandStyle", () => {
  it("prints nothing for the platform palette", () => {
    const { container } = render(<BrandStyle brand={{ light: {}, dark: {} }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("overrides the palette in both themes and drops anything unsafe", () => {
    const { container } = render(
      <BrandStyle
        brand={{
          light: { "--btn-primary": "#7a1f1f", "--mesh-glow": "rgb(255 209 102 / 0.35)", "--x": "red;}</style>" },
          dark: { "--accent-indigo": "#c58a8a" },
        }}
      />,
    );
    const css = container.querySelector("style")?.innerHTML ?? "";
    expect(css).toContain(':root:not([data-theme="dark"]){--btn-primary:#7a1f1f;--mesh-glow:rgb(255 209 102 / 0.35)}');
    expect(css).toContain('[data-theme="dark"]{--accent-indigo:#c58a8a}');
    expect(css).toContain("@media (prefers-color-scheme: dark){:root:not([data-theme]){--accent-indigo:#c58a8a}}");
    expect(css).not.toContain("</style>");
  });
});
