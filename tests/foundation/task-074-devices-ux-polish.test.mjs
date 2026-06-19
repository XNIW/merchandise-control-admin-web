import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-074 devices page uses owner-friendly registry view over the generic table", () => {
  const page = readProjectFile("src/app/shop/devices/page.tsx");
  const view = readProjectFile(
    "src/app/shop/_components/DeviceRegistryView.tsx",
  );
  const panel = readProjectFile(
    "src/app/shop/_components/DeviceActionPanel.tsx",
  );
  const copyButton = readProjectFile(
    "src/app/shop/_components/CopyDeviceIdentifierButton.tsx",
  );

  assert.match(page, /getShopDeviceReadModel/);
  assert.match(page, /DeviceRegistryView/);
  assert.match(page, /device_filter/);
  assert.match(page, /device_q/);
  assert.doesNotMatch(page, /ShopSectionPage/);

  assert.match(view, /Revocation enforced/);
  assert.match(view, /Active devices/);
  assert.match(view, /Revoked devices/);
  assert.match(view, /Needs attention/);
  assert.match(view, /Sync activity hints/);
  assert.match(view, /Diagnostics \/ Test/);
  assert.match(view, /Search by name, account, staff, app version/);
  assert.match(view, /shortDeviceIdentifier/);
  assert.match(view, /Account personale usato/);
  assert.match(view, /Staff POS usato/);
  assert.match(view, /Technical details/);
  assert.match(view, /CopyDeviceIdentifierButton/);
  assert.match(
    view,
    /data-device-kind=\{diagnostic \? "diagnostic" : "registered"\}/,
  );
  assert.match(view, /Activity hint only/);
  assert.match(view, /mapped shop inventory source/);
  assert.match(view, /not authorized devices until a client registers/);
  assert.doesNotMatch(view, /mapped shop owner/);
  assert.match(view, /InlineDeviceActions/);
  assert.match(view, /Reactivate device/);
  assert.match(view, /Revoke device/);

  assert.match(panel, /<details/);
  assert.match(panel, /Advanced manual actions/);
  assert.match(page, /Manual register fallback/);
  assert.match(panel, /Device row id/);

  assert.match(copyButton, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(
    page + view + panel + copyButton,
    /SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.doesNotMatch(page + view + panel + copyButton, /service-role/i);
});

test("TASK-074 evidence and handoff docs are present", () => {
  assert.ok(existsSync(join(root, "docs/TASKS/TASK-074-devices-ux-polish.md")));
  assert.ok(existsSync(join(root, "docs/TASKS/EVIDENCE/TASK-074/README.md")));
});
