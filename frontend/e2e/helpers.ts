import { expect, type Page } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";
import { totp } from "./totp";

export const ADMIN = "http://admin.localhost:3100";

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

/** First sign-in for a role that needs the second factor: set up the app, save the codes. */
export async function setUpAuthenticator(page: Page) {
  await expect(page.getByRole("heading", { name: "Set up your authenticator app" })).toBeVisible();
  const secret = (await page.getByTestId("manual-key").textContent())?.trim() ?? "";
  await page.getByLabel(/6-digit code/i).fill(totp(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
  await page.getByRole("button", { name: /saved them/i }).click();
}
