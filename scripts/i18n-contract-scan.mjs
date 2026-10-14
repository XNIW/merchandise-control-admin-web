import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { csharpSourceViews, maskCSharpComments } from "./lib/csharp-source.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const adminLocales = ["en", "es", "it", "zh-CN"];
const posRoot = resolve(
  process.env.WIN7POS_REPO_PATH?.trim() || join(root, "..", "Win7POS"),
);
const normalizedPosRoot = posRoot.replace(/\\/g, "/");
const posLocalizationDirectory = join(posRoot, "src/Win7POS.Wpf/Localization");
const allowedPosDynamicKeyUsages = new Map([
  [
    "notice.",
    {
      path: "src/Win7POS.Wpf/Pos/PosViewModel.cs",
      requiredKeys: [
        "notice.info",
        "notice.success",
        "notice.warning",
        "notice.error",
      ],
      suffix:
        /^\s*\+\s*StatusToastSeverity\.ToString\(\)\.ToLowerInvariant\(\)/,
    },
  ],
  [
    "customerDisplay.error.",
    {
      paths: [
        "src/Win7POS.Wpf/MainWindow.xaml.cs",
        "src/Win7POS.Wpf/Pos/Dialogs/CustomerDisplaySettingsDialog.xaml.cs",
      ],
      requiredKeys: [
        "customerDisplay.error.same_monitor",
        "customerDisplay.error.customer_monitor_required",
        "customerDisplay.error.no_monitors",
        "customerDisplay.error.extend_required",
        "customerDisplay.error.selected_monitor_missing",
        "customerDisplay.error.customer_monitor_unavailable",
        "customerDisplay.error.actionFailed",
      ],
      suffix: /^\s*\+/,
    },
  ],
  [
    "customerDisplay.settings.topology.",
    {
      path: "src/Win7POS.Wpf/Pos/Dialogs/CustomerDisplaySettingsViewModel.cs",
      requiredKeys: [
        "customerDisplay.settings.topology.single",
        "customerDisplay.settings.topology.extended",
        "customerDisplay.settings.topology.duplicate",
      ],
      suffix: /^\s*\+/,
    },
  ],
  [
    "sync.center.revision.",
    {
      path: "src/Win7POS.Wpf/Pos/Dialogs/SyncCenterViewModel.cs",
      requiredKeys: [
        "sync.center.revision.match",
        "sync.center.revision.mismatch",
        "sync.center.revision.unknown",
      ],
      suffix: /^\s*\+/,
    },
  ],
]);

// These contracts bind a finite key family to the actual composing callsite.
// An unrecognized path or expression remains a missing literal-key error.
const importRecoveryCauseKeys = [
  "authentication", "backupFailed", "batchLimit", "conflict", "historyConflict",
  "invalidData", "network", "overlapPending", "preparedPlanConflict",
  "productChanged", "quantityConflict", "receiptConflict", "recoveryCapacity",
  "saveFailed", "unknownBlocked",
];
const importRecoveryFieldKeys = ["purchase", "retail", "quantity", "data"];
const backupResultKeys = [
  "backup_verified", "backup_verified_retention_warning", "access_denied",
  "network_unavailable", "cancelled", "backup_failed", "configuration_invalid",
  "published_identity_invalid", "backup_finalize_pending", "live_database_missing", "busy",
];
for (const [prefix, contract] of [
  ["importRecovery.", {
    requiredKeys: [...importRecoveryCauseKeys, ...importRecoveryFieldKeys].map((key) => `importRecovery.${key}`),
    usages: [
      { path: "src/Win7POS.Wpf/Pos/Dialogs/CatalogImportRecoveryDialog.xaml.cs", suffix: /^\s*\+\s*field\s*\)/, count: 1 },
      { path: "src/Win7POS.Wpf/Pos/Dialogs/ImportRecoveryPresentation.cs", suffix: /^\s*\+\s*FieldKey\(issue\.Field\)\s*\)/, count: 1 },
      { path: "src/Win7POS.Wpf/Pos/Dialogs/ImportRecoveryPresentation.cs", suffix: /^\s*\+\s*key\s*\)/, count: 1 },
    ],
  }],
  ["customerDisplay.polish.", {
    requiredKeys: ["logoPosition.Left", "logoPosition.Center", "idleMode.Welcome", "idleMode.CustomMessage", "idleMode.Clock", "barcodeMode.Hidden", "barcodeMode.Last4", "barcodeMode.Full"].map((key) => `customerDisplay.polish.${key}`),
    usages: [{ path: "src/Win7POS.Wpf/Pos/Dialogs/CustomerDisplaySettingsViewModel.cs", suffix: /^\s*\+\s*group\s*\+\s*"\."\s*\+\s*value\s*\)/, count: 1 }],
  }],
  ["settingsProfile.safety.", {
    requiredKeys: ["settingsProfile.safety.hardware_activation_local", "settingsProfile.safety.backup_target_invalid"],
    usages: [{ path: "src/Win7POS.Wpf/Pos/Dialogs/DbMaintenanceViewModel.cs", suffix: /^\s*\+\s*x\s*\)/, count: 1 }],
  }],
  ["backupAutomation.result.", {
    requiredKeys: backupResultKeys.map((key) => `backupAutomation.result.${key}`),
    usages: [
      { path: "src/Win7POS.Wpf/Pos/Dialogs/DbMaintenanceViewModel.cs", suffix: /^\s*\+\s*key\s*\)/, count: 1 },
      { path: "src/Win7POS.Wpf/Pos/Dialogs/DbMaintenanceViewModel.cs", suffix: /^\s*\+\s*code\s*\)/, count: 1 },
    ],
  }],
  ["supplierExcelImport.field", {
    requiredKeys: ["Barcode", "ProductName", "SecondProductName", "ItemNumber", "Supplier", "Category", "PurchasePrice", "RetailPrice", "Quantity"].map((key) => `supplierExcelImport.field${key}`),
    usages: [{ path: "src/Win7POS.Wpf/Pos/Dialogs/ImportRecoveryPresentation.cs", suffix: /^\s*\+\s*field\s*\)/, count: 2 }],
  }],
  ["hardware.diagnostic.", {
    requiredKeys: ["hardware.diagnostic.unavailable", "hardware.diagnostic.timeout", "hardware.diagnostic.busy"],
    usages: [{ path: "src/Win7POS.Wpf/Pos/Dialogs/PrinterSettingsViewModel.cs", suffix: /^\s*\+\s*\(result\.Completed\s*\?\s*"unavailable"\s*:\s*result\.ResultCode\)\s*\)/, count: 1 }],
  }],
]) {
  allowedPosDynamicKeyUsages.set(prefix, contract);
}

// A changed enum/result domain needs review instead of silently broadening a prefix.
function validatePosDynamicDomains(errors) {
  function check(path, pattern, values, expected) {
    const source = maskCSharpComments(readFileSync(join(posRoot, path), "utf8"));
    const match = pattern.exec(source);
    const actual = match ? values(match[1]) : [];
    if (JSON.stringify([...new Set(actual)].sort()) !== JSON.stringify([...new Set(expected)].sort())) {
      errors.push(`pos: dynamic translation domain changed in ${path}`);
    }
  }
  const strings = (source) => {
    const values = Array.from(source.matchAll(/"([^"\\]+)"/g), (match) => match[1]);
    return csharpSourceViews(source).code.replace(/[,\s]/g, "") ? [...values, "<unsupported array expression>"] : values;
  };
  const ternaryValues = (source) => Array.from(source.matchAll(/[?:]\s*"([^"\\]+)"/g), (match) => match[1]);
  const customerSettings = "src/Win7POS.Core/Pos/CustomerDisplaySettings.cs";
  for (const [name, values] of [
    ["LogoPosition", ["Left", "Center"]],
    ["IdleMode", ["Welcome", "CustomMessage", "Clock"]],
    ["BarcodeMode", ["Hidden", "Last4", "Full"]],
  ]) {
    check(customerSettings, new RegExp(`enum CustomerDisplay${name}\\s*\\{([^}]+)\\}`), (source) => source.split(",").map((value) => value.trim()), values);
  }
  check("src/Win7POS.Wpf/Pos/Dialogs/CustomerDisplaySettingsViewModel.cs", /([\s\S]*)/, (source) => Array.from(source.matchAll(/Choices\(typeof\((CustomerDisplay\w+)\),\s*"([^"\\]+)"\)/g), (match) => `${match[1]}|${match[2]}`), ["CustomerDisplayLogoPosition|logoPosition", "CustomerDisplayIdleMode|idleMode", "CustomerDisplayBarcodeMode|barcodeMode"]);
  check("src/Win7POS.Wpf/Pos/Dialogs/DbMaintenanceViewModel.cs", /BackupResultCodes\s*=\s*\{([^}]+)\}/, strings, backupResultKeys);
  check("src/Win7POS.Data/Operations/SettingsOperationsService.cs", /([\s\S]*)/, (source) => Array.from(source.matchAll(/adjustments\.Add\("([^"\\]+)"\)/g), (match) => match[1]), ["hardware_activation_local", "backup_target_invalid"]);
  check("src/Win7POS.Core/Hardware/SingleFlightDiagnostic.cs", /([\s\S]*)/, (source) => Array.from(source.matchAll(/ResultCode\s*=\s*"([^"\\]+)"/g), (match) => match[1]), ["busy", "timeout", "completed", "unavailable"]);
  check("src/Win7POS.Wpf/Pos/Dialogs/CatalogImportRecoveryDialog.xaml.cs", /var field =([\s\S]*?);/, ternaryValues, importRecoveryFieldKeys);
  check("src/Win7POS.Wpf/Pos/Dialogs/ImportRecoveryPresentation.cs", /var key =([\s\S]*?);/, ternaryValues, importRecoveryCauseKeys);
  check("src/Win7POS.Wpf/Pos/Dialogs/ImportRecoveryPresentation.cs", /internal static string FieldKey\(string field\)([\s\S]*?)internal static string FriendlyCause/, (source) => Array.from(source.matchAll(/return "([^"\\]+)"/g), (match) => match[1]), importRecoveryFieldKeys);
  check("src/Win7POS.Wpf/Pos/Dialogs/ImportRecoveryPresentation.cs", /internal static string DescribePlanRowError([\s\S]*)/, (source) => Array.from(source.matchAll(/field = "([^"\\]+)"/g), (match) => match[1]), ["Barcode", "ProductName", "SecondProductName", "ItemNumber", "Supplier", "Category", "PurchasePrice", "RetailPrice", "Quantity"]);
}

// Recognize the current finite producer -> sink forms. Unrecognized writes,
// extra uses or statements require review; a set of literals alone is insufficient.
function validatePosDynamicBindings(errors) {
  const read = (path) => csharpSourceViews(readFileSync(join(posRoot, path), "utf8"));
  const fail = (path, name) => errors.push(`pos: unsupported dynamic translation binding ${name} in ${path}`);
  for (const [prefix, contract] of allowedPosDynamicKeyUsages) {
    for (const usage of contract.usages ?? []) {
      const view = read(usage.path);
      const matches = Array.from(view.active.matchAll(/PosLocalization\.(?:Current\.(?:Text|Format)|T|F)\(\s*"([^"\\]+)"/g));
      const actual = matches.filter((match) => match[1] === prefix && view.code.startsWith("PosLocalization", match.index) && usage.suffix.test(view.active.slice(match.index + match[0].length))).length;
      if (actual !== usage.count) fail(usage.path, `${prefix} recognized sink count`);
    }
  }
  const sameSet = (left, right) => left && JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
  const count = (code, name) => Array.from(code.matchAll(new RegExp(`\\b${name}\\b`, "g"))).length;
  const body = (view, name) => {
    const match = new RegExp(`\\b${name}\\([^;{}]*\\)\\s*\\{`, "g").exec(view.code);
    if (!match) return { active: "", code: "", literal: new Uint8Array() };
    const start = match.index + match[0].length;
    let depth = 1; let end = start;
    while (end < view.code.length && depth) {
      if (view.code[end] === "{") depth += 1;
      if (view.code[end] === "}") depth -= 1;
      end += 1;
    }
    return { active: view.active.slice(start, end - 1), code: view.code.slice(start, end - 1), literal: view.literal.slice(start, end - 1) };
  };
  const assignments = (view, name, terminators = ";") => Array.from(view.code.matchAll(
    new RegExp(`\\b${name}\\s*(\\?\\?=|[+*/%&|^\\-]?=)(?!=)([^${terminators}]*?)[${terminators}]`, "gd"),
  ), (match) => ({ operator: match[1], value: view.active.slice(...match.indices[2]), end: match.indices[0][1] }));
  const escaped = (view, name) => new RegExp(`\\b(?:ref|out)\\s+${name}\\b|\\b${name}\\s*(?:\\+\\+|--)`).test(view.code);
  const contains = (view, expected) => {
    const compact = (value) => {
      let active = ""; let code = "";
      for (let index = 0; index < value.active.length; index += 1) {
        if (/\s/.test(value.active[index]) && !value.literal[index]) continue;
        active += value.active[index]; code += value.code[index];
      }
      return { active, code };
    };
    const { active, code } = compact(view);
    const fragment = compact(csharpSourceViews(expected)).active;
    let offset = active.indexOf(fragment);
    while (offset >= 0) {
      if (code[offset] === fragment[0]) return true;
      offset = active.indexOf(fragment, offset + 1);
    }
    return false;
  };
  function finiteStrings(expression) {
    const text = expression.trim();
    if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return [JSON.parse(text)];
    const code = csharpSourceViews(text).code;
    let depth = 0; let question = -1; let colon = -1; let pending = 0;
    for (let index = 0; index < code.length; index += 1) {
      if ("([{<".includes(code[index])) depth += 1;
      if (")]}>".includes(code[index])) depth -= 1;
      if (depth !== 0) continue;
      if (code[index] === "?" && code[index - 1] !== "?" && code[index + 1] !== "?") {
        if (question < 0) question = index;
        pending += 1;
      }
      if (code[index] === ":" && question >= 0 && --pending === 0) { colon = index; break; }
    }
    if (question <= 0 || colon < 0) return null;
    const yes = finiteStrings(text.slice(question + 1, colon));
    const no = finiteStrings(text.slice(colon + 1));
    return yes && no ? [...yes, ...no] : null;
  }
  const wpf = "src/Win7POS.Wpf/";
  const presentationPath = `${wpf}Pos/Dialogs/ImportRecoveryPresentation.cs`;
  const presentation = read(presentationPath);
  for (const [path, method, variable, expected] of [
    [presentationPath, "FriendlyCause", "key", importRecoveryCauseKeys],
    [`${wpf}Pos/Dialogs/CatalogImportRecoveryDialog.xaml.cs`, "PreviewFieldError", "field", importRecoveryFieldKeys],
  ]) {
    const methodBody = body(read(path), method);
    const writes = assignments(methodBody, variable);
    const sink = new RegExp(`^\\s*return\\s+PosLocalization\\.T\\("importRecovery\\."\\s*\\+\\s*${variable}\\)`);
    if (writes.length !== 1 || writes[0].operator !== "=" || !sameSet(finiteStrings(writes[0].value), expected) ||
        !sink.test(methodBody.active.slice(writes[0].end)) || escaped(methodBody, variable)) fail(path, method);
  }
  const fieldBody = body(presentation, "FieldKey");
  const fieldReturns = Array.from(fieldBody.active.matchAll(/return\s+"([^"\\]+)"\s*;/g), (match) => match[1]);
  if (count(fieldBody.code, "return") !== fieldReturns.length || !sameSet(fieldReturns, importRecoveryFieldKeys)) fail(presentationPath, "FieldKey");
  const rowBody = body(presentation, "DescribePlanRowError");
  const fieldWrites = assignments(rowBody, "field");
  const fieldValues = fieldWrites.map((write) => write.operator === "=" ? finiteStrings(write.value) : null);
  if (fieldValues.some((values) => !values || values.length !== 1) || escaped(rowBody, "field") ||
      !sameSet(fieldValues.flat(), ["Barcode", "ProductName", "SecondProductName", "ItemNumber", "Supplier", "Category", "PurchasePrice", "RetailPrice", "Quantity"]) ||
      !contains(rowBody, 'return PosLocalization.F("importRecovery.rowError", row, barcode, invalidUnicode ? PosLocalization.F("importRecovery.fieldInvalidUnicode", PosLocalization.T("supplierExcelImport.field" + field)) : PosLocalization.F("importRecovery.fieldTooLong", PosLocalization.T("supplierExcelImport.field" + field), maximum));')) fail(presentationPath, "DescribePlanRowError.field");

  const customerPath = `${wpf}Pos/Dialogs/CustomerDisplaySettingsViewModel.cs`;
  const customer = read(customerPath);
  if (count(customer.code, "Choices") !== 4 || !contains(customer,
    'private static IEnumerable<CustomerDisplayOption> Choices(Type type, string group) => Enum.GetValues(type).Cast<object>().Select(value => new CustomerDisplayOption { Value = value, Label = PosLocalization.Current.Text("customerDisplay.polish." + group + "." + value) });')) fail(customerPath, "Choices");

  const maintenancePath = `${wpf}Pos/Dialogs/DbMaintenanceViewModel.cs`;
  const maintenance = read(maintenancePath);
  const refresh = body(maintenance, "RefreshBackupResultAsync");
  const backup = body(maintenance, "BackupNowAsync");
  if (count(maintenance.code, "BackupResultCodes") !== 3 || !contains(refresh,
    'var key = Array.IndexOf(BackupResultCodes, parts[0]) >= 0 ? parts[0] : "backup_failed"; LastBackupResult = PosLocalization.T("backupAutomation.result." + key)') ||
    !contains(backup, 'foreach (var code in BackupResultCodes) { if (ex is InvalidOperationException && ex.Message == "Backup result=" + code) { detail = PosLocalization.T("backupAutomation.result." + code); break; } }')) fail(maintenancePath, "backup result whitelist to sink");

  const settingsPath = "src/Win7POS.Data/Operations/SettingsOperationsService.cs";
  const settings = read(settingsPath);
  const safety = body(settings, "ApplySafety");
  const preview = body(settings, "PreviewImportAsync");
  const previewConstructor = body(settings, "SettingsProfilePreview");
  const consumer = body(maintenance, "PreviewProfileAsync");
  const previewWrites = assignments(consumer, "preview");
  if (count(safety.code, "adjustments") !== 4 || !contains(safety, "var adjustments = new List<string>();") || !contains(safety, "return adjustments;") ||
      count(preview.code, "adjustments") !== 2 || !contains(preview, 'var adjustments = ApplySafety(before, merged); var values = AddAliases(merged); return new SettingsProfilePreview(this, before, values, adjustments);') ||
      count(settings.code, "SafetyAdjustments") !== 2 || !contains(settings, "public IReadOnlyList<string> SafetyAdjustments { get; }") ||
      count(previewConstructor.code, "adjustments") !== 1 || !contains(previewConstructor, "SafetyAdjustments = adjustments.ToArray();") ||
      count(consumer.code, "preview") !== 5 || previewWrites.length !== 1 || count(consumer.code, "return") !== 3 ||
      !contains(consumer, "return await service.PreviewImportAsync(bytes).ConfigureAwait(false);") ||
      !contains(consumer, 'preview.SafetyAdjustments.Select(x => PosLocalization.T("settingsProfile.safety." + x))')) fail(settingsPath, "SafetyAdjustments producer to sink");

  const flightPath = "src/Win7POS.Core/Hardware/SingleFlightDiagnostic.cs";
  const flightSource = read(flightPath);
  const flight = body(flightSource, "RunAsync");
  const resultWrites = assignments(flight, "ResultCode", ";},");
  const diagnosticPath = `${wpf}Pos/Dialogs/PrinterSettingsViewModel.cs`;
  const diagnostics = body(read(diagnosticPath), "ReadQueueDiagnosticsAsync");
  const adapter = body(read(`${wpf}Printing/WindowsPrinterDiagnostics.cs`), "ReadAsync");
  if (!contains(flightSource, 'public bool Completed => ResultCode == "completed";') ||
      !contains(flightSource, "public string ResultCode { get; internal set; }") ||
      resultWrites.length !== 4 || resultWrites.some((write) => write.operator !== "=" || !finiteStrings(write.value) || finiteStrings(write.value).length !== 1) ||
      !sameSet(resultWrites.flatMap((write) => finiteStrings(write.value) ?? []), ["busy", "timeout", "completed", "unavailable"]) ||
      count(adapter.code, "return") !== 3 || !contains(adapter, "return Flight.RunAsync(name, () =>") ||
      count(diagnostics.code, "result") !== 5 || assignments(diagnostics, "result").length !== 1 ||
      !contains(diagnostics, 'PosLocalization.T("hardware.diagnostic." + (result.Completed ? "unavailable" : result.ResultCode))') ||
      !contains(diagnostics, "var result = await WindowsPrinterDiagnostics.ReadAsync(ResolveReceiptPrinter()?.Name ?? PrinterName).ConfigureAwait(true);")) fail(diagnosticPath, "diagnostic result to sink");
}

const requiredAdminExactKeys = [
  "Select product",
  "Fallback when the product is not listed.",
  "Product id / barcode fallback",
  "Create new supplier",
  "Existing supplier or new supplier name",
  "Create new category",
  "Existing category or new category name",
  "Rename category",
  "Delete category",
  "Replace with existing",
  "Replacement category",
  "Remove assignment and delete",
  "Rename supplier",
  "Delete supplier",
  "Replacement supplier",
  "Create mobile history entry",
  "Create History Entry",
  "POS Revenue",
  "POS revenue unavailable",
  "POS sales requiring review",
  "Record recovery action",
  "Auth safety status",
  "Target recovery",
  "POS Sync Recovery",
  "Device / staff",
  "Stock warnings POS",
  "Supplier workbook preview",
  "History detail",
  "History detail is not available.",
  "History detail could not be loaded.",
  "Prices",
  "Product detail is not available.",
  "Product detail could not be loaded.",
  "Update mobile history entry",
  "Tombstone mobile history entry",
  "at least",
  "loading total...",
];

const adminExactMigrationTargets = [
  "auth/account/profile -> authLogin/authForm/shopCodeLogin structured keys",
  "pos revenue -> posRevenue structured namespace",
  "pos sync recovery -> syncRecovery structured namespace",
  "catalog actions -> catalogActions structured namespace",
  "history entry surfaces -> historyEntries structured namespace",
];
const exactAllowedLegacyKeys = [
  "legacy catalog/modal labels kept during structured migration",
  "old task-specific compatibility keys still exercised by foundation tests",
];

const forbiddenPosUiFragments = [
  "Permesso negato",
  "Carrello sincronizzato",
  "Carrello recuperato",
  "Carrello aggiornato",
  "Riga rimossa",
  "Quantità aggiornata",
  "Preview caricata",
  "Prodotto creato e aggiunto",
  "Errore in avvio",
  "Non hai il permesso",
  "Errore apertura Utenti e ruoli",
  "Errore apertura Prodotti",
];

const posScreenCoverageFiles = [
  ["MainWindow", "src/Win7POS.Wpf/MainWindow.xaml"],
  ["Operator switch", "src/Win7POS.Wpf/Pos/Dialogs/OperatorSwitchDialog.xaml"],
  ["POS/cart", "src/Win7POS.Wpf/Pos/PosView.xaml"],
  ["Payment", "src/Win7POS.Wpf/Pos/PaymentView.xaml"],
  ["Discount", "src/Win7POS.Wpf/Pos/Dialogs/DiscountDialog.xaml"],
  ["Refund", "src/Win7POS.Wpf/Pos/Dialogs/RefundDialog.xaml"],
  ["Daily report", "src/Win7POS.Wpf/Pos/DailyReportView.xaml"],
  ["Daily close dialog", "src/Win7POS.Wpf/Pos/Dialogs/DailyReportDialog.xaml"],
  ["Sales register", "src/Win7POS.Wpf/Pos/Dialogs/SalesRegisterDialog.xaml"],
  ["Printer settings", "src/Win7POS.Wpf/Pos/Dialogs/PrinterSettingsDialog.xaml"],
  ["DB maintenance", "src/Win7POS.Wpf/Pos/Dialogs/DbMaintenanceDialog.xaml"],
  ["Shop settings", "src/Win7POS.Wpf/Pos/Dialogs/ShopSettingsDialog.xaml"],
  ["Settings hub", "src/Win7POS.Wpf/Pos/Dialogs/SettingsHubDialog.xaml"],
  ["Language settings", "src/Win7POS.Wpf/Pos/Dialogs/LanguageSettingsDialog.xaml"],
  ["Customer display settings", "src/Win7POS.Wpf/Pos/Dialogs/CustomerDisplaySettingsDialog.xaml"],
];

const posCoreXamlPaths = new Set(posScreenCoverageFiles.map(([, relativePath]) => relativePath));
const posReachableLegacyXamlFiles = [
  ["Import data", "src/Win7POS.Wpf/Import/ImportView.xaml"],
  ["Import confirm", "src/Win7POS.Wpf/Import/ApplyConfirmDialog.xaml"],
  ["Import data dialog", "src/Win7POS.Wpf/Import/ImportDataDialog.xaml"],
  ["Products", "src/Win7POS.Wpf/Products/ProductsView.xaml"],
  ["Product edit", "src/Win7POS.Wpf/Products/ProductEditDialog.xaml"],
  ["Product delete confirm", "src/Win7POS.Wpf/Products/DeleteProductConfirmDialog.xaml"],
  ["Product export", "src/Win7POS.Wpf/Products/ExportDataDialog.xaml"],
  ["Product price history", "src/Win7POS.Wpf/Products/ProductPriceHistoryDialog.xaml"],
  ["Users and roles", "src/Win7POS.Wpf/Pos/UserManagementView.xaml"],
  ["Users dialog", "src/Win7POS.Wpf/Pos/Dialogs/UserManagementDialog.xaml"],
  ["New user", "src/Win7POS.Wpf/Pos/Dialogs/NewUserDialog.xaml"],
  ["Role edit", "src/Win7POS.Wpf/Pos/Dialogs/RoleEditDialog.xaml"],
  ["First run setup", "src/Win7POS.Wpf/Pos/Dialogs/FirstRunSetupDialog.xaml"],
  ["About support", "src/Win7POS.Wpf/Pos/Dialogs/AboutSupportDialog.xaml"],
  ["Held carts", "src/Win7POS.Wpf/Pos/Dialogs/HeldCartsDialog.xaml"],
  ["Boleta number", "src/Win7POS.Wpf/Pos/Dialogs/BoletaNumberDialog.xaml"],
  ["Change PIN", "src/Win7POS.Wpf/Pos/Dialogs/ChangePinDialog.xaml"],
  ["Change quantity", "src/Win7POS.Wpf/Pos/Dialogs/ChangeQuantityDialog.xaml"],
  ["Override authorization", "src/Win7POS.Wpf/Pos/Dialogs/OverrideAuthorizationDialog.xaml"],
  ["POS online first login", "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml"],
];
const posReachableLegacyXamlPaths = new Set(posReachableLegacyXamlFiles.map(([, relativePath]) => relativePath));
const posCoreCsharpUiPaths = new Set([
  "src/Win7POS.Wpf/App.xaml.cs",
  "src/Win7POS.Wpf/MainWindow.xaml.cs",
  "src/Win7POS.Wpf/Pos/PosViewModel.cs",
  "src/Win7POS.Wpf/Pos/PosWorkflowService.cs",
  "src/Win7POS.Wpf/Pos/DailyReportView.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/DailyReportViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/DbMaintenanceViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/DiscountDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/DiscountViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/OperatorSwitchDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/PaymentViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/PrinterSettingsViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/RefundDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/RefundViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/SalesRegisterViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/ShopSettingsViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/SettingsHubDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/LanguageSettingsDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/CustomerDisplaySettingsDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/CustomerDisplaySettingsViewModel.cs",
  "src/Win7POS.Wpf/Pos/Online/PosSyncStatusReader.cs",
  "src/Win7POS.Wpf/Printing/WindowsSpoolerReceiptPrinter.cs",
]);
const posReachableLegacyCsharpUiPaths = new Set([
  "src/Win7POS.Wpf/Import/ApplyConfirmDialog.xaml.cs",
  "src/Win7POS.Wpf/Import/ImportViewModel.cs",
  "src/Win7POS.Wpf/Infrastructure/Security/OverrideAuthService.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/AboutSupportViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/BoletaNumberDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/ChangePinDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/ChangeQuantityDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/FirstRunSetupDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/HeldCartsViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/NewUserDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/OverrideAuthorizationDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/RefundDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/RoleEditDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/UserManagementViewModel.cs",
  "src/Win7POS.Wpf/Pos/Online/PosOnlineBootstrapService.cs",
  "src/Win7POS.Wpf/Products/ExportDataDialog.xaml.cs",
  "src/Win7POS.Wpf/Products/ProductEditViewModel.cs",
  "src/Win7POS.Wpf/Products/ProductPriceHistoryViewModel.cs",
  "src/Win7POS.Wpf/Products/ProductsViewModel.cs",
]);
const posAllowedExternalHardcodedText = new Map([
  [
    "src/Win7POS.Wpf/MainWindow.xaml.cs|catalog_still_unsafe",
    "external Win7POS internal recovery result code; operator copy is localized on the following ternary branches",
  ],
  [
    "src/Win7POS.Wpf/Pos/Dialogs/DbMaintenanceDialog.xaml|Import Excel fornitore",
    "external Win7POS literal preexisting in sibling repo; this Admin Web merge must not edit Win7POS",
  ],
  [
    "src/Win7POS.Wpf/Printing/WindowsSpoolerReceiptPrinter.cs|Cash drawer printer is not configured.",
    "external Win7POS printer exception text preexisting in sibling repo",
  ],
  [
    "src/Win7POS.Wpf/Printing/WindowsSpoolerReceiptPrinter.cs|Receipt printer is not configured.",
    "external Win7POS printer exception text preexisting in sibling repo",
  ],
  [
    "src/Win7POS.Wpf/Printing/WindowsSpoolerReceiptPrinter.cs|Receipt exceeded the safe page limit.",
    "external Win7POS internal print-loop safety exception; this Admin Web merge must not edit Win7POS",
  ],
  [
    "src/Win7POS.Wpf/Products/ProductsView.xaml|Import Excel fornitore",
    "external Win7POS literal preexisting in sibling repo; this Admin Web merge must not edit Win7POS",
  ],
]);
const posExcludedUnreachableLegacyFiles = [
  {
    path: "src/Win7POS.Wpf/Import/ProductDbImportViewModel.cs",
    reason: "legacy database import ViewModel not wired from current POS menu; kept out of reachable UI failure gate",
  },
  {
    path: "src/Win7POS.Wpf/Pos/Dialogs/DailyReportDialog.xaml.cs",
    reason: "wrapper code-behind after DailyReportView extraction; no operator copy remains",
  },
];
const xamlTextAttributes = [
  "AutomationProperties.Name",
  "Content",
  "Header",
  "Text",
  "Title",
  "ToolTip",
];
const xamlAllowedLiteralValues = new Set([
  "Barcode",
  "DB",
  "Excel",
  "Menu",
  "PDF",
  "POS",
  "RUT",
  "SII",
  "SKU",
  "VACUUM",
  "Win7POS",
  "X",
  "×",
  "→",
]);
const technicalLiteralReasons = new Map([
  ["Barcode", "retail barcode field label accepted as domain technical term"],
  ["DB", "database acronym"],
  ["Excel", "file format/product name"],
  ["Menu", "short shell menu word accepted where icon fallback is needed"],
  ["PDF", "file format"],
  ["POS", "product/domain acronym"],
  ["RUT", "Chilean tax identifier; do not translate"],
  ["SII", "Chilean tax authority acronym; do not translate"],
  ["SKU", "inventory identifier acronym; do not translate"],
  ["VACUUM", "SQLite maintenance operation; do not translate"],
  ["Win7POS", "application/product name"],
  ["X", "icon-like close/control label"],
  ["×", "icon-like close/control label"],
  ["→", "icon-like navigation glyph"],
]);
const scopedTechnicalCsharpLiterals = new Map([
  ["src/Win7POS.Wpf/Pos/Dialogs/CustomerDisplaySettingsDialog.xaml.cs|PNG / JPEG / BMP|*.png;*.jpg;*.jpeg;*.bmp", {
    context: /new OpenFileDialog\s*\{\s*Filter = "PNG \/ JPEG \/ BMP\|\*\.png;\*\.jpg;\*\.jpeg;\*\.bmp"/,
    reason: "image format names and file extension patterns in logo picker",
  }],
  ["src/Win7POS.Wpf/Pos/PosWorkflowService.cs|Backup result=", {
    context: /throw new InvalidOperationException\("Backup result="\s*\+\s*result\.Code\)/,
    reason: "internal backup result sentinel; DbMaintenanceViewModel maps known codes to localized copy and otherwise uses a localized fallback",
  }],
]);
const xamlAllowedLiteralPattern =
  /^(?:\s*|[#0-9,.:;_\-/\s*()]+|\+ ?[0-9]+|\.{2,}|-|–|—|\?|…|☰|🔒|🔓)$/;

function normalizePathSeparators(path) {
  return path.replace(/\\/g, "/");
}

function posRelativePath(filePath) {
  return normalizePathSeparators(filePath).slice(normalizedPosRoot.length + 1);
}

function collectFiles(directory, predicate, output = []) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      collectFiles(fullPath, predicate, output);
      continue;
    }

    if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }

  return output;
}

function loadDictionaries() {
  const filePath = join(root, "src/i18n/dictionaries.ts");
  const source = readFileSync(filePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require,
  };

  vm.runInNewContext(js, sandbox, { filename: filePath });

  return sandbox.module.exports.dictionaries ?? sandbox.exports.dictionaries;
}

function flatten(value, prefix = "", output = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      output[`${prefix}[${index}]`] = entry;
    });
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "exact") {
        continue;
      }

      flatten(child, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }

  output[prefix] = value;
  return output;
}

function placeholders(value) {
  return Array.from(
    String(value).matchAll(/({{[^{}]+}}|{[A-Za-z0-9_]+}|{[0-9]+}|%s)/g),
    (match) => match[0],
  ).sort();
}

function samePlaceholders(left, right) {
  return JSON.stringify(placeholders(left)) === JSON.stringify(placeholders(right));
}

function parsePosEntries(sources, errors) {
  const entries = new Map();
  const builderSource = csharpSourceViews(sources.find(([path]) => posRelativePath(path) === "src/Win7POS.Wpf/Localization/PosLocalization.cs")?.[1] ?? "").code;
  const entryPattern =
    /new TranslationEntry\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g;

  for (const [filePath, source] of sources) {
    for (const match of source.matchAll(entryPattern)) {
      const key = JSON.parse(`"${match[1]}"`);

      if (entries.has(key)) {
        errors.push(`pos: duplicate translation key ${key} in ${filePath}`);
        continue;
      }

      entries.set(key, {
        en: JSON.parse(`"${match[2]}"`),
        es: JSON.parse(`"${match[3]}"`),
        it: JSON.parse(`"${match[4]}"`),
        "zh-CN": JSON.parse(`"${match[5]}"`),
      });
    }
  }

  const literal = '"((?:[^"\\\\]|\\\\.)*)"';
  const decode = (value) => JSON.parse(`"${value}"`);
  const directPattern = new RegExp(`catalog\\[${literal}\\]\\[${literal}\\]\\s*=\\s*${literal}\\s*;`, "g");
  const recoveryPattern = new RegExp(`RecoveryText\\(catalog,\\s*${Array(5).fill(literal).join("\\s*,\\s*")}\\s*\\)`, "g");
  const setLocale = (key, locale, value, filePath) => {
    const values = entries.get(key) ?? {};
    if (Object.hasOwn(values, locale)) {
      errors.push(`pos: duplicate translation key ${key} for ${locale} in ${filePath}`);
      return;
    }
    values[locale] = value;
    entries.set(key, values);
  };
  for (const [filePath, source] of sources) {
    const activeCode = csharpSourceViews(source).code;
    const directMatches = Array.from(source.matchAll(directPattern)).filter((match) => activeCode.startsWith("catalog", match.index));
    const recoveryMatches = posRelativePath(filePath) === "src/Win7POS.Wpf/Localization/PosLocalization.ImportRecovery.cs"
      ? Array.from(source.matchAll(recoveryPattern)).filter((match) => activeCode.startsWith("RecoveryText", match.index)) : [];
    if (directMatches.length || recoveryMatches.length) {
      const provider = /private static void (Add\w+Translations)\(Dictionary<string, Dictionary<string, string>> catalog\)/.exec(source)?.[1];
      if (!provider || !builderSource.includes(`${provider}(catalog);`)) {
        errors.push(`pos: unregistered locale provider ${posRelativePath(filePath)}`);
      }
    }
    for (const match of directMatches) {
      const [locale, key, value] = match.slice(1).map(decode);
      if (adminLocales.includes(locale)) setLocale(key, locale, value, filePath);
    }
    if (posRelativePath(filePath) !== "src/Win7POS.Wpf/Localization/PosLocalization.ImportRecovery.cs") continue;
    for (const match of recoveryMatches) {
      const [key, ...values] = match.slice(1).map(decode);
      adminLocales.forEach((locale, index) => setLocale(`importRecovery.${key}`, locale, values[index], filePath));
    }
    for (const [locale, parameter] of [["en", "en"], ["es", "es"], ["it", "it"], ["zh-CN", "zh"]]) {
      const assignment = `catalog["${locale}"]["importRecovery." + key] = ${parameter};`;
      let offset = source.indexOf(assignment);
      while (offset >= 0 && !activeCode.startsWith("catalog", offset)) offset = source.indexOf(assignment, offset + 1);
      if (offset < 0) {
        errors.push(`pos: unsupported RecoveryText registration for ${locale}`);
      }
    }
  }

  return entries;
}

function collectPosLocKeys() {
  return new Set(collectPosLocKeyUsages().map((usage) => usage.key));
}

function collectPosLocKeyUsages() {
  const usages = [];
  const files = collectFiles(join(posRoot, "src/Win7POS.Wpf"), (filePath) =>
    filePath.endsWith(".xaml"),
  );

  for (const filePath of files) {
    const relativePath = posRelativePath(filePath);
    const source = readFileSync(filePath, "utf8");
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const match of line.matchAll(/\{loc:Loc\s+([^}\s]+)\}/g)) {
        usages.push({
          key: match[1],
          line: index + 1,
          path: relativePath,
          source: "xaml",
          scope: posUiScope(relativePath),
        });
      }
    });
  }

  return usages;
}

function collectPosCodeKeys() {
  return new Set(collectPosCodeKeyUsages().map((usage) => usage.key));
}

function collectPosCodeKeyUsages() {
  const usages = [];
  const files = collectFiles(join(posRoot, "src/Win7POS.Wpf"), (filePath) =>
    filePath.endsWith(".cs") &&
    (!posRelativePath(filePath).includes("/Localization/") ||
      posRelativePath(filePath).endsWith("/Localization/PosReceiptLocalization.cs")),
  );
  const patterns = [
    /PosLocalization\.Current\.(?:Text|Format)\(\s*"([^"]+)"/g,
    /PosLocalization\.(?:T|F)\(\s*"([^"]+)"/g,
  ];

  for (const filePath of files) {
    const relativePath = posRelativePath(filePath);
    const view = csharpSourceViews(readFileSync(filePath, "utf8"));
    const source = view.active;
    const lines = source.split("\n");
    let lineOffset = 0;

    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        for (const match of line.matchAll(pattern)) {
          if (!view.code.startsWith("PosLocalization", lineOffset + (match.index ?? 0))) continue;
          const suffix = line.slice((match.index ?? 0) + match[0].length);
          const dynamicKeyUsage = allowedPosDynamicKeyUsages.get(match[1]);

          const contracts = dynamicKeyUsage?.usages ?? (dynamicKeyUsage ? [dynamicKeyUsage] : []);
          if (contracts.some((usage) =>
            (usage.path === relativePath || usage.paths?.includes(relativePath)) && usage.suffix.test(suffix)
          )) {
            continue;
          }

          usages.push({
            key: match[1],
            line: index + 1,
            path: relativePath,
            source: "code",
            scope: posUiScope(relativePath),
          });
        }
      }
      lineOffset += line.length + 1;
    });
  }

  return usages;
}

function collectPosReachableZhCnKeyInventory(posEntries) {
  const usageByKey = new Map();
  const usages = [
    ...collectPosLocKeyUsages(),
    ...collectPosCodeKeyUsages(),
  ].filter((usage) => usage.scope === "core" || usage.scope === "reachableLegacy");

  for (const usage of usages) {
    if (!usageByKey.has(usage.key)) {
      usageByKey.set(usage.key, []);
    }

    usageByKey.get(usage.key).push(usage);
  }

  const items = Array.from(usageByKey, ([key, keyUsages]) => {
    const zhCN = posEntries.get(key)?.["zh-CN"] ?? "";
    const paths = Array.from(
      new Set(keyUsages.map((usage) => `${usage.path}:${usage.line}`)),
    ).sort();

    return {
      hasCjk: /[\u4e00-\u9fff]/.test(zhCN),
      key,
      paths,
      scopes: Array.from(new Set(keyUsages.map((usage) => usage.scope))).sort(),
      sources: Array.from(new Set(keyUsages.map((usage) => usage.source))).sort(),
      usageCount: keyUsages.length,
      zhCN,
    };
  }).sort((left, right) => left.key.localeCompare(right.key));

  return {
    count: items.length,
    items,
    nonCjkItems: items.filter((item) => !item.hasCjk),
  };
}

function scanForbiddenPosFragments() {
  const findings = [];
  const files = [
    "src/Win7POS.Wpf/MainWindow.xaml.cs",
    "src/Win7POS.Wpf/Pos/PosViewModel.cs",
    "src/Win7POS.Wpf/Pos/DailyReportView.xaml",
    "src/Win7POS.Wpf/Pos/Dialogs/DailyReportDialog.xaml",
    "src/Win7POS.Wpf/Pos/Dialogs/DailyReportViewModel.cs",
    "src/Win7POS.Wpf/Pos/Dialogs/SalesRegisterDialog.xaml",
    "src/Win7POS.Wpf/Pos/Dialogs/SalesRegisterViewModel.cs",
    "src/Win7POS.Wpf/Pos/Dialogs/PrinterSettingsDialog.xaml",
    "src/Win7POS.Wpf/Pos/Dialogs/PrinterSettingsViewModel.cs",
    "src/Win7POS.Wpf/Pos/Online/PosSyncStatusReader.cs",
  ];

  for (const relativePath of files) {
    const source = readFileSync(join(posRoot, relativePath), "utf8");
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("//") || trimmed.startsWith("///")) {
        return;
      }

      for (const fragment of forbiddenPosUiFragments) {
        if (line.includes(fragment)) {
          findings.push(`${relativePath}:${index + 1}: forbidden UI fragment ${fragment}`);
        }
      }
    });
  }

  return findings;
}

function technicalLiteralReason(value) {
  const trimmed = value.trim();

  if (technicalLiteralReasons.has(trimmed)) {
    return technicalLiteralReasons.get(trimmed);
  }

  if (/^[A-Z0-9_]{3,}$/.test(trimmed)) {
    return "uppercase code/acronym literal";
  }

  if (/^[#0-9,.:;_\-/\s*()]+$/.test(trimmed)) {
    return "numeric/date/layout placeholder literal";
  }

  if (/^(?:\+ ?[0-9]+|\.{2,}|-|–|—|\?|…|☰|🔒|🔓)$/.test(trimmed)) {
    return "icon, punctuation or keypad control literal";
  }

  return null;
}

function classifyXamlLiteral(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return { kind: "ignore" };
  }

  if (
    trimmed.includes("{loc:Loc") ||
    trimmed.includes("{Binding") ||
    trimmed.includes("{StaticResource") ||
    trimmed.includes("{DynamicResource") ||
    trimmed.includes("{x:Static") ||
    trimmed.includes("{TemplateBinding") ||
    trimmed.includes("{RelativeSource") ||
    trimmed.startsWith("pack://") ||
    trimmed.startsWith("clr-namespace")
  ) {
    return { kind: "ignore" };
  }

  const technicalReason = technicalLiteralReason(trimmed);

  if (xamlAllowedLiteralValues.has(trimmed) || technicalReason) {
    return {
      kind: "allowedTechnical",
      reason: technicalReason ?? "explicit XAML technical whitelist",
    };
  }

  if (xamlAllowedLiteralPattern.test(trimmed)) {
    return {
      kind: "allowedTechnical",
      reason: "punctuation or numeric XAML literal",
    };
  }

  if (/[A-Za-zÀ-ÿ\u4e00-\u9fff]/.test(trimmed)) {
    return { kind: "candidate" };
  }

  return { kind: "ignore" };
}

function scanPosXamlHardcodedText() {
  const findings = [];
  const allowedTechnical = [];
  const files = collectFiles(join(posRoot, "src/Win7POS.Wpf"), (filePath) =>
    filePath.endsWith(".xaml"),
  );

  for (const filePath of files) {
    const relativePath = posRelativePath(filePath);
    const source = readFileSync(filePath, "utf8");
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const attribute of xamlTextAttributes) {
        const pattern = new RegExp(`\\b${attribute}="([^"]*)"`, "g");
        for (const match of line.matchAll(pattern)) {
          const classification = classifyXamlLiteral(match[1]);
          if (classification.kind === "ignore") {
            continue;
          }

          if (classification.kind === "allowedTechnical") {
            allowedTechnical.push({
              attribute,
              line: index + 1,
              path: relativePath,
              reason: classification.reason,
              value: match[1],
            });
            continue;
          }

          findings.push({
            attribute,
            core: posCoreXamlPaths.has(relativePath),
            reachableLegacy: posReachableLegacyXamlPaths.has(relativePath),
            line: index + 1,
            path: relativePath,
            value: match[1],
          });
        }
      }
    });
  }

  return { allowedTechnical, findings };
}

function posUiScope(relativePath) {
  if (posCoreXamlPaths.has(relativePath) || posCoreCsharpUiPaths.has(relativePath)) {
    return "core";
  }

  if (posReachableLegacyXamlPaths.has(relativePath) || posReachableLegacyCsharpUiPaths.has(relativePath)) {
    return "reachableLegacy";
  }

  return "other";
}

function extractCsharpStringLiterals(line) {
  const values = [];
  for (const match of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    try {
      values.push(JSON.parse(`"${match[1]}"`));
    } catch {
      values.push(match[1]);
    }
  }

  return values;
}

function isCsharpUiLiteralContext(line) {
  return (
    /\b(?:Status|StatusMessage|ErrorMessage|SuccessMessage|WarningMessage|DialogTitle|Title|Filter)\s*=/.test(line) ||
    /\b(?:ShowError|ShowInfo|ShowWarning)\s*\(/.test(line) ||
    /\b[A-Za-z0-9_]*(?:Status|Error|Warning|Message)[A-Za-z0-9_]*Text\.Text\s*=/.test(line) ||
    /\b(?:MessageBox|ModernMessageDialog)\.Show\s*\(/.test(line) ||
    /\bApplyConfirmDialog\.ShowConfirm\s*\(/.test(line) ||
    /\bnew\s+(?:OpenFileDialog|SaveFileDialog|RoleEditDialog)\b/.test(line) ||
    /\b(?:Header|Content|ToolTip)\s*=/.test(line) ||
    /\bthrow\s+new\s+(?:InvalidOperationException|ApplicationException)\s*\(/.test(line)
  );
}

function shouldIgnoreCsharpUiLine(line) {
  const trimmed = line.trim();

  return (
    !trimmed ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("///") ||
    trimmed.includes("PosLocalization.") ||
    trimmed.includes("PosLocalization.Current.") ||
    trimmed.includes("Log") ||
    trimmed.includes("nameof(") ||
    trimmed.includes("new TranslationEntry(")
  );
}

function scanPosCsharpHardcodedText() {
  const findings = [];
  const allowedTechnical = [];
  const relativePaths = Array.from(new Set([
    ...posCoreCsharpUiPaths,
    ...posReachableLegacyCsharpUiPaths,
  ])).sort();

  for (const relativePath of relativePaths) {
    const source = readFileSync(join(posRoot, relativePath), "utf8");
    const lines = source.split(/\r?\n/);
    const scope = posUiScope(relativePath);

    lines.forEach((line, index) => {
      if (shouldIgnoreCsharpUiLine(line) || !isCsharpUiLiteralContext(line)) {
        return;
      }

      for (const value of extractCsharpStringLiterals(line)) {
        const trimmed = value.trim();

        if (!trimmed || !/[A-Za-zÀ-ÿ\u4e00-\u9fff]/.test(trimmed)) {
          continue;
        }

        const scoped = scopedTechnicalCsharpLiterals.get(`${relativePath}|${trimmed}`);
        const reason = technicalLiteralReason(trimmed) ?? (scoped?.context.test(line) ? scoped.reason : null);
        const finding = {
          context: "csharp",
          line: index + 1,
          path: relativePath,
          scope,
          value,
        };

        if (reason) {
          allowedTechnical.push({ ...finding, reason });
          continue;
        }

        findings.push(finding);
      }
    });
  }

  return { allowedTechnical, findings };
}

function isAllowedExternalPosHardcodedText(finding) {
  return posAllowedExternalHardcodedText.has(`${finding.path}|${finding.value}`);
}

function collectAdminExactKeyCount(dictionaries) {
  const keys = new Set();

  for (const locale of adminLocales) {
    for (const key of Object.keys(dictionaries[locale].exact ?? {})) {
      keys.add(key);
    }
  }

  return keys.size;
}

function collectPosScreenCoverage() {
  return posScreenCoverageFiles.map(([area, relativePath]) => {
    const source = readFileSync(join(posRoot, relativePath), "utf8");
    const locKeys = Array.from(source.matchAll(/\{loc:Loc\s+([^}\s]+)\}/g));
    const bindings = Array.from(source.matchAll(/\{Binding\s+([^},\s]+)/g));

    return {
      area,
      bindings: bindings.length,
      locKeys: locKeys.length,
      path: relativePath,
    };
  });
}

function applyInjectedScannerFault(dictionaries) {
  if (process.env.I18N_CONTRACT_FAULT === "admin-missing-exact") {
    delete dictionaries.es.exact[requiredAdminExactKeys[0]];
  }

  if (process.env.I18N_CONTRACT_FAULT === "admin-placeholder-mismatch") {
    dictionaries.es.exact["Injected placeholder {0}"] = "Placeholder inyectado";
  }

  if (process.env.I18N_CONTRACT_FAULT === "admin-untranslated-exact") {
    dictionaries.es.exact[requiredAdminExactKeys[0]] = requiredAdminExactKeys[0];
  }
}

function applyInjectedPosFault(posEntries) {
  if (process.env.I18N_CONTRACT_FAULT === "pos-missing-key") {
    posEntries.delete("reports.fileSaved");
  }

  if (process.env.I18N_CONTRACT_FAULT === "pos-placeholder-mismatch") {
    const entry = posEntries.get("reports.fileSaved");
    if (entry) {
      entry.es = "Archivo guardado";
    }
  }
}

function main() {
  const errors = [];
  const dictionaries = loadDictionaries();
  applyInjectedScannerFault(dictionaries);
  const enFlattened = flatten(dictionaries.en);

  for (const locale of adminLocales) {
    const flattened = flatten(dictionaries[locale]);
    for (const [key, englishValue] of Object.entries(enFlattened)) {
      if (!(key in flattened)) {
        errors.push(`admin:${locale}: missing structured key ${key}`);
        continue;
      }

      if (!samePlaceholders(englishValue, flattened[key])) {
        errors.push(`admin:${locale}: placeholder mismatch in ${key}`);
      }
    }
  }

  for (const locale of ["es", "it", "zh-CN"]) {
    for (const key of requiredAdminExactKeys) {
      if (!dictionaries[locale].exact[key]) {
        errors.push(`admin:${locale}: missing exact key ${key}`);
      } else if (dictionaries[locale].exact[key] === key) {
        errors.push(`admin:${locale}: untranslated exact key ${key}`);
      }
    }

    for (const [source, translated] of Object.entries(dictionaries[locale].exact)) {
      if (!samePlaceholders(source, translated)) {
        errors.push(`admin:${locale}: exact placeholder mismatch in ${source}`);
      }
    }
  }

  const posSources = collectFiles(posLocalizationDirectory, (filePath) =>
    filePath.endsWith(".cs"),
  ).map((filePath) => [filePath, maskCSharpComments(readFileSync(filePath, "utf8"))]);
  const posEntries = parsePosEntries(posSources, errors);
  applyInjectedPosFault(posEntries);
  validatePosDynamicDomains(errors);
  validatePosDynamicBindings(errors);

  for (const dynamicKeyUsage of allowedPosDynamicKeyUsages.values()) {
    for (const requiredKey of dynamicKeyUsage.requiredKeys) {
      if (!posEntries.has(requiredKey)) {
        errors.push(`pos: missing dynamic translation key ${requiredKey}`);
      }
    }
  }

  if (posEntries.size < 80) {
    errors.push(`pos: expected translation catalog, found ${posEntries.size} entries`);
  }

  for (const [key, values] of posEntries) {
    for (const locale of adminLocales) {
      if (!values[locale]) {
        errors.push(`pos:${locale}: missing value for ${key}`);
      }

      if (!samePlaceholders(values.en, values[locale])) {
        errors.push(`pos:${locale}: placeholder mismatch in ${key}`);
      }
    }
  }

  for (const key of collectPosLocKeys()) {
    if (!posEntries.has(key)) {
      errors.push(`pos:xaml: missing loc key ${key}`);
    }
  }

  for (const key of collectPosCodeKeys()) {
    if (!posEntries.has(key)) {
      errors.push(`pos:code: missing loc key ${key}`);
    }
  }

  for (const finding of scanForbiddenPosFragments()) {
    errors.push(`pos:hardcoded: ${finding}`);
  }

  const posXamlScan = scanPosXamlHardcodedText();
  const posCsharpScan = scanPosCsharpHardcodedText();
  const posReachableZhCnKeyInventory = collectPosReachableZhCnKeyInventory(posEntries);
  const POS_CORE_UI_HARDCODED = [
    ...posXamlScan.findings.filter((entry) => entry.core),
    ...posCsharpScan.findings.filter((entry) => entry.scope === "core"),
  ].filter((entry) => !isAllowedExternalPosHardcodedText(entry));
  const POS_REACHABLE_LEGACY_UI_HARDCODED = [
    ...posXamlScan.findings.filter((entry) => entry.reachableLegacy),
    ...posCsharpScan.findings.filter((entry) => entry.scope === "reachableLegacy"),
  ].filter((entry) => !isAllowedExternalPosHardcodedText(entry));
  const POS_ALLOWED_TECHNICAL_LITERALS = [
    ...posXamlScan.allowedTechnical,
    ...posCsharpScan.allowedTechnical,
  ];

  if (process.env.I18N_CONTRACT_FAULT === "pos-reachable-hardcoded") {
    POS_REACHABLE_LEGACY_UI_HARDCODED.push({
      context: "fault-injection",
      line: 1,
      path: "src/Win7POS.Wpf/Products/ProductsView.xaml",
      value: "Injected hardcoded POS text",
    });
  }

  if (process.env.I18N_CONTRACT_FAULT === "pos-core-edit-hardcoded") {
    POS_CORE_UI_HARDCODED.push({
      attribute: "Content",
      context: "fault-injection",
      line: 1,
      path: "src/Win7POS.Wpf/Pos/PosView.xaml",
      value: "Edit",
    });
  }

  if (process.env.I18N_CONTRACT_FAULT === "pos-reachable-ok-hardcoded") {
    POS_REACHABLE_LEGACY_UI_HARDCODED.push({
      attribute: "Content",
      context: "fault-injection",
      line: 1,
      path: "src/Win7POS.Wpf/Pos/Dialogs/RoleEditDialog.xaml",
      value: "OK",
    });
  }

  for (const finding of POS_CORE_UI_HARDCODED) {
    errors.push(
      `pos:core: hardcoded UI text ${finding.path}:${finding.line} ${finding.attribute ?? finding.context}="${finding.value}"`,
    );
  }

  for (const finding of POS_REACHABLE_LEGACY_UI_HARDCODED) {
    errors.push(
      `pos:reachable-legacy: hardcoded UI text ${finding.path}:${finding.line} ${finding.attribute ?? finding.context}="${finding.value}"`,
    );
  }

  if (errors.length > 0) {
    console.error(JSON.stringify({ errors, status: "fail" }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        adminLocales,
        adminExactKeys: collectAdminExactKeyCount(dictionaries),
        adminExactMigrationTargets,
        exactAllowedLegacyKeys,
        exactMigrationCandidates: adminExactMigrationTargets,
        adminStructuredKeys: Object.keys(enFlattened).length,
        posEntries: posEntries.size,
        POS_ALLOWED_TECHNICAL_LITERALS: {
          count: POS_ALLOWED_TECHNICAL_LITERALS.length,
          items: POS_ALLOWED_TECHNICAL_LITERALS.slice(0, 80),
        },
        POS_CORE_UI_HARDCODED: {
          count: POS_CORE_UI_HARDCODED.length,
          items: POS_CORE_UI_HARDCODED,
        },
        POS_REACHABLE_LEGACY_UI_HARDCODED: {
          count: POS_REACHABLE_LEGACY_UI_HARDCODED.length,
          items: POS_REACHABLE_LEGACY_UI_HARDCODED,
        },
        POS_EXCLUDED_UNREACHABLE_LEGACY: posExcludedUnreachableLegacyFiles,
        posHardcodedXamlCandidates: {
          byPath: Object.fromEntries(
            Array.from(
              posXamlScan.findings.reduce((counts, finding) => {
                counts.set(finding.path, (counts.get(finding.path) ?? 0) + 1);
                return counts;
              }, new Map()),
            ).sort(([left], [right]) => left.localeCompare(right)),
          ),
          coreCount: posXamlScan.findings.filter((entry) => entry.core).length,
          legacyCount: posXamlScan.findings.filter((entry) => !entry.core).length,
          sample: posXamlScan.findings.slice(0, 40),
        },
        posLocalizationFiles: posSources.length,
        posReachableZhCnKeyInventory,
        posScreenCoverage: collectPosScreenCoverage(),
        posUsedCodeKeys: collectPosCodeKeys().size,
        posUsedXamlKeys: collectPosLocKeys().size,
        status: "pass",
      },
      null,
      2,
    ),
  );
}

main();
