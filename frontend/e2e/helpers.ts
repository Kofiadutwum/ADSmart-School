import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";

export const ADMIN = "http://admin.localhost:3100";
const OUTBOX = path.resolve(process.cwd(), "../backend/e2e-sms.jsonl");

export async function expectAccessibleInBothThemes(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await expectNoAccessibilityViolations(page);
  }
}

/** Opens a page once React runs on it: the sign-in forms ask for /api/auth/me as they mount. */
export async function openHydrated(page: Page, url: string) {
  await Promise.all([page.waitForResponse((response) => response.url().endsWith("/api/auth/me")), page.goto(url)]);
}

export async function signIn(page: Page, tab: string | null, username: string, password: string) {
  if (tab) await page.getByRole("tab", { name: tab }).click();
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** 0244000001 → +233244000001. */
export const e164 = (local: string) => `+233${local.replace(/\s/g, "").slice(1)}`;

/** The newest code texted to a number, from the development SMS log. */
export function lastCodeTo(number: string): string {
  const messages = fs
    .readFileSync(OUTBOX, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { to: string; body: string });
  const message = messages.reverse().find((item) => item.to === number);
  return message?.body.match(/\d{6}/)?.[0] ?? "";
}

/** The second sign-in step: have the code texted to the account's mobile, then type it in. */
export async function confirmWithTextedCode(page: Page, number: string) {
  await expect(page.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
  await page.getByRole("button", { name: /text the code/i }).click();
  await expect(page.getByText(/sent a 6-digit code/i)).toBeVisible();
  await page.getByLabel(/6-digit code/i).fill(lastCodeTo(number));
  await page.getByRole("button", { name: "Continue" }).click();
}
