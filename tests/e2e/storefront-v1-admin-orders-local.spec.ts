import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

test.use({ screenshot: "off", trace: "off", video: "off" });

type Fixture = {
  categoryId: string;
  customerId: string;
  email: string;
  orderCode: string;
  orderId: string;
  password: string;
  productId: string;
  publicCategoryId: string;
  publicationId: string;
  shopId: string;
  slotId: string;
  pickupPointId: string;
  userId: string;
};

const state: {
  admin?: SupabaseClient;
  fixture?: Fixture;
} = {};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const axePath = createRequire(`${process.cwd()}/package.json`).resolve(
  "axe-core/axe.min.js",
);

type AxeBrowserGlobal = typeof globalThis & {
  axe: {
    run(
      root: Document,
      options: { runOnly: { type: "tag"; values: string[] } },
    ): Promise<{
      violations: Array<{
        id: string;
        impact: string | null;
        nodes: Array<{ target: unknown }>;
      }>;
    }>;
  };
};

async function expectNoSeriousAccessibilityViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await (globalThis as unknown as AxeBrowserGlobal).axe.run(
      document,
      {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa"],
        },
      },
    );
    return result.violations
      .filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      )
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target),
      }));
  });
  expect(violations).toEqual([]);
}

async function attachUiScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  if (process.env.STOREFRONT_UI_CAPTURE !== "yes") return;
  await testInfo.attach(name, {
    body: await page.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png",
  });
}

function testRuntime() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const isLoopback = (value: string | undefined) => {
    if (!value) return false;
    try {
      return ["127.0.0.1", "localhost", "::1"].includes(
        new URL(value).hostname,
      );
    } catch {
      return false;
    }
  };
  if (
    process.env.TEST_TARGET === "local" &&
    isLoopback(supabaseUrl) &&
    publishableKey &&
    serviceRoleKey
  ) {
    return { publishableKey, serviceRoleKey, supabaseUrl: supabaseUrl! };
  }
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  const allowedRefs = (process.env.ALLOWED_STAGING_SUPABASE_PROJECT_REFS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  let stagingUrlMatches = false;
  try {
    stagingUrlMatches =
      Boolean(projectRef) &&
      new URL(supabaseUrl ?? "").hostname === `${projectRef}.supabase.co`;
  } catch {}
  return process.env.TEST_TARGET === "staging" &&
    process.env.ALLOW_STAGING_E2E === "yes" &&
    process.env.CONFIRM_STAGING_E2E === "yes" &&
    Boolean(projectRef) &&
    allowedRefs.includes(projectRef!) &&
    stagingUrlMatches &&
    publishableKey &&
    serviceRoleKey
    ? { publishableKey, serviceRoleKey, supabaseUrl: supabaseUrl! }
    : null;
}

function fixtureDatabaseUrl() {
  if (process.env.TEST_TARGET === "staging") {
    const value = process.env.STOREFRONT_STAGING_DATABASE_URL?.trim();
    const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
    if (!value || !projectRef) {
      throw new Error("STOREFRONT_ADMIN_ORDER_E2E_STAGING_DB_REQUIRED");
    }
    const parsed = new URL(value);
    if (
      parsed.protocol !== "postgresql:" ||
      decodeURIComponent(parsed.username) !== `postgres.${projectRef}` ||
      parsed.searchParams.get("sslmode") !== "require"
    ) {
      throw new Error("STOREFRONT_ADMIN_ORDER_E2E_STAGING_DB_SCOPE_INVALID");
    }
    return value;
  }
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const value = output.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];
  if (
    !value ||
    !["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname)
  ) {
    throw new Error("STOREFRONT_ADMIN_ORDER_E2E_LOCAL_DB_REQUIRED");
  }
  return value;
}

function validateFixture(fixture: Fixture) {
  for (const value of [
    fixture.categoryId,
    fixture.customerId,
    fixture.orderId,
    fixture.pickupPointId,
    fixture.productId,
    fixture.publicCategoryId,
    fixture.publicationId,
    fixture.shopId,
    fixture.slotId,
    fixture.userId,
  ]) {
    if (!uuidPattern.test(value)) {
      throw new Error("STOREFRONT_ADMIN_ORDER_E2E_FIXTURE_SCOPE_INVALID");
    }
  }
}

function seedFixture(fixture: Fixture, nonce: string) {
  validateFixture(fixture);
  if (!/^[0-9a-f]{10}$/.test(nonce)) {
    throw new Error("STOREFRONT_ADMIN_ORDER_E2E_NONCE_INVALID");
  }
  const sql = `
    begin;
    update public.profiles
       set display_name = 'Order Admin ${nonce}'
     where profile_id = '${fixture.userId}'::uuid;
    insert into public.shops (
      shop_id, shop_code, shop_name, shop_status, created_by_profile_id,
      status_changed_by_profile_id
    ) values (
      '${fixture.shopId}'::uuid, 'TASK029${nonce.toUpperCase()}',
      'Order Admin E2E ${nonce}', 'active', '${fixture.userId}'::uuid,
      '${fixture.userId}'::uuid
    );
    insert into public.shop_members (
      profile_id, shop_id, role_key, membership_status
    ) values (
      '${fixture.userId}'::uuid, '${fixture.shopId}'::uuid,
      'shop_owner', 'active'
    );
    insert into public.inventory_categories (
      id, owner_user_id, shop_id, name, updated_at
    ) values (
      '${fixture.categoryId}'::uuid, '${fixture.userId}'::uuid,
      '${fixture.shopId}'::uuid, 'Categoria ordine ${nonce}', now()
    );
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name, category_id,
      purchase_price, retail_price, stock_quantity, updated_at
    ) values (
      '${fixture.productId}'::uuid, '${fixture.userId}'::uuid,
      '${fixture.shopId}'::uuid, 'ORDER-${nonce}', 'Prodotto ordine ${nonce}',
      '${fixture.categoryId}'::uuid, 900, 2100, 8, now()
    );
    insert into public.storefront_settings (
      shop_id, public_slug, storefront_enabled, pickup_enabled,
      delivery_enabled, reservation_enabled, require_product_image
    ) values (
      '${fixture.shopId}'::uuid, 'order-admin-${nonce}',
      true, true, false, false, false
    );
    insert into public.storefront_categories (
      id, shop_id, source_category_id, slug, public_name,
      publication_status, sort_rank
    ) values (
      '${fixture.publicCategoryId}'::uuid, '${fixture.shopId}'::uuid,
      '${fixture.categoryId}'::uuid, 'order-${nonce}', 'Ordini',
      'published', 1
    );
    insert into public.storefront_product_publications (
      id, shop_id, source_product_id, publication_status, public_name,
      public_category_id, retail_price_clp, pickup_enabled,
      delivery_enabled, reservation_enabled, availability_mode, published_at
    ) values (
      '${fixture.publicationId}'::uuid, '${fixture.shopId}'::uuid,
      '${fixture.productId}'::uuid, 'published', 'Caffè ordine ${nonce}',
      '${fixture.publicCategoryId}'::uuid, 2100, true, false, false,
      'available', now()
    );
    insert into public.storefront_pickup_points (
      id, shop_id, public_name, address_line_1, commune, region,
      public_instructions, enabled
    ) values (
      '${fixture.pickupPointId}'::uuid, '${fixture.shopId}'::uuid,
      'Retiro Admin', 'Av. QA 29', 'Ñuñoa', 'Metropolitana',
      'Presenta el código.', true
    );
    insert into public.storefront_fulfillment_slots (
      id, shop_id, fulfillment_mode, pickup_point_id, public_label,
      starts_at, ends_at, capacity, enabled
    ) values (
      '${fixture.slotId}'::uuid, '${fixture.shopId}'::uuid, 'pickup',
      '${fixture.pickupPointId}'::uuid, 'Retiro próximo',
      now() + interval '2 hours', now() + interval '4 hours', 8, true
    );
    insert into public.customer_orders (
      id, public_order_code, user_id, shop_id, quote_version, status,
      status_version, fulfillment_mode, slot_id, currency_code,
      subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
      placed_at, updated_at
    ) values (
      '${fixture.orderId}'::uuid, '${fixture.orderCode}',
      '${fixture.customerId}'::uuid, '${fixture.shopId}'::uuid,
      1, 'confirmed', 1, 'pickup', '${fixture.slotId}'::uuid, 'CLP',
      2100, 0, 2100,
      '{"mode":"pickup","pickupPoint":{"name":"Retiro Admin","addressLine1":"Av. QA 29","commune":"Ñuñoa","region":"Metropolitana"},"slot":{"label":"Retiro próximo"}}'::jsonb,
      now() - interval '1 minute', now() - interval '1 minute'
    );
    insert into public.customer_order_items (
      order_id, shop_id, line_position, publication_id, source_product_id,
      public_name, quantity, unit_price_clp, line_total_clp, created_at
    ) values (
      '${fixture.orderId}'::uuid, '${fixture.shopId}'::uuid, 1,
      '${fixture.publicationId}'::uuid, '${fixture.productId}'::uuid,
      'Caffè ordine ${nonce}', 1, 2100, 2100, now() - interval '1 minute'
    );
    insert into public.customer_order_status_events (
      order_id, shop_id, event_version, status, actor_kind,
      metadata_redacted, created_at
    ) values (
      '${fixture.orderId}'::uuid, '${fixture.shopId}'::uuid,
      1, 'confirmed', 'system', '{"source":"customer_checkout_quote"}',
      now() - interval '1 minute'
    );
    insert into public.customer_order_outbox (
      order_id, shop_id, event_type, idempotency_key, payload,
      status, available_at, created_at, updated_at
    ) values (
      '${fixture.orderId}'::uuid, '${fixture.shopId}'::uuid,
      'customer_order.confirmed.v1', gen_random_uuid(),
      jsonb_build_object(
        'documentKind', 'customer_order', 'fiscalStatus', 'not_created',
        'orderId', '${fixture.orderId}'::uuid
      ),
      'pending', now(), now(), now()
    );
    commit;
  `;
  execFileSync(
    "psql",
    [fixtureDatabaseUrl(), "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: sql, stdio: ["pipe", "ignore", "ignore"] },
  );
}

async function cleanup() {
  const fixture = state.fixture;
  if (!fixture) return;
  validateFixture(fixture);
  execFileSync(
    "psql",
    [
      fixtureDatabaseUrl(),
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      [
        "begin",
        "alter table public.audit_logs disable trigger user",
        `delete from public.audit_logs where shop_id = '${fixture.shopId}'::uuid`,
        "alter table public.audit_logs enable trigger user",
        `delete from public.customer_order_admin_mutations where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.customer_order_outbox where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.customer_order_status_events where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.customer_order_items where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.customer_orders where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_fulfillment_slots where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_pickup_points where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_product_publications where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_categories where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_settings where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.inventory_products where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.inventory_categories where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.staff_role_permissions where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.shop_members where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.shops where shop_id = '${fixture.shopId}'::uuid`,
        "commit",
      ].join("; "),
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  await state.admin?.auth.admin.deleteUser(fixture.customerId);
  await state.admin?.auth.admin.deleteUser(fixture.userId);
}

test.beforeAll(async () => {
  const runtime = testRuntime();
  test.skip(!runtime, "A guarded local or staging Supabase runtime is required.");
  if (!runtime) return;
  const admin = createClient(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  state.admin = admin;
  const nonce = randomBytes(5).toString("hex");
  const email = `storefront-orders-${nonce}@example.invalid`;
  const password = `Storefront-${randomBytes(18).toString("base64url")}`;
  const owner = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  const customer = await admin.auth.admin.createUser({
    email: `storefront-orders-customer-${nonce}@example.invalid`,
    email_confirm: true,
    password: `Customer-${randomBytes(18).toString("base64url")}`,
  });
  if (owner.error || !owner.data.user || customer.error || !customer.data.user) {
    throw new Error("STOREFRONT_ADMIN_ORDER_E2E_USER_CREATE");
  }
  const orderId = randomUUID();
  state.fixture = {
    categoryId: randomUUID(),
    customerId: customer.data.user.id,
    email,
    orderCode: `MC-${orderId.replaceAll("-", "").slice(0, 20).toUpperCase()}`,
    orderId,
    password,
    pickupPointId: randomUUID(),
    productId: randomUUID(),
    publicCategoryId: randomUUID(),
    publicationId: randomUUID(),
    shopId: randomUUID(),
    slotId: randomUUID(),
    userId: owner.data.user.id,
  };
  try {
    seedFixture(state.fixture, nonce);
  } catch (error) {
    await cleanup();
    throw error;
  }
});

test.afterAll(cleanup);

test("owner filters, opens and advances an order without creating a fiscal sale", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const fixture = state.fixture;
  if (!fixture) test.skip();
  if (!fixture) return;

  await page.goto(`/auth/login?next=/shop/orders?shop_id=${fixture.shopId}`);
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop/orders"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);

  await expect(
    page.getByRole("heading", { level: 1, name: "Ordini cliente" }),
  ).toBeVisible();
  await expect(page.getByLabel("Filtri ordini")).toBeVisible();
  await expect(page.getByText(fixture.orderCode)).toBeVisible();
  await expect(
    page.locator("span").filter({ hasText: /^Confermato$/ }).first(),
  ).toBeVisible();

  await page.setViewportSize({ height: 568, width: 320 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const search = page.getByLabel("Cerca");
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("Filtri ordini").locator('select[name="status"]'),
  ).toBeFocused();
  expect(
    await page.getByLabel("Filtri ordini").locator(
      'input:not([type="hidden"]), select, button, a',
    ).evaluateAll((elements) =>
      elements.flatMap((element) =>
        element.getBoundingClientRect().height >= 47.5
          ? []
          : [element.outerHTML],
      ),
    ),
  ).toEqual([]);
  await page.setViewportSize({ height: 900, width: 1_440 });

  await page.getByText(fixture.orderCode).click();
  await expect(page.getByText("Dettaglio operativo")).toBeVisible();
  await expect(page.getByRole("heading", { name: fixture.orderCode })).toBeVisible();
  await expect(page.getByText("Caffè ordine").first()).toBeVisible();
  await expect(page.getByText("POS order outbox")).toBeVisible();
  await expect(page.getByText("vendita fiscale non creata")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await page.setViewportSize({ height: 568, width: 320 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ height: 900, width: 1_440 });
  await attachUiScreenshot(page, testInfo, "admin-orders-detail");

  const transition = page.locator("form").filter({
    has: page.getByRole("button", { name: "Conferma transizione" }),
  });
  await expect(transition.getByLabel("Prossima azione")).toHaveValue("accept");
  await transition.getByRole("checkbox").check();
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/shop/orders" &&
        url.searchParams.get("result") === "success",
    ),
    transition.getByRole("button", { name: "Conferma transizione" }).click(),
  ]);

  await expect(
    page.locator("span").filter({ hasText: /^Accettato$/ }).first(),
  ).toBeVisible();
  await page.getByText(/^Audit amministrativo/).click();
  await expect(page.getByText("confirmed → accepted")).toBeVisible();
  await expect(
    page.getByText(/Action completed|Azione completata|Accion completada|操作已完成/),
  ).toBeVisible();

  const verification = execFileSync(
    "psql",
    [
      fixtureDatabaseUrl(),
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `select case when
        (select status='accepted' and status_version=2 from public.customer_orders where id='${fixture.orderId}'::uuid)
        and (select count(*)=2 from public.customer_order_status_events where order_id='${fixture.orderId}'::uuid)
        and (select count(*)=1 from public.customer_order_admin_mutations where order_id='${fixture.orderId}'::uuid)
        and (select count(*)=1 from public.audit_logs where target_id='${fixture.orderId}')
        and (select count(*)=1 from public.customer_order_outbox where order_id='${fixture.orderId}'::uuid and event_type='customer_order.accepted.v1')
        and not exists (select 1 from public.pos_sales where shop_id='${fixture.shopId}'::uuid)
        then 'ok' else 'failed' end`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
  expect(verification).toBe("ok");

  const filters = page.getByLabel("Filtri ordini");
  await filters.getByLabel("Cerca").fill(fixture.orderCode.slice(-8));
  await filters.locator('select[name="status"]').selectOption("accepted");
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/shop/orders" &&
        url.searchParams.get("status") === "accepted",
    ),
    filters.getByRole("button", { name: "Applica filtri" }).click(),
  ]);
  await expect(page.getByLabel("Filtri ordini").getByLabel("Cerca")).toHaveValue(
    fixture.orderCode.slice(-8),
  );
  await expect(
    page.getByLabel("Filtri ordini").locator('select[name="status"]'),
  ).toHaveValue("accepted");
  await expect(page.getByText(fixture.orderCode)).toBeVisible();
});
