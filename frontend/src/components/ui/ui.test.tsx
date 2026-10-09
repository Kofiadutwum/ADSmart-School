import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ButtonLink } from "./button";
import { CategoryBadge } from "./category-badge";
import { ResponsiveImage } from "./responsive-image";
import { RichText } from "./rich-text";

const image = { src: "/media/a-960w.webp", srcset: "/media/a-480w.webp 480w", width: 960, height: 640, alt: "Pupils reading" };

describe("ui primitives", () => {
  it("renders internal and phone links as anchors with large tap targets", () => {
    render(
      <>
        <ButtonLink href="/admissions">Apply</ButtonLink>
        <ButtonLink href="tel:+233545875881" variant="outline">Call</ButtonLink>
      </>,
    );
    expect(screen.getByRole("link", { name: "Apply" })).toHaveAttribute("href", "/admissions");
    expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+233545875881");
    expect(screen.getByRole("link", { name: "Apply" }).className).toContain("min-h-11");
  });

  it("lazy-loads images unless they are the priority image", () => {
    const { rerender } = render(<ResponsiveImage image={image} sizes="100vw" />);
    expect(screen.getByRole("img", { name: "Pupils reading" })).toHaveAttribute("loading", "lazy");

    rerender(<ResponsiveImage image={image} sizes="100vw" priority />);
    const img = screen.getByRole("img", { name: "Pupils reading" });
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
    expect(img).toHaveAttribute("width", "960");
  });

  it("labels categories in words, not colour alone", () => {
    render(<CategoryBadge category="jhs" />);
    expect(screen.getByText("JHS")).toBeInTheDocument();
  });

  it("renders rich text blocks with the requested heading level", () => {
    render(<RichText text={"## Who we are\n\nA school.\n\n- One\n- Two"} headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "Who we are" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
