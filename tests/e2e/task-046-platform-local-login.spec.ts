import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

const email = process.env.DEV_PLATFORM_ADMIN_EMAIL?.trim() || "platform.local@example.test";
const password = process.env.DEV_PLATFORM_ADMIN_PASSWORD?.trim() || "";

function runSeed() {
  const result = spawnSync(
    process.execPath,
    ["scripts/platform/local-login-setup.mjs", "seed"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        "TASK-046 local login seed failed.",
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

test.beforeAll(() => {
  test.skip(
    process.env.CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST !== "yes",
    "Set CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes and DEV_PLATFORM_ADMIN_PASSWORD to run.",
  );
  expect(password.length).toBeGreaterThanOrEqual(12);
  runSeed();
});

test("TASK-046 local Platform Admin account opens Platform Master Console", async ({
  page,
}) => {
  await page.goto("/auth/login?next=/platform");
  await expect(
    page.getByRole("heading", { level: 1, name: "Master Console sign in" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForFunction(() => window.location.pathname === "/platform"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);

  await expect(
    page.getByRole("heading", { level: 1, name: "Platform Overview" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Provisioning" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit" })).toBeVisible();
  await expect(page.getByText("Read blocked")).toHaveCount(0);
});
