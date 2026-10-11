import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { WebsiteTabs } from "./website-tabs";

describe("WebsiteTabs", () => {
  it("marks the part of the website being edited", () => {
    vi.mocked(usePathname).mockReturnValue("/platform-admin/website/gallery");
    render(<WebsiteTabs />);
    expect(screen.getByRole("link", { name: "Gallery" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Articles and tips" })).not.toHaveAttribute("aria-current");
  });
});
