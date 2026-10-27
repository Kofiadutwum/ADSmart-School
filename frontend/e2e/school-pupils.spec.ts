import { expect, test } from "@playwright/test";
import accounts from "./accounts.json";
import {
  confirmWithTextedCode,
  e164,
  expectAccessibleInBothThemes,
  lastCodeTo,
  mainNav,
  openHydrated,
  portalNav,
  signIn,
} from "./helpers";

type Project = keyof typeof accounts.staff;

test("an Administrator admits a pupil with their family, and the parent sees them", async ({ page }, testInfo) => {
  const project = testInfo.project.name as Project;
  const surname = project === "phone" ? "Phone" : "Desktop";
  const pupil = `Kwabena ${surname}`;
  const mother = `Akua ${surname}`;
  const mobile = project === "phone" ? "0245551001" : "0245551002";

  await openHydrated(page, "/sign-in");
  await signIn(page, "Staff", accounts.staff[project], accounts.password);
  await confirmWithTextedCode(page, e164(accounts.phones.staff[project]));
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Admission gives a Student ID and opens the pupil's record.
  await (await mainNav(page)).getByRole("link", { name: "Pupils" }).click();
  await page.getByRole("button", { name: "Admit a pupil" }).click();
  const admit = page.getByRole("form", { name: "Admit a pupil" });
  await admit.getByLabel(/^first name/i).fill("Kwabena");
  await admit.getByLabel(/^surname/i).fill(surname);
  await admit.getByLabel(/^date of birth/i).fill("2018-02-01");
  await admit.getByLabel(/^gender/i).selectOption({ label: "Male" });
  await admit.getByRole("checkbox", { name: /privacy notice/i }).check();
  await admit.getByRole("button", { name: "Admit", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: pupil })).toBeVisible();
  await expect(page.getByText(/Student ID \d{7}/)).toBeVisible();

  // A parent, linked and texted the activation message.
  await page.getByRole("tab", { name: "Parents" }).click();
  const newParent = page.getByRole("form", { name: "Add a new parent" });
  await newParent.getByLabel(/^first name/i).fill("Akua");
  await newParent.getByLabel(/^surname/i).fill(surname);
  await newParent.getByLabel(/^mobile number/i).fill(mobile);
  await newParent.getByRole("checkbox", { name: "Main contact" }).check();
  await newParent.getByRole("checkbox", { name: /privacy notice/i }).check();
  await newParent.getByRole("button", { name: "Add parent" }).click();
  const card = page.getByRole("article", { name: mother });
  await card.getByRole("button", { name: "Send activation text" }).click();
  await expect(card.getByRole("status")).toHaveText("Activation text sent.");

  await page.getByRole("tab", { name: "Consents" }).click();
  const photo = page.getByRole("article", { name: "Photos may be used" });
  await photo.getByRole("button", { name: "Given" }).click();
  await expect(photo.getByText(/Given on/)).toBeVisible();

  await page.getByRole("tab", { name: "Pick-up persons" }).click();
  const pickup = page.getByRole("form", { name: "Add a pick-up person" });
  await pickup.getByLabel(/^name/i).fill("Uncle Kofi");
  await pickup.getByLabel(/^mobile number/i).fill("0247770001");
  await pickup.getByLabel(/^relationship/i).fill("Uncle");
  await pickup.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("article", { name: "Uncle Kofi" })).toBeVisible();

  // The parent activates with the texted code and sees their child.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await openHydrated(page, "/sign-in");
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/auth/me")),
    page.getByRole("link", { name: /first time/i }).click(),
  ]);
  await page.getByLabel(/mobile number/i).fill(mobile);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("If this number is registered, a code has been sent.")).toBeVisible();
  await page.getByLabel(/code from the sms/i).fill(lastCodeTo(e164(mobile)));
  await page.getByLabel(/^new password/i).fill(accounts.password);
  await page.getByLabel(/type it again/i).fill(accounts.password);
  await page.getByRole("button", { name: /set password/i }).click();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();

  await page.getByRole("link", { name: new RegExp(pupil) }).click();
  await expect(page.getByRole("region", { name: pupil }).getByText(/Uncle Kofi/)).toBeVisible();

  await (await portalNav(page)).getByRole("link", { name: "Consent" }).click();
  const ward = page.getByRole("region", { name: pupil });
  const wardPhoto = ward.getByRole("article", { name: "Photos may be used" });
  await expect(wardPhoto.getByText(/Given on/)).toBeVisible();
  await wardPhoto.getByRole("button", { name: "Withdrawn" }).click();
  await expect(wardPhoto.getByText(/Withdrawn on/)).toBeVisible();
  await expectAccessibleInBothThemes(page);
});
