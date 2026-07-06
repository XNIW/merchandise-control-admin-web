import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

async function loadCredentialModule() {
  const source = readProjectFile("src/server/shop-admin/staff-credentials.ts")
    .replace(/^import "server-only";\r?\n\r?\n/, "");
  const tempDir = await mkdtemp(join(tmpdir(), "task-054-staff-credentials-"));
  const modulePath = join(tempDir, "staff-credentials.mjs");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "staff-credentials.ts",
  });

  await writeFile(modulePath, outputText, "utf8");

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    module: await import(pathToFileURL(modulePath).href),
  };
}

test("TASK-054 temporary manager PIN is 5 numeric digits and hashes only with explicit opt-in", async () => {
  const { cleanup, module } = await loadCredentialModule();

  try {
    await assert.rejects(
      () => module.hashStaffCredential("12345"),
      /STAFF_CREDENTIAL_TOO_SHORT/,
    );
    await assert.rejects(
      () => module.hashStaffCredential("abcde", { allowTemporaryPin: true }),
      /STAFF_TEMPORARY_PIN_INVALID/,
    );

    const hash = await module.hashStaffCredential("12345", {
      allowTemporaryPin: true,
    });

    assert.equal(await module.verifyStaffCredential("12345", hash), true);
    assert.equal(await module.verifyStaffCredential("54321", hash), false);
  } finally {
    await cleanup();
  }
});

test("TASK-054 provisioning and recovery hash generated 5 digit PINs with the temporary PIN option", () => {
  const temporaryPin = readProjectFile("src/server/platform-admin/temporary-manager-pin.ts");
  const staffProvisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );
  const shopActions = readProjectFile("src/server/platform-admin/shop-actions.ts");

  assert.match(temporaryPin, /randomInt\(10000, 100000\)\.toString\(\)/);
  assertContains(staffProvisioning, "hashStaffCredential(oneTimeSignInValue, {");
  assertContains(staffProvisioning, "allowTemporaryPin: true");
  assertContains(shopActions, "hashStaffCredential(temporaryCredential, {");
  assertContains(shopActions, "allowTemporaryPin: true");
});

test("TASK-054 staff web auth returns diagnostic login failure codes without exposing secrets", () => {
  const auth = readProjectFile("src/server/shop-admin/staff-web-auth.ts");
  const actions = readProjectFile("src/app/(staff-auth)/shop/staff-login/actions.ts");
  const form = readProjectFile("src/components/auth/ShopCodeLoginForm.tsx");
  const dictionaries = readProjectFile("src/i18n/dictionaries.ts");

  for (const required of [
    "shop_not_found",
    "shop_inactive",
    "staff_not_found",
    "staff_inactive",
    "staff_not_allowed",
    "credential_invalid",
    "database_error",
    "unknown_error",
  ]) {
    assertContains(auth, required, `staff web auth must expose ${required}`);
    assertContains(actions, required, `staff login action must classify ${required}`);
  }

  assertContains(actions, "sign_in_blocked");
  assertContains(actions, "staffWebDiagnosticFailureCodes");
  assertContains(actions, "publicStaffWebLoginCode(result.code)");
  assertContains(actions, "code: publicCode");
  assertContains(actions, "messageForStaffWebLoginCode(publicCode)");
  assertContains(form, "labels.messages[state.code]");
  assertContains(
    dictionaries,
    "Sign-in was blocked. Check the credentials or try again later.",
  );
  assert.doesNotMatch(actions, /Shop code was not found|Staff code was not found/);
  assert.doesNotMatch(actions, /PIN\/password is not correct for this staff account/);
  assert.doesNotMatch(auth, /return staffWebLoginResult\("denied"\)/);
  assert.doesNotMatch(actions, /credential_hash|session_token_hash|service_role/i);
  assert.doesNotMatch(
    auth,
    /metadata_redacted:[\s\S]{0,500}(parsed\.credential|input\.credential|credential:)/,
  );
  assert.doesNotMatch(auth, /service_role/i);
  assert.doesNotMatch(`${auth}\n${actions}`, /console\.(log|debug|info|warn|error)/);
});

test("TASK-054 Shop code form preserves non-secret fields and focuses PIN after an error", () => {
  const form = readProjectFile("src/components/auth/ShopCodeLoginForm.tsx");
  const actions = readProjectFile("src/app/(staff-auth)/shop/staff-login/actions.ts");
  const dictionary = readProjectFile("src/i18n/dictionaries.ts");

  assert.match(form, /^"use client";/);
  assertContains(form, "useActionState");
  assertContains(form, "useEffect");
  assertContains(form, "useRef");
  assertContains(form, "staffManagerWebLoginFormAction");
  assertContains(form, "defaultValue={state.values.shopCode}");
  assertContains(form, "defaultValue={state.values.staffCode}");
  assertContains(form, "credentialRef.current?.focus()");
  assertContains(`${form}\n${dictionary}`, "PIN / password");
  assert.doesNotMatch(form, /Credential<\/label>|localStorage|sessionStorage/);

  assertContains(actions, "type ShopCodeLoginFormState");
  assertContains(actions, "values: {");
  assertContains(actions, "shopCode");
  assertContains(actions, "staffCode");
  assert.doesNotMatch(actions, /values:\s*\{[^}]*credential/s);
});

test("TASK-054 initial manager recovery accepts selected shop_id and safe shop_code fallback", () => {
  const provisioningFormSubmit = readProjectFile(
    "src/app/platform/provisioning/provisioningFormSubmit.ts",
  );
  const panel = readProjectFile(
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx",
  );
  const provisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );

  assertContains(provisioningFormSubmit, 'shopId: value(formData, "shopId")');
  assertContains(provisioningFormSubmit, 'shopCode: value(formData, "shopCode")');
  assertContains(panel, 'name="shopCode"');
  assertContains(provisioning, "shopCode?: string");
  assertContains(provisioning, "normalizeShopCode");
  assertContains(provisioning, "shop_read_failed");
  assertContains(provisioning, "shop_not_found");
  assert.match(provisioning, /p_shop_id:\s*UUID_PATTERN\.test\(normalized\.shopId\)/);
  assert.match(provisioning, /p_shop_code:\s*normalized\.shopCode/);
  assertContains(provisioning, "platform_recover_initial_manager_1001");
});
