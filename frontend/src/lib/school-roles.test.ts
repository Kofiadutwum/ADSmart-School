import { describe, expect, it } from "vitest";
import { canEdit, homeFor, navFor, rolesWithScreens, usesTabs } from "./school-roles";

describe("school roles", () => {
  it("sends each role to its own home", () => {
    expect(homeFor("Administrator")).toBe("/dashboard");
    expect(homeFor("Head Teacher")).toBe("/dashboard");
    expect(homeFor("Teacher")).toBe("/my-teaching");
    expect(homeFor("Early Years Caregiver")).toBe("/my-teaching");
    expect(homeFor("Proprietor")).toBe("/overview");
    expect(homeFor("Parent")).toBe("/family");
    expect(homeFor("Student")).toBe("/my-school");
    expect(homeFor("Accountant")).toBe("/account");
    expect(homeFor(null)).toBe("/account");
  });

  it("offers the switcher only between roles that have screens", () => {
    expect(rolesWithScreens(["Teacher", "Administrator", "Accountant"])).toEqual(["Administrator", "Teacher"]);
    expect(rolesWithScreens(["Accountant"])).toEqual([]);
    expect(rolesWithScreens(["Parent"])).toEqual(["Parent"]);
  });

  it("shows the pages of the active role, always with Account", () => {
    expect(navFor("Administrator").map((item) => item.label)).toEqual([
      "Dashboard",
      "Pupils",
      "Parents",
      "Enrolment",
      "School setup",
      "Staff",
      "Audit log",
      "Account",
    ]);
    expect(navFor("Head Teacher").map((item) => item.label)).toEqual([
      "Dashboard",
      "Pupils",
      "Parents",
      "School setup",
      "Staff",
      "Audit log",
      "Account",
    ]);
    expect(navFor("Teacher").map((item) => item.label)).toEqual(["My classes", "Account"]);
    expect(navFor("Proprietor").map((item) => item.label)).toEqual(["Overview", "Account"]);
    expect(navFor("Parent").map((item) => item.label)).toEqual(["Home", "My wards", "Consent", "Account"]);
    expect(navFor("Student").map((item) => item.label)).toEqual(["My school", "Account"]);
    expect(navFor(null).map((item) => item.label)).toEqual(["Account"]);
  });

  it("gives parents a bottom tab bar on phones", () => {
    expect(usesTabs("Parent")).toBe(true);
    expect(usesTabs("Administrator")).toBe(false);
  });

  it("lets only the Administrator change things", () => {
    expect(canEdit("Administrator")).toBe(true);
    expect(canEdit("Head Teacher")).toBe(false);
  });
});
