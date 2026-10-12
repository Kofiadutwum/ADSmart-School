import { describe, expect, it } from "vitest";
import { canEdit, homeFor, navFor, rolesWithScreens } from "./school-roles";

describe("school roles", () => {
  it("sends each role to its own home", () => {
    expect(homeFor("Administrator")).toBe("/dashboard");
    expect(homeFor("Head Teacher")).toBe("/dashboard");
    expect(homeFor("Teacher")).toBe("/my-teaching");
    expect(homeFor("Early Years Caregiver")).toBe("/my-teaching");
    expect(homeFor("Accountant")).toBe("/account");
    expect(homeFor(null)).toBe("/account");
  });

  it("offers the switcher only between roles that have screens", () => {
    expect(rolesWithScreens(["Teacher", "Administrator", "Accountant"])).toEqual(["Administrator", "Teacher"]);
    expect(rolesWithScreens(["Accountant"])).toEqual([]);
  });

  it("shows the pages of the active role, always with Account", () => {
    expect(navFor("Administrator").map((item) => item.label)).toEqual([
      "Dashboard",
      "School setup",
      "Staff",
      "Audit log",
      "Account",
    ]);
    expect(navFor("Teacher").map((item) => item.label)).toEqual(["My teaching", "Account"]);
    expect(navFor(null).map((item) => item.label)).toEqual(["Account"]);
  });

  it("lets only the Administrator change things", () => {
    expect(canEdit("Administrator")).toBe(true);
    expect(canEdit("Head Teacher")).toBe(false);
  });
});
