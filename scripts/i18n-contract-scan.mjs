import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const adminLocales = ["en", "es", "it", "zh-CN"];
const posRoot = resolve(
  process.env.WIN7POS_REPO_PATH?.trim() || join(root, "..", "Win7POS"),
);
const normalizedPosRoot = posRoot.replace(/\\/g, "/");
const posLocalizationDirectory = join(posRoot, "src/Win7POS.Wpf/Localization");

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
  ["Operator login", "src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml"],
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
  "src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/PaymentViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/PrinterSettingsViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/RefundDialog.xaml.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/RefundViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/SalesRegisterViewModel.cs",
  "src/Win7POS.Wpf/Pos/Dialogs/ShopSettingsViewModel.cs",
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
    const source = readFileSync(filePath, "utf8");
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        for (const match of line.matchAll(pattern)) {
          usages.push({
            key: match[1],
            line: index + 1,
            path: relativePath,
            source: "code",
            scope: posUiScope(relativePath),
          });
        }
      }
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

        const reason = technicalLiteralReason(trimmed);
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
  ).map((filePath) => [filePath, readFileSync(filePath, "utf8")]);
  const posEntries = parsePosEntries(posSources, errors);
  applyInjectedPosFault(posEntries);

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
