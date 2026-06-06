import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type RuntimeFixture = {
  cleanup: () => Promise<void>;
  email: string;
  password: string;
  supabase: SupabaseClient;
  userId: string;
};

type CreatedData = {
  pendingShopCode?: string;
  shopCode?: string;
  staffCode?: string;
};

type SupabaseOperationResult = {
  error: { code?: string; message?: string } | null;
};

const platformRoutes = [
  { heading: "Platform Overview", label: "Overview", path: "/platform" },
  { heading: "Users / Profiles", label: "Users", path: "/platform/users" },
  { heading: "Shops", label: "Shops", path: "/platform/shops" },
  { heading: "Provisioning", label: "Provisioning", path: "/platform/provisioning" },
  { heading: "Platform Admins", label: "Admins", path: "/platform/admins" },
  { heading: "Audit", label: "Audit", path: "/platform/audit" },
  { heading: "System Status", label: "System", path: "/platform/system" },
  { heading: "Data Health", label: "Data", path: "/platform/data" },
  { heading: "Global History", label: "History", path: "/platform/history" },
  {
    heading: "Controlled Operations",
    label: "Operations",
    path: "/platform/operations",
  },
  {
    heading: "Support Diagnostics",
    label: "Support",
    path: "/platform/support",
  },
] as const;

const diagnosticDeepLinks = [
  { heading: "Device Signals", hiddenLabel: "Devices", path: "/platform/devices" },
  { heading: "Sync Signals", hiddenLabel: "Sync", path: "/platform/sync" },
] as const;

function runtimeEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl)) {
    throw new Error("BLOCKED_TASK045_REQUIRES_LOCAL_SUPABASE_URL");
  }

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("BLOCKED_TASK045_REQUIRES_LOCAL_SUPABASE_KEYS");
  }

  return { serviceRoleKey, supabaseUrl };
}

function nonce() {
  return `${Date.now()}_${randomBytes(4).toString("hex").toUpperCase()}`;
}

async function expectSupabaseOk(
  label: string,
  operation: PromiseLike<SupabaseOperationResult>,
) {
  const result = await operation;
  expect(result.error, label).toBeNull();
}

async function createTemporaryPlatformAdmin(): Promise<RuntimeFixture> {
  const { serviceRoleKey, supabaseUrl } = runtimeEnv();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const userNonce = nonce().toLowerCase();
  const email = `task045-${userNonce}@example.invalid`;
  const password = `Task045-${randomBytes(18).toString("base64url")}`;
  const { data: createdUser, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
  const userId = createdUser.user?.id;

  if (createError || !userId) {
    throw new Error("BLOCKED_TASK045_USER_CREATE_FAILED");
  }

  const cleanup = async () => {
    const now = new Date().toISOString();

    await expectSupabaseOk(
      "revoke temporary TASK-045 platform admin",
      supabase
        .from("platform_admins")
        .update({
          reason_redacted: "TASK-045 final review cleanup revoked temporary admin.",
          revoked_at: now,
          revoked_by_profile_id: userId,
          status: "revoked",
        })
        .eq("profile_id", userId)
        .eq("status", "active"),
    );
    await expectSupabaseOk(
      "disable temporary TASK-045 profile",
      supabase
        .from("profiles")
        .update({
          disabled_at: now,
          disabled_by_profile_id: null,
          profile_status: "disabled",
          updated_at: now,
        })
        .eq("profile_id", userId),
    );

    const { data: activeAdmins, error: activeAdminError } = await supabase
      .from("platform_admins")
      .select("platform_admin_id")
      .eq("profile_id", userId)
      .eq("status", "active");
    expect(activeAdminError).toBeNull();
    expect(activeAdmins).toHaveLength(0);
  };

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      display_name: "TASK045 Platform Final Review",
      profile_id: userId,
      profile_status: "active",
    },
    { onConflict: "profile_id" },
  );

  if (profileError) {
    await cleanup();
    throw new Error("BLOCKED_TASK045_PROFILE_CREATE_FAILED");
  }

  const { error: adminError } = await supabase.from("platform_admins").insert({
    profile_id: userId,
    reason_redacted: "TASK-045 final review temporary platform admin.",
    status: "active",
  });

  if (adminError) {
    await cleanup();
    throw new Error("BLOCKED_TASK045_PLATFORM_ADMIN_CREATE_FAILED");
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_profile_id: userId,
    event_key: "task045.platform_admin.final_review_harness",
    metadata_redacted: {
      mode: "temporary_local_test_user",
      source: "tests/e2e/task-045-platform-master-console-final-review.spec.ts",
    },
    result: "success",
    scope: "global",
    severity: "info",
    target_id: userId,
    target_type: "platform_admin",
  });

  if (auditError) {
    await cleanup();
    throw new Error("BLOCKED_TASK045_AUDIT_CREATE_FAILED");
  }

  return {
    cleanup,
    email,
    password,
    supabase,
    userId,
  };
}

async function signIn(page: Page, fixture: RuntimeFixture) {
  await page.goto("/auth/login?next=/platform");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin account sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await Promise.all([
    page.waitForFunction(() => window.location.pathname === "/platform"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function archiveShopThroughOperations(page: Page, shopCode: string) {
  await page.goto("/platform/operations");
  const shopArticle = page.locator("article").filter({ hasText: shopCode });
  await expect(shopArticle).toBeVisible();
  const archiveForm = shopArticle.locator("form").filter({
    has: page.getByLabel("Type shop code to archive"),
  });

  await archiveForm
    .getByLabel("Reason")
    .fill("TASK-045 final review operational cleanup archive.");
  await archiveForm.getByLabel("Type shop code to archive").fill(shopCode);
  await archiveForm.getByRole("button", { name: "Soft delete shop" }).click();
  await page.waitForURL(/\/platform\/operations\?operation=soft_delete&result=success/);
  await expect(page.getByText("Operation completed.")).toBeVisible();
}

async function expectPlatformRoute(page: Page, heading: string, activeLabel: string) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByText("Read blocked")).toHaveCount(0);
  await expect(page.getByText("Request could not be completed")).toHaveCount(0);
  await expect(page.getByText("Rendering...")).toHaveCount(0);
  await expect(page.getByRole("link", { name: activeLabel })).toHaveAttribute(
    "aria-current",
    "page",
  );
}

async function expectDiagnosticDeepLink(
  page: Page,
  heading: string,
  hiddenLabel: string,
) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(page.getByText("Read blocked")).toHaveCount(0);
  await expect(page.getByText("Request could not be completed")).toHaveCount(0);
  await expect(page.getByText("Rendering...")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Platform sections" }).getByRole("link", {
      name: hiddenLabel,
    }),
  ).toHaveCount(0);
}

async function cleanupCreatedData(
  supabase: SupabaseClient,
  created: CreatedData,
  actorProfileId: string,
) {
  const shopCodes = [created.shopCode, created.pendingShopCode].filter(
    (code): code is string => Boolean(code),
  );

  if (shopCodes.length === 0) {
    return {
      auditLogsRetained: 0,
      nonArchivedShops: 0,
      invites: 0,
      posDeviceCredentials: 0,
      posSaleLines: 0,
      posSales: 0,
      posSalesSyncBatches: 0,
      posSessions: 0,
      shopDevices: 0,
      shopInventorySources: 0,
      shopMembers: 0,
      shops: 0,
      staffAccounts: 0,
      staffRolePermissions: 0,
      staffWebSessions: 0,
    };
  }

  const { data: shopRows } = await supabase
    .from("shops")
    .select("shop_id")
    .in("shop_code", shopCodes);
  const shopIds = shopRows?.map((shop) => shop.shop_id).filter(Boolean) ?? [];

  if (shopIds.length > 0) {
    const { data: staffRows } = await supabase
      .from("staff_accounts")
      .select("staff_id")
      .in("shop_id", shopIds);
    const staffIds = staffRows?.map((staff) => staff.staff_id).filter(Boolean) ?? [];

    if (staffIds.length > 0) {
      await expectSupabaseOk(
        "delete staff web sessions by staff",
        supabase.from("staff_web_sessions").delete().in("staff_id", staffIds),
      );
    }

    await expectSupabaseOk(
      "delete POS sale lines",
      supabase.from("pos_sale_lines").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete POS sales",
      supabase.from("pos_sales").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete POS sales sync batches",
      supabase.from("pos_sales_sync_batches").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete POS sessions",
      supabase.from("pos_sessions").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete POS device credentials",
      supabase.from("pos_device_credentials").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete shop devices",
      supabase.from("shop_devices").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete platform owner invites",
      supabase.from("platform_owner_invites").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete staff role permissions",
      supabase.from("staff_role_permissions").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete staff accounts",
      supabase.from("staff_accounts").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete shop members",
      supabase.from("shop_members").delete().in("shop_id", shopIds),
    );
    await expectSupabaseOk(
      "delete shop inventory source mappings",
      supabase.from("shop_inventory_sources").delete().in("shop_id", shopIds),
    );
    const now = new Date().toISOString();
    await expectSupabaseOk(
      "archive temporary TASK-045 shops",
      supabase
        .from("shops")
        .update({
          archived_at: now,
          archived_by_profile_id: actorProfileId,
          shop_status: "archived",
          status_changed_at: now,
          status_changed_by_profile_id: actorProfileId,
          status_reason_redacted:
            "TASK-045 final review cleanup archived temporary local shop.",
          suspended_at: null,
          suspended_by_profile_id: null,
          updated_at: now,
        })
        .in("shop_id", shopIds)
        .neq("shop_status", "archived"),
    );
  }

  const [
    shops,
    shopMembers,
    staffAccounts,
    permissions,
    sessions,
    invites,
    inventorySources,
    devices,
    credentials,
    posSessions,
    batches,
    sales,
    saleLines,
    auditLogs,
  ] = await Promise.all([
    supabase.from("shops").select("shop_id,shop_status").in("shop_code", shopCodes),
    shopIds.length > 0
      ? supabase.from("shop_members").select("shop_member_id").in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase.from("staff_accounts").select("staff_id").in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase
          .from("staff_role_permissions")
          .select("staff_role_permission_id")
          .in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase.from("staff_web_sessions").select("staff_web_session_id").in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase
          .from("platform_owner_invites")
          .select("platform_owner_invite_id")
          .in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase
          .from("shop_inventory_sources")
          .select("shop_inventory_source_id")
          .in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase.from("shop_devices").select("shop_device_id").in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase
          .from("pos_device_credentials")
          .select("pos_device_credential_id")
          .in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase.from("pos_sessions").select("pos_session_id").in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase
          .from("pos_sales_sync_batches")
          .select("pos_sales_sync_batch_id")
          .in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase.from("pos_sales").select("pos_sale_id").in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase.from("pos_sale_lines").select("pos_sale_line_id").in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
    shopIds.length > 0
      ? supabase.from("audit_logs").select("audit_log_id").in("shop_id", shopIds)
      : Promise.resolve({ data: [] }),
  ]);
  const retainedShopRows = shops.data ?? [];

  return {
    auditLogsRetained: auditLogs.data?.length ?? 0,
    invites: invites.data?.length ?? 0,
    nonArchivedShops: retainedShopRows.filter(
      (shop) => shop.shop_status !== "archived",
    ).length,
    posDeviceCredentials: credentials.data?.length ?? 0,
    posSaleLines: saleLines.data?.length ?? 0,
    posSales: sales.data?.length ?? 0,
    posSalesSyncBatches: batches.data?.length ?? 0,
    posSessions: posSessions.data?.length ?? 0,
    shopDevices: devices.data?.length ?? 0,
    shopInventorySources: inventorySources.data?.length ?? 0,
    shopMembers: shopMembers.data?.length ?? 0,
    shops: retainedShopRows.length,
    staffAccounts: staffAccounts.data?.length ?? 0,
    staffRolePermissions: permissions.data?.length ?? 0,
    staffWebSessions: sessions.data?.length ?? 0,
  };
}

async function auditEventsForShop(
  supabase: SupabaseClient,
  shopId: string,
  eventKeys: readonly string[],
) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("event_key")
    .eq("shop_id", shopId)
    .in("event_key", [...eventKeys]);

  expect(error).toBeNull();
  return new Set(data?.map((row) => row.event_key) ?? []);
}

test.describe("TASK-045 Platform Master Console final review", () => {
  test.skip(
    process.env.CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST !== "yes",
    "Set CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST=yes with local Supabase env to run.",
  );

  test("platform console routes, provisioning, logout, and cleanup pass on local Supabase", async ({
    page,
  }) => {
    const fixture = await createTemporaryPlatformAdmin();
    const testNonce = nonce();
    const shopCode = `TASK045_SHOP_${testNonce}`.slice(0, 32);
    const pendingShopCode = `TASK045_PENDING_${testNonce}`.slice(0, 32);
    const staffCode = `TASK045_MGR_${testNonce}`.slice(0, 32);
    const created: CreatedData = {
      pendingShopCode,
      shopCode,
      staffCode,
    };

    try {
      await signIn(page, fixture);

      for (const route of platformRoutes) {
        await page.goto(route.path);
        await expectPlatformRoute(page, route.heading, route.label);
      }

      for (const route of diagnosticDeepLinks) {
        await page.goto(route.path);
        await expectDiagnosticDeepLink(page, route.heading, route.hiddenLabel);
      }

      await page.goto("/platform/admins");
      await expect(
        page.getByRole("heading", { level: 2, name: "Grant Platform Admin" }),
      ).toBeVisible();
      await page.goto("/platform/provisioning");
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Create shop with existing owner",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Create pending owner invite",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Provision POS manager web access",
        }),
      ).toBeVisible();

      await page.goto("/platform/operations");
      await expect(page.getByRole("heading", { level: 2, name: "Shop actions" })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Emergency devices" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Audit preview" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Create shop with existing owner",
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 2, name: "Grant Platform Admin" }),
      ).toHaveCount(0);

      await page.goto("/platform/provisioning");
      const createSection = page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 2,
          name: "Create shop with existing owner",
        }),
      });
      await createSection.getByLabel("Shop name").fill(`TASK045 Shop ${testNonce}`);
      await createSection.getByLabel("Shop code").fill(shopCode);
      await createSection.getByLabel("Initial owner").selectOption(fixture.userId);
      await createSection
        .getByLabel("Reason")
        .fill("TASK-045 final review create shop.");
      await createSection.getByRole("button", { name: "Create shop" }).dblclick();
      await page.waitForURL(/\/platform\/provisioning\?operation=create&result=success/);
      await expect(page.getByText("Shop created.")).toBeVisible();
      await expect(page.getByText("Rendering...")).toHaveCount(0);

      const { data: createdShops, error: createdShopError } = await fixture.supabase
        .from("shops")
        .select("shop_id,shop_code,shop_status")
        .eq("shop_code", shopCode);
      expect(createdShopError).toBeNull();
      expect(createdShops).toHaveLength(1);
      const shopId = createdShops?.[0]?.shop_id;
      if (!shopId) {
        throw new Error("TASK045_CREATED_SHOP_ID_MISSING");
      }

      const createAudit = await auditEventsForShop(fixture.supabase, shopId, [
        "platform.shop.create.success",
        "platform.shop.owner.assign.success",
      ]);
      expect(createAudit).toEqual(
        new Set([
          "platform.shop.create.success",
          "platform.shop.owner.assign.success",
        ]),
      );

      await page.goto("/platform/provisioning");
      await createSection.getByLabel("Shop name").fill(`TASK045 Duplicate ${testNonce}`);
      await createSection.getByLabel("Shop code").fill(shopCode);
      await createSection.getByLabel("Initial owner").selectOption(fixture.userId);
      await createSection
        .getByLabel("Reason")
        .fill("TASK-045 duplicate shop code proof.");
      await createSection.getByRole("button", { name: "Create shop" }).click();
      await page.waitForURL(
        /\/platform\/provisioning\?operation=create&result=duplicate_shop_code/,
      );
      await expect(page.getByText("A shop with this code already exists.")).toBeVisible();
      await expect(page.getByText("Rendering...")).toHaveCount(0);

      const { data: duplicateCheck, error: duplicateError } = await fixture.supabase
        .from("shops")
        .select("shop_id")
        .eq("shop_code", shopCode);
      expect(duplicateError).toBeNull();
      expect(duplicateCheck).toHaveLength(1);

      await page.goto("/platform/provisioning");
      const pendingSection = page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 2,
          name: "Create pending owner invite",
        }),
      });
      await pendingSection.getByLabel("Shop name").fill(`TASK045 Pending ${testNonce}`);
      await pendingSection.getByLabel("Shop code").fill(pendingShopCode);
      await pendingSection
        .getByLabel("Owner email")
        .fill(`owner-task045-${testNonce.toLowerCase()}@example.invalid`);
      await pendingSection
        .getByLabel("Reason")
        .fill("TASK-045 pending owner invite proof.");
      await pendingSection
        .getByRole("button", { name: "Create pending invite" })
        .click();
      await page.waitForURL(
        /\/platform\/provisioning\?operation=pending_owner_invite&result=success/,
      );
      await expect(page.getByText("Pending owner invite created.")).toBeVisible();

      const { data: pendingShopRows, error: pendingShopError } = await fixture.supabase
        .from("shops")
        .select("shop_id,shop_status")
        .eq("shop_code", pendingShopCode);
      expect(pendingShopError).toBeNull();
      expect(pendingShopRows).toHaveLength(1);
      expect(pendingShopRows?.[0]?.shop_status).toBe("pending_setup");
      const pendingShopId = pendingShopRows?.[0]?.shop_id;
      if (!pendingShopId) {
        throw new Error("TASK045_PENDING_SHOP_ID_MISSING");
      }

      const pendingAudit = await auditEventsForShop(
        fixture.supabase,
        pendingShopId,
        ["platform.shop.pending_owner_invite.success"],
      );
      expect(pendingAudit).toEqual(
        new Set(["platform.shop.pending_owner_invite.success"]),
      );

      await page.goto("/platform/provisioning");
      const managerSection = page.locator("section").filter({
        has: page.getByRole("heading", {
          level: 2,
          name: "Provision POS manager web access",
        }),
      });
      await managerSection.getByLabel("Shop").selectOption(shopId);
      await managerSection.getByLabel("Staff code").fill(staffCode);
      await managerSection
        .getByLabel("Display name")
        .fill("TASK045 Manager Web");
      await managerSection
        .getByLabel("Reason")
        .fill("TASK-045 POS manager web access proof.");
      await managerSection
        .getByRole("button", { name: "Provision manager access" })
        .click();
      await expect(
        managerSection.getByText("Staff manager web access was provisioned."),
      ).toBeVisible();
      await expect(managerSection.locator("code")).toContainText("mcstaff_mgr_");

      const { data: staffRows, error: staffError } = await fixture.supabase
        .from("staff_accounts")
        .select("staff_id,role_key,status")
        .eq("shop_id", shopId)
        .eq("staff_code", staffCode);
      expect(staffError).toBeNull();
      expect(staffRows).toHaveLength(1);
      expect(staffRows?.[0]?.role_key).toBe("manager");
      expect(staffRows?.[0]?.status).toBe("active");

      const { data: permissionRows, error: permissionError } = await fixture.supabase
        .from("staff_role_permissions")
        .select("enabled")
        .eq("shop_id", shopId)
        .eq("role_key", "manager")
        .eq("permission_key", "shop_admin.full_access");
      expect(permissionError).toBeNull();
      expect(permissionRows).toEqual([{ enabled: true }]);

      const { data: managerAudit, error: managerAuditError } = await fixture.supabase
        .from("audit_logs")
        .select("event_key")
        .eq("target_id", staffRows?.[0]?.staff_id ?? "")
        .eq("event_key", "platform.staff_manager_web.provision.success");
      expect(managerAuditError).toBeNull();
      expect(managerAudit).toHaveLength(1);

      await archiveShopThroughOperations(page, pendingShopCode);
      await archiveShopThroughOperations(page, shopCode);

      const { data: archivedShops, error: archivedShopError } = await fixture.supabase
        .from("shops")
        .select("shop_code,shop_status")
        .in("shop_code", [shopCode, pendingShopCode]);
      expect(archivedShopError).toBeNull();
      expect(archivedShops).toHaveLength(2);
      expect(archivedShops?.every((shop) => shop.shop_status === "archived")).toBe(
        true,
      );

      await page.goto("/platform/provisioning");
      await page.evaluate(() => {
        window.sessionStorage.setItem("task045_nav_marker", "same_document");
      });
      await page.getByRole("link", { name: "Users" }).click();
      for (const delay of [0, 50, 100, 200]) {
        await page.waitForTimeout(delay);
        await expect(page.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
          "aria-current",
          "page",
        );
      }
      await page.waitForURL("**/platform/users");
      await expectPlatformRoute(page, "Users / Profiles", "Users");
      const navMarker = await page.evaluate(() =>
        window.sessionStorage.getItem("task045_nav_marker"),
      );
      expect(navMarker).toBe("same_document");

      await page.getByRole("link", { name: "Logout" }).click();
      await page.waitForURL(/\/auth\/login\?logged_out=1/);
      await page.goto("/platform");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Master Console access required",
        }),
      ).toBeVisible();
    } finally {
      const residuals = await cleanupCreatedData(
        fixture.supabase,
        created,
        fixture.userId,
      );
      expect(residuals).toMatchObject({
        invites: 0,
        nonArchivedShops: 0,
        posDeviceCredentials: 0,
        posSaleLines: 0,
        posSales: 0,
        posSalesSyncBatches: 0,
        posSessions: 0,
        shopDevices: 0,
        shopInventorySources: 0,
        shopMembers: 0,
        staffAccounts: 0,
        staffRolePermissions: 0,
        staffWebSessions: 0,
      });
      expect(residuals.shops).toBeLessThanOrEqual(2);
      if (residuals.shops > 0) {
        expect(residuals.auditLogsRetained).toBeGreaterThan(0);
      }
      await fixture.cleanup();
    }
  });
});
