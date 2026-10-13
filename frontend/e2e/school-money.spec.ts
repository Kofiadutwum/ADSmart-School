import { expect, test, type Page } from "@playwright/test";
import accounts from "./accounts.json";
import { confirmWithTextedCode, e164, expectAccessibleInBothThemes, mainNav, openHydrated, signIn } from "./helpers";

type Project = keyof typeof accounts.staff;

async function signInAs(page: Page, username: string, phone: string) {
  await openHydrated(page, "/sign-in");
  await signIn(page, "Staff", username, accounts.password);
  await confirmWithTextedCode(page, e164(phone));
}

test("the Accountant sets a daily rate and the Head Teacher approves it", async ({ page, browser }, testInfo) => {
  const project = testInfo.project.name as Project;
  // Phones and desktops run side by side at one school, so each sets a different category.
  const category = project === "phone" ? "Early Years" : "JHS";

  await signInAs(page, accounts.accountants[project], accounts.phones.accountants[project]);
  await expect(page.getByRole("heading", { level: 1, name: "Money" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Record a payment" })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await (await mainNav(page)).getByRole("link", { name: "Daily charges" }).click();
  await page.getByRole("navigation", { name: "Daily charges" }).getByRole("link", { name: "Rates" }).click();
  await page.getByRole("button", { name: "Add rate" }).click();
  await page.getByLabel(/^category/i).selectOption({ label: category });
  await page.getByLabel(/^daily amount/i).fill("10");
  await page.getByLabel(/^of which canteen/i).fill("6");
  await page.getByRole("button", { name: "Add rate" }).click();
  const rate = page.getByRole("article").filter({ hasText: category });
  await expect(rate.getByText("Waiting for approval")).toBeVisible();
  await expect(rate.getByText("GH₵10.00")).toBeVisible();

  const head = await browser.newPage();
  await signInAs(head, accounts.head_teachers[project], accounts.phones.head_teachers[project]);
  await expect(head.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await (await mainNav(head)).getByRole("link", { name: "Daily charges" }).click();
  await head.getByRole("navigation", { name: "Daily charges" }).getByRole("link", { name: "Rates" }).click();
  const pending = head.getByRole("article").filter({ hasText: category });
  await pending.getByRole("button", { name: "Approve" }).click();
  await expect(pending.getByText("Approved")).toBeVisible();
  await head.close();
});

test("an Administrator sends an announcement to staff", async ({ page }, testInfo) => {
  const project = testInfo.project.name as Project;
  const title = `Staff meeting ${project}`;

  await signInAs(page, accounts.staff[project], accounts.phones.staff[project]);
  await (await mainNav(page)).getByRole("link", { name: "Messages" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Announcements" })).toBeVisible();
  await page.getByRole("button", { name: "Add announcement" }).click();
  await page.getByLabel(/^title/i).fill(title);
  await page.getByLabel(/^message/i).fill("Staff meeting on Friday at 2 pm in the hall.");
  await page.getByLabel(/^to/i).selectOption({ label: "Staff" });
  await page.getByRole("button", { name: "Add announcement" }).click();
  const card = page.getByRole("article").filter({ hasText: title });
  await card.getByRole("button", { name: "Send" }).click();
  await card.getByRole("button", { name: "Yes" }).click();
  await expect(card.getByText("Sent", { exact: true })).toBeVisible();
  await expectAccessibleInBothThemes(page);
});
