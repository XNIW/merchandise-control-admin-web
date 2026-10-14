import { execFileSync } from "node:child_process";
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
} from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const EXPECTED_PROJECT_REF = "jpgoimipbothfgkokyvm";
const EXPECTED_SUPABASE_ORIGIN =
  "https://jpgoimipbothfgkokyvm.supabase.co";
const EXPECTED_APP_ORIGIN =
  "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";
const EXPECTED_CONFIRMATION = "RUN_ADMIN_REVISION_CONFLICT_STAGING";
const EXPECTED_POOLER_HOST = "aws-1-sa-east-1.pooler.supabase.com";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_MARKER_PATTERN = /^ARC_[0-9]{1,20}_[0-9]{1,5}_[A-F0-9]{10}$/;
const EVIDENCE_PATH = join(
  process.cwd(),
  "test-results/admin-live-product-revision-conflict/summary.json",
);

type Runtime = {
  appOrigin: string;
  commitSha: string;
  deploymentId: string;
  publishableKey: string;
  serviceRoleKey: string;
  supabaseOrigin: string;
  versionId: string;
};

type ScenarioEvidence = {
  bothReadRevisionX: boolean;
  draftAPreservedAfterConflict: boolean;
  duplicateSyncEvents: number;
  reloadDisplayedServerB: boolean;
  serverPreservedB: boolean;
  staleRevisionAuditRows: number;
  staleRevisionRejected: boolean;
  successfulSyncEvents: number;
  uiSessions: number;
};

type Evidence = {
  cleanup: {
    auditSnapshotRows: number;
    exactIdentifiersOnly: boolean;
    mutableResidualRows: number;
    status: "NOT_RUN" | "PASS" | "FAIL";
  };
  correlationMarker: string;
  deployment: {
    deploymentIdSha256: string;
    exactCommit: boolean;
    versionIdSha256: string;
  };
  owner: ScenarioEvidence;
  schemaVersion: 1;
  staff: ScenarioEvidence;
  status: "RUNNING" | "PASS" | "FAIL";
  target: "staging";
  workflowCommit: string;
};

type Fixture = {
  attemptKeyHash: string;
  correlationMarker: string;
  mappingId: string;
  ownerEmail: string;
  ownerId: string;
  ownerPassword: string;
  ownerProductId: string;
  ownerProductNameX: string;
  shopCode: string;
  shopId: string;
  shopMemberId: string;
  shopName: string;
  staffCode: string;
  staffId: string;
  staffPin: string;
  staffProductId: string;
  staffProductNameX: string;
};

type ProductState = {
  productName: string;
  revision: string;
  staleAuditRows: number;
  syncEvents: number;
};

function required(name: string) {
  const value = process.env[name]?.trim() ?? "";

  if (!value) {
    throw new Error(`BLOCKED_ADMIN_REVISION_${name}_REQUIRED`);
  }

  return value;
}

function exactOrigin(value: string, expected: string) {
  try {
    const url = new URL(value);

    return (
      url.origin === expected &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function runtimeFromEnvironment(): Runtime {
  const projectRef = required("SUPABASE_PROJECT_REF");
  const supabaseOrigin = required("NEXT_PUBLIC_SUPABASE_URL");
  const appOrigin = required("PLAYWRIGHT_BASE_URL");
  const commitSha = required("GITHUB_SHA");
  const deployedSha = required("ADMIN_REVISION_DEPLOYED_SHA");
  const allowlist = required("ALLOWED_STAGING_SUPABASE_PROJECT_REFS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const status = {
    appExact: exactOrigin(appOrigin, EXPECTED_APP_ORIGIN),
    commitExact:
      SHA_PATTERN.test(commitSha) &&
      commitSha === deployedSha &&
      commitSha === required("ADMIN_REVISION_EXPECTED_SHA"),
    confirmationExact:
      required("CONFIRM_ADMIN_REVISION_CONFLICT_STAGING") ===
      EXPECTED_CONFIRMATION,
    databaseExact:
      required("PGHOST") === EXPECTED_POOLER_HOST &&
      required("PGUSER") === `postgres.${EXPECTED_PROJECT_REF}` &&
      required("PGDATABASE") === "postgres" &&
      required("PGSSLMODE") === "require" &&
      required("PGPASSWORD").length > 0,
    genericStagingConfirmation:
      process.env.ALLOW_STAGING_E2E === "yes" &&
      process.env.CONFIRM_STAGING_E2E === "yes",
    projectExact:
      projectRef === EXPECTED_PROJECT_REF && allowlist.includes(projectRef),
    stagingOnly:
      process.env.TEST_TARGET === "staging" &&
      process.env.PLAYWRIGHT_DISABLE_WEB_SERVER === "1" &&
      process.env.CI === "true",
    supabaseExact: exactOrigin(supabaseOrigin, EXPECTED_SUPABASE_ORIGIN),
  };

  if (Object.values(status).some((value) => !value)) {
    throw new Error("BLOCKED_ADMIN_REVISION_STAGING_RUNTIME_MISMATCH");
  }

  return {
    appOrigin,
    commitSha,
    deploymentId: required("ADMIN_REVISION_DEPLOYMENT_ID"),
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseOrigin,
    versionId: required("ADMIN_REVISION_VERSION_ID"),
  };
}

function sqlText(value: string, label: string, pattern?: RegExp) {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value.includes("\0") ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(`ADMIN_REVISION_${label}_INVALID`);
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function sqlUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`ADMIN_REVISION_${label}_INVALID`);
  }

  return `'${value}'::uuid`;
}

function runSql(label: string, sql: string) {
  if (!sql.trim() || sql.length > 128_000) {
    throw new Error(`ADMIN_REVISION_${label}_SQL_INVALID`);
  }

  try {
    return execFileSync(
      "psql",
      ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      {
        encoding: "utf8",
        env: process.env,
        input: sql,
        maxBuffer: 512 * 1024,
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 30_000,
      },
    ).trim();
  } catch {
    throw new Error(`ADMIN_REVISION_${label}_FAILED`);
  }
}

function runJson<T>(label: string, sql: string): T {
  const output = runSql(label, sql);

  try {
    return JSON.parse(output) as T;
  } catch {
    throw new Error(`ADMIN_REVISION_${label}_OUTPUT_INVALID`);
  }
}

async function staffCredentialHash(plaintext: string) {
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      plaintext,
      salt,
      64,
      {
        N: 16_384,
        maxmem: 64 * 1024 * 1024,
        p: 1,
        r: 8,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });

  return [
    "",
    "scrypt-v1",
    "n=16384,r=8,p=1,l=64",
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function revisionMilliseconds(value: string) {
  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    throw new Error("ADMIN_REVISION_TIMESTAMP_INVALID");
  }

  return milliseconds;
}

function emptyScenario(): ScenarioEvidence {
  return {
    bothReadRevisionX: false,
    draftAPreservedAfterConflict: false,
    duplicateSyncEvents: -1,
    reloadDisplayedServerB: false,
    serverPreservedB: false,
    staleRevisionAuditRows: -1,
    staleRevisionRejected: false,
    successfulSyncEvents: -1,
    uiSessions: 0,
  };
}

function persistEvidence(evidence: Evidence) {
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function buildFixture(): Fixture {
  const nonce = randomBytes(5).toString("hex").toUpperCase();
  const runId = required("GITHUB_RUN_ID");
  const runAttempt = required("GITHUB_RUN_ATTEMPT");
  const correlationMarker = `ARC_${runId}_${runAttempt}_${nonce}`;

  if (!SAFE_MARKER_PATTERN.test(correlationMarker)) {
    throw new Error("ADMIN_REVISION_CORRELATION_MARKER_INVALID");
  }

  const fixture: Fixture = {
    attemptKeyHash: "",
    correlationMarker,
    mappingId: randomUUID(),
    ownerEmail: `admin-revision-${nonce.toLowerCase()}@example.invalid`,
    ownerId: "",
    ownerPassword: `Arc-${randomBytes(24).toString("base64url")}`,
    ownerProductId: randomUUID(),
    ownerProductNameX: `Owner X ${correlationMarker}`,
    shopCode: `STAGING_ARC_${nonce}`,
    shopId: randomUUID(),
    shopMemberId: randomUUID(),
    shopName: `ARC Synthetic ${correlationMarker}`,
    staffCode: `ARC_STAFF_${nonce}`,
    staffId: randomUUID(),
    staffPin: randomInt(100_000, 1_000_000).toString(),
    staffProductId: randomUUID(),
    staffProductNameX: `Staff X ${correlationMarker}`,
  };
  fixture.attemptKeyHash = `sha256:${sha256(
    `${fixture.shopCode}:${fixture.staffCode}`,
  )}`;

  return fixture;
}

async function seedFixture(runtime: Runtime, fixture: Fixture) {
  const nonce = fixture.correlationMarker.split("_").at(-1) ?? "";

  if (!/^[A-F0-9]{10}$/.test(nonce)) {
    throw new Error("ADMIN_REVISION_FIXTURE_NONCE_INVALID");
  }

  const admin = createClient(runtime.supabaseOrigin, runtime.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const created = await admin.auth.admin.createUser({
    email: fixture.ownerEmail,
    email_confirm: true,
    password: fixture.ownerPassword,
  });

  if (created.error || !created.data.user?.id) {
    throw new Error("ADMIN_REVISION_AUTH_FIXTURE_CREATE_FAILED");
  }

  fixture.ownerId = created.data.user.id;
  const credentialHash = await staffCredentialHash(fixture.staffPin);
  const ownerId = sqlUuid(fixture.ownerId, "OWNER_ID");
  const shopId = sqlUuid(fixture.shopId, "SHOP_ID");
  const staffId = sqlUuid(fixture.staffId, "STAFF_ID");

  runSql(
    "FIXTURE_CREATE",
    [
      "begin;",
      "insert into public.profiles (profile_id, display_name, profile_status)",
      `values (${ownerId}, ${sqlText(`ARC Owner ${nonce}`, "OWNER_NAME")}, 'active')`,
      "on conflict (profile_id) do update set display_name = excluded.display_name,",
      "profile_status = 'active', disabled_at = null, disabled_by_profile_id = null, updated_at = now();",
      "insert into public.shops",
      "(shop_id, created_by_profile_id, shop_code, shop_name, shop_status, status_changed_by_profile_id)",
      `values (${shopId}, ${ownerId}, ${sqlText(fixture.shopCode, "SHOP_CODE", /^[A-Z0-9_]+$/)}, ${sqlText(fixture.shopName, "SHOP_NAME")}, 'active', ${ownerId});`,
      "insert into public.shop_members",
      "(shop_member_id, invited_by_profile_id, membership_status, profile_id, role_key, shop_id)",
      `values (${sqlUuid(fixture.shopMemberId, "MEMBER_ID")}, ${ownerId}, 'active', ${ownerId}, 'shop_owner', ${shopId});`,
      "insert into public.shop_inventory_sources",
      "(shop_inventory_source_id, owner_user_id, shop_id, source_kind, mapping_state, verified_at, verified_by_profile_id, created_by_profile_id)",
      `values (${sqlUuid(fixture.mappingId, "MAPPING_ID")}, ${ownerId}, ${shopId}, 'mobile_owner', 'mapped', now(), ${ownerId}, ${ownerId});`,
      "insert into public.staff_role_permissions",
      "(enabled, permission_key, role_key, shop_id, updated_by_profile_id)",
      `values (true, 'catalog.read', 'manager', ${shopId}, ${ownerId}), (true, 'catalog.write', 'manager', ${shopId}, ${ownerId});`,
      "insert into public.staff_accounts",
      "(staff_id, created_by_profile_id, credential_hash, credential_kind, credential_status, credential_updated_at, credential_version, display_name, failed_attempts, must_change_credential, role_key, session_invalidated_at, shop_id, staff_code, status, updated_by_profile_id)",
      `values (${staffId}, ${ownerId}, ${sqlText(credentialHash, "STAFF_HASH")}, 'pin', 'active', now(), 1, ${sqlText(`ARC Staff ${nonce}`, "STAFF_NAME")}, 0, false, 'manager', '2020-01-01T00:00:00Z'::timestamptz, ${shopId}, ${sqlText(fixture.staffCode, "STAFF_CODE", /^[A-Z0-9_]+$/)}, 'active', ${ownerId});`,
      "insert into public.inventory_products",
      "(id, owner_user_id, shop_id, barcode, item_number, product_name, purchase_price, retail_price, stock_quantity)",
      `values (${sqlUuid(fixture.ownerProductId, "OWNER_PRODUCT_ID")}, ${ownerId}, ${shopId}, ${sqlText(`ARC-O-${nonce}`, "OWNER_BARCODE")}, ${sqlText(`ARC-O-${nonce}`, "OWNER_ITEM")}, ${sqlText(fixture.ownerProductNameX, "OWNER_PRODUCT_NAME")}, 10, 15, 5),`,
      `(${sqlUuid(fixture.staffProductId, "STAFF_PRODUCT_ID")}, ${ownerId}, ${shopId}, ${sqlText(`ARC-S-${nonce}`, "STAFF_BARCODE")}, ${sqlText(`ARC-S-${nonce}`, "STAFF_ITEM")}, ${sqlText(fixture.staffProductNameX, "STAFF_PRODUCT_NAME")}, 20, 30, 8);`,
      "commit;",
    ].join(" "),
  );

}

function productState(fixture: Fixture, productId: string, actor: "owner" | "staff") {
  const actorPredicate =
    actor === "owner"
      ? `audit.actor_profile_id = ${sqlUuid(fixture.ownerId, "OWNER_AUDIT_ID")}`
      : `audit.actor_staff_id = ${sqlUuid(fixture.staffId, "STAFF_AUDIT_ID")}`;

  return runJson<ProductState>(
    `${actor.toUpperCase()}_PRODUCT_STATE`,
    [
      "select json_build_object(",
      "'productName', product.product_name,",
      "'revision', product.updated_at,",
      "'syncEvents', (select count(*) from public.sync_events event",
      `where event.shop_id = ${sqlUuid(fixture.shopId, "STATE_SHOP_ID")}`,
      "and event.entity_ids @> jsonb_build_object('product_ids', jsonb_build_array(product.id))),",
      "'staleAuditRows', (select count(*) from public.audit_logs audit",
      `where audit.shop_id = ${sqlUuid(fixture.shopId, "AUDIT_SHOP_ID")}`,
      "and audit.event_key = 'shop.catalog.product.update.stale_revision'",
      "and audit.target_type = 'product'",
      "and audit.target_id = product.id::text",
      `and ${actorPredicate})`,
      ") from public.inventory_products product",
      `where product.id = ${sqlUuid(productId, "STATE_PRODUCT_ID")}`,
      `and product.shop_id = ${sqlUuid(fixture.shopId, "STATE_PRODUCT_SHOP_ID")};`,
    ].join(" "),
  );
}

async function goto(page: Page, path: string) {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(20_000);
  await page.goto(path, { waitUntil: "domcontentloaded" });

  if ((await page.locator("form").count()) > 0) {
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("form")).some((form) =>
          Object.keys(form).some((key) => key.startsWith("__reactProps$")),
        ),
      undefined,
      { timeout: 20_000 },
    );
  }
}

async function signInOwner(page: Page, fixture: Fixture) {
  await goto(page, "/auth/login?next=/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.ownerEmail);
  await page.getByLabel("Password").fill(fixture.ownerPassword);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function signInStaff(page: Page, fixture: Fixture) {
  await goto(page, "/auth/login?next=/shop&mode=shop-code");
  await page.getByRole("textbox", { name: "Shop code" }).fill(fixture.shopCode);
  await page.getByRole("textbox", { name: "Staff code" }).fill(fixture.staffCode);
  await page.getByLabel("PIN / password").fill(fixture.staffPin);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function openProduct(page: Page, fixture: Fixture, productId: string) {
  await goto(
    page,
    `/shop/products?shop_id=${fixture.shopId}&product_action=edit&product_id=${productId}`,
  );
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Product name")).toBeVisible();
  return dialog;
}

async function submitSave(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/shop/products" &&
      Boolean(response.request().headers()["next-action"]),
  );
  const [response] = await Promise.all([
    responsePromise,
    page.getByRole("dialog").getByRole("button", { name: "Save" }).click(),
  ]);

  expect(response.status()).toBe(200);
}

async function runConflictScenario(input: {
  actor: "owner" | "staff";
  browser: Browser;
  evidence: ScenarioEvidence;
  fixture: Fixture;
  initialName: string;
  productId: string;
  signIn: (page: Page, fixture: Fixture) => Promise<void>;
}) {
  const contexts: BrowserContext[] = [];

  try {
    const contextA = await input.browser.newContext({
      baseURL: EXPECTED_APP_ORIGIN,
      locale: "en-US",
    });
    const contextB = await input.browser.newContext({
      baseURL: EXPECTED_APP_ORIGIN,
      locale: "en-US",
    });
    contexts.push(contextA, contextB);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await Promise.all([
      input.signIn(pageA, input.fixture),
      input.signIn(pageB, input.fixture),
    ]);
    input.evidence.uiSessions = 2;

    const [dialogA, dialogB] = await Promise.all([
      openProduct(pageA, input.fixture, input.productId),
      openProduct(pageB, input.fixture, input.productId),
    ]);
    await expect(dialogA.getByLabel("Product name")).toHaveValue(input.initialName);
    await expect(dialogB.getByLabel("Product name")).toHaveValue(input.initialName);
    const revisionA = await dialogA
      .locator('input[name="expectedUpdatedAt"]')
      .inputValue();
    const revisionB = await dialogB
      .locator('input[name="expectedUpdatedAt"]')
      .inputValue();
    const initialState = productState(
      input.fixture,
      input.productId,
      input.actor,
    );
    expect(revisionA).toBe(revisionB);
    expect(revisionMilliseconds(revisionA)).toBe(
      revisionMilliseconds(initialState.revision),
    );
    input.evidence.bothReadRevisionX = true;

    const nameB = `${input.initialName} B`;
    const nameA = `${input.initialName} A`;
    await dialogB.getByLabel("Product name").fill(nameB);
    await submitSave(pageB);
    await expect
      .poll(
        () =>
          productState(
            input.fixture,
            input.productId,
            input.actor,
          ).productName,
        { timeout: 20_000 },
      )
      .toBe(nameB);
    const committedState = productState(
      input.fixture,
      input.productId,
      input.actor,
    );
    expect(committedState.revision).not.toBe(initialState.revision);

    await dialogA.getByLabel("Product name").fill(nameA);
    await submitSave(pageA);
    const conflict = dialogA.getByRole("alert");
    await expect(
      conflict.getByRole("heading", {
        name: "A newer product version is available",
      }),
    ).toBeVisible();
    await expect(dialogA.getByLabel("Product name")).toHaveValue(nameA);
    input.evidence.staleRevisionRejected = true;
    input.evidence.draftAPreservedAfterConflict = true;

    const staleState = productState(
      input.fixture,
      input.productId,
      input.actor,
    );
    expect(staleState.productName).toBe(nameB);
    expect(revisionMilliseconds(staleState.revision)).toBe(
      revisionMilliseconds(committedState.revision),
    );
    expect(staleState.syncEvents - initialState.syncEvents).toBe(1);
    expect(staleState.staleAuditRows - initialState.staleAuditRows).toBe(1);
    input.evidence.serverPreservedB = true;
    input.evidence.successfulSyncEvents = 1;
    input.evidence.duplicateSyncEvents = 0;
    input.evidence.staleRevisionAuditRows = 1;

    await conflict
      .getByRole("button", { name: "Reload server version" })
      .click();
    await expect(conflict).toHaveCount(0);
    await expect(dialogA.getByRole("heading", { level: 2, name: nameB })).toBeVisible();
    await expect(dialogA.getByLabel("Product name")).toHaveValue(nameA);
    expect(
      revisionMilliseconds(
        await dialogA
          .locator('input[name="expectedUpdatedAt"]')
          .inputValue(),
      ),
    ).toBe(revisionMilliseconds(committedState.revision));
    input.evidence.reloadDisplayedServerB = true;
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
}

async function cleanupFixture(runtime: Runtime, fixture: Fixture | null) {
  if (!fixture?.ownerId) {
    return { auditSnapshotRows: 0, mutableResidualRows: 0 };
  }

  const ownerId = sqlUuid(fixture.ownerId, "CLEANUP_OWNER_ID");
  const shopId = sqlUuid(fixture.shopId, "CLEANUP_SHOP_ID");
  const staffId = sqlUuid(fixture.staffId, "CLEANUP_STAFF_ID");
  const ownerProductId = sqlUuid(
    fixture.ownerProductId,
    "CLEANUP_OWNER_PRODUCT_ID",
  );
  const staffProductId = sqlUuid(
    fixture.staffProductId,
    "CLEANUP_STAFF_PRODUCT_ID",
  );
  const marker = sqlText(
    fixture.correlationMarker,
    "CLEANUP_MARKER",
    SAFE_MARKER_PATTERN,
  );

  runSql(
    "CLEANUP",
    [
      "begin;",
      "do $$ begin",
      `if exists (select 1 from public.shops where shop_id = ${shopId} and (shop_code <> ${sqlText(fixture.shopCode, "CLEANUP_SHOP_CODE")} or shop_name <> ${sqlText(fixture.shopName, "CLEANUP_SHOP_NAME")} or created_by_profile_id <> ${ownerId})) then`,
      "raise exception 'fixture scope mismatch'; end if; end $$;",
      "insert into public.audit_logs",
      "(actor_profile_id, scope, shop_id, event_key, severity, result, target_type, target_id, metadata_redacted)",
      "select null, 'global', null, 'qa.admin.revision_conflict.cleanup.snapshot', 'info', 'success', 'shop',",
      `${sqlText(fixture.shopId, "CLEANUP_TARGET_ID")},`,
      "jsonb_build_object(",
      `'correlation_marker', ${marker},`,
      "'source', 'admin-live-product-revision-conflict',",
      "'audit_snapshot', coalesce((select jsonb_agg(jsonb_build_object(",
      "'audit_log_id', audit.audit_log_id, 'actor_profile_id', audit.actor_profile_id,",
      "'actor_staff_id', audit.actor_staff_id, 'event_key', audit.event_key,",
      "'severity', audit.severity, 'result', audit.result, 'target_type', audit.target_type,",
      "'target_id', audit.target_id, 'metadata_redacted', audit.metadata_redacted,",
      "'created_at', audit.created_at) order by audit.created_at, audit.audit_log_id)",
      "from public.audit_logs audit where audit.shop_id = " + shopId,
      `or audit.actor_profile_id = ${ownerId} or audit.actor_staff_id = ${staffId}), '[]'::jsonb),`,
      "'captured_at', now())",
      `where exists (select 1 from public.shops where shop_id = ${shopId})`,
      "and not exists (select 1 from public.audit_logs snapshot",
      "where snapshot.scope = 'global' and snapshot.shop_id is null",
      "and snapshot.event_key = 'qa.admin.revision_conflict.cleanup.snapshot'",
      `and snapshot.target_id = ${sqlText(fixture.shopId, "CLEANUP_SNAPSHOT_TARGET")}`,
      `and snapshot.metadata_redacted->>'correlation_marker' = ${marker});`,
      "select set_config('app.platform_allow_test_audit_delete', 'on', true);",
      `delete from public.audit_logs where shop_id = ${shopId} or actor_profile_id = ${ownerId} or actor_staff_id = ${staffId};`,
      "select set_config('app.platform_allow_test_audit_delete', 'off', true);",
      `delete from public.staff_web_sessions where shop_id = ${shopId} and staff_id = ${staffId};`,
      `delete from public.staff_web_login_attempts where attempt_key_hash = ${sqlText(fixture.attemptKeyHash, "CLEANUP_ATTEMPT_HASH", /^sha256:[0-9a-f]{64}$/)};`,
      `delete from public.pos_sale_lines where shop_id = ${shopId};`,
      `delete from public.pos_sales where shop_id = ${shopId};`,
      `delete from public.pos_sales_sync_batches where shop_id = ${shopId};`,
      `delete from public.pos_sessions where shop_id = ${shopId};`,
      `delete from public.pos_device_credentials where shop_id = ${shopId};`,
      `delete from public.platform_owner_invites where shop_id = ${shopId};`,
      `delete from public.shop_devices where shop_id = ${shopId};`,
      `delete from public.sync_events where shop_id = ${shopId} and owner_user_id = ${ownerId};`,
      `delete from public.inventory_product_prices where shop_id = ${shopId};`,
      `delete from public.inventory_products where shop_id = ${shopId} and owner_user_id = ${ownerId} and id in (${ownerProductId}, ${staffProductId});`,
      `delete from public.inventory_categories where shop_id = ${shopId} and owner_user_id = ${ownerId};`,
      `delete from public.inventory_suppliers where shop_id = ${shopId} and owner_user_id = ${ownerId};`,
      `delete from public.shared_sheet_sessions where shop_id = ${shopId} and owner_user_id = ${ownerId};`,
      `delete from public.staff_role_permissions where shop_id = ${shopId} and role_key = 'manager';`,
      `delete from public.staff_accounts where staff_id = ${staffId} and shop_id = ${shopId};`,
      `delete from public.shop_members where shop_member_id = ${sqlUuid(fixture.shopMemberId, "CLEANUP_MEMBER_ID")} and shop_id = ${shopId} and profile_id = ${ownerId};`,
      `delete from public.shop_inventory_sources where shop_inventory_source_id = ${sqlUuid(fixture.mappingId, "CLEANUP_MAPPING_ID")} and shop_id = ${shopId} and owner_user_id = ${ownerId};`,
      `delete from public.shops where shop_id = ${shopId} and shop_code = ${sqlText(fixture.shopCode, "CLEANUP_DELETE_SHOP_CODE")} and created_by_profile_id = ${ownerId};`,
      "commit;",
    ].join(" "),
  );

  const admin = createClient(runtime.supabaseOrigin, runtime.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const authRows = Number(
    runSql(
      "AUTH_RESIDUE_PREDELETE",
      `select count(*) from auth.users where id = ${ownerId};`,
    ),
  );

  if (!Number.isSafeInteger(authRows) || authRows < 0 || authRows > 1) {
    throw new Error("ADMIN_REVISION_AUTH_FIXTURE_SCOPE_INVALID");
  }

  if (authRows === 1) {
    const deleted = await admin.auth.admin.deleteUser(fixture.ownerId);

    if (deleted.error) {
      throw new Error("ADMIN_REVISION_AUTH_FIXTURE_DELETE_FAILED");
    }
  }

  const residue = runJson<{
    auditSnapshotRows: number;
    mutableResidualRows: number;
  }>(
    "RESIDUE_VERIFY",
    [
      "select json_build_object(",
      "'mutableResidualRows',",
      `(select count(*) from auth.users where id = ${ownerId}) +`,
      `(select count(*) from public.profiles where profile_id = ${ownerId}) +`,
      `(select count(*) from public.shops where shop_id = ${shopId}) +`,
      `(select count(*) from public.shop_members where shop_member_id = ${sqlUuid(fixture.shopMemberId, "RESIDUE_MEMBER_ID")}) +`,
      `(select count(*) from public.shop_inventory_sources where shop_inventory_source_id = ${sqlUuid(fixture.mappingId, "RESIDUE_MAPPING_ID")}) +`,
      `(select count(*) from public.staff_accounts where staff_id = ${staffId}) +`,
      `(select count(*) from public.staff_web_sessions where shop_id = ${shopId} and staff_id = ${staffId}) +`,
      `(select count(*) from public.staff_web_login_attempts where attempt_key_hash = ${sqlText(fixture.attemptKeyHash, "RESIDUE_ATTEMPT_HASH", /^sha256:[0-9a-f]{64}$/)}) +`,
      `(select count(*) from public.staff_role_permissions where shop_id = ${shopId}) +`,
      `(select count(*) from public.inventory_products where id in (${ownerProductId}, ${staffProductId})) +`,
      `(select count(*) from public.inventory_product_prices where shop_id = ${shopId}) +`,
      `(select count(*) from public.sync_events where shop_id = ${shopId}) +`,
      `(select count(*) from public.audit_logs where shop_id = ${shopId} or actor_profile_id = ${ownerId} or actor_staff_id = ${staffId}),`,
      "'auditSnapshotRows', (select count(*) from public.audit_logs snapshot",
      "where snapshot.scope = 'global' and snapshot.shop_id is null",
      "and snapshot.event_key = 'qa.admin.revision_conflict.cleanup.snapshot'",
      `and snapshot.target_id = ${sqlText(fixture.shopId, "RESIDUE_TARGET_ID")}`,
      `and snapshot.metadata_redacted->>'correlation_marker' = ${marker})`,
      ");",
    ].join(" "),
  );

  if (residue.mutableResidualRows !== 0 || residue.auditSnapshotRows !== 1) {
    throw new Error("ADMIN_REVISION_EXACT_CLEANUP_RESIDUE");
  }

  runSql(
    "ALL_SHOP_RESIDUE_VERIFY",
    [
      "do $$ declare target record; residue_count bigint; begin",
      "for target in select column_row.table_schema, column_row.table_name",
      "from information_schema.columns column_row",
      "join information_schema.tables tables on tables.table_schema = column_row.table_schema",
      "and tables.table_name = column_row.table_name",
      "where column_row.table_schema in ('public', 'app_private')",
      "and column_row.column_name = 'shop_id' and column_row.udt_name = 'uuid'",
      "and tables.table_type = 'BASE TABLE' loop",
      "execute format('select count(*) from %I.%I where shop_id = $1',",
      "target.table_schema, target.table_name) into residue_count using",
      `${shopId};`,
      "if residue_count <> 0 then raise exception 'shop-scoped fixture residue';",
      "end if; end loop; end $$;",
    ].join(" "),
  );

  return residue;
}

test("staging deployed UI rejects stale owner and staff product revisions", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const runtime = runtimeFromEnvironment();
  let fixture: Fixture | null = null;
  const evidence: Evidence = {
    cleanup: {
      auditSnapshotRows: 0,
      exactIdentifiersOnly: true,
      mutableResidualRows: -1,
      status: "NOT_RUN",
    },
    correlationMarker: "PENDING",
    deployment: {
      deploymentIdSha256: sha256(runtime.deploymentId),
      exactCommit: runtime.commitSha === required("ADMIN_REVISION_DEPLOYED_SHA"),
      versionIdSha256: sha256(runtime.versionId),
    },
    owner: emptyScenario(),
    schemaVersion: 1,
    staff: emptyScenario(),
    status: "RUNNING",
    target: "staging",
    workflowCommit: runtime.commitSha,
  };
  let testFailure: unknown = null;

  try {
    fixture = buildFixture();
    evidence.correlationMarker = fixture.correlationMarker;
    persistEvidence(evidence);
    await seedFixture(runtime, fixture);

    await runConflictScenario({
      actor: "owner",
      browser,
      evidence: evidence.owner,
      fixture,
      initialName: fixture.ownerProductNameX,
      productId: fixture.ownerProductId,
      signIn: signInOwner,
    });
    await runConflictScenario({
      actor: "staff",
      browser,
      evidence: evidence.staff,
      fixture,
      initialName: fixture.staffProductNameX,
      productId: fixture.staffProductId,
      signIn: signInStaff,
    });
  } catch (error) {
    testFailure = error;
  } finally {
    try {
      const cleanup = await cleanupFixture(runtime, fixture);
      evidence.cleanup = {
        ...cleanup,
        exactIdentifiersOnly: true,
        status: "PASS",
      };
    } catch (error) {
      evidence.cleanup.status = "FAIL";
      testFailure ??= error;
    }
    evidence.status = testFailure ? "FAIL" : "PASS";
    persistEvidence(evidence);
  }

  if (testFailure) {
    throw testFailure;
  }

  expect(evidence.owner).toEqual({
    bothReadRevisionX: true,
    draftAPreservedAfterConflict: true,
    duplicateSyncEvents: 0,
    reloadDisplayedServerB: true,
    serverPreservedB: true,
    staleRevisionAuditRows: 1,
    staleRevisionRejected: true,
    successfulSyncEvents: 1,
    uiSessions: 2,
  });
  expect(evidence.staff).toEqual(evidence.owner);
  expect(evidence.cleanup).toEqual({
    auditSnapshotRows: 1,
    exactIdentifiersOnly: true,
    mutableResidualRows: 0,
    status: "PASS",
  });
});
