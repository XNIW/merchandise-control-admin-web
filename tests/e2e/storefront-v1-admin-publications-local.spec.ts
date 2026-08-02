import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";

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
  replacementSourceImageId: string;
  replacementSourceMainPath: string;
  replacementSourceThumbPath: string;
  shopId: string;
  shopSlug: string;
  sourceImageId: string;
  sourceMainPath: string;
  sourceThumbPath: string;
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
const sourceJpeg = Buffer.from(
  "/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ9AFA4//9k=",
  "base64",
);
const sourceJpegSha256 = createHash("sha256").update(sourceJpeg).digest("hex");

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

async function must<T>(
  label: string,
  operation: PromiseLike<{ data: T; error: unknown }>,
): Promise<NonNullable<T>> {
  const result = await operation;
  if (result.error || result.data == null) {
    throw new Error(`STOREFRONT_ADMIN_E2E_${label}`);
  }
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
    throw new Error("STOREFRONT_ADMIN_E2E_LOCAL_DB_REQUIRED");
  }
  return value;
}

function seedFixture(fixture: Fixture, nonce: string) {
  if (
    !uuidPattern.test(fixture.categoryId) ||
    !uuidPattern.test(fixture.productId) ||
    !uuidPattern.test(fixture.publicCategoryId) ||
    !uuidPattern.test(fixture.replacementSourceImageId) ||
    !uuidPattern.test(fixture.sourceImageId) ||
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
    select set_config('request.jwt.claims', '{"role":"service_role"}', true);
    insert into public.inventory_product_image_versions (
      id, shop_id, product_id, status, main_path, thumb_path,
      expected_main_sha256, expected_main_bytes, expected_main_width, expected_main_height,
      expected_thumb_sha256, expected_thumb_bytes, expected_thumb_width, expected_thumb_height,
      verified_main_sha256, verified_main_bytes, verified_main_width, verified_main_height,
      verified_main_mime_type, verified_thumb_sha256, verified_thumb_bytes,
      verified_thumb_width, verified_thumb_height, verified_thumb_mime_type,
      requested_by_profile_id, finalized_by_profile_id, actor_kind, finalized_at
    ) values (
      '${fixture.sourceImageId}'::uuid, '${fixture.shopId}'::uuid,
      '${fixture.productId}'::uuid, 'ready', '${fixture.sourceMainPath}',
      '${fixture.sourceThumbPath}', '${sourceJpegSha256}', ${sourceJpeg.byteLength}, 2, 3,
      '${sourceJpegSha256}', ${sourceJpeg.byteLength}, 2, 3,
      '${sourceJpegSha256}', ${sourceJpeg.byteLength}, 2, 3, 'image/jpeg',
      '${sourceJpegSha256}', ${sourceJpeg.byteLength}, 2, 3, 'image/jpeg',
      '${fixture.userId}'::uuid, '${fixture.userId}'::uuid, 'personal_account', now()
    );
    update public.inventory_products
       set primary_image_version_id='${fixture.sourceImageId}'::uuid,
           primary_image_updated_at=now()
     where id='${fixture.productId}'::uuid;
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
  execFileSync(
    "psql",
    [fixtureDatabaseUrl(), "-v", "ON_ERROR_STOP=1", "-f", "-"],
    {
      input: sql,
      stdio: ["pipe", "ignore", "ignore"],
    },
  );
}

function activateReplacementSource(fixture: Fixture) {
  if (
    !uuidPattern.test(fixture.shopId) ||
    !uuidPattern.test(fixture.productId) ||
    !uuidPattern.test(fixture.sourceImageId) ||
    !uuidPattern.test(fixture.replacementSourceImageId)
  )
    throw new Error("STOREFRONT_ADMIN_E2E_REPLACEMENT_SCOPE_INVALID");
  const sql = `
    begin;
    select set_config('request.jwt.claims', '{"role":"service_role"}', true);
    select set_config('request.jwt.claim.role', 'service_role', true);
    update public.inventory_product_image_versions
       set status='superseded', superseded_at=now()
     where id='${fixture.sourceImageId}'::uuid
       and shop_id='${fixture.shopId}'::uuid;
    insert into public.inventory_product_image_versions (
      id, shop_id, product_id, previous_version_id, status, main_path, thumb_path,
      expected_main_sha256, expected_main_bytes, expected_main_width, expected_main_height,
      expected_thumb_sha256, expected_thumb_bytes, expected_thumb_width, expected_thumb_height,
      verified_main_sha256, verified_main_bytes, verified_main_width, verified_main_height,
      verified_main_mime_type, verified_thumb_sha256, verified_thumb_bytes,
      verified_thumb_width, verified_thumb_height, verified_thumb_mime_type,
      requested_by_profile_id, finalized_by_profile_id, actor_kind, finalized_at
    ) values (
      '${fixture.replacementSourceImageId}'::uuid, '${fixture.shopId}'::uuid,
      '${fixture.productId}'::uuid, '${fixture.sourceImageId}'::uuid, 'ready',
      '${fixture.replacementSourceMainPath}', '${fixture.replacementSourceThumbPath}',
      '${sourceJpegSha256}', ${sourceJpeg.byteLength}, 2, 3,
      '${sourceJpegSha256}', ${sourceJpeg.byteLength}, 2, 3,
      '${sourceJpegSha256}', ${sourceJpeg.byteLength}, 2, 3, 'image/jpeg',
      '${sourceJpegSha256}', ${sourceJpeg.byteLength}, 2, 3, 'image/jpeg',
      '${fixture.userId}'::uuid, '${fixture.userId}'::uuid, 'personal_account', now()
    );
    update public.inventory_products
       set primary_image_version_id='${fixture.replacementSourceImageId}'::uuid,
           primary_image_updated_at=now()
     where id='${fixture.productId}'::uuid;
    commit;
  `;
  execFileSync(
    "psql",
    [fixtureDatabaseUrl(), "-v", "ON_ERROR_STOP=1", "-f", "-"],
    {
      input: sql,
      stdio: ["pipe", "ignore", "ignore"],
    },
  );
}

async function cleanup() {
  const fixture = state.fixture;
  if (!fixture) return;
  if (!uuidPattern.test(fixture.shopId) || !uuidPattern.test(fixture.userId)) {
    throw new Error("STOREFRONT_ADMIN_E2E_CLEANUP_SCOPE_INVALID");
  }
  const variants = await state.admin
    ?.from("storefront_image_publication_variants")
    .select("object_path")
    .eq("shop_id", fixture.shopId);
  const publicPaths = variants?.data?.map((item) => item.object_path) ?? [];
  if (publicPaths.length > 0) {
    await state.admin?.storage
      .from("storefront-product-images")
      .remove(publicPaths);
  }
  await state.admin?.storage
    .from("product-images")
    .remove([
      fixture.sourceMainPath,
      fixture.sourceThumbPath,
      fixture.replacementSourceMainPath,
      fixture.replacementSourceThumbPath,
    ]);
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
  test.skip(
    !runtime,
    "A guarded local or staging Supabase runtime is required.",
  );
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
  const sourceImageId = randomUUID();
  const replacementSourceImageId = randomUUID();
  const sourceMainPath = `shops/${shopId}/products/${productId}/primary/${sourceImageId}/main.jpg`;
  const sourceThumbPath = `shops/${shopId}/products/${productId}/primary/${sourceImageId}/thumb.jpg`;
  const replacementSourceMainPath = `shops/${shopId}/products/${productId}/primary/${replacementSourceImageId}/main.jpg`;
  const replacementSourceThumbPath = `shops/${shopId}/products/${productId}/primary/${replacementSourceImageId}/thumb.jpg`;
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
    replacementSourceImageId,
    replacementSourceMainPath,
    replacementSourceThumbPath,
    shopId,
    shopSlug,
    sourceImageId,
    sourceMainPath,
    sourceThumbPath,
    userId,
  };
  try {
    seedFixture(state.fixture, nonce);
    for (const path of [
      sourceMainPath,
      sourceThumbPath,
      replacementSourceMainPath,
      replacementSourceThumbPath,
    ]) {
      const upload = await admin.storage
        .from("product-images")
        .upload(path, sourceJpeg, {
          cacheControl: "3600",
          contentType: "image/jpeg",
          upsert: false,
        });
      if (upload.error) throw new Error("STOREFRONT_ADMIN_E2E_SOURCE_UPLOAD");
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
});

test.afterAll(cleanup);

test("owner publishes, previews, audits and pauses a Storefront product", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
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
  await expect(
    page.getByRole("heading", { level: 1, name: "Storefront" }),
  ).toBeVisible();
  const storefrontSections = page.getByLabel("Sezioni Storefront");
  const catalogTab = storefrontSections.getByRole("link", {
    exact: true,
    name: "Catalogo",
  });
  const categoriesTab = storefrontSections.getByRole("link", {
    exact: true,
    name: "Categorie pubbliche",
  });
  await catalogTab.focus();
  await page.keyboard.press("Tab");
  await expect(categoriesTab).toBeFocused();
  await page.setViewportSize({ height: 1_024, width: 768 });
  await expect(page.getByLabel("Filtri catalogo Storefront")).toBeVisible();
  await expect(page.getByLabel("Azioni multiple Storefront")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ height: 900, width: 1_440 });
  await attachUiScreenshot(page, testInfo, "admin-storefront-catalog");
  const row = page
    .locator("article")
    .filter({ hasText: fixture.productName })
    .first();
  await expect(row).toBeVisible();
  await row.getByText("Modifica pubblicazione").click();
  await expect(
    row.getByLabel(`Anteprima cliente ${fixture.productName}`),
  ).toBeVisible();
  const derivedAvailability = row.getByRole("status", {
    name: "Disponibilità commerciale: Non disponibile",
  });
  await expect(derivedAvailability).toBeVisible();
  await expect(derivedAvailability).toContainText(
    "Derivata server-side dallo stato operativo",
  );
  await expect(derivedAvailability).toContainText("La quantità resta privata");
  await expect(row.locator('[name="availabilityMode"]')).toHaveCount(0);
  await attachUiScreenshot(page, testInfo, "admin-storefront-editor");
  await row.getByLabel("Nome pubblico").fill(fixture.publicName);
  await row
    .getByLabel("Categoria pubblica")
    .selectOption(fixture.publicCategoryId);
  await row.getByLabel("Prezzo cliente CLP").fill("1000");
  await row.getByLabel("Prezzo precedente CLP").fill("1200");
  await row.getByLabel("Modalità prezzo").selectOption("override");
  await row.getByRole("checkbox", { name: "Ritiro", exact: true }).check();
  await row.getByLabel("Stato pubblicazione").selectOption("published");
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/shop/storefront" &&
        url.searchParams.get("result") === "success",
    ),
    row.getByRole("button", { name: "Salva e rivalida server-side" }).click(),
  ]);
  await expect(page.getByText(fixture.publicName).first()).toBeVisible();
  await expect(
    page.getByText("published", { exact: true }).first(),
  ).toBeVisible();
  const publishedRow = page
    .locator("article")
    .filter({ hasText: fixture.publicName })
    .first();
  await publishedRow.getByText("Modifica pubblicazione").click();
  await expect(
    publishedRow.getByRole("status", {
      name: "Disponibilità commerciale: Solo ritiro",
    }),
  ).toBeVisible();

  const publication = await must(
    "PUBLICATION_READ",
    state
      .admin!.from("storefront_product_publications")
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
  expect(visible.item.availability).toBe("pickup_only");

  await storefrontSections
    .getByRole("link", { name: "Promozioni", exact: true })
    .click();
  const createPromotion = page.locator("form").filter({
    has: page.getByRole("button", { name: "Crea promozione" }),
  });
  await createPromotion
    .getByLabel("Nome promozione")
    .fill(fixture.promotionName);
  await createPromotion.getByLabel("Stato promozione").selectOption("active");
  await createPromotion
    .getByLabel("Tipo sconto")
    .selectOption("percentage_bps");
  await createPromotion.getByLabel("Sconto percentuale").fill("10");
  await createPromotion.getByLabel("Fuso orario").selectOption("UTC");
  await createPromotion
    .getByLabel("Inizio")
    .fill(new Date(Date.now() - 5 * 60_000).toISOString().slice(0, 16));
  await createPromotion
    .getByLabel("Fine")
    .fill(new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 16));
  await createPromotion.getByLabel(`Includi ${fixture.publicName}`).check();
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/shop/storefront" &&
        url.searchParams.get("area") === "promotions" &&
        url.searchParams.get("result") === "success",
    ),
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
  const promotionCard = page
    .locator("article")
    .filter({ hasText: fixture.promotionName })
    .first();
  await promotionCard.getByText("Modifica promozione").click();
  await promotionCard.getByLabel("Stato promozione").selectOption("paused");
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/shop/storefront" &&
        url.searchParams.get("area") === "promotions" &&
        url.searchParams.get("result") === "success",
    ),
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

  await storefrontSections
    .getByRole("link", { name: "Anteprima", exact: true })
    .click();
  await expect(page.getByLabel("Anteprima mobile cliente")).toBeVisible();
  await expect(page.getByText(fixture.publicName).first()).toBeVisible();
  await attachUiScreenshot(page, testInfo, "admin-storefront-preview");

  await storefrontSections
    .getByRole("link", { name: "Immagini pubbliche", exact: true })
    .click();
  const sourceCard = page
    .locator("article")
    .filter({ hasText: fixture.publicName })
    .first();
  await expect(
    sourceCard.getByRole("button", { name: "Pubblica immagine" }),
  ).toBeEnabled();
  await sourceCard.getByRole("button", { name: "Pubblica immagine" }).click();
  const firstImageOutcome = page.getByText(/Immagine pubblica pronta\.|Errore:/);
  await expect(firstImageOutcome).toBeVisible({ timeout: 30_000 });
  await expect(firstImageOutcome).toHaveText("Immagine pubblica pronta.");

  const firstPublicImage = await must(
    "FIRST_PUBLIC_IMAGE",
    state
      .admin!.from("storefront_image_publications")
      .select(
        "id,publication_status,source_image_version_id,thumb_url,card_url,detail_url",
      )
      .eq("shop_id", fixture.shopId)
      .eq("source_image_version_id", fixture.sourceImageId)
      .single(),
  );
  expect(firstPublicImage.publication_status).toBe("published");
  expect(firstPublicImage.thumb_url).toContain("/storefront-product-images/");
  const firstVariants = await must(
    "FIRST_PUBLIC_VARIANTS",
    state
      .admin!.from("storefront_image_publication_variants")
      .select("variant,publication_status,object_path,content_type")
      .eq("image_publication_id", firstPublicImage.id)
      .order("variant"),
  );
  expect(firstVariants).toHaveLength(3);
  expect(firstVariants.map((item) => item.variant).sort()).toEqual([
    "card",
    "detail",
    "thumb",
  ]);
  expect(
    firstVariants.every(
      (item) =>
        item.publication_status === "ready" &&
        item.content_type === "image/webp",
    ),
  ).toBe(true);
  const publicWithImage = await must(
    "PUBLIC_DETAIL_IMAGE",
    anon.rpc("storefront_product_detail_v1", {
      p_publication_id: publication.id,
      p_shop_slug: fixture.shopSlug,
    }),
  );
  expect(publicWithImage.item.images.thumb).toContain(
    "/storefront-product-images/",
  );
  expect(JSON.stringify(publicWithImage)).not.toContain("/product-images/");

  activateReplacementSource(fixture);
  await page.goto(`/shop/storefront?area=images&shop_id=${fixture.shopId}`);
  const replacementCard = page
    .locator("article")
    .filter({ hasText: fixture.publicName })
    .first();
  await replacementCard
    .getByRole("button", { name: "Sostituisci immagine" })
    .click();
  const replacementOutcome = page.getByText(/Immagine pubblica pronta\.|Errore:/);
  await expect(replacementOutcome).toBeVisible({ timeout: 30_000 });
  await expect(replacementOutcome).toHaveText("Immagine pubblica pronta.");
  const replacementImage = await must(
    "REPLACEMENT_PUBLIC_IMAGE",
    state
      .admin!.from("storefront_image_publications")
      .select("id,publication_status")
      .eq("shop_id", fixture.shopId)
      .eq("source_image_version_id", fixture.replacementSourceImageId)
      .single(),
  );
  expect(replacementImage.publication_status).toBe("published");
  const supersededFirst = await must(
    "SUPERSEDED_FIRST_IMAGE",
    state
      .admin!.from("storefront_image_publications")
      .select("publication_status")
      .eq("id", firstPublicImage.id)
      .single(),
  );
  expect(supersededFirst.publication_status).toBe("superseded");

  await page.goto(`/shop/storefront?area=images&shop_id=${fixture.shopId}`);
  const priorVersion = page
    .locator("article")
    .filter({ hasText: firstPublicImage.id.slice(0, 8) });
  await priorVersion.getByRole("button", { name: "Ripristina" }).click();
  await expect(page.getByText("Rollback completato.")).toBeVisible({
    timeout: 30_000,
  });
  const restoredPublication = await must(
    "RESTORED_PUBLICATION_IMAGE",
    state
      .admin!.from("storefront_product_publications")
      .select("published_image_version_id")
      .eq("id", publication.id)
      .single(),
  );
  expect(restoredPublication.published_image_version_id).toBe(
    firstPublicImage.id,
  );

  await storefrontSections
    .getByRole("link", { name: "Audit", exact: true })
    .click();
  await expect(
    page.getByText("shop.storefront.publication.upsert.success"),
  ).toBeVisible();
  await expect(
    page.getByText("shop.storefront.promotion.upsert.success").first(),
  ).toBeVisible();
  await expect(
    page.getByText("shop.storefront.image.publish.success").first(),
  ).toBeVisible();
  await expect(
    page.getByText("shop.storefront.image.rollback.success"),
  ).toBeVisible();
  await attachUiScreenshot(page, testInfo, "admin-storefront-audit");
  await storefrontSections
    .getByRole("link", { name: "Catalogo", exact: true })
    .click();
  await publishedRow.getByText("Modifica pubblicazione").click();
  await publishedRow.getByLabel("Stato pubblicazione").selectOption("paused");
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/shop/storefront" &&
        url.searchParams.get("result") === "success",
    ),
    publishedRow
      .getByRole("button", { name: "Salva e rivalida server-side" })
      .click(),
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
