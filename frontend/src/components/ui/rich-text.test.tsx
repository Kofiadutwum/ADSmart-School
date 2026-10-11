import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "./rich-text";

describe("RichText", () => {
  it("shows bold words, safe links, quotes and photos", () => {
    render(<RichText text={"Read **this** on [our site](https://example.com).\n\n> Every child counts.\n\n![Pupils reading](/media/a.webp)"} />);
    expect(screen.getByText("this").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "our site" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("Every child counts.").closest("blockquote")).not.toBeNull();
    const photo = screen.getByRole("img", { name: "Pupils reading" });
    expect(photo).toHaveAttribute("src", "/media/a.webp");
    expect(photo).toHaveAttribute("loading", "lazy");
  });

  it("never turns written HTML or unsafe links into page content", () => {
    const { container } = render(<RichText text={'<script>alert(1)</script> [click](javascript:alert(1))'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("<script>alert(1)</script>");
  });
});
