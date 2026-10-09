import { expect, test } from "@playwright/test";

test("follows the device theme from the first paint", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("remembers a chosen theme across visits", async ({ page, isMobile }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
