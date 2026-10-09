import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";

const PLATFORM = "http://localhost:3100";
const BRIGHT_FUTURE = "http://brightfuture.localhost:3100";

for (const scheme of ["light", "dark"] as const) {
  test(`the platform home page is usable and accessible in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto(PLATFORM);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your school, online");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expectNoAccessibilityViolations(page);
  });
}

test("a school owner can ask to get their school online", async ({ page }) => {
  await page.goto(`${PLATFORM}/#get-online`);
  await page.getByLabel(/school name/i).fill("Sunrise Academy");
  await page.getByLabel(/^town/i).fill("Ejisu");
  await page.getByLabel(/your name/i).fill("Kwame Asante");
  await page.getByLabel(/mobile number/i).fill("020 123 4567");
  await page.getByLabel(/I agree/i).check();
  await page.waitForTimeout(3200); // spam protection: the form must be open for 3 seconds

  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByRole("heading", { name: /received your request/i })).toBeFocused();
});

test("each school has its own site and only its own levels", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BRIGHT_FUTURE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bright beginnings, from KG to Basic 6");
  await expect(page.getByRole("link", { name: /Bright Future Academy/ }).first()).toBeVisible();

  await page.goto(`${BRIGHT_FUTURE}/levels`);
  await expect(page.getByRole("heading", { level: 2, name: "Kindergarten (KG1–KG2)" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Junior High/ })).toHaveCount(0);
  await expectNoAccessibilityViolations(page);
});

test("a school's address never shows another school's pages", async ({ page }) => {
  const response = await page.goto(`${BRIGHT_FUTURE}/sites/adsmart.localhost/about`);
  expect(response?.status()).toBe(404);
});

test("an unknown school address shows the not-found page", async ({ page }) => {
  const response = await page.goto("http://nobody.localhost:3100/");
  expect(response?.status()).toBe(404);
});
