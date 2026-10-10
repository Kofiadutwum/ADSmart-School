import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformFooter } from "./platform-footer";
import { PlatformHeader } from "./platform-header";

describe("platform header and footer", () => {
  it("shows the platform's own logo", () => {
    const { container } = render(<PlatformHeader name="ADsmartschool" />);
    expect(screen.getByRole("link", { name: "ADsmartschool" })).toBeInTheDocument();
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^\/brand\/adsmartschool-logo/);
  });

  it("gives the platform's email and phone number", () => {
    render(<PlatformFooter name="ADsmartschool" email="hello@example.com" phone="+233545875881" phoneDisplay="054 587 5881" />);
    expect(screen.getByRole("link", { name: "054 587 5881" })).toHaveAttribute("href", "tel:+233545875881");
    expect(screen.getByRole("link", { name: "hello@example.com" })).toHaveAttribute("href", "mailto:hello@example.com");
  });
});
