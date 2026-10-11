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

  it("links to articles only once there are some", () => {
    const { rerender } = render(<PlatformHeader name="ADsmartschool" />);
    expect(screen.queryByRole("link", { name: "Articles" })).not.toBeInTheDocument();
    rerender(<PlatformHeader name="ADsmartschool" hasArticles />);
    expect(screen.getByRole("link", { name: "Articles" })).toHaveAttribute("href", "/articles");
  });

  it("links to articles, questions and the WhatsApp Channel when there are any", () => {
    render(
      <PlatformFooter
        name="ADsmartschool"
        email=""
        phone=""
        phoneDisplay=""
        hasArticles
        hasFaqs
        whatsapp="https://whatsapp.com/channel/0029VaExample"
      />,
    );
    expect(screen.getByRole("link", { name: "Articles and tips" })).toHaveAttribute("href", "/articles");
    expect(screen.getByRole("link", { name: "Questions" })).toHaveAttribute("href", "/#faq");
    const whatsapp = screen.getByRole("link", { name: /follow on whatsapp/i });
    expect(whatsapp).toHaveAttribute("href", "https://whatsapp.com/channel/0029VaExample");
    expect(whatsapp).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("gives the platform's email and phone number", () => {
    render(<PlatformFooter name="ADsmartschool" email="hello@example.com" phone="+233545875881" phoneDisplay="054 587 5881" />);
    expect(screen.getByRole("link", { name: "054 587 5881" })).toHaveAttribute("href", "tel:+233545875881");
    expect(screen.getByRole("link", { name: "hello@example.com" })).toHaveAttribute("href", "mailto:hello@example.com");
  });
});
