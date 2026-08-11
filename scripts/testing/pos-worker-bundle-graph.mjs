#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

const DEFAULT_NEXT_ROOT =
  ".open-next/server-functions/default/.next";
const DEFAULT_EXISTING_ROUTE_TOLERANCE_BYTES = 5 * 1024;
const DEFAULT_PRODUCT_IMAGE_INITIAL_MAX_BYTES = 110 * 1024;
const CHUNK_REFERENCE_PATTERN =
  /["'](server\/chunks\/[^"'\\]+\.js)["']/g;
const INITIAL_CHUNK_PATTERN =
  /\bR\.c\((["'])(server\/chunks\/[^"'\\]+\.js)\1\)/g;
const INITIAL_FORBIDDEN_PATTERNS = [
  {
    label: "@supabase/supabase-js",
    pattern:
      /node_modules_@supabase_supabase-js|@supabase\/supabase-js/i,
  },
  {
    label: "heavy POS product image domain",
    pattern:
      /src_server_pos-auth_product-images(?:_ts)?|src\/server\/pos-auth\/product-images\.ts/i,
  },
  {
    label: "Shop Admin product image domain",
    pattern:
      /src_server_shop-admin_product-images|src\/server\/shop-admin\/product-images\//i,
  },
];
const UI_OR_SSR_PATTERNS = [
  {
    label: "SSR chunk",
    pattern: /(?:^|\/)server\/chunks\/ssr\//i,
  },
  {
    label: "Shop UI module",
    pattern: /src_app_shop_|src\/app\/shop\//i,
  },
  {
    label: "component module",
    pattern: /src_components_|src\/components\//i,
  },
];
const AUTH_DYNAMIC_PATTERNS = [
  /src_server_pos-auth_product-image-auth(?:_ts)?/i,
  /src\/server\/pos-auth\/product-image-auth\.ts/i,
  /authorizePosProductImageRequest/i,
];
const IMAGE_DYNAMIC_PATTERNS = [
  /src_server_pos-auth_product-images(?:_ts)?/i,
  /src\/server\/pos-auth\/product-images\.ts/i,
  /product_image_(?:create_intent|finalize|remove|resolve_read_paths)/i,
];
const IMAGE_DOMAIN_CLOSURE_PATTERNS = [
  ...IMAGE_DYNAMIC_PATTERNS,
  /src_server_shop-admin_product-images/i,
  /src\/server\/shop-admin\/product-images\//i,
];

const routeDefinitions = [
  {
    baselineBytes: 93_980,
    label: "POS catalog pull",
    route: "api/pos/catalog/pull",
    type: "existing",
  },
  {
    baselineBytes: 93_415,
    label: "POS first login",
    route: "api/pos/auth/first-login",
    type: "existing",
  },
  {
    baselineBytes: 93_601,
    label: "POS article mutations",
    route: "api/pos/catalog/article-mutations",
    type: "existing",
  },
  {
    label: "POS product image intent",
    route: "api/pos/catalog/product-images/intent",
    type: "product-image",
  },
  {
    label: "POS product image finalize",
    route: "api/pos/catalog/product-images/finalize",
    type: "product-image",
  },
  {
    label: "POS product image read URLs",
    route: "api/pos/catalog/product-images/read-urls",
    type: "product-image",
  },
  {
    label: "POS product image remove",
    route: "api/pos/catalog/product-images/remove",
    type: "product-image",
  },
];

function parsePositiveInteger(value, label, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function parseArgs(argv) {
  const options = {
    assert: false,
    existingOnly: false,
    json: false,
    nextRoot:
      process.env.POS_WORKER_BUNDLE_NEXT_ROOT?.trim() ||
      DEFAULT_NEXT_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--assert") {
      options.assert = true;
      continue;
    }

    if (argument === "--json") {
      options.json = true;
      continue;
    }

    if (argument === "--existing-only") {
      options.existingOnly = true;
      continue;
    }

    if (argument === "--root") {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("--root requires a path");
      }

      options.nextRoot = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function unique(values) {
  return [...new Set(values)];
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function relativePath(nextRoot, path) {
  return relative(nextRoot, path).replace(/\\/g, "/");
}

function resolveChunk(nextRoot, reference) {
  const normalizedReference = normalize(reference).replace(/\\/g, "/");

  if (
    !normalizedReference.startsWith("server/chunks/") ||
    normalizedReference.includes("../")
  ) {
    throw new Error(`Unsafe emitted chunk reference: ${reference}`);
  }

  const absolutePath = resolve(nextRoot, normalizedReference);
  const relativeChunkPath = relative(resolve(nextRoot), absolutePath);

  if (
    relativeChunkPath === ".." ||
    relativeChunkPath.startsWith(`..${sep}`) ||
    isAbsolute(relativeChunkPath)
  ) {
    throw new Error(`Chunk reference escapes the emitted build: ${reference}`);
  }

  if (!existsSync(absolutePath)) {
    throw new Error(`Emitted chunk is missing: ${normalizedReference}`);
  }

  return absolutePath;
}

function collectMatches(source, pattern, captureIndex) {
  const values = [];

  for (const match of source.matchAll(pattern)) {
    values.push(match[captureIndex]);
  }

  return unique(values);
}

function collectInitialChunks(nextRoot, entrySource) {
  return collectMatches(entrySource, INITIAL_CHUNK_PATTERN, 2).map(
    (reference) => resolveChunk(nextRoot, reference),
  );
}

function collectChunkClosure(nextRoot, entryPath, initialPaths) {
  const visited = new Set();
  const queue = [entryPath, ...initialPaths];

  while (queue.length > 0) {
    const currentPath = queue.shift();

    if (!currentPath || visited.has(currentPath)) {
      continue;
    }

    visited.add(currentPath);
    const source = readText(currentPath);
    const references = collectMatches(
      source,
      CHUNK_REFERENCE_PATTERN,
      1,
    );

    for (const reference of references) {
      const chunkPath = resolveChunk(nextRoot, reference);

      if (!visited.has(chunkPath)) {
        queue.push(chunkPath);
      }
    }
  }

  return visited;
}

function descriptor(nextRoot, paths) {
  return [...paths]
    .map(
      (path) =>
        `${relativePath(nextRoot, path)}\n${readText(path)}`,
    )
    .join("\n");
}

function initialDescriptor(nextRoot, paths) {
  return [...paths]
    .map((path) => {
      const sourceWithoutLazyChunkNames = readText(path).replace(
        CHUNK_REFERENCE_PATTERN,
        '""',
      );

      return `${relativePath(nextRoot, path)}\n${sourceWithoutLazyChunkNames}`;
    })
    .join("\n");
}

function matchingLabels(source, definitions) {
  return definitions
    .filter(({ pattern }) => pattern.test(source))
    .map(({ label }) => label);
}

function matchesAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

function matchingChunkPaths(nextRoot, paths, patterns) {
  return [...paths].filter((path) =>
    matchesAny(initialDescriptor(nextRoot, [path]), patterns),
  );
}

function inspectRoute(nextRoot, definition, limits) {
  const entryPath = join(
    nextRoot,
    "server/app",
    definition.route,
    "route.js",
  );

  if (!existsSync(entryPath)) {
    throw new Error(
      `${definition.label} entry is missing at ${relativePath(
        nextRoot,
        entryPath,
      )}`,
    );
  }

  const entrySource = readText(entryPath);
  const initialPaths = collectInitialChunks(nextRoot, entrySource);
  const initialCallCount =
    entrySource.match(/\bR\.c\(/g)?.length ?? 0;

  if (
    initialPaths.length === 0 ||
    initialPaths.length !== initialCallCount
  ) {
    throw new Error(
      `${definition.label} has ${initialCallCount} R.c(...) calls but ` +
        `${initialPaths.length} parseable initial chunks`,
    );
  }

  const closurePaths = collectChunkClosure(
    nextRoot,
    entryPath,
    initialPaths,
  );
  const initialSet = new Set(initialPaths);
  const dynamicPaths = [...closurePaths].filter(
    (path) => path !== entryPath && !initialSet.has(path),
  );
  const loadedInitialDescriptor = initialDescriptor(
    nextRoot,
    initialPaths,
  );
  const closureDescriptor = descriptor(nextRoot, closurePaths);
  const initialBytes = initialPaths.reduce(
    (total, path) => total + statSync(path).size,
    0,
  );
  const failures = [];
  const initialForbidden = matchingLabels(
    loadedInitialDescriptor,
    INITIAL_FORBIDDEN_PATTERNS,
  );
  const initialUiOrSsr = matchingLabels(
    loadedInitialDescriptor,
    UI_OR_SSR_PATTERNS,
  );
  const closureUiOrSsr = matchingLabels(
    closureDescriptor,
    UI_OR_SSR_PATTERNS,
  );

  if (initialForbidden.length > 0) {
    failures.push(
      `initial graph contains ${initialForbidden.join(", ")}`,
    );
  }

  if (initialUiOrSsr.length > 0) {
    failures.push(
      `initial graph contains ${initialUiOrSsr.join(", ")}`,
    );
  }

  if (closureUiOrSsr.length > 0) {
    failures.push(
      `route closure contains ${closureUiOrSsr.join(", ")}`,
    );
  }

  if (definition.type === "existing") {
    const maximum =
      definition.baselineBytes + limits.existingToleranceBytes;

    if (initialBytes > maximum) {
      failures.push(
        `initial graph is ${initialBytes} bytes; maximum is ${maximum} ` +
          `(TASK-147 baseline ${definition.baselineBytes} + ` +
          `${limits.existingToleranceBytes})`,
      );
    }

    if (
      matchesAny(
        closureDescriptor,
        IMAGE_DOMAIN_CLOSURE_PATTERNS,
      )
    ) {
      failures.push(
        "TASK-147 route closure unexpectedly contains the product image domain",
      );
    }
  } else {
    if (initialBytes > limits.productImageInitialMaxBytes) {
      failures.push(
        `initial graph is ${initialBytes} bytes; maximum is ` +
          `${limits.productImageInitialMaxBytes}`,
      );
    }

    const authDynamicPaths = matchingChunkPaths(
      nextRoot,
      dynamicPaths,
      AUTH_DYNAMIC_PATTERNS,
    );
    const imageDynamicPaths = matchingChunkPaths(
      nextRoot,
      dynamicPaths,
      IMAGE_DYNAMIC_PATTERNS,
    );

    if (authDynamicPaths.length === 0) {
      failures.push(
        "light POS product image auth is not present in the dynamic closure",
      );
    }

    if (imageDynamicPaths.length === 0) {
      failures.push(
        "heavy product image domain is not present in the dynamic closure",
      );
    }

    for (const authPath of authDynamicPaths) {
      const authChunk = relativePath(nextRoot, authPath);
      const authDescriptor = initialDescriptor(nextRoot, [authPath]);

      if (matchesAny(authDescriptor, IMAGE_DOMAIN_CLOSURE_PATTERNS)) {
        failures.push(
          `auth dynamic chunk ${authChunk} also contains the heavy ` +
            "product image domain",
        );
      }

      const authClosurePaths = collectChunkClosure(
        nextRoot,
        authPath,
        [],
      );
      const heavyDependencies = matchingChunkPaths(
        nextRoot,
        [...authClosurePaths].filter((path) => path !== authPath),
        IMAGE_DOMAIN_CLOSURE_PATTERNS,
      );

      if (heavyDependencies.length > 0) {
        failures.push(
          `auth dynamic chunk ${authChunk} reaches heavy product image ` +
            `chunk(s): ${heavyDependencies
              .map((path) => relativePath(nextRoot, path))
              .sort()
              .join(", ")}`,
        );
      }
    }
  }

  return {
    dynamicChunks: dynamicPaths
      .map((path) => relativePath(nextRoot, path))
      .sort(),
    failures,
    initialBytes,
    initialChunks: initialPaths
      .map((path) => relativePath(nextRoot, path))
      .sort(),
    label: definition.label,
    route: `/${definition.route}`,
    type: definition.type,
  };
}

function printHumanReport(report) {
  for (const route of report.routes) {
    const status = route.failures.length === 0 ? "PASS" : "FAIL";
    console.log(
      `[pos-worker-bundle] ${status} ${route.route}: ` +
        `initial=${route.initialBytes}B chunks=${route.initialChunks.length} ` +
        `dynamic=${route.dynamicChunks.length}`,
    );

    for (const failure of route.failures) {
      console.error(`[pos-worker-bundle]   - ${failure}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const configuredRoot = isAbsolute(options.nextRoot)
    ? options.nextRoot
    : join(process.cwd(), options.nextRoot);
  const nextRoot = resolve(configuredRoot);

  if (!existsSync(nextRoot)) {
    throw new Error(
      `${nextRoot} is missing. Run npm run cf:build first or pass --root.`,
    );
  }

  const limits = {
    existingToleranceBytes: parsePositiveInteger(
      process.env.POS_WORKER_BUNDLE_EXISTING_TOLERANCE_BYTES,
      "POS_WORKER_BUNDLE_EXISTING_TOLERANCE_BYTES",
      DEFAULT_EXISTING_ROUTE_TOLERANCE_BYTES,
    ),
    productImageInitialMaxBytes: parsePositiveInteger(
      process.env.POS_PRODUCT_IMAGE_INITIAL_MAX_BYTES,
      "POS_PRODUCT_IMAGE_INITIAL_MAX_BYTES",
      DEFAULT_PRODUCT_IMAGE_INITIAL_MAX_BYTES,
    ),
  };
  const report = {
    limits,
    nextRoot,
    routes: routeDefinitions
      .filter(
        (definition) =>
          !options.existingOnly || definition.type === "existing",
      )
      .map((definition) =>
        inspectRoute(nextRoot, definition, limits),
      ),
  };
  const failures = report.routes.flatMap((route) =>
    route.failures.map((failure) => `${route.route}: ${failure}`),
  );

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (options.assert && failures.length > 0) {
    throw new Error(
      `POS Worker bundle graph gate failed with ${failures.length} violation(s)`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[pos-worker-bundle] FAIL ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
