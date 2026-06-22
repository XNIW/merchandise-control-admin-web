import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const androidRoot =
  "/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview";
const iosRoot = "/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl";

function read(path) {
  return readFileSync(path, "utf8");
}

function readRepo(relativePath) {
  return read(join(root, relativePath));
}

function assertHas(source, pattern, label) {
  assert.match(source, pattern, label);
}

const adminMutations = readRepo("src/server/shop-admin/history-mutations.ts");
const adminRoute = readRepo("src/app/shop/history/detail/route.ts");
const adminContract = readRepo(
  "src/server/shop-admin/supplier-import-history-entry-contract.ts",
);
const androidSessionPayload = read(
  join(androidRoot, "data/SessionRemotePayload.kt"),
);
const androidSyncModels = read(join(androidRoot, "data/SyncEventModels.kt"));
const androidRepository = read(join(androidRoot, "data/InventoryRepository.kt"));
const iosShared = read(join(iosRoot, "Sync/Shared/HistorySessionSyncShared.swift"));
const iosSyncMapper = read(
  join(iosRoot, "Sync/Remote/SyncEventRPCRequestMapper.swift"),
);
const iosSyncApplyHelpers = read(
  join(iosRoot, "Sync/Automatic/Pull/SyncEventIncrementalApplyHelpers.swift"),
);

assertHas(adminContract, /SUPPLIER_IMPORT_HISTORY_PAYLOAD_VERSION\s*=\s*2/, "Admin writes payload v2.");
assertHas(adminContract, /SUPPLIER_IMPORT_HISTORY_OVERLAY_SCHEMA\s*=\s*1/, "Admin writes overlay schema 1.");
assertHas(adminContract, /"realQuantity"/, "Admin supplier payload includes generated counted quantity.");
assertHas(adminContract, /"RetailPrice"/, "Admin supplier payload includes generated sale price.");
assertHas(adminContract, /"complete"/, "Admin supplier payload includes complete.");
assertHas(adminMutations, /editable\[rowIndex\]\[0\]\s*=\s*nextCountedQuantity\.value/, "Admin writes counted quantity into overlay editable[0].");
assertHas(adminMutations, /editable\[rowIndex\]\[1\]\s*=\s*nextSalePrice\.value/, "Admin writes sale price into overlay editable[1].");
assertHas(adminMutations, /complete\[rowIndex\]\s*=\s*patch\.complete/, "Admin writes complete flag.");
assertHas(adminMutations, /eventType:\s*"history_changed"/, "Admin emits history_changed.");
assertHas(adminMutations, /session_ids:\s*\[input\.remoteId\]/, "Admin sync event references session_ids.");
assertHas(adminRoute, /export async function PATCH/, "Admin detail exposes same-origin PATCH.");
assertHas(androidSessionPayload, /payloadVersion|payload_version/i, "Android session payload reads payload version.");
assertHas(androidSessionPayload, /overlay_schema/, "Android session payload handles overlay_schema.");
assertHas(androidSyncModels, /history_changed/, "Android sync models know history_changed.");
assertHas(androidSyncModels, /@SerialName\("session_ids"\)/, "Android sync event model maps session_ids.");
assertHas(androidRepository, /ids\.sessionIds|sessionIds/i, "Android applies history session IDs from sync events.");
assertHas(iosShared, /payloadVersion|payload_version/i, "iOS shared sync reads payload version.");
assertHas(iosShared, /overlay_schema/, "iOS shared sync handles overlay_schema.");
assertHas(iosSyncMapper, /history_changed/, "iOS sync mapper knows history_changed.");
assertHas(iosSyncApplyHelpers, /session_ids/, "iOS sync apply helper handles session_ids.");

console.log("TASK-079C mobile history edit contract smoke PASS");
