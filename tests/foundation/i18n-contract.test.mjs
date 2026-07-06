import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative } from "node:path";
import { test } from "node:test";
import vm from "node:vm";

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
  assert.equal(result.posHardcodedXamlCandidates.coreCount, 0);
  assert.equal(result.posHardcodedXamlCandidates.legacyCount, 0);
  assert.ok(result.posLocalizationFiles >= 2);
  assert.ok(result.posUsedCodeKeys > 0);
  assert.ok(result.posUsedXamlKeys > 0);
  assert.ok(result.posScreenCoverage.length > 0);
  assert.ok(result.posReachableZhCnKeyInventory.count > 0);
  assert.ok(Array.isArray(result.posReachableZhCnKeyInventory.items));

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
