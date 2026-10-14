import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, extname, join, relative } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { csharpSourceViews, maskCSharpComments } from "../../scripts/lib/csharp-source.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const posRoot = process.env.WIN7POS_REPO_PATH?.trim() || join(root, "..", "Win7POS");
const requireWin7PosRepo = process.env.REQUIRE_WIN7POS_REPO === "1";
const tsModuleCache = new Map();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readPosFile(relativePath) {
  return readFileSync(join(posRoot, relativePath), "utf8");
}

function shouldSkipMissingWin7PosRepo() {
  return !existsSync(posRoot) && !requireWin7PosRepo;
}

function loadTsModule(relativePath) {
  const filePath = join(root, relativePath);
  if (tsModuleCache.has(filePath)) {
    return tsModuleCache.get(filePath);
  }

  const source = readFileSync(filePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) {
      return require(specifier);
    }

    const resolvedPath = extname(specifier)
      ? join(dirname(filePath), specifier)
      : `${join(dirname(filePath), specifier)}.ts`;

    return loadTsModule(relative(root, resolvedPath));
  };
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require: localRequire,
  };

  vm.runInNewContext(js, sandbox, { filename: filePath });

  const loaded = Object.keys(sandbox.module.exports).length > 0
    ? sandbox.module.exports
    : sandbox.exports;

  tsModuleCache.set(filePath, loaded);

  return loaded;
}

function parsePosTranslationEntries() {
  const sources = [
    "src/Win7POS.Wpf/Localization/PosLocalization.cs",
    "src/Win7POS.Wpf/Localization/PosTranslations.Secondary.cs",
    "src/Win7POS.Wpf/Localization/PosTranslations.LegacyReachable.cs",
  ].map(readPosFile);
  const entries = new Map();
  const pattern =
    /new TranslationEntry\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g;

  for (const source of sources) {
    for (const match of source.matchAll(pattern)) {
      entries.set(JSON.parse(`"${match[1]}"`), {
        en: JSON.parse(`"${match[2]}"`),
        es: JSON.parse(`"${match[3]}"`),
        it: JSON.parse(`"${match[4]}"`),
        "zh-CN": JSON.parse(`"${match[5]}"`),
      });
    }
  }

  return entries;
}

test("C# comment masking preserves literal markers, escapes and source positions", () => {
  for (const literal of [
    String.raw`"https://synthetic.invalid/a//b/*text*/"`,
    String.raw`"escaped \"//text\" and /*text*/"`,
    String.raw`@"C:\synthetic//path/*text*/"`,
    String.raw`@"quoted ""//text"" and /*text*/"`,
    String.raw`$"https://synthetic.invalid/{name}/*text*/"`,
    String.raw`$@"C:\{name}//text/*text*/"`,
    String.raw`@$"C:\{name}//text/*text*/"`,
    String.raw`$"{Pick("https://synthetic.invalid/*text*/")} //text"`,
    String.raw`$"{value://literal} /*text*/"`,
    String.raw`"""https://synthetic.invalid//text/*text*/"""`,
    String.raw`'\''`,
    String.raw`'/'`,
  ]) {
    const prefix = `var value = ${literal}; `;
    const source = `${prefix}// removed\r\n/* removed\nblock */ next();`;
    const expected = `${prefix}${" ".repeat("// removed".length)}\r\n${" ".repeat("/* removed".length)}\n${" ".repeat("block */".length)} next();`;
    assert.equal(maskCSharpComments(source), expected);
    assert.equal(maskCSharpComments(source).length, source.length);
    assert.equal(csharpSourceViews(source).code.includes("synthetic"), false);
  }
  assert.equal(maskCSharpComments('var value = $"{name /* active */} //literal";'), 'var value = $"{name             } //literal";');
  assert.ok(csharpSourceViews('$"{PosLocalization.T("prefix" + code)}"').code.includes("PosLocalization.T"));
  assert.equal(csharpSourceViews('"""PosLocalization.T("prefix" + code)"""').code.includes("PosLocalization.T"), false);
  assert.throws(() => csharpSourceViews('$"""{PosLocalization.T("prefix" + code)}"""'), /Unsupported C# raw interpolated string/);
});

test("i18n contract validates Admin Web and Win7POS locales", (t) => {
  if (shouldSkipMissingWin7PosRepo()) {
    t.skip("SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE: Win7POS repo is not available");
    return;
  }

  const output = execFileSync(
    process.execPath,
    ["scripts/i18n-contract-scan.mjs"],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  const result = JSON.parse(output);

  assert.equal(result.status, "pass");
  assert.deepEqual(result.adminLocales, ["en", "es", "it", "zh-CN"]);
  assert.ok(result.adminStructuredKeys > 0);
  assert.ok(result.adminExactKeys > 0);
  assert.ok(result.adminExactMigrationTargets.length > 0);
  assert.ok(result.exactMigrationCandidates.length > 0);
  assert.ok(result.exactAllowedLegacyKeys.length > 0);
  assert.ok(result.posEntries >= 80);
  assert.equal(result.POS_CORE_UI_HARDCODED.count, 0);
  assert.equal(result.POS_REACHABLE_LEGACY_UI_HARDCODED.count, 0);
  assert.ok(result.POS_ALLOWED_TECHNICAL_LITERALS.count > 0);
  assert.ok(
    result.POS_ALLOWED_TECHNICAL_LITERALS.items.every((item) => item.reason),
  );
  assert.ok(
    result.POS_EXCLUDED_UNREACHABLE_LEGACY.some((item) =>
      item.path.endsWith("ProductDbImportViewModel.cs"),
    ),
  );
  assert.equal(result.POS_CORE_UI_HARDCODED.count, 0);
  assert.equal(result.POS_REACHABLE_LEGACY_UI_HARDCODED.count, 0);
  assert.ok(result.posLocalizationFiles >= 2);
  assert.ok(result.posUsedCodeKeys > 0);
  assert.ok(result.posUsedXamlKeys > 0);
  assert.ok(result.posScreenCoverage.length > 0);
  assert.ok(result.posReachableZhCnKeyInventory.count > 0);
  assert.ok(Array.isArray(result.posReachableZhCnKeyInventory.items));

  const scanner = readProjectFile("scripts/i18n-contract-scan.mjs");
  assert.match(scanner, /"sync\.center\.revision\."/);
  for (const key of [
    "sync.center.revision.match",
    "sync.center.revision.mismatch",
    "sync.center.revision.unknown",
  ]) {
    assert.ok(scanner.includes(`"${key}"`), `scanner must require ${key}`);
  }

  for (const key of [
    "settings.language",
    "pos.cart.scannerTitle",
    "printer.title",
    "reports.exportFileFilter",
  ]) {
    const item = result.posReachableZhCnKeyInventory.items.find(
      (entry) => entry.key === key,
    );

    assert.ok(item, `reachable zh-CN inventory should include ${key}`);
    assert.ok(item.zhCN, `${key} should expose zh-CN text`);
    assert.match(item.zhCN, /[\u4e00-\u9fff]/, `${key} should contain zh-CN text`);
  }
});

test("i18n contract scanner fails on missing keys and placeholder mismatches", (t) => {
  if (shouldSkipMissingWin7PosRepo()) {
    t.skip("SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE: Win7POS repo is not available");
    return;
  }

  for (const [fault, expected] of [
    ["admin-missing-exact", /missing exact key/],
    ["admin-placeholder-mismatch", /exact placeholder mismatch/],
    ["admin-untranslated-exact", /untranslated exact key/],
    ["pos-missing-key", /missing loc key reports\.fileSaved/],
    ["pos-placeholder-mismatch", /pos:es: placeholder mismatch in reports\.fileSaved/],
    ["pos-core-edit-hardcoded", /pos:core: hardcoded UI text.*Edit/],
    ["pos-reachable-hardcoded", /pos:reachable-legacy: hardcoded UI text/],
    ["pos-reachable-ok-hardcoded", /pos:reachable-legacy: hardcoded UI text.*OK/],
  ]) {
    assert.throws(
      () =>
        execFileSync(process.execPath, ["scripts/i18n-contract-scan.mjs"], {
          cwd: root,
          encoding: "utf8",
          env: { ...process.env, I18N_CONTRACT_FAULT: fault },
          stdio: "pipe",
        }),
      (error) => {
        const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;

        assert.match(output, expected);
        return true;
      },
    );
  }
});

test("i18n scanner validates runtime registration forms and bounded dynamic families", async (t) => {
  if (shouldSkipMissingWin7PosRepo()) {
    t.skip("SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE: Win7POS repo is not available");
    return;
  }
  const fixture = mkdtempSync(join(tmpdir(), "admin-pos-i18n-"));
  const wpf = "src/Win7POS.Wpf/";
  const recovery = `${wpf}Localization/PosLocalization.ImportRecovery.cs`;
  const direct = `${wpf}Localization/PosLocalization.SupplierImportCompletion.cs`;
  const presentation = `${wpf}Pos/Dialogs/ImportRecoveryPresentation.cs`;
  const hardware = `${wpf}Localization/PosLocalization.Hardware.cs`;
  const run = () => execFileSync(process.execPath, ["scripts/i18n-contract-scan.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, WIN7POS_REPO_PATH: fixture, REQUIRE_WIN7POS_REPO: "1" },
    stdio: "pipe",
  });
  try {
    cpSync(join(posRoot, wpf), join(fixture, wpf), {
      recursive: true,
      filter: (path) => !/(?:^|[\\/])(?:bin|obj)(?:[\\/]|$)/.test(path) &&
        (statSync(path).isDirectory() || /\.(?:cs|xaml)$/.test(path)),
    });
    for (const path of [
      "src/Win7POS.Core/Pos/CustomerDisplaySettings.cs",
      "src/Win7POS.Core/Hardware/SingleFlightDiagnostic.cs",
      "src/Win7POS.Data/Operations/SettingsOperationsService.cs",
    ]) {
      cpSync(join(posRoot, path), join(fixture, path), { recursive: true });
    }
    const result = JSON.parse(run());
    assert.equal(result.status, "pass");
    assert.equal(result.POS_CORE_UI_HARDCODED.count, 0);
    const directFile = join(fixture, direct);
    const originalDirect = readFileSync(directFile, "utf8");
    try {
      writeFileSync(directFile, originalDirect.replace('"Cancelando la operación de importación..."', '"https://synthetic.invalid/a//b/*literal*/"'));
      assert.equal(JSON.parse(run()).status, "pass", "comment markers in an actual translation value remain literal text");
    } finally { writeFileSync(directFile, originalDirect); }
    const diagnosticFile = join(fixture, `${wpf}Pos/Dialogs/PrinterSettingsViewModel.cs`);
    const originalDiagnostic = readFileSync(diagnosticFile, "utf8");
    try {
      writeFileSync(diagnosticFile, `${originalDiagnostic}\nclass LiteralDecoy { string Text() => """PosLocalization.T("hardware.diagnostic." + (result.Completed ? "unavailable" : result.ResultCode))"""; }`);
      assert.equal(JSON.parse(run()).status, "pass", "a noninterpolated raw literal is not an executable sink");
    } finally { writeFileSync(diagnosticFile, originalDiagnostic); }
    for (const [path, edit, expected] of [
      [recovery, (source) => source.replace(/^.*RecoveryText\(catalog, "title",.*\n/m, ""), /missing loc key importRecovery\.title/],
      [recovery, (source) => source.replace('catalog["es"]["importRecovery." + key] = es;', ""), /unsupported RecoveryText registration for es/],
      [direct, (source) => source.replace(/^.*\["supplierExcelImport.statusOperationCancelling"\].*\n/gm, ""), /missing loc key supplierExcelImport\.statusOperationCancelling/],
      [direct, (source) => source.replace(/^.*catalog\["es"\]\["supplierExcelImport.statusOperationCancelling"\].*\n/m, ""), /pos:es: missing value for supplierExcelImport\.statusOperationCancelling/],
      [direct, (source) => source.replace('"Cancelando la operación de importación..."', '"Cancelando la operación {99}..."'), /pos:es: placeholder mismatch in supplierExcelImport\.statusOperationCancelling/],
      [recovery, (source) => source.replace('"Admin confirmó {0}/{1} filas · {2}/{3} partes."', '"Admin confirmó filas."'), /pos:es: placeholder mismatch in importRecovery\.planProgress/],
      [direct, (source) => source.replace(/(.*catalog\["en"\]\["supplierExcelImport.statusOperationCancelling"\].*\n)/, "$1$1"), /duplicate translation key supplierExcelImport\.statusOperationCancelling for en/],
      [hardware, (source) => source.replace(/^.*new TranslationEntry\("hardware.diagnostic.busy",.*\n/m, ""), /missing dynamic translation key hardware\.diagnostic\.busy/],
      ["src/Win7POS.Core/Pos/CustomerDisplaySettings.cs", (source) => source.replace("CustomerDisplayLogoPosition { Left, Center }", "CustomerDisplayLogoPosition { Left, Center, Right }"), /dynamic translation domain changed/],
      [presentation, (source) => source.replace('"importRecovery." + FieldKey(issue.Field)', '"importRecovery." + unboundedSuffix'), /missing loc key importRecovery\./],
      [`${wpf}UnexpectedDynamicUsage.cs`, () => 'class UnexpectedDynamicUsage { string Lookup() => PosLocalization.T("hardware.diagnostic." + code); }', /missing loc key hardware\.diagnostic\./],
      [`${wpf}Pos/Dialogs/CustomerDisplaySettingsDialog.xaml.cs`, (source) => source.replace("PNG / JPEG / BMP|*.png;*.jpg;*.jpeg;*.bmp", "Choose a picture|*.png"), /hardcoded UI text.*Choose a picture/],
      [`${wpf}Pos/PosWorkflowService.cs`, (source) => source.replace('InvalidOperationException("Backup result="', 'InvalidOperationException("Backup did not finish="'), /hardcoded UI text.*Backup did not finish=/],
      [`${wpf}Localization/PosLocalization.cs`, (source) => source.replace("AddImportRecoveryTranslations(catalog);", ""), /unregistered locale provider/],
      [`${wpf}Localization/PosLocalization.cs`, (source) => source.replace("AddImportRecoveryTranslations(catalog);", "// AddImportRecoveryTranslations(catalog);"), /unregistered locale provider/],
      [`${wpf}Localization/PosLocalization.cs`, (source) => source.replace("AddImportRecoveryTranslations(catalog);", "/* AddImportRecoveryTranslations(catalog); */"), /unregistered locale provider/],
      [`${wpf}Localization/PosLocalization.cs`, (source) => source.replace("AddImportRecoveryTranslations(catalog);", 'var note = "AddImportRecoveryTranslations(catalog);";'), /unregistered locale provider/],
      [recovery, (source) => source.replace('catalog["es"]["importRecovery." + key] = es;', '// catalog["es"]["importRecovery." + key] = es;'), /unsupported RecoveryText registration for es/],
      [recovery, (source) => source.replace('catalog["es"]["importRecovery." + key] = es;', '/* catalog["es"]["importRecovery." + key] = es; */'), /unsupported RecoveryText registration for es/],
      [recovery, (source) => source.replace(/^(.*RecoveryText\(catalog, "title",.*)$/m, "// $1"), /missing loc key importRecovery\.title/],
      [recovery, (source) => source.replace(/^(.*RecoveryText\(catalog, "title",.*)$/m, "/* $1 */"), /missing loc key importRecovery\.title/],
      [direct, (source) => source.replace(/^(.*catalog\["es"\]\["supplierExcelImport.statusOperationCancelling"\].*)$/m, "// $1"), /pos:es: missing value for supplierExcelImport\.statusOperationCancelling/],
      [direct, (source) => source.replace(/^(.*catalog\["es"\]\["supplierExcelImport.statusOperationCancelling"\].*)$/m, "/* $1 */"), /pos:es: missing value for supplierExcelImport\.statusOperationCancelling/],
      [direct, (source) => source.replace(/^(.*catalog\["es"\]\["supplierExcelImport.statusOperationCancelling"\].*)$/m, 'var note = """$1""";'), /pos:es: missing value for supplierExcelImport\.statusOperationCancelling/],
      [presentation, (source) => source.replace('return PosLocalization.T("importRecovery." + key);', 'key = code; return PosLocalization.T("importRecovery." + key);'), /unsupported dynamic translation binding FriendlyCause/],
      [presentation, (source) => source.replace('? "network" :', '? "network" + code :'), /unsupported dynamic translation binding FriendlyCause/],
      [`${wpf}Pos/Dialogs/CatalogImportRecoveryDialog.xaml.cs`, (source) => source.replace('return PosLocalization.T("importRecovery." + field)', 'field = message; return PosLocalization.T("importRecovery." + field)'), /unsupported dynamic translation binding PreviewFieldError/],
      [presentation, (source) => source.replace('var barcode = new string', 'field = code; var barcode = new string'), /unsupported dynamic translation binding DescribePlanRowError.field/],
      [`${wpf}Pos/Dialogs/CustomerDisplaySettingsViewModel.cs`, (source) => source.replace('Choices(Type type, string group) => Enum.GetValues(type)', 'Choices(Type type, string group) => Enum.GetValues(typeof(CustomerDisplayFontScale))'), /unsupported dynamic translation binding Choices/],
      [`${wpf}Pos/Dialogs/DbMaintenanceViewModel.cs`, (source) => source.replace('LastBackupResult = PosLocalization.T("backupAutomation.result." + key)', 'key = parts[1]; LastBackupResult = PosLocalization.T("backupAutomation.result." + key)'), /unsupported dynamic translation binding backup result whitelist to sink/],
      [`${wpf}Pos/Dialogs/DbMaintenanceViewModel.cs`, (source) => source.replace('foreach (var code in BackupResultCodes)', 'foreach (var code in new[] { ex.Message })'), /unsupported dynamic translation binding backup result whitelist to sink/],
      [`${wpf}Pos/Dialogs/DbMaintenanceViewModel.cs`, (source) => source.replace('preview.SafetyAdjustments.Select(x => PosLocalization.T("settingsProfile.safety." + x))', 'preview.SafetyAdjustments.Select(x => { x = DateTime.Now.ToString(); return PosLocalization.T("settingsProfile.safety." + x); })'), /unsupported dynamic translation binding SafetyAdjustments producer to sink/],
      ["src/Win7POS.Core/Hardware/SingleFlightDiagnostic.cs", (source) => source.replace('ResultCode = "busy"', 'ResultCode = "busy" + key'), /unsupported dynamic translation binding diagnostic result to sink/],
      [`${wpf}Pos/Dialogs/DbMaintenanceViewModel.cs`, (source) => source.replace('"live_database_missing", "busy" };', '"live_database_missing", "busy", Environment.UserName };'), /dynamic translation domain changed/],
      [`${wpf}Pos/Dialogs/DbMaintenanceViewModel.cs`, (source) => `${source}\nclass UnknownSink { string Lookup(string code) => PosLocalization.T("backupAutomation.result." + code); }`, /unsupported dynamic translation binding backupAutomation\.result\. recognized sink count/],
      ["src/Win7POS.Data/Operations/SettingsOperationsService.cs", (source) => source.replace('adjustments.Add("hardware_activation_local");', '// adjustments.Add("hardware_activation_local");'), /dynamic translation domain changed/],
      ["src/Win7POS.Data/Operations/SettingsOperationsService.cs", (source) => source.replace('adjustments.Add("hardware_activation_local");', '/* adjustments.Add("hardware_activation_local"); */'), /dynamic translation domain changed/],
      ["src/Win7POS.Core/Hardware/SingleFlightDiagnostic.cs", (source) => source.replace('public bool Completed => ResultCode == "completed";', 'public bool Completed => ResultCode == "complete";'), /unsupported dynamic translation binding diagnostic result to sink/],
      ["src/Win7POS.Data/Operations/SettingsOperationsService.cs", (source) => source.replace('public IReadOnlyList<string> SafetyAdjustments { get; }', 'private IReadOnlyList<string> _safe; public IReadOnlyList<string> SafetyAdjustments { get { return _safe.Select(code => code.ToUpperInvariant()).ToArray(); } private set { _safe = value; } }'), /unsupported dynamic translation binding SafetyAdjustments producer to sink/],
      [`${wpf}Pos/Dialogs/DbMaintenanceViewModel.cs`, (source) => source.replace(': "backup_failed";', ': "backup_ failed";'), /unsupported dynamic translation binding backup result whitelist to sink/],
      ...[
        '$"{PosLocalization.T("hardware.diagnostic." + (result.Completed ? "unavailable" : result.ResultCode))}"',
        '$@"{PosLocalization.T("hardware.diagnostic." + (result.Completed ? "unavailable" : result.ResultCode))}"',
        '@$"{PosLocalization.T("hardware.diagnostic." + (result.Completed ? "unavailable" : result.ResultCode))}"',
        '$"{string.Concat($"{PosLocalization.T("hardware.diagnostic." + (result.Completed ? "unavailable" : result.ResultCode))}")}"',
      ].map((expression) => [`${wpf}Pos/Dialogs/PrinterSettingsViewModel.cs`, (source) => `${source}\nclass UnboundedCarrier { string UnboundedDiagnostic(string unbounded) { var result = new { Completed = false, ResultCode = unbounded }; return ${expression}; } }`, /unsupported dynamic translation binding hardware\.diagnostic\. recognized sink count/]),
      [`${wpf}Pos/Dialogs/PrinterSettingsViewModel.cs`, (source) => `${source}\nclass UnboundedRawCarrier { string UnboundedDiagnostic(string unbounded) { var result = new { Completed = false, ResultCode = unbounded }; return $"""{PosLocalization.T("hardware.diagnostic." + (result.Completed ? "unavailable" : result.ResultCode))}"""; } }`, /Unsupported C# raw interpolated string/],
    ]) {
      await t.test(`${path}: ${expected.source}`, () => {
        const file = join(fixture, path);
        const original = existsSync(file) ? readFileSync(file, "utf8") : null;
        const changed = edit(original ?? "");
        assert.notEqual(changed, original, "mutation must change actual fixture source");
        try {
          writeFileSync(file, changed);
          assert.throws(run, (error) => {
            assert.match(`${error.stdout ?? ""}\n${error.stderr ?? ""}`, expected);
            return true;
          });
        } finally {
          if (original === null) rmSync(file);
          else writeFileSync(file, original);
        }
      });
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("Admin locale helpers execute aliases, q-weighted Accept-Language and fallback", () => {
  const locales = loadTsModule("src/i18n/locales.ts");
  const dictionaries = loadTsModule("src/i18n/dictionaries.ts");
  const format = loadTsModule("src/i18n/format.ts");
  const serverLocale = readProjectFile("src/i18n/get-locale.ts");

  assert.equal(locales.normalizeLocaleAlias("english"), "en");
  assert.equal(locales.normalizeLocaleAlias("español"), "es");
  assert.equal(locales.normalizeLocaleAlias("zh-Hans"), "zh-CN");
  assert.equal(locales.normalizeLocale("unsupported"), "en");
  assert.equal(
    locales.resolvePreferredLocaleFromAcceptLanguage(
      "it;q=0.2, zh-Hans;q=0.9, es;q=0.7",
    ),
    "zh-CN",
  );
  assert.equal(
    locales.resolvePreferredLocaleFromAcceptLanguage("fr-CA, es-CL;q=0.8"),
    "es",
  );
  assert.equal(
    locales.resolvePreferredLocaleFromAcceptLanguage("it;q=0, fr;q=0.9"),
    "en",
  );

  assert.equal(dictionaries.getDictionary("unsupported"), dictionaries.dictionaries.en);
  assert.equal(
    dictionaries.dictionaries["zh-CN"].authLogin.admin.heading,
    "店铺管理台登录",
  );
  assert.notEqual(
    dictionaries.dictionaries["zh-CN"].authLogin.admin.heading,
    dictionaries.dictionaries.en.authLogin.admin.heading,
  );
  assert.match(serverLocale, /await headers\(\)/);
  assert.match(serverLocale, /accept-language/);
  assert.match(serverLocale, /cookieLocale/);

  const zhDate = format.formatDateTime("zh-CN", "2026-06-29T12:34:00.000Z");
  assert.match(zhDate, /年\d{1,2}月\d{1,2}日/);
  assert.doesNotMatch(zhDate, /\d{4}\/\d{1,2}\/\d{1,2}/);
  assert.doesNotMatch(zhDate, /\b(?:AM|PM)\b/i);
  assert.doesNotMatch(readProjectFile("src/app/shop/pos/PosRevenueDashboard.tsx"), /dateStyle:\s*"short"/);
  assert.doesNotMatch(readProjectFile("src/app/shop/sync/PosSyncRecoveryPanel.tsx"), /dateStyle:\s*"short"/);
});

test("Admin route locale smoke covers cookie precedence, html lang and core route labels", () => {
  const locales = loadTsModule("src/i18n/locales.ts");
  const { dictionaries } = loadTsModule("src/i18n/dictionaries.ts");
  const getLocaleSource = readProjectFile("src/i18n/get-locale.ts");
  const rootLayout = readProjectFile("src/app/layout.tsx");

  assert.equal(locales.LOCALE_COOKIE_NAME, "mc_admin_locale");
  assert.match(rootLayout, /lang=\{locale\}/);
  assert.ok(
    getLocaleSource.indexOf("if (cookieLocale)") <
      getLocaleSource.indexOf("accept-language"),
    "cookie locale must be checked before Accept-Language fallback",
  );
  assert.equal(
    locales.resolvePreferredLocaleFromAcceptLanguage(
      "en;q=0.7, es-CL;q=0.9, zh-Hans;q=0.8",
    ),
    "es",
  );

  const structuredPaths = [
    ["authLogin.admin.heading", (dict) => dict.authLogin.admin.heading],
    ["authLogin.shopCodeTab", (dict) => dict.authLogin.shopCodeTab],
    ["authForm.googleSubmit", (dict) => dict.authForm.googleSubmit],
    ["shopCodeLogin.submit", (dict) => dict.shopCodeLogin.submit],
    ["accountProfile.title", (dict) => dict.accountProfile.title],
    ["accountProfile.passwordReset.submit", (dict) => dict.accountProfile.passwordReset.submit],
  ];

  for (const [path, selector] of structuredPaths) {
    const english = selector(dictionaries.en);

    for (const locale of ["it", "es", "zh-CN"]) {
      const translated = selector(dictionaries[locale]);

      assert.ok(translated, `${locale} ${path} should be populated`);
      assert.notEqual(translated, english, `${locale} ${path} should not fall back to English`);
    }
  }

  const exactRouteKeys = [
    "POS Revenue",
    "POS revenue unavailable",
    "POS sales requiring review",
    "POS Sync Recovery",
    "Record recovery action",
    "Target recovery",
    "History Detail",
    "Search history",
    "Product Detail",
    "Product detail tabs",
    "Prices",
    "Product detail is not available.",
    "Product detail could not be loaded.",
  ];

  for (const key of exactRouteKeys) {
    for (const locale of ["it", "es", "zh-CN"]) {
      const translated = dictionaries[locale].exact[key];

      assert.ok(translated, `${locale} exact route key ${key} should exist`);
      assert.notEqual(translated, key, `${locale} exact route key ${key} should be translated`);
    }
  }

  const zhCoreValues = [
    dictionaries["zh-CN"].authLogin.admin.heading,
    dictionaries["zh-CN"].accountProfile.title,
    dictionaries["zh-CN"].exact["POS Revenue"],
    dictionaries["zh-CN"].exact["POS Sync Recovery"],
    dictionaries["zh-CN"].exact["History Detail"],
    dictionaries["zh-CN"].exact["Product Detail"],
    dictionaries["zh-CN"].exact["Prices"],
    dictionaries["zh-CN"].exact["Product detail is not available."],
    dictionaries["zh-CN"].exact["Product detail could not be loaded."],
  ];

  for (const value of zhCoreValues) {
    assert.match(value, /[\u4e00-\u9fff]/, `${value} should contain zh-CN copy`);
    assert.doesNotMatch(value, /\b(?:Revenue|Recovery|History|Product|Profile|Prices)\b/);
  }

  const productsPage = readProjectFile("src/app/shop/products/page.tsx");
  assert.doesNotMatch(productsPage, /return "Purchase"|return "Retail"|return "Stock"/);
  assert.match(productsPage, /purchase:\s*translateText\(dictionary,\s*"Purchase"\)/);
  assert.match(productsPage, /retail:\s*translateText\(dictionary,\s*"Retail"\)/);
  assert.match(productsPage, /stock:\s*translateText\(dictionary,\s*"Stock"\)/);

  const historyList = readProjectFile("src/app/shop/_components/HistoryEntriesClientList.tsx");
  assert.doesNotMatch(historyList, /Intl\.DateTimeFormat\("en-US"/);
  assert.match(historyList, /monthTitle\(key, labels, locale\)/);

  const historyPage = readProjectFile("src/app/shop/history/page.tsx");
  assert.match(historyPage, /locale=\{locale\}/);

  const posDashboard = readProjectFile("src/app/shop/pos/PosRevenueDashboard.tsx");
  assert.match(posDashboard, /formatBusinessDate\(locale, data\.filters\.today\)/);
  assert.match(posDashboard, /formatBusinessDate\(locale, day\.businessDate\)/);
  assert.match(posDashboard, /formatBusinessMonth\(locale, row\.month\)/);

  const productSearch = readProjectFile("src/app/shop/products/_components/ProductSearchCombobox.tsx");
  assert.doesNotMatch(productSearch, /Intl\.NumberFormat\("en-US"/);
  assert.match(productSearch, /Intl\.NumberFormat\(intlLocale\(locale\)\)/);

  const productDetail = readProjectFile("src/app/shop/_components/ProductDetailModalController.tsx");
  assert.doesNotMatch(productDetail, /toLocaleString\(\)/);
  assert.doesNotMatch(productDetail, /Intl\.NumberFormat\("en-US"/);
  assert.match(productDetail, /formatDate\(value, translate, locale\)/);
  assert.match(productDetail, /translate\("Product detail is not available\."\)/);

  const historyDetail = readProjectFile("src/app/shop/_components/HistoryDetailModalController.tsx");
  assert.doesNotMatch(historyDetail, /toLocaleString\(\)/);
  assert.doesNotMatch(historyDetail, /Intl\.NumberFormat\("en-US"/);
  assert.match(historyDetail, /formatDate\(value, translate, locale\)/);
});

test("Win7POS localization static harness covers fallback, persistence, receipts and refresh hooks", (t) => {
  if (shouldSkipMissingWin7PosRepo()) {
    t.skip("SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE: Win7POS repo is not available");
    return;
  }

  const posLocalization = readPosFile("src/Win7POS.Wpf/Localization/PosLocalization.cs");
  const appSettingKeys = readPosFile("src/Win7POS.Wpf/Infrastructure/AppSettingKeys.cs");
  const receiptLocalization = readPosFile("src/Win7POS.Wpf/Localization/PosReceiptLocalization.cs");
  const receiptFormatter = readPosFile("src/Win7POS.Core/Receipt/ReceiptFormatter.cs");
  const entries = parsePosTranslationEntries();

  assert.match(posLocalization, /public const string DefaultLanguage = "en"/);
  assert.match(posLocalization, /new HashSet<string>[\s\S]*"en"[\s\S]*"es"[\s\S]*"it"[\s\S]*"zh-CN"/);
  assert.match(posLocalization, /NormalizeLanguage\(languageCode\)/);
  assert.match(posLocalization, /return "\[missing:" \+ normalizedKey \+ "\]"/);
  assert.match(posLocalization, /new PropertyChangedEventArgs\(propertyName\)/);
  assert.match(posLocalization, /handler\(this, EventArgs\.Empty\)/);
  assert.match(posLocalization, /settings\.GetStringAsync\(AppSettingKeys\.UiLanguage\)/);
  assert.match(posLocalization, /settings\.SetStringAsync\(AppSettingKeys\.UiLanguage, normalized\)/);
  assert.match(appSettingKeys, /UiLanguage = "ui\.language"/);

  for (const key of [
    "receipt.title",
    "receipt.totalDiscounts",
    "reports.receiptTitle",
    "reports.fileSaved",
    "payment.sendingBoletaPrinter",
    "pos.status.paymentCompleted",
    "printer.receiptTextEmpty",
    "refund.splitMismatch",
    "refund.receiptHeader",
    "products.barcodeRequired",
    "products.invalidProductId",
    "import.missingAnalyzedRows",
    "onlineFirstLogin.invalidOptions",
    "onlineFirstLogin.serverNotConfigured",
    "override.invalidCredentials",
    "firstRun.operatorNameRequired",
  ]) {
    const entry = entries.get(key);

    assert.ok(entry, `POS key ${key} should exist`);
    for (const locale of ["en", "es", "it", "zh-CN"]) {
      assert.ok(entry[locale], `${locale} ${key} should be populated`);
    }
    assert.match(entry["zh-CN"], /[\u4e00-\u9fff]/, `${key} zh-CN should be translated`);
  }

  for (const key of [
    "common.card",
    "common.cash",
    "common.gross",
    "common.net",
    "common.receipts",
    "common.total",
    "receipt.change",
    "receipt.dateTime",
    "receipt.line",
  ]) {
    assert.match(receiptLocalization, new RegExp(`T\\("${key.replace(".", "\\.")}"\\)`));
  }

  assert.match(receiptLocalization, /CultureNameForLanguage\(Current\.CurrentLanguage\)/);
  assert.doesNotMatch(receiptFormatter, /Scontrino:/);
  assert.doesNotMatch(receiptFormatter, /Boleta:/);

  const receiptPrinter = readPosFile("src/Win7POS.Wpf/Printing/WindowsSpoolerReceiptPrinter.cs");
  const receiptOptions = readPosFile("src/Win7POS.Wpf/Printing/ReceiptPrintOptions.cs");
  const workflowService = readPosFile("src/Win7POS.Wpf/Pos/PosWorkflowService.cs");
  assert.match(receiptOptions, /SaleCodeForBarcode/);
  assert.match(receiptPrinter, /SaleCodeForBarcode/);
  assert.doesNotMatch(receiptPrinter, /Receipt:|Boleta:|Scontrino:|小票:/);
  assert.match(workflowService, /ExtractSaleCodeForBarcode/);
  assert.match(workflowService, /GetLastSaleCodeAsync/);

  for (const [file, requiredRefresh] of [
    ["src/Win7POS.Wpf/Pos/Dialogs/DailyReportViewModel.cs", /OnLanguageChanged/],
    ["src/Win7POS.Wpf/Pos/Dialogs/SalesRegisterViewModel.cs", /OnLanguageChanged/],
    ["src/Win7POS.Wpf/Pos/Dialogs/PaymentViewModel.cs", /SetFiscalStatusKey\(_fiscalStatusKey\)[\s\S]*NotifyDerived\(\)/],
  ]) {
    const source = readPosFile(file);

    assert.match(source, /PosLocalization\.Current\.LanguageChanged \+=/);
    assert.match(source, requiredRefresh);
  }
});
