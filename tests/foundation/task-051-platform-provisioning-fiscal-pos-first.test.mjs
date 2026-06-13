import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(path) {
  return readFileSync(join(root, path), "utf8");
}

function readProjectFiles(paths) {
  return paths.map((path) => readProjectFile(path)).join("\n");
}

function readMigrations() {
  return readProjectFiles(
    readdirSync(join(root, "supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => `supabase/migrations/${file}`),
  );
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
  const migrations = readMigrations();

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
  assertContains(migrations, "platform_recover_initial_manager_1001");
  assertContains(migrations, "p_staff_credential_hash");
  assert.match(
    migrations,
    /platform_create_shop_with_pending_owner_invite[\s\S]*p_staff_display_name[\s\S]*p_staff_credential_hash[\s\S]*task051_insert_initial_manager/,
    "Pending-owner fiscalized provisioning must create manager 1001 in the same transactional RPC.",
  );
  assert.match(
    migrations,
    /platform_recover_initial_manager_1001[\s\S]*update public\.staff_accounts[\s\S]*task051_platform_audit[\s\S]*platform_action_result\(true, 'success'/,
    "Initial manager recovery must update credential and write success audit inside one transactional RPC.",
  );
  assert.match(
    migrations,
    /platform_recover_initial_manager_1001[\s\S]*count\(\*\)[\s\S]*duplicate_initial_manager/,
    "Initial manager recovery must fail closed on duplicate manager 1001 rows before generating a credential.",
  );
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
  const createShopRoute = readProjectFile(
    "src/app/platform/provisioning/create-shop/route.ts",
  );
  const recoverRoute = readProjectFile(
    "src/app/platform/provisioning/recover-manager-1001/route.ts",
  );
  const provisioningFormSubmit = readProjectFile(
    "src/app/platform/provisioning/provisioningFormSubmit.ts",
  );
  const provisioningRequest = readProjectFile(
    "src/app/platform/provisioning/platformProvisioningRequest.ts",
  );
  const routeGuard = readProjectFile(
    "src/server/platform-admin/provisioning-route-guard.ts",
  );
  const staffManagerProvisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );
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
    "Temporary PIN. It is shown once after creation and should be changed after first access.",
    "Use Company RUT as Shop code",
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
    "Temporary PIN shown once",
    "Copy PIN",
    "Save this PIN now. It will not be shown again.",
    "Use this PIN with shop code and staff code 1001 for the first Admin Console / Win7POS access. The shop should change it after first access.",
    "Owner status",
    "Personal owner linked",
    "No personal owner yet",
    "Pending owner setup recorded",
    "Emergency recovery: recover initial manager 1001",
    "Use this only when an existing shop lost manager access. The server will restore or recreate manager 1001 and generate a new temporary PIN. The old PIN is never shown.",
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
  assertContains(panel, "useCompanyRutAsShopCode");
  assertContains(panel, 'checked={formValues.useCompanyRutAsShopCode}');
  assertContains(panel, "normalizeShopNameForInput");
  assertContains(panel, "normalizeRutInput");
  assertContains(panel, "formatRutForDisplay");
  assertContains(panel, "deriveShopCodeFromRut");
  assertContains(panel, "validateRutFormat");
  assertContains(panel, "onShopNameBlur");
  assertContains(panel, "onLegalRepresentativeRutBlur");
  assertContains(panel, "setFormValues((current) =>");
  assertContains(panel, 'value={formValues.shopName}');
  assertContains(panel, 'value={formValues.businessGiro}');
  assertContains(panel, 'value={formValues.businessAddress}');
  assertContains(panel, 'value={formValues.businessCity}');
  assertContains(panel, 'value={formValues.legalRepresentativeRut}');
  assertContains(panel, 'onBlur={onShopNameBlur}');
  assertContains(panel, 'aria-invalid={fieldHasError("companyRut")}');
  assertContains(panel, 'aria-describedby={fieldErrorId("companyRut")}');
  assertContains(panel, 'ref={registerField("companyRut")}');
  assertContains(panel, "focusFirstInvalidField");
  assertContains(panel, 'name="ownerEmail"');
  assertContains(panel, 'placeholder="76.123.456-7"');
  assertContains(panel, 'placeholder="761234567"');
  assertContains(
    panel,
    "RUT can be typed with or without dots/dash. Shop code uses the compact RUT for login.",
  );
  assertContains(panel, 'data-layout="shop-identity-primary-row"');
  assertContains(panel, 'data-layout="shop-code-toggle-row"');
  assertContains(panel, 'data-layout="shop-code-row"');
  assertContains(panel, 'data-layout="fiscal-primary-row"');
  assertContains(panel, 'data-layout="fiscal-secondary-row"');
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
    /function formatShortRutHelp|formatShortRutHelp\(\)|function formatCompanyRutHelp|formatCompanyRutHelp\(\)/,
    "RUT helper copy must be compact and shared at section level instead of repeated under individual fields.",
  );
  assert.doesNotMatch(
    panel,
    /Example: 76\.123\.456-7 -> 761234567|76\.123\.456-K -> 76123456K/,
    "Long RUT examples should not dominate the provisioning form UI.",
  );
  assert.doesNotMatch(
    panel,
    /<label className="grid gap-1\.5 text-sm font-medium text-slate-800 sm:col-span-2">\s*<span>Legal representative RUT/,
    "Legal representative RUT must share the second fiscal row with City on desktop.",
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
  assertContains(provisioningFormSubmit, "submitUnifiedPlatformShopProvisioningForm");
  assertContains(provisioningFormSubmit, "ownerSetupMode");
  assertContains(provisioningFormSubmit, "createPlatformPosFirstShop");
  assertContains(provisioningFormSubmit, "createPlatformShopWithOwnerBootstrap");
  assertContains(provisioningFormSubmit, "createPlatformPendingOwnerInviteWithFiscal");
  assertContains(provisioningFormSubmit, "ownerMode");
  assertContains(provisioningFormSubmit, "values");
  assertContains(provisioningFormSubmit, "formValuesFromFormData");
  assert.match(
    provisioningFormSubmit,
    /if \(result\.ok\) \{[\s\S]{0,120}revalidateProvisioning\(\);[\s\S]{0,120}\}/,
    "Provisioning must not revalidate the route when validation fails and would remount/reset the form.",
  );
  assertContains(provisioningFormSubmit, "shopName");
  assertContains(provisioningFormSubmit, "companyRut");
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
  assertContains(staffPanel, "PIN reset");
  assertContains(staffPanel, "Manager reactivated and PIN reset");
  assertContains(staffPanel, "Manager recreated");
  assertContains(staffPanel, "Temporary PIN");
  assertContains(staffPanel, "Copy PIN");
  assertContains(staffPanel, "Save this PIN now. It will not be shown again.");
  assertContains(staffPanel, "Use this PIN with shop code and staff code 1001 for the first Admin Console / Win7POS access. The shop should change it after first access.");
  assertContains(staffPanel, "New manager display name: manager");
  assertContains(staffPanel, "submitPlatformProvisioningForm");
  assertContains(staffPanel, "pendingRef");
  assertContains(staffPanel, "/platform/provisioning/recover-manager-1001");
  assertContains(panel, "/platform/provisioning/create-shop");
  assertContains(panel, "async function handleCreateShop()");
  assertContains(panel, "createShopPendingRef");
  assertContains(panel, "submitPlatformProvisioningForm");
  assertContains(panel, '"/platform/provisioning/create-shop"');
  assertContains(provisioningRequest, "credentials: \"same-origin\"");
  assertContains(provisioningRequest, "Accept: \"application/json\"");
  assertContains(provisioningRequest, "body");
  assertContains(panel, "onClick={handleCreateShop}");
  assertContains(panel, 'type="button"');
  assert.doesNotMatch(
    panel,
    /Authorization:\s*`Bearer \$\{token\}`|readPlatformProvisioningAccessToken/,
    "Create-shop submit must not send a custom browser Authorization bearer that can diverge from the SSR cookie session.",
  );
  assert.doesNotMatch(
    panel,
    /onSubmit=|type="submit"|formAction|useActionState/,
    "Create shop must use the explicit button click fetch path, not form submit or Server Action wiring.",
  );
  assertContains(provisioningRequest, ".fetch(url");
  assertContains(provisioningRequest, "credentials: \"same-origin\"");
  assertContains(provisioningRequest, "Accept: \"application/json\"");
  assertContains(provisioningRequest, "same-origin cookie session");
  assert.doesNotMatch(
    provisioningRequest,
    /Authorization:\s*`Bearer \$\{accessToken\}`|auth\.getSession\(\)|readSupabaseAccessTokenFromCookie|window\.atob|parseCookieSource/,
    "Shared provisioning submit helper must rely on same-origin cookies instead of scraping browser tokens.",
  );
  assertContains(createShopRoute, "submitUnifiedPlatformShopProvisioningForm");
  assertContains(createShopRoute, "guardPlatformProvisioningPostRequest(request)");
  assertContains(createShopRoute, "request.headers.get(\"authorization\")");
  assertContains(createShopRoute, "noStoreJson(responseBody)");
  assertContains(provisioningFormSubmit, "createPlatformShopWithOwnerBootstrap");
  assertContains(provisioningFormSubmit, "createPlatformPosFirstShop");
  assertContains(provisioningFormSubmit, "createPlatformPendingOwnerInviteWithFiscal");
  assertContains(createShopRoute, "await cookies()");
  assertContains(recoverRoute, "submitInitialManager1001RecoveryForm");
  assertContains(recoverRoute, "guardPlatformProvisioningPostRequest(request)");
  assertContains(recoverRoute, "request.headers.get(\"authorization\")");
  assertContains(recoverRoute, "request.headers.get(\"x-platform-supabase-host\")");
  assertContains(recoverRoute, "request.headers.get(\"content-type\")");
  assertContains(provisioningFormSubmit, "recoverInitialManager1001");
  assertContains(recoverRoute, "await cookies()");
  assertContains(recoverRoute, "noStoreJson(result)");
  assertContains(routeGuard, "server-only");
  assertContains(routeGuard, "multipart/form-data");
  assertContains(routeGuard, "application/x-www-form-urlencoded");
  assertContains(routeGuard, "sec-fetch-site");
  assertContains(routeGuard, "\"cross-site\"");
  assertContains(routeGuard, "request.headers.get(\"origin\")");
  assertContains(routeGuard, "request.headers.get(\"host\")");
  assertContains(routeGuard, "request.headers.get(\"content-length\")");
  assertContains(routeGuard, "contentLength === null");
  assertContains(routeGuard, "\"Cache-Control\": \"no-store\"");
  assertContains(routeGuard, "status: 403");
  assertContains(routeGuard, "status: 413");
  assertContains(routeGuard, "status: 415");
  assert.doesNotMatch(
    routeGuard,
    /contentLength !== null && contentLength > maxProvisioningBodyBytes/,
    "Provisioning body-size guard must fail closed when Content-Length is missing.",
  );
  assertContains(staffManagerProvisioning, "resolvePlatformAdminForRequest");
  assert.doesNotMatch(
    staffManagerProvisioning,
    /from "next\/headers"|auth\.getSession\(|auth\.getClaims\(|authorizeCurrentPlatformAdmin/,
    "Recovery manager provisioning must use the shared Platform Admin request resolver instead of a parallel auth path.",
  );
  assert.doesNotMatch(
    `${panel}\n${staffPanel}\n${provisioningRequest}`,
    /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey|createSupabaseAdminClient/,
    "Client provisioning submit code must never import or expose service-role/admin runtime.",
  );
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
    "Provisioning copy must not overstate temporary PIN validity.",
  );
  assert.doesNotMatch(
    `${page}\n${panel}\n${staffPanel}`,
    /Temporary credential|temporary credential|Copy credential|Save this credential/,
    "Provisioning UI copy must use Temporary PIN terminology.",
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

test("TASK-051 server boundaries generate credentials server-side and keep raw values out of audit metadata", () => {
  const shopActions = readProjectFile("src/server/platform-admin/shop-actions.ts");
  const staffProvisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );
  const staffWebAuth = readProjectFile("src/server/shop-admin/staff-web-auth.ts");
  const staffLoginActions = readProjectFile(
    "src/app/(staff-auth)/shop/staff-login/actions.ts",
  );
  const shopCodeLoginForm = readProjectFile(
    "src/components/auth/ShopCodeLoginForm.tsx",
  );
  const managerPin = readProjectFile(
    "src/server/platform-admin/temporary-manager-pin.ts",
  );
  const validation = readProjectFile("src/server/platform-admin/shop-action-validation.ts");
  const actionTypes = readProjectFile("src/server/platform-admin/action-types.ts");
  const createShopRoute = readProjectFile(
    "src/app/platform/provisioning/create-shop/route.ts",
  );
  const recoverRoute = readProjectFile(
    "src/app/platform/provisioning/recover-manager-1001/route.ts",
  );
  const provisioningFormSubmit = readProjectFile(
    "src/app/platform/provisioning/provisioningFormSubmit.ts",
  );
  const provisioningRequest = readProjectFile(
    "src/app/platform/provisioning/platformProvisioningRequest.ts",
  );
  const provisioningRequestAuth = readProjectFile(
    "src/server/platform-admin/provisioning-request-auth.ts",
  );

  assertContains(shopActions, "generateTemporaryManagerPin");
  assertContains(staffProvisioning, "generateTemporaryManagerPin");
  assertContains(managerPin, "export function generateTemporaryManagerPin");
  assertContains(managerPin, 'from "node:crypto"');
  assertContains(managerPin, "randomInt(10000, 100000)");
  assertContains(managerPin, ".toString()");
  assertContains(shopActions, "hashStaffCredential");
  assertContains(shopActions, "getProvisioningBoundary");
  assertContains(shopActions, "resolvePlatformAdminForRequest");
  assertContains(shopActions, "createPlatformProvisioningRpcClient");
  assertContains(shopActions, "platform_create_shop_with_owner_bootstrap");
  assertContains(shopActions, "platform_create_pos_first_shop");
  assertContains(shopActions, "platform_create_shop_with_pending_owner_invite");
  assertContains(shopActions, "PlatformProvisioningRequestAuthDiagnostics");
  assertContains(provisioningRequestAuth, "actorAccessToken");
  assertContains(provisioningRequestAuth, "resolvePlatformAdminForRequest");
  assertContains(provisioningRequestAuth, "readBearerToken");
  assertContains(provisioningRequestAuth, "/auth/v1/user");
  assertContains(provisioningRequestAuth, "bearerVerificationTimeoutMs");
  assertContains(provisioningRequestAuth, "SUPABASE_ANON_KEY");
  assertContains(provisioningRequestAuth, "serverConfig.publishableKey");
  assertContains(provisioningRequestAuth, "createBearerSupabaseClient");
  assertContains(provisioningRequestAuth, "userIsActivePlatformAdmin");
  assertContains(provisioningRequestAuth, "platform_admins");
  assertContains(shopActions, "temporaryCredential");
  assertContains(shopActions, "credentialGenerated");
  assertContains(shopActions, "shopName: normalized.shopName");
  assertContains(shopActions, "INITIAL_MANAGER_STAFF_CODE");
  assertContains(shopActions, "INITIAL_MANAGER_DISPLAY_NAME");
  assertContains(shopActions, '"1001"');
  assertContains(actionTypes, '"manager"');
  assertContains(actionTypes, "ownerStatus");
  assertContains(actionTypes, "ownerMode");
  assertContains(actionTypes, "shopName");
  assertContains(actionTypes, "PlatformShopProvisioningFormValues");
  assertContains(actionTypes, "values?: PlatformShopProvisioningFormValues");
  assertContains(actionTypes, "ownerSetupMode");
  assertContains(actionTypes, "legalRepresentativeRut");
  assertContains(actionTypes, "useCompanyRutAsShopCode");
  assertContains(staffProvisioning, "recoverInitialManager1001");
  assertContains(staffProvisioning, "platform_recover_initial_manager_1001");
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
  assertContains(staffProvisioning, "server_admin_not_configured");
  assertContains(staffProvisioning, "shop_not_selected");
  assertContains(staffProvisioning, "shop_inactive");
  assertContains(staffProvisioning, "shop_lookup_database_error");
  assertContains(staffProvisioning, "staff_lookup_database_error");
  assertContains(staffProvisioning, "credential_update_database_error");
  assertContains(staffProvisioning, "audit_database_error");
  assertContains(staffProvisioning, "PlatformStaffManagerProvisionDiagnostics");
  assertContains(staffProvisioning, "shopIdPresent");
  assertContains(staffProvisioning, "shopCodePresent");
  assertContains(staffProvisioning, "selectedShopCodePreview");
  assertContains(staffProvisioning, "previewShopCode");
  assertContains(staffProvisioning, "resolvePlatformAdminForRequest");
  assertContains(staffProvisioning, "createPlatformProvisioningRpcClient");
  assert.doesNotMatch(
    shopActions,
    /insertFiscalShop|insertInitialManager|archiveIncompleteShop|writeTask051Audit/,
    "TASK-051 create-shop service must call transactional RPCs instead of Node-side insert/update/audit compensation.",
  );
  assert.doesNotMatch(
    staffProvisioning,
    /\.from\("staff_accounts"\)[\s\S]{0,1200}\.(insert|update)|\.from\("staff_role_permissions"\)[\s\S]{0,800}upsert|writePlatformStaffManagerAudit/,
    "Initial manager recovery must call the transactional recovery RPC instead of Node-side credential update plus separate audit.",
  );
  assert.doesNotMatch(
    staffProvisioning,
    /readRequestAuthorizationHeader|serverClient\.auth\.getUser\(accessToken\)|auth\.getSession\(|auth\.getClaims\(/,
    "Recovery manager provisioning must not keep its old parallel auth resolver.",
  );
  assertContains(
    staffProvisioning,
    "Server admin runtime is not configured. Recovery cannot update staff credentials in this runtime.",
  );
  assertContains(
    staffProvisioning,
    "Recovery could not complete because the database boundary failed. Check server diagnostics.",
  );
  assertContains(staffWebAuth, "server_admin_not_configured");
  assertContains(staffLoginActions, "server_admin_not_configured");
  assertContains(shopCodeLoginForm, "server_admin_not_configured");
  assertContains(
    `${staffLoginActions}\n${shopCodeLoginForm}`,
    "Sign-in cannot be verified because the server admin runtime is not configured.",
  );
  assertContains(validation, "normalizeRut");
  assertContains(validation, "export function normalizeRutInput");
  assertContains(validation, "export function formatRutForDisplay");
  assertContains(validation, "export function deriveShopCodeFromRut");
  assertContains(validation, "export function validateRutFormat");
  assertContains(validation, "/^[0-9]{7,8}[0-9K]$/");
  assertContains(validation, "123456789 -> 12.345.678-9");
  assertContains(validation, "export function normalizeShopName");
  assert.match(
    validation,
    /normalizeShopName[\s\S]{0,240}\.toUpperCase\(\)/,
    "Server-side shop creation validation must normalize shop names to uppercase.",
  );
  assertContains(validation, "businessGiro");
  assertContains(validation, "legalRepresentativeRut");
  assertContains(provisioningFormSubmit, "submitUnifiedPlatformShopProvisioningForm");
  assertContains(provisioningFormSubmit, "Personal owner linked");
  assertContains(provisioningFormSubmit, "No personal owner yet");
  assertContains(provisioningFormSubmit, "Pending owner setup recorded");
  assertContains(provisioningFormSubmit, "createPlatformShopWithOwnerBootstrap");
  assertContains(provisioningFormSubmit, "createPlatformPosFirstShop");
  assertContains(provisioningFormSubmit, "createPlatformPendingOwnerInviteWithFiscal");
  assertContains(provisioningFormSubmit, "submitInitialManager1001RecoveryForm");
  assertContains(provisioningFormSubmit, "recoverInitialManager1001");
  assertContains(provisioningFormSubmit, 'staffCode: "1001"');
  assertContains(createShopRoute, "submitUnifiedPlatformShopProvisioningForm");
  assertContains(createShopRoute, "request.headers.get(\"authorization\")");
  assertContains(provisioningFormSubmit, "submitUnifiedPlatformShopProvisioningForm");
  assertContains(provisioningFormSubmit, "createPlatformShopWithOwnerBootstrap");
  assertContains(provisioningFormSubmit, "createPlatformPosFirstShop");
  assertContains(provisioningFormSubmit, "createPlatformPendingOwnerInviteWithFiscal");
  assertContains(provisioningFormSubmit, "authorizationHeader");
  assertContains(createShopRoute, "platformProvisioningDiagnosticsEnabled");
  assertContains(createShopRoute, "createPlatformProvisioningAuthDiagnostics");
  assertContains(provisioningRequestAuth, "authorizationHeaderPresent");
  assertContains(provisioningRequestAuth, "authorizationHeaderLooksBearer");
  assertContains(provisioningRequestAuth, "bearerLooksLikeJwt");
  assertContains(provisioningRequestAuth, "bearerUserResolved");
  assertContains(provisioningRequestAuth, "cookieUserResolved");
  assertContains(provisioningRequestAuth, "auth_mismatch");
  assertContains(provisioningRequestAuth, "platform-provisioning-auth-cookie-fallback");
  assertContains(provisioningRequestAuth, "platformAdminResolved");
  assertContains(provisioningRequestAuth, "authSourceUsed");
  assertContains(provisioningRequestAuth, "requestContentType");
  assertContains(provisioningRequestAuth, "formMode");
  assertContains(provisioningRequestAuth, "codeBranch");
  assertContains(createShopRoute, "await cookies()");
  assertContains(createShopRoute, "request.formData()");
  assertContains(createShopRoute, "noStoreJson(responseBody)");
  assertContains(recoverRoute, "submitInitialManager1001RecoveryForm");
  assertContains(recoverRoute, "request.headers.get(\"authorization\")");
  assertContains(provisioningFormSubmit, "submitInitialManager1001RecoveryForm");
  assertContains(provisioningFormSubmit, "recoverInitialManager1001");
  assertContains(recoverRoute, "await cookies()");
  assertContains(recoverRoute, "request.formData()");
  assertContains(recoverRoute, "noStoreJson(result)");
  assertContains(provisioningRequest, ".fetch(url");
  assertContains(provisioningRequest, "credentials: \"same-origin\"");
  assertContains(provisioningRequest, "Accept: \"application/json\"");
  assertContains(provisioningRequest, "same-origin cookie session");
  assert.doesNotMatch(
    provisioningRequest,
    /Authorization:\s*`Bearer \$\{accessToken\}`|auth\.getSession\(\)|readSupabaseAccessTokenFromCookie|window\.atob|parseCookieSource/,
    "Provisioning client helper must not duplicate Supabase session parsing or send custom bearer headers.",
  );
  assert.doesNotMatch(
    `${createShopRoute}\n${recoverRoute}\n${provisioningFormSubmit}\n${provisioningRequest}`,
    /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey|createSupabaseAdminClient/,
    "Route/client submit boundary must not move service-role access into browser code.",
  );
  assert.doesNotMatch(
    `${shopActions}\n${staffProvisioning}\n${managerPin}`,
    /mcstaff_mgr_|randomBytes|Math\.random/,
    "TASK-051 manager PIN must be a 5-digit crypto random number, not a long token or Math.random output.",
  );
  assert.match(
    provisioningFormSubmit,
    /values: result\.ok \? undefined : submittedValues/,
    "Server action errors must return submitted values so validation does not clear the form.",
  );
  assert.doesNotMatch(
    provisioningFormSubmit,
    /submitInitialManager1001RecoveryForm[\s\S]{0,500}value\(formData,\s*"staffCode"\)/,
    "Recover initial manager 1001 must ignore any client-provided staffCode.",
  );
  assert.doesNotMatch(actionTypes, /staffDisplayName:/);
  assert.doesNotMatch(
    provisioningFormSubmit,
    /staffDisplayName|displayName: value\(formData, "displayName"\)/,
  );
  assert.doesNotMatch(validation, /staffDisplayName.*required|Initial manager display name is required/);
  assert.doesNotMatch(
    staffProvisioning,
    /if \(existingStaff\.data\)[\s\S]{0,900}return result\("conflict"/,
    "Recovery must reset an existing staff credential instead of showing or failing on the old one.",
  );
  assert.doesNotMatch(
    `${shopActions}\n${staffProvisioning}\n${staffWebAuth}\n${staffLoginActions}\n${shopCodeLoginForm}`,
    /metadata_redacted:[\s\S]{0,500}(temporaryCredential|oneTimeSignInValue|credential:|credential_value)/,
    "Raw credential must not be inserted into audit metadata.",
  );
  assert.doesNotMatch(
    `${shopActions}\n${staffProvisioning}\n${staffWebAuth}\n${staffLoginActions}\n${shopCodeLoginForm}`,
    /metadata_redacted:[\s\S]{0,500}(temporaryPin|pin:|pin_value|one_time_pin)/i,
    "Raw temporary PIN must not be inserted into audit metadata.",
  );
  assert.doesNotMatch(
    `${staffProvisioning}\n${staffWebAuth}\n${staffLoginActions}`,
    /console\.(log|debug|info|warn|error)/,
    "Runtime diagnostics for TASK-051 must stay in redacted result/audit metadata, not server console output.",
  );
});

test("TASK-051 manual runtime parity has a redacted local-only diagnostic harness", () => {
  const script = readProjectFile("scripts/platform/task-051-runtime-parity-check.mjs");

  assertContains(script, "TASK-051 runtime parity");
  assertContains(script, "loadEnvConfig");
  assertContains(script, "hasFlag(\"local\")");
  assertContains(script, "supabase\", [\"status\", \"--output\", \"env\"]");
  assertContains(script, "parseSupabaseStatusEnv");
  assertContains(script, "assertTargetEnv(\"local\", env)");
  assertContains(script, "redactSupabaseTarget");
  assertContains(script, "TEST_TARGET: \"local\"");
  assertContains(script, "NEXT_PUBLIC_SUPABASE_URL");
  assertContains(script, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  assertContains(script, "SUPABASE_SERVICE_ROLE_KEY");
  assertContains(script, "shop_code_present");
  assertContains(script, "staff_1001_present");
  assertContains(script, "full_access_permission_present");
  assertContains(script, "Refusing write checks against non-local Supabase");
  assert.doesNotMatch(
    script,
    /console\.(log|error)\([^)]*(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|PUBLISHABLE_KEY|password|credential_hash|oneTimeSignInValue)/i,
    "Runtime parity diagnostics must never print secrets or raw credentials.",
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
  assertContains(
    shopSettings,
    "Shop profile and fiscal identity are managed by Master Console. Admin Console can view these fields but cannot edit them.",
  );
  assert.doesNotMatch(shopSettings, /Update settings|Type SETTINGS as confirmation/);
  assert.doesNotMatch(
    shopSettingsMutations,
    /company_rut|business_giro|business_address|business_city|legal_representative_rut/,
    "Shop Admin settings mutations must not update platform-locked fiscal fields.",
  );
});

test("TASK-051 docs record runtime regression fix, checks, and follow-up boundaries without credential leakage", () => {
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile(
    "docs/TASKS/TASK-051-platform-provisioning-fiscal-pos-first-bootstrap.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-051/README.md");

  assertContains(masterPlan, "TASK-051 - Platform Provisioning fiscal identity and POS-first shop bootstrap");
  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-058 - Cloudflare\/OpenNext Staging Hardening and Deployment Governance`/,
  );
  assert.match(
    masterPlan,
    /Stato TASK-051: `(READY_FOR_DONE_CONFIRMATION|DONE)`/,
  );
  assertContains(masterPlan, "Fase TASK-051: `REVIEW`");
  assert.match(
    masterPlan,
    /Verdict TASK-051: `(READY_FOR_DONE_CONFIRMATION|DONE)`/,
  );
  assertContains(task, "Fase: `REVIEW`");
  assertContains(task, "READY_FOR_DONE_CONFIRMATION_RUNTIME_REGRESSION_FIXED");
  assertContains(evidence, "DONE confirmation 2026-06-09");
  assertContains(evidence, "Runtime auth regression 2026-06-09");
  assertContains(evidence, "READY_FOR_DONE_CONFIRMATION_RUNTIME_REGRESSION_FIXED");
  assertContains(evidence, "bearer/cookie mismatch");
  assertContains(evidence, "auth_mismatch");
  assertContains(evidence, "task-051-platform-provisioning-manual-platform-admin-regression.spec.ts");
  assertContains(evidence, "platform.local@example.test");
  assertContains(task, "shop_code resta tecnico");
  assertContains(task, "company_rut separato");
  assertContains(task, "Catalog migration/import preview");
  assertContains(evidence, "Schema reale verificato");
  assertContains(evidence, "one create shop form + owner setup mode + advanced recovery");
  assertContains(evidence, "RUT formatted for fiscal identity");
  assertContains(evidence, "shop_code derived without separators");
  assertContains(evidence, "Never show existing PINs. Recovery always generates a new one-time temporary manager PIN.");
  assertContains(evidence, "Force rotation follow-up");
  assertContains(evidence, "1001 active/suspended/archived/missing recovery case");
  assertContains(evidence, "Duplicate 1001 anomaly");
  assertContains(evidence, "platform.staff_manager.initial_recovery.success");
  assertContains(evidence, "Admin Console recovery: shop-scoped staff credential reset");
  assertContains(evidence, "Block removing the last full-access shop manager in Admin Console.");
  assertContains(evidence, "Form value preservation");
  assertContains(evidence, "RUT digits-only live formatting");
  assertContains(evidence, "AUTHENTICATED_RUNTIME_NOT_RUN");
  assertContains(evidence, "No password/PIN/token is preserved after validation errors");
  assertContains(evidence, "temporary manager PIN raw non presente in DB/audit/log/evidence");
  assertContains(evidence, "Win7POS uso dei dati boleta");
  assert.doesNotMatch(
    `${task}\n${evidence}`,
    /mcstaff_mgr_[A-Za-z0-9_-]+|credential_hash\s*[:=]\s*['"]|temporary manager PIN raw:\s*[0-9]{5}/i,
  );
});
