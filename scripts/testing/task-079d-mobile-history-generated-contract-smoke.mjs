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

const adminContract = readRepo(
  "src/server/shop-admin/supplier-import-history-entry-contract.ts",
);
const adminMutations = readRepo("src/server/shop-admin/history-mutations.ts");
const adminReadModel = readRepo("src/server/shop-admin/history-read-model.ts");
const adminDetail = readRepo(
  "src/app/shop/_components/HistoryDetailModalController.tsx",
);
const androidExcelViewModel = read(join(androidRoot, "viewmodel/ExcelViewModel.kt"));
const androidGeneratedScreen = read(join(androidRoot, "ui/screens/GeneratedScreen.kt"));
const androidInventoryRepository = read(
  join(androidRoot, "data/InventoryRepository.kt"),
);
const androidOrderQuantitySummary = read(
  join(androidRoot, "util/OrderQuantitySummary.kt"),
);
const iosGeneratedView = read(join(iosRoot, "GeneratedView.swift"));
const iosRuntimeSummary = read(
  join(iosRoot, "HistoryEntryRuntimeSummary.swift"),
);
const iosHistoryView = read(join(iosRoot, "HistoryView.swift"));

assertHas(adminContract, /"realQuantity"/, "Admin supplier payload includes realQuantity.");
assertHas(adminContract, /"RetailPrice"/, "Admin supplier payload includes generated RetailPrice.");
assertHas(adminContract, /"complete"/, "Admin supplier payload includes complete.");
assertHas(adminContract, /complete:\s*data\.map\(\(\)\s*=>\s*false\)/, "Admin initial complete flags are missing/false.");
assertHas(adminMutations, /ensureColumn\("realQuantity"\)/, "Admin save ensures realQuantity.");
assertHas(adminMutations, /ensureColumn\("RetailPrice"\)/, "Admin save ensures RetailPrice.");
assertHas(adminMutations, /ensureColumn\("complete"\)/, "Admin save ensures complete.");
assertHas(adminMutations, /editable\[rowIndex\]\[0\]\s*=\s*nextCountedQuantity\.value/, "Admin writes counted quantity to editable[0].");
assertHas(adminMutations, /editable\[rowIndex\]\[1\]\s*=\s*nextSalePrice\.value/, "Admin writes sale price to editable[1].");
assertHas(adminMutations, /complete\[rowIndex\]\s*=\s*patch\.complete/, "Admin writes complete flag.");
assertHas(adminReadModel, /historyPreviewColumnValue\(row,\s*columns\.countedQuantity\)/, "Admin read model reads counted quantity separately.");
assertHas(adminReadModel, /historyPreviewColumnValue\(row,\s*columns\.salePrice\)/, "Admin read model reads sale price separately.");
assertHas(adminDetail, /row\.completion === "Complete"/, "Admin detail status uses complete flag.");

assertHas(androidExcelViewModel, /"realQuantity"/, "Android generated grid has realQuantity.");
assertHas(androidExcelViewModel, /"RetailPrice"/, "Android generated grid has RetailPrice.");
assertHas(androidExcelViewModel, /"complete"/, "Android generated grid has complete.");
assertHas(androidExcelViewModel, /editable\.getOrNull\(modelIndex\)\?\.getOrNull\(0\)/, "Android summary reads editable[0] for counted quantity.");
assertHas(androidGeneratedScreen, /editableValues\[infoRowIndex\]\[0\]/, "Android UI edits counted quantity in editable[0].");
assertHas(androidGeneratedScreen, /editableValues\[infoRowIndex\]\[1\]/, "Android UI edits sale price in editable[1].");
assertHas(androidGeneratedScreen, /completeStates\[infoRowIndex\]/, "Android UI edits complete state.");
assertHas(androidInventoryRepository, /missingItems\s*=\s*\(data\.size - 1\)\.coerceAtLeast\(0\) - completedItems/, "Android missing is item rows minus complete.");
assertHas(androidOrderQuantitySummary, /calculateTotalQuantityFromRows/, "Android total quantity uses source rows.");

assertHas(iosGeneratedView, /key == "realQuantity"[\s\S]*bindingForEditable\(row: rowIndex, slot: 0\)/, "iOS binds realQuantity to editable[0].");
assertHas(iosGeneratedView, /key == "RetailPrice"[\s\S]*bindingForEditable\(row: rowIndex, slot: 1\)/, "iOS binds RetailPrice to editable[1].");
assertHas(iosGeneratedView, /complete\[rowIndex\]\s*=\s*value/, "iOS writes complete flag.");
assertHas(iosGeneratedView, /mergedData\[rowIndex\]\[qtyIndex\]\s*=\s*qtyText/, "iOS merges counted quantity into realQuantity.");
assertHas(iosGeneratedView, /mergedData\[rowIndex\]\[priceIndex\]\s*=\s*priceText/, "iOS merges sale price into RetailPrice.");
assertHas(iosGeneratedView, /mergedData\[rowIndex\]\[completeIndex\]\s*=\s*isDone \? "1" : ""/, "iOS merges complete into data.");
assertHas(iosRuntimeSummary, /resolvedQuantity/, "iOS runtime summary resolves counted quantity.");
assertHas(iosRuntimeSummary, /missingItems:\s*max\(0,\s*totalItems - checked\)/, "iOS missing is item rows minus complete.");
assertHas(iosHistoryView, /HistoryEntryRuntimeSummary\.totalQuantity/, "iOS list computes source total quantity.");
assertHas(iosHistoryView, /history\.summary\.total_quantity/, "iOS list shows total quantity metric.");

console.log("TASK-079D mobile history generated contract smoke PASS");
