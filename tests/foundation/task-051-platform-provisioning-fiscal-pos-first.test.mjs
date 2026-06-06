import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertContains(source, snippet, message) {
  assert.ok(source.includes(snippet), message ?? `Missing snippet: ${snippet}`);
}

function assertInOrder(source, snippets, message) {
  let cursor = -1;

  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor + 1);

    assert.notEqual(
      next,
      -1,
      message ?? `Expected snippet after index ${cursor}: ${snippet}`,
    );
    cursor = next;
  }
}

test("TASK-051 migration adds platform-locked fiscal identity and POS-first bootstrap RPCs", () => {
  const migration = readProjectFile(
    "supabase/migrations/20260606120000_task_051_platform_provisioning_fiscal_pos_first.sql",
  );

  for (const column of [
    "company_rut",
    "business_giro",
    "business_address",
    "business_city",
    "legal_representative_rut",
    "fiscal_identity_locked_by_platform",
  ]) {
    assertContains(migration, `add column if not exists ${column}`);
  }

  assertContains(migration, "platform_create_shop_with_owner_bootstrap");
  assertContains(migration, "platform_create_pos_first_shop");
  assertContains(migration, "platform_create_shop_with_pending_owner_invite");
  assert.match(
    migration,
    /p_owner_profile_id[\s\S]{0,1600}'shop_owner'/,
    "Owner bootstrap must grant shop_owner, not platform_admin.",
  );
  assertContains(migration, "staff_code", "Migration must create the first staff manager.");
  assertContains(migration, "'1001'", "Initial staff manager code must default to 1001.");
  assertContains(migration, "'shop_admin.full_access'");
  assertContains(migration, "credential_hash");
  assertContains(migration, "credential_generated");
  assert.doesNotMatch(
    migration,
    /credential_raw|raw_credential|temporary_credential_value|one_time_sign_in_value/i,
    "Migration must never mention or persist raw credential values.",
  );
  assert.match(
    migration,
    /shops_company_rut_unique/i,
    "Company RUT must have a uniqueness guard separate from technical shop_code.",
  );
});

test("TASK-051 platform provisioning UI uses one create-shop form with owner setup modes and advanced recovery", () => {
  const page = readProjectFile("src/app/platform/provisioning/page.tsx");
  const panel = readProjectFile("src/app/platform/provisioning/ShopProvisioningForms.tsx");
  const picker = readProjectFile(
    "src/app/platform/provisioning/SearchableEntityPicker.tsx",
  );
  const staffPanel = readProjectFile(
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx",
  );
  const actions = readProjectFile("src/app/platform/provisioning/actions.ts");

  for (const snippet of [
    "Shop Provisioning",
    "Create shop",
    "Create the shop, fiscal identity, initial manager access, and optional owner setup.",
    "Shop identity",
    "Fiscal / Boleta identity",
    "Fiscal identity is managed by Master Console and shown read-only in Admin Console.",
    "Initial manager access",
    "Staff code: 1001",
    "Display name: manager",
    "Access: full Admin Console access",
    "Temporary credential. It is shown once after creation and should be changed after first access.",
    "Use Company RUT as Shop code",
    "Shop code is used for POS/Admin Console login. By default it uses Company RUT without dots or dash.",
    "76.123.456-7 -> 761234567",
    "76.123.456-K -> 76123456K",
    "Owner setup",
    "No personal owner now / POS-first",
    "Link existing personal owner",
    "Record pending owner email",
    "This records a pending owner setup. Email delivery is not active yet.",
    "Create POS-first shop",
    "Create shop with owner",
    "Create pending owner setup",
    "Shop created",
    "Shop name",
    "Company RUT",
    "Owner mode",
    "Staff code",
    "Temporary credential/PIN shown once",
    "Copy credential",
    "Save this credential now. It will not be shown again.",
    "Owner status",
    "Personal owner linked",
    "No personal owner yet",
    "Pending owner setup recorded",
    "Emergency recovery: recover initial manager 1001",
    "Use this only when an existing shop lost manager access. The server will restore or recreate manager 1001 and generate a new temporary credential. The old credential is never shown.",
  ]) {
    assertContains(`${page}\n${panel}`, snippet);
  }

  assertContains(page, "<details");
  assertContains(page, "ownerProfileOptions");
  assertContains(page, "shopOptions");
  assertContains(page, "status: formatToken(profile.profile_status)");
  assertContains(page, "status: formatToken(shop.shop_status)");
  assert.doesNotMatch(
    page,
    /\.filter\(\(profile\) => profile\.profile_status === "active"\)|\.filter\(\(shop\) => shop\.shop_status === "active"\)/,
    "Provisioning entity pickers must be scalable search lists, not active-only native-select feeds.",
  );
  assertContains(page, "StaffManagerProvisioningPanel");
  assertContains(panel, "InitialManagerSummary");
  assertContains(picker, "SearchableEntityPicker");
  assertContains(picker, "type SearchableEntityPickerItem");
  assertContains(picker, "hiddenInputName");
  assertContains(picker, "selectedSummaryLabel");
  assertContains(picker, "renderItemTitle");
  assertContains(picker, "renderItemSubtitle");
  assertContains(picker, "renderItemStatus");
  assertContains(picker, 'role="listbox"');
  assertContains(picker, 'role="option"');
  assertContains(picker, 'aria-selected={selected}');
  assertContains(picker, 'type="hidden"');
  assertContains(picker, "max-h-72");
  assertContains(picker, "No results");
  assertContains(panel, "OwnerProfilePicker");
  assertContains(panel, "SearchableEntityPicker");
  assertContains(panel, "ownerSetupMode");
  assertContains(panel, "shopCodeFromCompanyRut");
  assertContains(panel, "formatRutForFiscalDisplay");
  assertContains(panel, "setUseCompanyRutAsShopCode");
  assertContains(panel, 'checked={useCompanyRutAsShopCode}');
  assertContains(panel, 'name="ownerEmail"');
  assertContains(panel, 'placeholder="76.123.456-7"');
  assertContains(panel, 'placeholder="761234567"');
  assert.match(
    panel,
    /function ShopIdentityFields[\s\S]*Shop name[\s\S]*Company RUT[\s\S]*Use Company RUT as Shop code[\s\S]*Shop code/,
    "Create-shop identity inputs must be ordered as Shop name, Company RUT, RUT-derived toggle, then Shop code.",
  );
  assertInOrder(panel, [
    "Shop name",
    "Company RUT",
    "Use Company RUT as Shop code",
    "Shop code",
  ]);
  assert.doesNotMatch(
    panel,
    /function FiscalIdentityFields[\s\S]*Company RUT/,
    "Company RUT must be placed before Shop code instead of hidden lower in FiscalIdentityFields.",
  );
  assert.doesNotMatch(
    panel,
    /<textarea[\s\S]{0,300}name="shopName"/,
    "Shop name must stay a normal single-line input.",
  );
  assertContains(panel, "Search profiles");
  assertContains(panel, "shortProfileId");
  assertContains(panel, 'selectedSummaryLabel="Selected owner"');
  assertContains(panel, 'hiddenInputName="ownerProfileId"');
  assertContains(panel, "renderItemTitle={(profile) => profile.displayName}");
  assertContains(panel, "renderItemSubtitle={(profile) => profile.shortProfileId}");
  assertContains(panel, "renderItemStatus={(profile) => profile.status}");
  assertContains(actions, "createPlatformShopFromUnifiedProvisioningAction");
  assertContains(actions, "ownerSetupMode");
  assertContains(actions, "createPlatformPosFirstShop");
  assertContains(actions, "createPlatformShopWithOwnerBootstrap");
  assertContains(actions, "createPlatformPendingOwnerInviteWithFiscal");
  assertContains(actions, "temporaryCredential");
  assertContains(actions, "ownerMode");
  assertContains(actions, "shopName");
  assertContains(actions, "companyRut");
  assertContains(staffPanel, "Search target shops");
  assertContains(staffPanel, "Target shop");
  assertContains(staffPanel, "SearchableEntityPicker");
  assertContains(staffPanel, 'hiddenInputName="shopId"');
  assertContains(staffPanel, 'selectedSummaryLabel="Selected shop"');
  assertContains(staffPanel, "renderItemTitle={(shop) => shop.shopName}");
  assertContains(staffPanel, "renderItemSubtitle={(shop) => shop.shopCode}");
  assertContains(staffPanel, "renderItemStatus={(shop) => shop.status}");
  assertContains(staffPanel, "Manager state");
  assertContains(staffPanel, "Manager availability is resolved at the server boundary after shop");
  assertContains(staffPanel, "Dynamic manager selection is not available in this read");
  assertContains(staffPanel, "Recover initial manager 1001");
  assertContains(staffPanel, "Recover manager 1001");
  assertContains(staffPanel, "Operation result");
  assertContains(staffPanel, "Credential reset");
  assertContains(staffPanel, "Manager reactivated and credential reset");
  assertContains(staffPanel, "Manager recreated");
  assertContains(staffPanel, "Temporary credential / PIN");
  assertContains(staffPanel, "Copy credential");
  assertContains(staffPanel, "Save this credential now. It will not be shown again.");
  assertContains(staffPanel, "New manager display name: manager");
  assertContains(staffPanel, "recoverInitialManager1001Action");
  assertContains(staffPanel, "Shown once");
  assertContains(staffPanel, "It will not be shown again.");
  assert.match(
    staffPanel,
    /Target shop[\s\S]*Search target shops[\s\S]*Manager state[\s\S]*Reason[\s\S]*Recover manager 1001/,
    "Recovery must use the target-shop picker, ask for a reason, then submit the single manager 1001 action.",
  );
  assert.doesNotMatch(
    staffPanel,
    /Recovery action|Reset credential for manager 1001|Reactivate and reset manager 1001|Create new manager access|Advanced options|name="staffCode"|<select[\s\S]*name="shopId"/,
    "Standard initial-manager recovery must not expose multiple actions or editable staff code.",
  );
  assert.doesNotMatch(
    `${panel}\n${staffPanel}`,
    /<select[\s\S]*(ownerProfileId|shopId)|Advanced keyboard fallback/,
    "Database entity pickers in provisioning must use SearchableEntityPicker, not native select fallback.",
  );
  assertContains(
    panel,
    'replace(/[.\\-\\s]/g, "")',
    "Derived shop code must remove dots, dash, and spaces from Company RUT.",
  );
  assert.doesNotMatch(`${page}\n${panel}`, /Choose provisioning flow|FlowSelector|activeFlow|role="tab"/);
  assert.doesNotMatch(
    `${page}\n${panel}\n${staffPanel}`,
    /must change on first sign-in/i,
    "Provisioning copy must not promise a forced first sign-in credential change.",
  );
  assert.doesNotMatch(
    `${page}\n${panel}`,
    /The credential remains valid until the shop changes it or an admin resets it\./,
    "Provisioning copy must not overstate temporary credential validity.",
  );
  assert.doesNotMatch(
    panel,
    /Create shop with existing personal owner|Pending owner invite/,
    "Existing personal owner and pending invite must not be separate main form headings.",
  );
  assert.doesNotMatch(
    staffPanel,
    /Reset credential for selected manager/,
    "Dynamic manager selection is unavailable, so recovery must not offer selected-manager reset.",
  );
  assert.doesNotMatch(
    staffPanel,
    /For an existing active shop\. Does not create a shop\./,
    "Advanced recovery copy should live on the collapsed recovery container only.",
  );
  assert.doesNotMatch(
    `${panel}\n${staffPanel}`,
    /name="(staffDisplayName|displayName)"/,
    "Provisioning UI must not expose editable display name inputs.",
  );
});

test("TASK-051 server actions generate credentials server-side and keep raw values out of audit metadata", () => {
  const shopActions = readProjectFile("src/server/platform-admin/shop-actions.ts");
  const staffProvisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );
  const validation = readProjectFile("src/server/platform-admin/shop-action-validation.ts");
  const actionTypes = readProjectFile("src/server/platform-admin/action-types.ts");
  const actions = readProjectFile("src/app/platform/provisioning/actions.ts");

  assertContains(shopActions, "generateTemporaryStaffCredential");
  assertContains(shopActions, "hashStaffCredential");
  assertContains(shopActions, "platform_create_pos_first_shop");
  assertContains(shopActions, "platform_create_shop_with_owner_bootstrap");
  assertContains(shopActions, "temporaryCredential");
  assertContains(shopActions, "credentialGenerated");
  assertContains(shopActions, "INITIAL_MANAGER_STAFF_CODE");
  assertContains(shopActions, "INITIAL_MANAGER_DISPLAY_NAME");
  assertContains(shopActions, '"1001"');
  assertContains(actionTypes, '"manager"');
  assertContains(actionTypes, "ownerStatus");
  assertContains(actionTypes, "ownerMode");
  assertContains(actionTypes, "shopName");
  assertContains(staffProvisioning, "generateManagerCredential");
  assertContains(staffProvisioning, "recoverInitialManager1001");
  assertContains(staffProvisioning, "INITIAL_MANAGER_RECOVERY_STAFF_CODE");
  assertContains(staffProvisioning, "platform.staff_manager.initial_recovery.success");
  assertContains(staffProvisioning, "credential_generated");
  assertContains(staffProvisioning, "operation_result");
  assertContains(staffProvisioning, "duplicate_initial_manager");
  assertContains(staffProvisioning, "DEFAULT_MANAGER_DISPLAY_NAME");
  assertContains(staffProvisioning, "credential_expires_at: null");
  assertContains(staffProvisioning, "locked_until: null");
  assertContains(staffProvisioning, "must_change_credential: false");
  assertContains(staffProvisioning, "platform.staff_manager_web.recovery.success");
  assertContains(validation, "normalizeRut");
  assertContains(validation, "businessGiro");
  assertContains(validation, "legalRepresentativeRut");
  assertContains(actions, "createPlatformShopFromUnifiedProvisioningAction");
  assertContains(actions, "Personal owner linked");
  assertContains(actions, "No personal owner yet");
  assertContains(actions, "Pending owner setup recorded");
  assertContains(actions, "createPlatformShopWithOwnerBootstrap");
  assertContains(actions, "createPlatformPosFirstShop");
  assertContains(actions, "createPlatformPendingOwnerInviteWithFiscal");
  assertContains(actions, "recoverInitialManager1001Action");
  assertContains(actions, "recoverInitialManager1001");
  assertContains(actions, 'staffCode: "1001"');
  assert.doesNotMatch(
    actions,
    /recoverInitialManager1001Action[\s\S]{0,500}value\(formData,\s*"staffCode"\)/,
    "Recover initial manager 1001 must ignore any client-provided staffCode.",
  );
  assert.doesNotMatch(actionTypes, /staffDisplayName:/);
  assert.doesNotMatch(actions, /staffDisplayName|displayName: value\(formData, "displayName"\)/);
  assert.doesNotMatch(validation, /staffDisplayName.*required|Initial manager display name is required/);
  assert.doesNotMatch(
    staffProvisioning,
    /if \(existingStaff\.data\)[\s\S]{0,900}return result\("conflict"/,
    "Recovery must reset an existing staff credential instead of showing or failing on the old one.",
  );
  assert.doesNotMatch(
    `${shopActions}\n${staffProvisioning}`,
    /metadata_redacted:[\s\S]{0,500}(temporaryCredential|oneTimeSignInValue|credential:|credential_value)/,
    "Raw credential must not be inserted into audit metadata.",
  );
});

test("TASK-051 read models expose fiscal identity safely and Shop Admin settings keep it read-only", () => {
  const platformReadModel = readProjectFile("src/server/platform-admin/read-model.ts");
  const platformMappers = readProjectFile("src/server/platform-admin/mappers.ts");
  const platformSections = readProjectFile("src/server/platform-admin/platform-section-data.ts");
  const shopReadModel = readProjectFile("src/server/shop-admin/read-model.ts");
  const shopSections = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const shopSettings = readProjectFile("src/app/shop/settings/page.tsx");
  const shopSettingsMutations = readProjectFile("src/server/shop-admin/settings-mutations.ts");

  for (const snippet of [
    "company_rut",
    "business_giro",
    "business_address",
    "business_city",
    "legal_representative_rut",
  ]) {
    assertContains(platformReadModel, snippet);
    assertContains(platformMappers, snippet);
    assertContains(shopReadModel, snippet);
  }

  assertContains(platformSections, "Fiscal / Boleta identity");
  assertContains(shopSections, "Fiscal/boleta identity is managed by Master Console.");
  assertContains(shopSettings, "Fiscal/boleta identity is managed by Master Console.");
  assert.doesNotMatch(
    shopSettingsMutations,
    /company_rut|business_giro|business_address|business_city|legal_representative_rut/,
    "Shop Admin settings mutations must not update platform-locked fiscal fields.",
  );
});

test("TASK-051 docs record discovery, checks, and follow-up boundaries without DONE or credential leakage", () => {
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile(
    "docs/TASKS/TASK-051-platform-provisioning-fiscal-pos-first-bootstrap.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-051/README.md");

  assertContains(masterPlan, "TASK-051 - Platform Provisioning fiscal identity and POS-first shop bootstrap");
  assertContains(masterPlan, "Task attivo: `TASK-051 - Platform Provisioning fiscal identity and POS-first shop bootstrap`");
  assertContains(task, "Fase: `REVIEW`");
  assertContains(task, "PASS_WITH_NOTES_READY_FOR_REVIEW");
  assertContains(task, "shop_code resta tecnico");
  assertContains(task, "company_rut separato");
  assertContains(task, "Catalog migration/import preview");
  assertContains(evidence, "Schema reale verificato");
  assertContains(evidence, "one create shop form + owner setup mode + advanced recovery");
  assertContains(evidence, "RUT formatted for fiscal identity");
  assertContains(evidence, "shop_code derived without separators");
  assertContains(evidence, "Never show existing credentials. Recovery always generates a new one-time temporary credential.");
  assertContains(evidence, "Force rotation follow-up");
  assertContains(evidence, "1001 active/suspended/archived/missing recovery case");
  assertContains(evidence, "Duplicate 1001 anomaly");
  assertContains(evidence, "platform.staff_manager.initial_recovery.success");
  assertContains(evidence, "Admin Console recovery: shop-scoped staff credential reset");
  assertContains(evidence, "Block removing the last full-access shop manager in Admin Console.");
  assertContains(evidence, "credential raw non presente in audit/log/evidence");
  assertContains(evidence, "Win7POS uso dei dati boleta");
  assert.doesNotMatch(`${task}\n${evidence}`, /Stato.*`DONE`|Fase.*`DONE`/);
  assert.doesNotMatch(
    `${task}\n${evidence}`,
    /mcstaff_mgr_[A-Za-z0-9_-]+|credential_hash\s*[:=]\s*['"]/,
  );
});
