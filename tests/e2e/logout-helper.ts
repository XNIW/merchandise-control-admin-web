import { expect, type Page } from "@playwright/test";

const logoutTargets = {
  "platform-account": "/auth/logout?next=/platform",
  "shop-account": "/auth/logout?next=/shop",
  "shop-staff": "/shop/staff-logout",
} as const;

export type LogoutTarget = keyof typeof logoutTargets;

export async function submitSameOriginLogout(
  page: Page,
  target: LogoutTarget,
) {
  const action = logoutTargets[target];
  const form = page.locator(`form[action="${action}"][method="post"]`);

  await expect(form).toHaveCount(1);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/auth/login"),
    form.locator('button[type="submit"]').click(),
  ]);
}
