import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import type { SchoolInfo } from "@/lib/types";
import { Header } from "./header";
import { MobileMenu } from "./mobile-menu";
import { isActive } from "./nav";
import { OfflineBar } from "./offline-bar";
import { schoolJsonLd } from "./school-json-ld";
import { ThemeToggle } from "./theme-toggle";

describe("OfflineBar", () => {
  it("stays hidden online and appears while offline", () => {
    const { rerender } = render(<OfflineBar />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    rerender(<OfflineBar key="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
    spy.mockRestore();
  });
});

describe("isActive", () => {
  it("matches a section and its children only", () => {
    expect(isActive("/news", "/news")).toBe(true);
    expect(isActive("/news/welcome", "/news")).toBe(true);
    expect(isActive("/newsletter", "/news")).toBe(false);
  });
});

describe("ThemeToggle", () => {
  it("starts on System and switches to Dark", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const group = screen.getByRole("radiogroup", { name: "Colour theme" });
    expect(within(group).getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(group).getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("adss-theme")).toBe("dark");
    expect(within(group).getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });

  it("moves the choice with arrow keys", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("radio", { name: "Light" }));

    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveFocus();
  });
});

describe("Header", () => {
  it("marks the current section and hides sign-in until the portal exists", () => {
    vi.mocked(usePathname).mockReturnValue("/admissions");
    render(<Header schoolName="AD Smart School" />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Admissions" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("shows the portal sign-in when configured", () => {
    render(<Header schoolName="AD Smart School" portalUrl="/sign-in" />);
    expect(screen.getAllByRole("link", { name: /sign in/i })[0]).toHaveAttribute("href", "/sign-in");
  });
});

describe("MobileMenu", () => {
  it("opens a menu with navigation and a labelled theme switch, and closes on navigation", async () => {
    const user = userEvent.setup();
    render(<MobileMenu schoolName="AD Smart School" />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(within(dialog).getByRole("radio", { name: "Dark" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("link", { name: "News" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("schoolJsonLd", () => {
  it("describes the school for search engines", () => {
    const school = {
      name: "AD Smart School", founded_year: 2001, phone: "+233545875881", email: "a@b.c",
      town: "Kronom, Kumasi", region: "Ashanti Region",
    } as SchoolInfo;

    expect(schoolJsonLd(school, "https://example.test")).toMatchObject({
      "@type": "School",
      name: "AD Smart School",
      foundingDate: "2001",
      telephone: "+233545875881",
      address: { addressLocality: "Kronom, Kumasi", addressCountry: "GH" },
    });
  });
});
