import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLink } from "./brand-link";

describe("BrandLink", () => {
  it("links home with the school name as its accessible name", () => {
    render(<BrandLink name="AD Smart School" />);
    const link = screen.getByRole("link", { name: "AD Smart School" });
    expect(link).toHaveAttribute("href", "/");
    // Without a logo the mark is a monogram, hidden so the name is read once.
    expect(link.querySelector("[aria-hidden='true']")).toHaveTextContent("AS");
  });
});
