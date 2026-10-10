import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import accounts from "./accounts.json";
import { ADMIN, expectAccessibleInBothThemes, openHydrated, setUpAuthenticator, signIn } from "./helpers";

type Project = keyof typeof accounts.staff;
const OUTBOX = path.resolve(process.cwd(), "../backend/e2e-sms.jsonl");
const OTHER_SCHOOL = "http://brightfuture.localhost:3100";

function lastCodeTo(e164: string): string {
  const messages = fs
    .readFileSync(OUTBOX, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { to: string; body: string });
  const message = messages.reverse().find((item) => item.to === e164);
  return message?.body.match(/\d{6}/)?.[0] ?? "";
}

/** The form's own message; Next.js keeps a second, empty alert for announcing page changes. */
const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");

test("each school's sign-in page names that school and is accessible in light and dark", async ({ page }) => {
  await openHydrated(page, "/sign-in");
  await expect(page.getByText("For parents, pupils and staff of AD Smart School.")).toBeVisible();
  await expectAccessibleInBothThemes(page);
  await openHydrated(page, `${OTHER_SCHOOL}/sign-in`);
  await expect(page.getByText("For parents, pupils and staff of Bright Future Academy.")).toBeVisible();
});

test("a wrong password gets the one generic message", async ({ page }) => {
  await openHydrated(page, "/sign-in");
  await signIn(page, "Staff", "nobody.here", "not the password");
  await expect(formAlert(page)).toHaveText("Incorrect username or password.");
});

test("an account from one school cannot sign in at another", async ({ page }, testInfo) => {
  await openHydrated(page, `${OTHER_SCHOOL}/sign-in`);
  await signIn(page, "Staff", accounts.staff[testInfo.project.name as Project], accounts.password);
  await expect(formAlert(page)).toHaveText("Incorrect username or password.");
});

test("an administrator sets up the second factor at first sign-in", async ({ page }, testInfo) => {
  await openHydrated(page, "/sign-in");
  await signIn(page, "Staff", accounts.staff[testInfo.project.name as Project], accounts.password);
  await setUpAuthenticator(page);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a parent activates their account with an SMS code from their school", async ({ page }, testInfo) => {
  const local = accounts.parents[testInfo.project.name as Project];
  await openHydrated(page, "/sign-in");
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/auth/me")),
    page.getByRole("link", { name: /first time/i }).click(),
  ]);
  await page.getByLabel(/mobile number/i).fill(local);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("If this number is registered, a code has been sent.")).toBeVisible();

  await page.getByLabel(/code from the sms/i).fill(lastCodeTo(`+233${local.slice(1)}`));
  await page.getByLabel(/^new password/i).fill(accounts.password);
  await page.getByLabel(/type it again/i).fill(accounts.password);
  await page.getByRole("button", { name: /set password/i }).click();

  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(`${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`)).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test("platform staff sign in at the admin address with a second factor", async ({ page }, testInfo) => {
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(`${ADMIN}/sign-in?next=%2Fschools`);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await signIn(page, null, accounts.platform[testInfo.project.name as Project], accounts.password);
  await setUpAuthenticator(page);
  await expect(page.getByRole("heading", { name: "Schools" })).toBeVisible();
});
