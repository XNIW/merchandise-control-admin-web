import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

test.use({ screenshot: "off", trace: "off", video: "off" });

type Fixture = {
  categoryId: string;
  email: string;
  password: string;
  productId: string;
  productName: string;
  promotionName: string;
  publicCategoryId: string;
  publicName: string;
  shopId: string;
  shopSlug: string;
  userId: string;
};

const state: {
  admin?: SupabaseClient;
  fixture?: Fixture;
  publishableKey?: string;
  supabaseUrl?: string;
} = {};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function testRuntime() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const isLoopback = (value: string | undefined) => {
    if (!value) return false;
    try {
      return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);
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

async function must<T>(
  label: string,
  operation: PromiseLike<{ data: T; error: unknown }>,
) {
  const result = await operation;
  if (result.error) throw new Error(`STOREFRONT_ADMIN_E2E_${label}`);
  return result.data;
}

function fixtureDatabaseUrl() {
  if (process.env.TEST_TARGET === "staging") {
    const value = process.env.STOREFRONT_STAGING_DATABASE_URL?.trim();
    const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
    if (!value || !projectRef) {
      throw new Error("STOREFRONT_ADMIN_E2E_STAGING_DB_REQUIRED");
    }
    const parsed = new URL(value);
    if (
      parsed.protocol !== "postgresql:" ||
      parsed.hostname !== "aws-1-sa-east-1.pooler.supabase.com" ||
      decodeURIComponent(parsed.username) !== `postgres.${projectRef}` ||
      parsed.searchParams.get("sslmode") !== "require"
    ) {
      throw new Error("STOREFRONT_ADMIN_E2E_STAGING_DB_SCOPE_INVALID");
    }
    return value;
  }
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    env: { ...process.env, DO_NOT_TRACK: "1", SUPABASE_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const value = output.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];
  if (!value || !["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname)) {
    throw new Error("STOREFRONT_ADMIN_E2E_LOCAL_DB_REQUIRED");
  }
  return value;
}

function seedFixture(fixture: Fixture, nonce: string) {
  if (
    !uuidPattern.test(fixture.categoryId) ||
    !uuidPattern.test(fixture.productId) ||
    !uuidPattern.test(fixture.publicCategoryId) ||
    !uuidPattern.test(fixture.shopId) ||
    !uuidPattern.test(fixture.userId) ||
    !/^[0-9a-f]{10}$/.test(nonce)
  ) {
    throw new Error("STOREFRONT_ADMIN_E2E_FIXTURE_SCOPE_INVALID");
  }
  const sql = `
    begin;
    update public.profiles
       set display_name = 'Storefront Admin ${nonce}'
     where profile_id = '${fixture.userId}'::uuid;
    insert into public.shops (
      shop_id, shop_code, shop_name, shop_status, created_by_profile_id,
      status_changed_by_profile_id
    ) values (
      '${fixture.shopId}'::uuid, 'SF${nonce.toUpperCase()}',
      'Storefront E2E ${nonce}', 'active', '${fixture.userId}'::uuid,
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
      '${fixture.shopId}'::uuid, 'Categoria interna ${nonce}', now()
    );
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name, category_id,
      purchase_price, retail_price, stock_quantity, updated_at
    ) values (
      '${fixture.productId}'::uuid, '${fixture.userId}'::uuid,
      '${fixture.shopId}'::uuid, 'SF-${nonce}', 'Prodotto interno ${nonce}',
      '${fixture.categoryId}'::uuid, 100, 1200, 10, now()
    );
    insert into public.storefront_settings (
      shop_id, public_slug, storefront_enabled, pickup_enabled,
      require_product_image
    ) values (
      '${fixture.shopId}'::uuid, 'sf-admin-${nonce}', true, true, false
    );
    insert into public.storefront_categories (
      id, shop_id, source_category_id, slug, public_name,
      publication_status, sort_rank
    ) values (
      '${fixture.publicCategoryId}'::uuid, '${fixture.shopId}'::uuid,
      '${fixture.categoryId}'::uuid, 'caffe-${nonce}', 'Caffè',
      'published', 1
    );
    commit;
  `;
  execFileSync("psql", [fixtureDatabaseUrl(), "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql,
    stdio: ["pipe", "ignore", "ignore"],
  });
}

async function cleanup() {
  const fixture = state.fixture;
  if (!fixture) return;
  if (!uuidPattern.test(fixture.shopId) || !uuidPattern.test(fixture.userId)) {
    throw new Error("STOREFRONT_ADMIN_E2E_CLEANUP_SCOPE_INVALID");
  }
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
        `delete from public.storefront_promotion_products where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_promotions where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_product_publications where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_categories where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.storefront_settings where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.inventory_products where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.inventory_categories where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.staff_role_permissions where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.shop_members where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.shops where shop_id = '${fixture.shopId}'::uuid`,
        `delete from public.profiles where profile_id = '${fixture.userId}'::uuid`,
        "commit",
      ].join("; "),
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  await state.admin?.auth.admin.deleteUser(fixture.userId);
}

test.beforeAll(async () => {
  const runtime = testRuntime();
  test.skip(!runtime, "A guarded local or staging Supabase runtime is required.");
  if (!runtime) return;
  state.publishableKey = runtime.publishableKey;
  state.supabaseUrl = runtime.supabaseUrl;
  const admin = createClient(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  state.admin = admin;
  const nonce = randomBytes(5).toString("hex");
  const email = `storefront-admin-${nonce}@example.invalid`;
  const password = `Storefront-${randomBytes(18).toString("base64url")}`;
  const userResult = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  if (userResult.error || !userResult.data.user) {
    throw new Error("STOREFRONT_ADMIN_E2E_USER_CREATE");
  }
  const userId = userResult.data.user.id;
  const shopId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const publicCategoryId = randomUUID();
  const productName = `Prodotto interno ${nonce}`;
  const publicName = `Caffè cliente ${nonce}`;
  const promotionName = `Sconto cliente ${nonce}`;
  const shopSlug = `sf-admin-${nonce}`;
  state.fixture = {
    categoryId,
    email,
    password,
    productId,
    productName,
    promotionName,
    publicCategoryId,
    publicName,
    shopId,
    shopSlug,
    userId,
  };
  try {
    seedFixture(state.fixture, nonce);
  } catch (error) {
    await cleanup();
    throw error;
  }
});

test.afterAll(cleanup);

test("owner publishes, previews, audits and pauses a Storefront product", async ({ page }) => {
  const fixture = state.fixture;
  if (!fixture || !state.supabaseUrl || !state.publishableKey) test.skip();
  if (!fixture || !state.supabaseUrl || !state.publishableKey) return;

  await page.goto("/auth/login?next=/shop/storefront");
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop/storefront"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name: "Storefront" })).toBeVisible();
  const row = page.locator("article").filter({ hasText: fixture.productName }).first();
  await expect(row).toBeVisible();
  await row.getByText("Modifica pubblicazione").click();
  await row.getByLabel("Nome pubblico").fill(fixture.publicName);
  await row.getByLabel("Categoria pubblica").selectOption(fixture.publicCategoryId);
  await row.getByLabel("Prezzo cliente CLP").fill("1000");
  await row.getByLabel("Prezzo precedente CLP").fill("1200");
  await row.getByLabel("Modalità prezzo").selectOption("override");
  await row.getByRole("checkbox", { name: "Ritiro", exact: true }).check();
  await row.getByLabel("Stato pubblicazione").selectOption("published");
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop/storefront" && url.searchParams.get("result") === "success"),
    row.getByRole("button", { name: "Salva e rivalida server-side" }).click(),
  ]);
  await expect(page.getByText(fixture.publicName).first()).toBeVisible();
  await expect(page.getByText("published", { exact: true }).first()).toBeVisible();

  const publication = await must(
    "PUBLICATION_READ",
    state.admin!.from("storefront_product_publications")
      .select("id")
      .eq("shop_id", fixture.shopId)
      .eq("source_product_id", fixture.productId)
      .single(),
  );
  if (!publication) throw new Error("STOREFRONT_ADMIN_E2E_PUBLICATION_MISSING");
  const anon = createClient(state.supabaseUrl, state.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const visible = await must(
    "PUBLIC_DETAIL",
    anon.rpc("storefront_product_detail_v1", {
      p_publication_id: publication.id,
      p_shop_slug: fixture.shopSlug,
    }),
  );
  expect(visible.status).toBe("ok");
  expect(visible.item.name).toBe(fixture.publicName);

  const storefrontSections = page.getByLabel("Sezioni Storefront");
  await storefrontSections.getByRole("link", { name: "Promozioni", exact: true }).click();
  const createPromotion = page.locator("form").filter({
    has: page.getByRole("button", { name: "Crea promozione" }),
  });
  await createPromotion.getByLabel("Nome promozione").fill(fixture.promotionName);
  await createPromotion.getByLabel("Stato promozione").selectOption("active");
  await createPromotion.getByLabel("Tipo sconto").selectOption("percentage_bps");
  await createPromotion.getByLabel("Sconto percentuale").fill("10");
  await createPromotion.getByLabel("Fuso orario").selectOption("UTC");
  await createPromotion.getByLabel("Inizio").fill(
    new Date(Date.now() - 5 * 60_000).toISOString().slice(0, 16),
  );
  await createPromotion.getByLabel("Fine").fill(
    new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 16),
  );
  await createPromotion.getByLabel(`Includi ${fixture.publicName}`).check();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop/storefront" && url.searchParams.get("area") === "promotions" && url.searchParams.get("result") === "success"),
    createPromotion.getByRole("button", { name: "Crea promozione" }).click(),
  ]);
  await expect(page.getByText(fixture.promotionName).first()).toBeVisible();
  const promoted = await must(
    "PUBLIC_DETAIL_PROMOTION",
    anon.rpc("storefront_product_detail_v1", {
      p_publication_id: publication.id,
      p_shop_slug: fixture.shopSlug,
    }),
  );
  expect(promoted.status).toBe("ok");
  expect(promoted.item.priceClp).toBe(900);

  await page.goto(`/shop/storefront?area=promotions&shop_id=${fixture.shopId}`);
  const promotionCard = page.locator("article").filter({ hasText: fixture.promotionName }).first();
  await promotionCard.getByText("Modifica promozione").click();
  await promotionCard.getByLabel("Stato promozione").selectOption("paused");
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop/storefront" && url.searchParams.get("area") === "promotions" && url.searchParams.get("result") === "success"),
    promotionCard.getByRole("button", { name: "Aggiorna promozione" }).click(),
  ]);
  const promotionPaused = await must(
    "PUBLIC_DETAIL_PROMOTION_PAUSED",
    anon.rpc("storefront_product_detail_v1", {
      p_publication_id: publication.id,
      p_shop_slug: fixture.shopSlug,
    }),
  );
  expect(promotionPaused.item.priceClp).toBe(1000);

  await storefrontSections.getByRole("link", { name: "Audit", exact: true }).click();
  await expect(page.getByText("shop.storefront.publication.upsert.success")).toBeVisible();
  await expect(page.getByText("shop.storefront.promotion.upsert.success").first()).toBeVisible();
  await storefrontSections.getByRole("link", { name: "Catalogo", exact: true }).click();
  const publishedRow = page.locator("article").filter({ hasText: fixture.publicName }).first();
  await publishedRow.getByText("Modifica pubblicazione").click();
  await publishedRow.getByLabel("Stato pubblicazione").selectOption("paused");
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop/storefront" && url.searchParams.get("result") === "success"),
    publishedRow.getByRole("button", { name: "Salva e rivalida server-side" }).click(),
  ]);
  const hidden = await must(
    "PUBLIC_DETAIL_AFTER_PAUSE",
    anon.rpc("storefront_product_detail_v1", {
      p_publication_id: publication.id,
      p_shop_slug: fixture.shopSlug,
    }),
  );
  expect(hidden.status).toBe("unavailable");
});
