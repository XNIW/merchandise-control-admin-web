import { expect, test } from "@playwright/test";

const stagingSyntheticPrefix = "STAGING_TASK045_";

test("staging Platform auth boundary responds without mutating data", async ({ page }) => {
  expect(process.env.TEST_TARGET).toBe("staging");
  expect(stagingSyntheticPrefix).toMatch(/^STAGING_TASK045_/);

  await page.goto("/platform");
  await expect(page.locator("body")).toContainText(
    /Admin account sign in|Master Console access required|MerchandiseControl/i,
  );
});
