import { expect, test } from "@playwright/test";

test("Lite mode swaps blur for solid surfaces", async ({ page }) => {
  await page.goto("/?lite=1");
  await expect(page.locator("html")).toHaveAttribute("data-lite", "");
  const blur = await page.locator("header").evaluate((element) => getComputedStyle(element).backdropFilter);
  expect(blur).toBe("none");
});
