import { expect, test } from "@playwright/test";

test("an empty form shows a focused error summary", async ({ page }) => {
  await page.goto("/admissions#enquiry");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Please check the form" })).toBeFocused();
});

test("a parent can send an admissions enquiry", async ({ page }) => {
  await page.goto("/admissions#enquiry");
  await page.getByLabel(/your name/i).fill("Akua Mensah");
  await page.getByLabel(/mobile number/i).fill("024 123 4567");
  await page.getByLabel(/child's name/i).fill("Ama Mensah");
  await page.getByLabel(/date of birth/i).fill("2019-05-01");
  await page.getByLabel(/^level/i).selectOption("lower_primary");
  await page.getByLabel(/I agree/i).check();
  await page.waitForTimeout(3200); // spam protection: the form must be open for 3 seconds

  await page.getByRole("button", { name: "Send enquiry" }).click();

  await expect(page.getByRole("heading", { name: /we've received your enquiry/i })).toBeFocused();
});
