import { describe, expect, it } from "vitest";
import { ADMIN_NAV, CONTENT, OWNER, SUPPORT, canUse, firstAllowedPath } from "./platform-roles";

describe("platform team roles", () => {
  it("lets the Owner use everything and others only their own areas", () => {
    expect(canUse({ roles: [OWNER] }, [CONTENT])).toBe(true);
    expect(canUse({ roles: [CONTENT] }, [CONTENT])).toBe(true);
    expect(canUse({ roles: [CONTENT] }, [SUPPORT])).toBe(false);
    expect(canUse({ roles: [] }, undefined)).toBe(true);
  });

  it("opens each person on the first page their roles allow", () => {
    expect(firstAllowedPath({ roles: [SUPPORT] })).toBe("/schools");
    expect(firstAllowedPath({ roles: [CONTENT] })).toBe("/website");
    expect(firstAllowedPath({ roles: [OWNER] })).toBe("/schools");
    expect(firstAllowedPath({ roles: [] })).toBe("/account");
  });

  it("keeps Account open to everyone", () => {
    expect(ADMIN_NAV.at(-1)).toEqual({ href: "/account", label: "Account" });
  });
});
