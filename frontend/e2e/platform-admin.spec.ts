import { expect, test } from "@playwright/test";
import accounts from "./accounts.json";
import { ADMIN, confirmWithTextedCode, e164, expectAccessibleInBothThemes, openHydrated, signIn } from "./helpers";

type Project = keyof typeof accounts.platform_admins;
const ADMIN_MOBILE: Record<Project, string> = { phone: "024 555 0101", desktop: "024 555 0102" };
const NEW_PASSWORD = "a fresh school passphrase";

test("the platform team adds a school, and its Administrator signs in", async ({ page }, testInfo) => {
  const project = testInfo.project.name as Project;
  const name = `E2E School ${project}`;
  const site = `http://e2e-school-${project}.localhost:3100`;

  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(`${ADMIN}/sign-in?next=%2Fschools`);
  await signIn(page, null, accounts.platform_admins[project], accounts.password);
  await confirmWithTextedCode(page, e164(accounts.phones.platform_admins[project]));
  await expect(page.getByRole("heading", { name: "Schools" })).toBeVisible();
  await expect(page.getByRole("link", { name: /AD Smart School/ })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.getByRole("link", { name: "Add a school" }).click();
  await page.getByLabel(/^school name/i).fill(name);
  await expect(page.getByLabel(/^web address/i)).toHaveValue(`e2e-school-${project}`);
  await page.getByLabel(/^town/i).fill("Ejisu");
  await page.getByLabel(/^region/i).fill("Ashanti Region");
  await page.getByLabel(/^school phone/i).fill("020 111 2233");
  await page.getByLabel(/^school email/i).fill(`office@${project}.example`);
  await page.getByLabel(/^first name/i).fill("Abena");
  await page.getByLabel(/^surname/i).fill("Darko");
  await page.getByLabel(/^username/i).fill("head");
  await page.getByLabel(/^mobile number/i).fill(ADMIN_MOBILE[project]);
  await page.getByRole("button", { name: "Add the school" }).click();
  await expect(page.getByRole("heading", { name: `${name} is set up` })).toBeVisible();
  const password = (await page.getByTestId("one-time-password").textContent())?.trim() ?? "";

  await page.goto(`${site}/`);
  await expect(page).toHaveTitle(new RegExp(name));

  await openHydrated(page, `${site}/sign-in`);
  await signIn(page, "Staff", "head", password);
  await confirmWithTextedCode(page, e164(ADMIN_MOBILE[project]));
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(/choose your own password/i)).toBeVisible();
  await page.getByLabel(/current password/i).fill(password);
  await page.getByLabel(/^new password/i).fill(NEW_PASSWORD);
  await page.getByLabel(/type it again/i).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/password changed/i)).toBeVisible();
});
