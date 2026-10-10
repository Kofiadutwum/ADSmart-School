import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations } from "./axe";

const PAGES: [string, RegExp][] = [
  ["/", /Bright beginnings/],
  ["/about", /About Sample School/],
  ["/levels", /From Crèche to JHS/],
  ["/admissions", /Join Sample School/],
  ["/news", /School news/],
  ["/news/welcome-to-our-new-website", /Welcome to our new website/],
  ["/contact", /Get in touch/],
  ["/privacy", /Privacy notice/],
];

for (const scheme of ["light", "dark"] as const) {
  for (const [path, heading] of PAGES) {
    test(`${path} is usable and accessible in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
      await expect(page.getByRole("note").filter({ hasText: "Preview: not yet public" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expectNoAccessibilityViolations(page);
    });
  }
}

test("preview pages ask search engines not to index them", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("unknown pages show a friendly not-found page", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
});
