import { expect, test } from "@playwright/test";
import accounts from "./accounts.json";
import { ADMIN, confirmWithTextedCode, e164, expectAccessibleInBothThemes, mainNav, openHydrated, signIn } from "./helpers";

type Project = keyof typeof accounts.platform_writers;
const PLATFORM = "http://localhost:3100";
// A 1×1 PNG: enough for the server to check and resize.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("a Content member publishes to the website, and it shows straight away", async ({ page }, testInfo) => {
  const project = testInfo.project.name as Project;
  const title = `Plan your term early ${project}`;
  const question = `Can parents pay by Mobile Money? ${project}`;
  const photo = `Pupils at assembly ${project}`;

  await openHydrated(page, `${ADMIN}/sign-in`);
  await signIn(page, null, accounts.platform_writers[project], accounts.password);
  await confirmWithTextedCode(page, e164(accounts.phones.platform_writers[project]));
  const nav = await mainNav(page);
  await expect(nav.getByRole("link")).toHaveText(["Website", "Account"]);
  await nav.getByRole("link", { name: "Website" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Articles and tips" })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.getByLabel(/^title/i).fill(title);
  await page.getByRole("button", { name: "Start writing" }).click();
  await page.getByLabel(/^summary/i).fill("Three steps that make the new term calmer.");
  await page.getByLabel(/^article text/i).fill("## Start with dates\n\nShare **key dates** before the term begins.");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("It's live on your website.")).toBeVisible();

  await page.getByRole("link", { name: "Questions" }).click();
  await page.getByLabel(/^question/i).fill(question);
  await page.getByLabel(/^answer/i).fill("That depends on each school. Ask your school's office.");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("article", { name: question })).toBeVisible();

  await page.getByRole("link", { name: "Gallery" }).click();
  await page.getByLabel(/^photo/i).setInputFiles({ name: "assembly.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel(/^description/i).fill(photo);
  await page.getByRole("button", { name: "Add photo" }).click();
  await expect(page.getByRole("article", { name: photo })).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.goto(`${PLATFORM}/`);
  await expect(page.getByText(question)).toBeVisible();
  await page.getByRole("button", { name: `Open photo: ${photo}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expectAccessibleInBothThemes(page);

  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("key dates", { exact: true })).toHaveJSProperty("tagName", "STRONG");
  await expectAccessibleInBothThemes(page);
});

test("a visitor signs up for tips and is asked to confirm by email", async ({ page }, testInfo) => {
  // Ready once the forms have their spam-protection token.
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/public/enquiries/form-token")),
    page.goto(`${PLATFORM}/`),
  ]);
  const form = page.getByRole("form", { name: "Get new tips by email" });
  await form.getByLabel(/^email/i).fill(`reader-${testInfo.project.name}@example.com`);
  await form.getByRole("checkbox", { name: /send me new tips/i }).check();
  await page.waitForTimeout(3200); // spam protection: the form must be open for 3 seconds
  await form.getByRole("button", { name: "Send me tips" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});
