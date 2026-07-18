import { expect, test } from "@playwright/test";

const enabled = process.env.TASK088_FINAL_SYNC_E2E === "1";
const shopId = process.env.TASK088_FINAL_SYNC_SHOP_ID?.trim() ?? "";
const crossShopId = process.env.TASK088_FINAL_SYNC_CROSS_SHOP_ID?.trim() ?? "";
const prefix =
  process.env.TASK088_FINAL_SYNC_PREFIX?.trim() ??
  "TASK_SYNC_FINAL_20260714_AdminE2E_";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

test.skip(!enabled, "TASK-088 final sync route E2E is explicitly gated");

type ResponseSnapshot = {
  body: unknown;
  status: number;
};

async function sameOriginRequest(
  page: import("@playwright/test").Page,
  input: {
    body?: unknown;
    method: "GET" | "POST";
  },
): Promise<ResponseSnapshot> {
  return page.evaluate(async ({ body, method }) => {
    const response = await fetch("/shop/qa-sync-fixture", {
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      headers:
        body === undefined
          ? undefined
          : {
              "Content-Type": "application/json",
            },
      method,
    });
    const responseBody = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : null;

    return {
      body: responseBody,
      status: response.status,
    };
  }, input);
}

function finalBody(overrides: Record<string, unknown> = {}) {
  return {
    confirm: "staging-sync-final",
    correlationId: "AdminE2E-Correlation",
    entity: "product",
    fixtureId: "AdminE2E-Fixture",
    mode: "final",
    operation: "observe",
    prefix,
    scenario: "observe",
    shopId,
    ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  expect(shopId, "TASK088_FINAL_SYNC_SHOP_ID is required").not.toBe("");
  expect(prefix).toMatch(
    /^TASK_SYNC_FINAL_20260714_[A-Za-z0-9][A-Za-z0-9-]{5,63}_$/,
  );

  await page.goto(`/shop/overview?shop_id=${encodeURIComponent(shopId)}`);
  await expect(page).not.toHaveURL(/\/auth\/login/);
});

test("TASK-088 rejects GET mutation and generic final prefixes", async ({ page }) => {
  const getResult = await sameOriginRequest(page, { method: "GET" });
  expect(getResult.status).toBe(405);

  const genericPrefix = await sameOriginRequest(page, {
    body: finalBody({ prefix: "TASK_SYNC_FINAL_20260714_" }),
    method: "POST",
  });
  expect(genericPrefix.status).toBe(400);
  expect(genericPrefix.body).toMatchObject({
    code: "validation_failed",
    ok: false,
  });
});

test("TASK-088 rejects final-mode History writes", async ({ page }) => {
  const result = await sameOriginRequest(page, {
    body: finalBody({
      entity: "history_entry",
      operation: "create",
      scenario: "online",
    }),
    method: "POST",
  });

  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({
    code: "validation_failed",
    ok: false,
  });
});

test("TASK-088 denies a requested cross-shop observation", async ({ page }) => {
  test.skip(!crossShopId, "TASK088_FINAL_SYNC_CROSS_SHOP_ID is required");

  const result = await sameOriginRequest(page, {
    body: finalBody({ shopId: crossShopId }),
    method: "POST",
  });

  expect(result.status).toBe(403);
  expect(result.body).toMatchObject({
    marker: "TASK_SYNC_FINAL_ADMIN_V1",
    ok: false,
    result: "denied",
  });
});
