import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const root = process.cwd();
const redirectOnlyPageFiles = new Set([
  "src/app/(staff-auth)/shop/staff-login/page.tsx",
  "src/app/page.tsx",
]);
const consoleAllowedSourceFiles = new Set(["src/server/admin-web-perf.ts"]);

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(escapeRegExp(required)), label);
}

function listSourceFiles(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      const stats = statSync(path);

      if (stats.isDirectory()) {
        return listSourceFiles(path);
      }

      return /\.(ts|tsx)$/.test(entry) ? [path] : [];
    })
    .sort();
}

function parseDictionariesSource() {
  return ts.createSourceFile(
    "dictionaries.ts",
    readProjectFile("src/i18n/dictionaries.ts"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function propertyNameText(name) {
  if (
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }

  if (ts.isIdentifier(name)) {
    return name.text;
  }

  return null;
}

function findObjectLiteral(sourceFile, variableName) {
  let objectLiteral = null;

  function visit(node) {
    if (objectLiteral) {
      return;
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === variableName && ts.isObjectLiteralExpression(node.initializer)) {
        objectLiteral = node.initializer;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  assert.ok(objectLiteral, `${variableName} object literal is present`);

  return objectLiteral;
}

function objectLiteralKeys(objectLiteral) {
  return objectLiteral.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return [];
    }

    const key = propertyNameText(property.name);

    assert.ok(key, "dictionary exact maps must use static property names");

    return [key];
  });
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  return Array.from(duplicates).sort();
}

function projectRelativePath(path) {
  return relative(root, path).split("\\").join("/");
}

function localizedMetadataTitleKeys(source) {
  return Array.from(
    source.matchAll(/createLocalizedPageMetadata\("([^"]+)"\)/g),
    (match) => match[1],
  );
}

test("TASK-068 global security headers cover common browser attack classes", () => {
  const config = readProjectFile("next.config.ts");
  const cloudflareSmoke = readProjectFile("scripts/testing/cloudflare-local-smoke.mjs");

  assertContains(config, "async headers()");
  assertContains(config, "poweredByHeader: false");
  assertContains(config, 'source: "/:path*"');

  for (const key of [
    "Content-Security-Policy",
    "Permissions-Policy",
    "Referrer-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
  ]) {
    assertContains(config, `key: "${key}"`);
  }

  assertContains(config, "frame-ancestors 'none'");
  assertContains(config, "object-src 'none'");
  assertContains(config, "base-uri 'self'");
  assertContains(config, "form-action 'self'");
  assertContains(config, "https://*.supabase.co");
  assertContains(config, "https://accounts.google.com");
  assertContains(config, "camera=(), microphone=(), geolocation=()");
  assertContains(config, "payment=(), usb=(), bluetooth=(), serial=()");
  assertContains(config, "strict-origin-when-cross-origin");
  assertContains(config, 'value: "nosniff"');
  assertContains(config, 'value: "DENY"');

  assert.doesNotMatch(
    config,
    /script-src|style-src/,
    "CSP must stay nonce-safe until script/style nonces are implemented.",
  );

  assertContains(cloudflareSmoke, "function assertSecurityHeaders");
  assertContains(cloudflareSmoke, "x-powered-by");
  for (const key of [
    "content-security-policy",
    "permissions-policy",
    "referrer-policy",
    "x-content-type-options",
    "x-frame-options",
  ]) {
    assertContains(cloudflareSmoke, key);
  }
});

test("TASK-068 source code keeps high-risk browser primitives out of app code", () => {
  const sources = listSourceFiles(join(root, "src")).filter(
    (path) => !consoleAllowedSourceFiles.has(relative(root, path)),
  );
  const combined = sources
    .map((path) => readFileSync(path, "utf8"))
    .join("\n/* file boundary */\n");

  assert.doesNotMatch(
    combined,
    /dangerouslySetInnerHTML|innerHTML|outerHTML|eval\(|new Function|document\.write/,
  );
  assert.doesNotMatch(combined, /localStorage|sessionStorage/);
  assert.doesNotMatch(combined, /console\.(log|debug|info|warn|error)/);
});

test("TASK-068 locale contract covers Italian, Spanish and simplified Chinese", () => {
  const locales = readProjectFile("src/i18n/locales.ts");
  const formatter = readProjectFile("src/i18n/format.ts");
  const switcher = readProjectFile("src/components/language-switcher.tsx");

  assertContains(locales, 'SUPPORTED_LOCALES = ["it", "en", "es", "zh-CN"]');
  assertContains(locales, '{ code: "it", label: "Italiano" }');
  assertContains(locales, '{ code: "es", label: "Español" }');
  assertContains(locales, '{ code: "zh-CN", label: "简体中文" }');
  assertContains(formatter, 'es: "es-CL"');
  assertContains(formatter, '"zh-CN": "zh-CN"');
  assertContains(formatter, '"zh-CN": "未设置"');
  assertContains(formatter, "formatToParts");
  assertContains(switcher, "document.cookie");
  assertContains(switcher, "SameSite=Lax");
});

test("TASK-068 dictionary exact maps do not duplicate or shadow corrective maps", () => {
  const sourceFile = parseDictionariesSource();

  for (const name of [
    "itExact",
    "esExact",
    "zhExact",
    "itRenderedCorrectiveExact",
    "esRenderedCorrectiveExact",
    "zhRenderedCorrectiveExact",
  ]) {
    const keys = objectLiteralKeys(findObjectLiteral(sourceFile, name));

    assert.deepEqual(duplicateValues(keys), [], `${name} has duplicate keys`);
  }

  for (const [baseName, correctiveName] of [
    ["itExact", "itRenderedCorrectiveExact"],
    ["esExact", "esRenderedCorrectiveExact"],
    ["zhExact", "zhRenderedCorrectiveExact"],
  ]) {
    const baseKeys = new Set(objectLiteralKeys(findObjectLiteral(sourceFile, baseName)));
    const correctiveKeys = objectLiteralKeys(
      findObjectLiteral(sourceFile, correctiveName),
    );
    const collisions = correctiveKeys
      .filter((key) => baseKeys.has(key))
      .sort();

    assert.deepEqual(
      collisions,
      [],
      `${correctiveName} must not override ${baseName} entries`,
    );
  }
});

test("TASK-068 dictionaries wire exact maps for every supported non-English locale", () => {
  const dictionaries = readProjectFile("src/i18n/dictionaries.ts");

  assertContains(dictionaries, "exact: { ...itExact, ...itRenderedCorrectiveExact }");
  assertContains(dictionaries, "exact: { ...esExact, ...esRenderedCorrectiveExact }");
  assertContains(dictionaries, "exact: { ...zhExact, ...zhRenderedCorrectiveExact }");
  assertContains(dictionaries, "it,");
  assertContains(dictionaries, "es,");
  assertContains(dictionaries, '"zh-CN": zhCN');
});

test("TASK-068 page metadata titles use localized dictionaries", () => {
  const pageFiles = listSourceFiles(join(root, "src/app"))
    .filter((path) => path.endsWith("page.tsx"))
    .map((path) => ({
      path,
      relativePath: projectRelativePath(path),
      source: readFileSync(path, "utf8"),
    }));
  const staticMetadataFiles = pageFiles
    .filter(({ source }) => source.includes("export const metadata"))
    .map(({ relativePath }) => relativePath);

  assert.deepEqual(staticMetadataFiles, []);

  for (const relativePath of redirectOnlyPageFiles) {
    const page = pageFiles.find((candidate) => candidate.relativePath === relativePath);

    assert.ok(page, `${relativePath} redirect-only page exists`);
    assertContains(page.source, "redirect(");
    assert.doesNotMatch(
      page.source,
      /createLocalizedPageMetadata/,
      `${relativePath} should not carry redundant page metadata`,
    );
  }

  const missingLocalizedMetadataFiles = pageFiles
    .filter(
      ({ relativePath, source }) =>
        !redirectOnlyPageFiles.has(relativePath) &&
        localizedMetadataTitleKeys(source).length === 0,
    )
    .map(({ relativePath }) => relativePath);

  assert.deepEqual(missingLocalizedMetadataFiles, []);

  const redundantLocalizedMetadataFiles = pageFiles
    .filter(({ source }) => localizedMetadataTitleKeys(source).length > 1)
    .map(({ relativePath }) => relativePath);

  assert.deepEqual(redundantLocalizedMetadataFiles, []);

  const titleKeys = pageFiles.flatMap(({ source }) =>
    localizedMetadataTitleKeys(source),
  );

  assert.equal(titleKeys.length, pageFiles.length - redirectOnlyPageFiles.size);

  const sourceFile = parseDictionariesSource();
  const localeKeySets = {
    es: new Set([
      ...objectLiteralKeys(findObjectLiteral(sourceFile, "esExact")),
      ...objectLiteralKeys(
        findObjectLiteral(sourceFile, "esRenderedCorrectiveExact"),
      ),
    ]),
    it: new Set([
      ...objectLiteralKeys(findObjectLiteral(sourceFile, "itExact")),
      ...objectLiteralKeys(
        findObjectLiteral(sourceFile, "itRenderedCorrectiveExact"),
      ),
    ]),
    zh: new Set([
      ...objectLiteralKeys(findObjectLiteral(sourceFile, "zhExact")),
      ...objectLiteralKeys(
        findObjectLiteral(sourceFile, "zhRenderedCorrectiveExact"),
      ),
    ]),
  };

  for (const [locale, keys] of Object.entries(localeKeySets)) {
    const missing = Array.from(new Set(titleKeys))
      .filter((titleKey) => !keys.has(titleKey))
      .sort();

    assert.deepEqual(missing, [], `${locale} metadata title translations`);
  }
});
