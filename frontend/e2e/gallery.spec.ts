import { expect, test } from "@playwright/test";

test("photos open in a viewer that can be browsed and closed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const firstPhoto = page.getByRole("button", { name: "Open photo: Early years play" });
  await firstPhoto.scrollIntoViewIfNeeded();
  await firstPhoto.click();

  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("Photo 1 of 12")).toBeVisible();

  await viewer.getByRole("button", { name: "Next photo" }).click();
  await expect(viewer.getByText("Photo 2 of 12")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(firstPhoto).toBeFocused();
});
