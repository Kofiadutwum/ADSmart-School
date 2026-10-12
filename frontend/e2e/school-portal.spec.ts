import { expect, test } from "@playwright/test";
import accounts from "./accounts.json";
import { confirmWithTextedCode, e164, expectAccessibleInBothThemes, mainNav, openHydrated, signIn } from "./helpers";

type Project = keyof typeof accounts.staff;

test("an Administrator sets up the school and its staff, and the Head Teacher reads it", async ({ page }, testInfo) => {
  const project = testInfo.project.name as Project;
  // Each project gets its own school year, so the two runs never share terms or classes.
  const start = project === "phone" ? 2030 : 2032;
  const yearName = `${start}/${start + 1}`;
  const teacher = `Abena ${project === "phone" ? "Phone" : "Desktop"}`;
  const subject = `Mathematics ${project}`;

  await openHydrated(page, "/sign-in");
  await signIn(page, "Staff", accounts.staff[project], accounts.password);
  await confirmWithTextedCode(page, e164(accounts.phones.staff[project]));
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Go-live checklist" })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  // Years and terms, reached through the navigation (the menu on phones).
  await (await mainNav(page)).getByRole("link", { name: "School setup" }).click();
  await page.getByRole("navigation", { name: "School setup" }).getByRole("link", { name: "Years and terms" }).click();
  await page.getByRole("button", { name: "Add a year" }).click();
  await page.getByLabel(/^name/i).fill(yearName);
  await page.getByLabel(/^first day/i).fill(`${start}-09-01`);
  await page.getByLabel(/^last day/i).fill(`${start + 1}-07-31`);
  await page.getByRole("checkbox", { name: /current year/i }).check();
  await page.getByRole("button", { name: "Save year" }).click();
  const year = page.getByRole("article", { name: yearName });
  await expect(year.getByText("Current year")).toBeVisible();
  await year.getByRole("button", { name: "Add a term" }).click();
  await year.getByLabel(/^first day/i).fill(`${start}-09-08`);
  await year.getByLabel(/^last day/i).fill(`${start}-12-17`);
  await year.getByRole("button", { name: "Save term" }).click();
  await expect(year.getByText("Term 1", { exact: true })).toBeVisible();

  // A day of the calendar becomes a holiday.
  await openHydrated(page, `/setup/calendar?month=${start}-10`);
  await page.getByRole("button", { name: /15 October: School open/ }).click();
  const day = page.getByRole("dialog");
  await day.getByRole("radio", { name: "Holiday" }).check();
  await day.getByLabel(/^note/i).fill("Sports day");
  await day.getByRole("button", { name: "Save day" }).click();
  await expect(page.getByRole("button", { name: /15 October: Holiday, Sports day/ })).toBeVisible();

  await openHydrated(page, "/setup/subjects");
  const newSubject = page.getByRole("form", { name: "Add a subject" });
  await newSubject.getByLabel(/^name/i).fill(subject);
  await newSubject.getByLabel(/^code/i).fill(project === "phone" ? "MATHP" : "MATHD");
  await newSubject.getByRole("checkbox", { name: "Basic 1–3" }).check();
  await newSubject.getByRole("button", { name: "Add subject" }).click();
  await expect(page.getByRole("article", { name: subject })).toBeVisible();

  await openHydrated(page, "/setup/classes");
  await page.getByLabel(/^year group/i).selectOption({ label: "Basic 1" });
  await page.getByLabel(/^stream/i).fill("A");
  await page.getByRole("button", { name: "Add class" }).click();
  await expect(page.getByRole("article", { name: "Basic 1A" })).toBeVisible();

  // A new teacher, with a one-time password to hand over.
  await openHydrated(page, "/staff");
  await page.getByRole("button", { name: "Add a member of staff" }).click();
  const newStaff = page.getByRole("form", { name: "Add a member of staff" });
  await newStaff.getByLabel(/^first name/i).fill("Abena");
  await newStaff.getByLabel(/^surname/i).fill(teacher.split(" ")[1]);
  await newStaff.getByLabel(/^username/i).fill(`e2e-teacher-${project}`);
  await newStaff.getByRole("checkbox", { name: "Teacher", exact: true }).check();
  await newStaff.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("one-time-password")).toBeVisible();
  await expect(page.getByRole("link", { name: teacher })).toBeVisible();

  await openHydrated(page, "/setup/classes");
  const basic1 = page.getByRole("article", { name: "Basic 1A" });
  await basic1.getByLabel("Class teacher, Term 1").selectOption({ label: teacher });
  await expect(basic1.getByRole("status")).toHaveText("Saved.");

  await openHydrated(page, "/setup/teaching");
  const assign = page.getByRole("form", { name: "Assign teaching" });
  await assign.getByLabel(/^teacher/i).selectOption({ label: teacher });
  await assign.getByLabel(/^class/i).selectOption({ label: "Basic 1A" });
  await assign.getByLabel(/^subject/i).selectOption({ label: subject });
  await assign.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByRole("cell", { name: subject, exact: true })).toBeVisible();

  await openHydrated(page, "/audit");
  await expect(page.getByRole("cell", { name: /^Calendar day/ }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /^Teaching/ }).first()).toBeVisible();

  // The Head Teacher sees the same school, with nothing to change.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await openHydrated(page, "/sign-in");
  await signIn(page, "Staff", accounts.head_teachers[project], accounts.password);
  await confirmWithTextedCode(page, e164(accounts.phones.head_teachers[project]));
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await openHydrated(page, "/staff");
  await expect(page.getByRole("link", { name: teacher })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a member of staff" })).toHaveCount(0);
  await openHydrated(page, "/setup/years");
  await expect(page.getByRole("article", { name: yearName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a year" })).toHaveCount(0);
});
