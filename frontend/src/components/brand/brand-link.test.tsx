import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLink } from "./brand-link";

describe("BrandLink", () => {
  it("links home with the school name as its accessible name", () => {
    render(<BrandLink name="AD Smart School" />);
    const link = screen.getByRole("link", { name: "AD Smart School" });
    expect(link).toHaveAttribute("href", "/");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
