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
    expect(homeFor("Accountant")).toBe("/money");
    expect(homeFor("Front Desk Officer")).toBe("/gate");
    expect(homeFor("School Nurse")).toBe("/health");
    expect(homeFor("Bookshop Keeper")).toBe("/shop");
    expect(homeFor("Canteen Officer")).toBe("/daily-charges");
    expect(homeFor("Transport Officer")).toBe("/transport");
    expect(homeFor(null)).toBe("/account");
  });

  it("offers the switcher only between roles that have screens", () => {
    expect(rolesWithScreens(["Teacher", "Administrator", "Accountant"])).toEqual(["Administrator", "Accountant", "Teacher"]);
    expect(rolesWithScreens([])).toEqual([]);
    expect(rolesWithScreens(["Parent"])).toEqual(["Parent"]);
  });

  it("shows the pages of the active role, with Account for everyone but parents", () => {
    const labels = (role: string | null) => navFor(role).map((item) => item.label);
    expect(labels("Administrator")).toEqual([
      "Dashboard",
      "Pupils",
      "Parents",
      "Enrolment",
      "Staff",
      "Import",
      "Leave",
      "Attendance",
      "Results",
      "Lesson notes",
      "Timetable",
      "Resources",
      "Daily care",
      "Money",
      "Daily charges",
      "Billing",
      "Gate",
      "Health",
      "Transport",
      "Shop",
      "Messages",
      "Website",
      "School setup",
      "Support",
      "Year end",
      "Reports",
      "Audit log",
      "Account",
    ]);
    expect(labels("Teacher")).toEqual([
      "My classes",
      "Leave",
      "Attendance",
      "Marks",
      "Lesson notes",
      "Timetable",
      "Resources",
      "Quizzes",
      "Daily care",
      "Daily charges",
      "Account",
    ]);
    expect(labels("Accountant")).toEqual(["Leave", "Money", "Daily charges", "Billing", "Shop", "Reports", "Account"]);
    expect(labels("Parent")).toEqual(["Home", "My wards", "Payments", "Consent", "More"]);
    expect(labels("Student")).toEqual(["My school", "Results", "Quizzes", "Timetable", "Resources", "Account"]);
    expect(labels(null)).toEqual(["Account"]);
  });

  it("puts staff pages under headings", () => {
    expect(navFor("Administrator").find((item) => item.label === "Pupils")?.group).toBe("People");
    expect(navFor("Administrator").find((item) => item.label === "Dashboard")?.group).toBeUndefined();
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
