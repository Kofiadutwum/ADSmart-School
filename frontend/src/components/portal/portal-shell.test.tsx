import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "@/test/http";
import { AuthProvider } from "./auth-provider";
import { PortalShell } from "./portal-shell";

const ME = {
  id: 1, kind: "platform", username: "ops", display_name: "Kojo Ops", roles: ["Platform Admin"],
  must_change_password: false, has_authenticator: true, school: null,
};
const NAV = [
  { href: "/schools", label: "Schools" },
  { href: "/leads", label: "Leads" },
];

describe("PortalShell", () => {
  it("marks the page you are on in the navigation", async () => {
    vi.mocked(usePathname).mockReturnValue("/platform-admin/schools/adsmart");
    mockApi([["GET", "/api/auth/me", 200, ME]]);
    render(
      <AuthProvider>
        <PortalShell name="SchoolSite admin" nav={NAV}>
          <p>page</p>
        </PortalShell>
      </AuthProvider>,
    );
    expect(await screen.findByRole("link", { name: "Schools" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Leads" })).not.toHaveAttribute("aria-current");
  });
});
