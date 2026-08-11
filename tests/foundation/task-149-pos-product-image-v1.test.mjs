import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTest = createRequire(import.meta.url);
const SHOP_ID = "10000000-0000-4000-8000-000000000149";
const STAFF_ID = "20000000-0000-4000-8000-000000000149";
const SHOP_DEVICE_ID = "30000000-0000-4000-8000-000000000149";
const POS_SESSION_ID = "40000000-0000-4000-8000-000000000149";
const VERSION_ID = "50000000-0000-4000-8000-000000000149";
const PRODUCT_ID = "60000000-0000-4000-8000-000000000149";
const POS_DEVICE_CREDENTIAL_ID = "70000000-0000-4000-8000-000000000149";
const PAYLOAD_HASH = `sha256:${"a".repeat(64)}`;
const IMAGE_SHA256 = "b".repeat(64);
const BASELINE_JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ9AFA4//9k=",
    "base64",
  ),
);

const ROUTES = [
  {
    envelopeGuard: "hasPosProductImageIntentEnvelope",
    handler: "handlePosProductImageIntent",
    label: "pos.catalog.product_images.intent",
    operation: "intent",
    path: "src/app/api/pos/catalog/product-images/intent/route.ts",
    permission: "catalog.write",
    stage: "product_image_intent",
    url: "/api/pos/catalog/product-images/intent",
  },
  {
    envelopeGuard: "hasPosProductImageFinalizeEnvelope",
    handler: "handlePosProductImageFinalize",
    label: "pos.catalog.product_images.finalize",
    operation: "finalize",
    path: "src/app/api/pos/catalog/product-images/finalize/route.ts",
    permission: "catalog.write",
    stage: "product_image_finalize",
    url: "/api/pos/catalog/product-images/finalize",
  },
  {
    envelopeGuard: "hasPosProductImageReadUrlsEnvelope",
    handler: "handlePosProductImageReadUrls",
    label: "pos.catalog.product_images.read_urls",
    operation: "read-urls",
    path: "src/app/api/pos/catalog/product-images/read-urls/route.ts",
    permission: "catalog.read",
    stage: "product_image_read_urls",
    url: "/api/pos/catalog/product-images/read-urls",
  },
  {
    envelopeGuard: "hasPosProductImageRemoveEnvelope",
    handler: "handlePosProductImageRemove",
    label: "pos.catalog.product_images.remove",
    operation: "remove",
    path: "src/app/api/pos/catalog/product-images/remove/route.ts",
    permission: "catalog.write",
    stage: "product_image_remove",
    url: "/api/pos/catalog/product-images/remove",
  },
];

const TASK_149_CASES = Object.freeze([
  {
    id: 1,
    name: "valid session",
    coverage: ["foundation", "pgTAP", "staging"],
  },
  { id: 2, name: "expired session", coverage: ["foundation", "pgTAP"] },
  { id: 3, name: "revoked device", coverage: ["foundation", "pgTAP"] },
  { id: 4, name: "wrong shop", coverage: ["foundation", "pgTAP"] },
  {
    id: 5,
    name: "read-only staff write denial",
    coverage: ["foundation", "pgTAP"],
  },
  { id: 6, name: "malformed envelope", coverage: ["foundation", "cloudflare"] },
  { id: 7, name: "unknown app version policy", coverage: ["pgTAP", "staging"] },
  { id: 8, name: "valid replacement intent", coverage: ["pgTAP", "staging"] },
  { id: 9, name: "intent product not found", coverage: ["pgTAP"] },
  { id: 10, name: "intent expected-version conflict", coverage: ["pgTAP"] },
  { id: 11, name: "invalid JPEG metadata", coverage: ["foundation", "pgTAP"] },
  { id: 12, name: "intent replay same hash", coverage: ["pgTAP", "staging"] },
  { id: 13, name: "intent replay different hash", coverage: ["pgTAP"] },
  { id: 14, name: "valid finalize", coverage: ["pgTAP", "staging"] },
  { id: 15, name: "finalize missing object", coverage: ["pgTAP"] },
  { id: 16, name: "finalize MIME mismatch", coverage: ["pgTAP"] },
  { id: 17, name: "finalize hash mismatch", coverage: ["pgTAP"] },
  { id: 18, name: "finalize byte mismatch", coverage: ["pgTAP"] },
  { id: 19, name: "finalize dimension mismatch", coverage: ["pgTAP"] },
  { id: 20, name: "finalize corrupt JPEG", coverage: ["foundation", "pgTAP"] },
  { id: 21, name: "finalize replay", coverage: ["pgTAP", "staging"] },
  { id: 22, name: "failed finalize preserves current", coverage: ["pgTAP"] },
  {
    id: 23,
    name: "finalize revision publication",
    coverage: ["pgTAP", "staging"],
  },
  { id: 24, name: "read missing image without signing", coverage: ["pgTAP"] },
  { id: 25, name: "read ready image", coverage: ["pgTAP", "staging"] },
  { id: 26, name: "read removed or superseded denial", coverage: ["pgTAP"] },
  { id: 27, name: "read batch sixteen", coverage: ["foundation"] },
  {
    id: 28,
    name: "read batch seventeen rejected",
    coverage: ["foundation", "pgTAP"],
  },
  {
    id: 29,
    name: "signed URL bounded TTL and memory-only",
    coverage: ["pgTAP", "staging"],
  },
  {
    id: 30,
    name: "signed URL absent from logs",
    coverage: ["foundation", "security"],
  },
  { id: 31, name: "valid remove", coverage: ["pgTAP", "staging"] },
  { id: 32, name: "remove expected-version conflict", coverage: ["pgTAP"] },
  { id: 33, name: "remove replay one-shot", coverage: ["pgTAP", "staging"] },
  { id: 34, name: "remove cleanup pending", coverage: ["pgTAP"] },
  { id: 35, name: "stale remove preserves newer paths", coverage: ["pgTAP"] },
  {
    id: 36,
    name: "full catalog image fields",
    coverage: ["foundation", "pgTAP", "staging"],
  },
  { id: 37, name: "replacement catalog delta", coverage: ["pgTAP", "staging"] },
  { id: 38, name: "removal catalog delta", coverage: ["pgTAP", "staging"] },
  { id: 39, name: "legacy additive compatibility", coverage: ["foundation"] },
  {
    id: 40,
    name: "bounded 676-page drain",
    coverage: ["foundation"],
  },
  {
    id: 41,
    name: "catalog exactness",
    coverage: ["foundation", "pgTAP", "staging"],
  },
  {
    id: 42,
    name: "catalog image metadata redaction",
    coverage: ["foundation", "security"],
  },
  { id: 43, name: "RLS grants and receipts", coverage: ["pgTAP"] },
  {
    id: 44,
    name: "canonical server-derived paths",
    coverage: ["foundation", "pgTAP"],
  },
  {
    id: 45,
    name: "malformed route cold path",
    coverage: ["foundation", "bundle", "cloudflare"],
  },
  {
    id: 46,
    name: "TASK-147 catalog CPU regression",
    coverage: ["foundation", "bundle", "cloudflare", "staging"],
  },
  {
    id: 47,
    name: "image route emitted import graph",
    coverage: ["foundation", "bundle"],
  },
  {
    id: 48,
    name: "secret URL audit receipt redaction",
    coverage: ["foundation", "pgTAP", "cloudflare", "security", "staging"],
  },
]);

const TASK_149_EXECUTABLE_GATES = new Map();
const TASK_149_GATE_PROVIDER_BY_KIND = Object.freeze({
  bundle: "bundle",
  cloudflare: "cloudflare",
  "external-foundation": "foundation",
  foundation: "foundation",
  pgtap: "pgTAP",
  security: "security",
  staging: "staging",
});
const TASK_149_COVERAGE_PROVIDERS = new Set(
  Object.values(TASK_149_GATE_PROVIDER_BY_KIND),
);

function registerTask149Gate(caseIds, gate) {
  for (const caseId of caseIds) {
    assert.ok(
      Number.isInteger(caseId) && caseId >= 1 && caseId <= 48,
      `invalid TASK-149 case ${caseId}`,
    );
    const gates = TASK_149_EXECUTABLE_GATES.get(caseId) ?? [];
    gates.push(gate);
    TASK_149_EXECUTABLE_GATES.set(caseId, gates);
  }
}

function task149Test(caseIds, name, fn) {
  registerTask149Gate(caseIds, {
    kind: "foundation",
    name,
    path: "tests/foundation/task-149-pos-product-image-v1.test.mjs",
  });
  return test(name, fn);
}

function registerExternalFoundationGate(caseIds, path, name) {
  registerTask149Gate(caseIds, {
    kind: "external-foundation",
    name,
    path,
  });
}

function registerMarkerGate(caseIds, kind, path) {
  for (const caseId of caseIds) {
    registerTask149Gate([caseId], {
      kind,
      marker: `TASK149_CASE_${String(caseId).padStart(2, "0")}`,
      path,
    });
  }
}

function registerCommandGate(
  caseIds,
  kind,
  path,
  packageScript,
  requiredSnippets,
) {
  assert.ok(
    ["bundle", "cloudflare", "security"].includes(kind),
    `invalid TASK-149 command gate kind ${kind}`,
  );
  registerTask149Gate(caseIds, {
    kind,
    packageScript,
    path,
    requiredSnippets,
  });
}

registerExternalFoundationGate(
  [36, 37, 38],
  "tests/foundation/task-143-admin-staging-catalog-pull-503.test.mjs",
  "TASK-149 catalog keeps image state additive across full, delta, replacement and remove",
);
registerExternalFoundationGate(
  [2, 3],
  "tests/foundation/cross-platform-runtime-boundary-binding.test.mjs",
  "POS runtime boundary binds the complete lease graph and expiry",
);
registerExternalFoundationGate(
  [40],
  "tests/foundation/task-143-admin-staging-catalog-pull-503.test.mjs",
  "TASK-143 full handler drain matches its first-page real-volume manifest",
);
registerExternalFoundationGate(
  [41],
  "tests/foundation/task-139-pos-catalog-v2-pagination.test.mjs",
  "TASK-139 keyset drains exact boundary datasets without gaps or duplicates",
);
registerExternalFoundationGate(
  [46],
  "tests/foundation/task-147-admin-staging-worker-cpu-remediation.test.mjs",
  "TASK-147 POS image routes preserve a two-stage cold boundary",
);
registerMarkerGate(
  [
    1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 41, 43, 44,
    48,
  ],
  "pgtap",
  "supabase/tests/task_149_pos_product_image_v1.sql",
);
registerMarkerGate(
  [1, 6, 7, 8, 12, 14, 21, 23, 25, 29, 31, 33, 36, 37, 38, 41, 44, 45],
  "staging",
  "scripts/testing/task-149-pos-product-image-staging-e2e.mjs",
);
registerMarkerGate(
  [46, 48],
  "staging",
  "scripts/testing/task-149-pos-product-image-resource-gate.mjs",
);
registerCommandGate(
  [46, 48],
  "cloudflare",
  "scripts/testing/task-149-pos-product-image-resource-gate.mjs",
  "check:task149:resource-gate",
  [
    "GRAPHQL_ENDPOINT",
    "workersInvocationsAdaptive",
    "TASK149_REQUEST_PHASE_COMPLETE",
    "deployments",
    "tail",
    "merchandise-control-admin-web-staging",
    "MEMORY_LIMIT_BYTES",
  ],
);
registerCommandGate(
  [6, 45],
  "cloudflare",
  "scripts/testing/cloudflare-local-smoke.mjs",
  "test:cloudflare:local",
  [
    "const posProductImagePaths = [",
    "POS product image light guard",
    "expect: [400]",
  ],
);
registerCommandGate(
  [30, 48],
  "security",
  "scripts/security-checks.mjs",
  "security:scan",
  [
    "checkTask149TrustedPosProductImages",
    "must not log tokens, paths, signed URLs or request bodies",
  ],
);
registerCommandGate(
  [42],
  "security",
  "scripts/security-checks.mjs",
  "security:scan",
  [
    "const productProjection",
    "must not expose image URLs, paths, hashes or raw metadata",
  ],
);
registerCommandGate(
  [45, 46, 47],
  "bundle",
  "scripts/testing/pos-worker-bundle-graph.mjs",
  "check:pos-worker-bundle",
  [
    "DEFAULT_EXISTING_ROUTE_TOLERANCE_BYTES",
    "DEFAULT_PRODUCT_IMAGE_INITIAL_MAX_BYTES",
    "AUTH_DYNAMIC_PATTERNS",
    "IMAGE_DYNAMIC_PATTERNS",
  ],
);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function runSyntheticPosBundleGate(authSource) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "task149-pos-bundle-"));
  const nextRoot = join(fixtureRoot, ".next");
  const chunkRoot = join(nextRoot, "server/chunks");
  const existingRoutes = [
    "api/pos/catalog/pull",
    "api/pos/auth/first-login",
    "api/pos/catalog/article-mutations",
  ];

  try {
    mkdirSync(chunkRoot, { recursive: true });
    writeFileSync(
      join(chunkRoot, "existing-initial.js"),
      "export const existingRoute = true;\n",
    );
    writeFileSync(
      join(chunkRoot, "product-initial.js"),
      [
        'const auth = "server/chunks/product-image-auth.js";',
        'const image = "server/chunks/product-images.js";',
        "export { auth, image };",
        "",
      ].join("\n"),
    );
    writeFileSync(join(chunkRoot, "product-image-auth.js"), `${authSource}\n`);
    writeFileSync(
      join(chunkRoot, "product-images.js"),
      [
        "// src_server_pos-auth_product-images_ts",
        "export const handlePosProductImage = true;",
        "",
      ].join("\n"),
    );

    for (const route of existingRoutes) {
      const routeRoot = join(nextRoot, "server/app", route);

      mkdirSync(routeRoot, { recursive: true });
      writeFileSync(
        join(routeRoot, "route.js"),
        'R.c("server/chunks/existing-initial.js");\n',
      );
    }

    for (const definition of ROUTES) {
      const routeRoot = join(nextRoot, "server/app", definition.url.slice(1));

      mkdirSync(routeRoot, { recursive: true });
      writeFileSync(
        join(routeRoot, "route.js"),
        'R.c("server/chunks/product-initial.js");\n',
      );
    }

    const result = spawnSync(
      process.execPath,
      [
        join(root, "scripts/testing/pos-worker-bundle-graph.mjs"),
        "--assert",
        "--root",
        nextRoot,
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    );

    return {
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      status: result.status,
    };
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

function transpileCommonJs(relativePath, stubs = {}, globals = {}) {
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    createContext({
      AbortSignal,
      Buffer,
      Date,
      Request,
      Response,
      TextDecoder,
      TextEncoder,
      Uint8Array,
      URL,
      console: globals.console ?? console,
      exports: cjsModule.exports,
      fetch: globals.fetch ?? fetch,
      module: cjsModule,
      process: globals.process ?? process,
      require(specifier) {
        if (specifier === "server-only") return {};
        if (specifier in stubs) return stubs[specifier];
        return requireForTest(specifier);
      },
    }),
  );

  return cjsModule.exports;
}

function trackedModule(moduleExports, increment) {
  return new Proxy(
    {
      __esModule: true,
      ...moduleExports,
    },
    {
      get(target, property, receiver) {
        if (property !== "__esModule") {
          increment();
        }

        return Reflect.get(target, property, receiver);
      },
    },
  );
}

function loadProductImageRoute(
  definition,
  {
    authorize = async () => {
      throw new Error("unexpected POS product image auth load");
    },
    handle = async () => {
      throw new Error("unexpected POS product image domain load");
    },
  } = {},
) {
  const rejectionAudits = [];
  const security = transpileCommonJs(
    "src/app/api/pos/_shared/pos-route-security.ts",
    {},
    {
      console: {
        warn(value) {
          rejectionAudits.push(String(value));
        },
      },
    },
  );
  const envelope = transpileCommonJs(
    "src/server/pos-auth/product-image-envelope.ts",
    {
      "./pos-contract": {
        POS_PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
        POS_PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
        POS_PRODUCT_IMAGE_MAX_CREDENTIAL_VERSION: 2_147_483_647,
        POS_PRODUCT_IMAGE_READ_BATCH_LIMIT: 16,
        POS_PRODUCT_IMAGE_SCHEMA_VERSION: "pos-product-image-v1",
        POS_PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
        POS_PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
      },
    },
  );
  let authLoadCount = 0;
  let imageLoadCount = 0;
  const route = transpileCommonJs(definition.path, {
    "../../../_shared/pos-route-security": security,
    "@/server/pos-auth/product-image-auth": trackedModule(
      {
        authorizePosProductImageRequest: authorize,
      },
      () => {
        authLoadCount += 1;
      },
    ),
    "@/server/pos-auth/product-images": trackedModule(
      {
        [definition.handler]: handle,
      },
      () => {
        imageLoadCount += 1;
      },
    ),
    "@/server/pos-auth/product-image-envelope": envelope,
  });

  return {
    authLoads: () => authLoadCount,
    imageLoads: () => imageLoadCount,
    rejectionAudits: () => rejectionAudits,
    route,
  };
}

function jsonRequest(path, value, headers = {}) {
  const body = typeof value === "string" ? value : JSON.stringify(value);

  return new Request(`https://example.invalid${path}`, {
    body,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

function commonEnvelope() {
  return {
    appVersion: "task-149-foundation",
    deviceToken: "task-149-device-token",
    posSessionId: POS_SESSION_ID,
    schemaVersion: "pos-product-image-v1",
    sessionToken: "task-149-session-token",
    shopDeviceId: SHOP_DEVICE_ID,
    shopId: SHOP_ID,
    staffCredentialVersion: 7,
    staffId: STAFF_ID,
  };
}

function imageMetadata({ height, width }) {
  return {
    bytes: 4,
    height,
    mimeType: "image/jpeg",
    sha256: IMAGE_SHA256,
    width,
  };
}

function operationEnvelope(operation) {
  return {
    ...commonEnvelope(),
    expectedCurrentVersionId: operation === "remove" ? VERSION_ID : null,
    idempotencyKey: `task-149-${operation}-idempotency`,
    operation,
    operationId: `task-149-${operation}-operation`,
    payloadHash: PAYLOAD_HASH,
    productId: PRODUCT_ID,
  };
}

function intentEnvelope() {
  return {
    ...operationEnvelope("intent"),
    main: imageMetadata({ height: 600, width: 800 }),
    thumb: imageMetadata({ height: 288, width: 384 }),
  };
}

function finalizeEnvelope() {
  return {
    ...operationEnvelope("finalize"),
    versionId: VERSION_ID,
  };
}

function readUrlsEnvelope(count = 1) {
  return {
    ...commonEnvelope(),
    refs: Array.from({ length: count }, (_, index) => ({
      productId: fixtureUuid("8", index + 1),
      variant: index % 2 === 0 ? "main" : "thumb",
      versionId: fixtureUuid("9", index + 1),
    })),
  };
}

function removeEnvelope() {
  return operationEnvelope("remove");
}

function validEnvelope(operation) {
  switch (operation) {
    case "intent":
      return intentEnvelope();
    case "finalize":
      return finalizeEnvelope();
    case "read-urls":
      return readUrlsEnvelope();
    case "remove":
      return removeEnvelope();
    default:
      throw new Error(`unsupported operation ${operation}`);
  }
}

function fixtureUuid(prefix, index) {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function authorizedRequest(body, permission) {
  const trusted = Object.fromEntries(
    Object.entries(body).filter(
      ([key]) => key !== "deviceToken" && key !== "sessionToken",
    ),
  );

  return {
    ...trusted,
    permission,
    posDeviceCredentialId: POS_DEVICE_CREDENTIAL_ID,
  };
}

function validRuntimeLease() {
  return {
    credential: {
      pos_device_credential_id: POS_DEVICE_CREDENTIAL_ID,
      staff_credential_version: 7,
      token_hash: "fixture-device-token-hash",
    },
    device: {
      shop_device_id: SHOP_DEVICE_ID,
    },
    session: {
      pos_session_id: POS_SESSION_ID,
      session_token_hash: "fixture-session-token-hash",
      staff_credential_version: 7,
    },
    shop: {
      shop_id: SHOP_ID,
    },
    staff: {
      credential_version: 7,
      staff_id: STAFF_ID,
    },
    status: "ok",
  };
}

function loadProductImageAuth({
  configured = true,
  lease = validRuntimeLease(),
  rpcData = { code: "authorized", ok: true },
  rpcError = null,
  verifySecret = () => true,
} = {}) {
  const leaseCalls = [];
  const rpcCalls = [];
  const rpcClient = {
    async rpc(name, args) {
      rpcCalls.push({ args, name });

      return {
        data: rpcData,
        error: rpcError,
      };
    },
  };
  const envelope = transpileCommonJs(
    "src/server/pos-auth/product-image-envelope.ts",
    {
      "./pos-contract": {
        POS_PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
        POS_PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
        POS_PRODUCT_IMAGE_MAX_CREDENTIAL_VERSION: 2_147_483_647,
        POS_PRODUCT_IMAGE_READ_BATCH_LIMIT: 16,
        POS_PRODUCT_IMAGE_SCHEMA_VERSION: "pos-product-image-v1",
        POS_PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
        POS_PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
      },
    },
  );
  const auth = transpileCommonJs("src/server/pos-auth/product-image-auth.ts", {
    "./pos-contract": {
      POS_PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
      POS_PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
      POS_PRODUCT_IMAGE_MAX_CREDENTIAL_VERSION: 2_147_483_647,
      POS_PRODUCT_IMAGE_READ_BATCH_LIMIT: 16,
      POS_PRODUCT_IMAGE_SCHEMA_VERSION: "pos-product-image-v1",
      POS_PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
      POS_PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
    },
    "./product-image-envelope": {
      createPosProductImageErrorBody: envelope.createPosProductImageErrorBody,
    },
    "./runtime-boundary": {
      async loadPosRuntimeLease(client, input) {
        leaseCalls.push({ client, input });
        return lease;
      },
    },
    "./runtime-rpc-client": {
      createPosRuntimeRpcClient() {
        return configured ? rpcClient : null;
      },
    },
    "./tokens": {
      verifyPosSecret: verifySecret,
    },
  });

  return {
    auth,
    leaseCalls,
    rpcCalls,
    rpcClient,
  };
}

function canonicalTimestamp(offsetMilliseconds = 0) {
  return new Date(Date.now() + offsetMilliseconds)
    .toISOString()
    .replace("Z", "000Z");
}

function canonicalObjectPath(variant, versionId = VERSION_ID) {
  return (
    `shops/${SHOP_ID}/products/${PRODUCT_ID}/primary/` +
    `${versionId}/${variant}.jpg`
  );
}

function loadProductImageService({
  auditAdmission = async () => ({
    data: {
      admitted: true,
      ok: true,
      server_time: canonicalTimestamp(),
    },
    error: null,
  }),
  configured = true,
  download = async () => ({
    data: new Blob([BASELINE_JPEG], { type: "image/jpeg" }),
    error: null,
  }),
  remove = async () => ({ data: [], error: null }),
  rpc = async () => ({
    data: null,
    error: { code: "unconfigured_test_rpc" },
  }),
  signedRead = async (paths) => ({
    data: paths.map((path) => ({
      path,
      signedUrl: `https://storage.example.invalid/object/sign/${path}?token=ephemeral`,
    })),
    error: null,
  }),
  signedUpload = async (path) => ({
    data: {
      signedUrl: `https://storage.example.invalid/object/upload/sign/${path}?token=ephemeral`,
    },
    error: null,
  }),
  verifyJpeg = (input) => ({
    height: input.expectedHeight,
    ok: true,
    sha256: input.expectedSha256,
    width: input.expectedWidth,
  }),
} = {}) {
  const auditAdmissionCalls = [];
  const auditTimeline = [];
  const audits = [];
  const downloadCalls = [];
  const removeCalls = [];
  const rpcCalls = [];
  const signedReadCalls = [];
  const signedUploadCalls = [];
  const verifyCalls = [];
  const bucket = {
    async createSignedUploadUrl(path) {
      signedUploadCalls.push(path);
      return signedUpload(path);
    },
    async createSignedUrls(paths, ttlSeconds) {
      signedReadCalls.push({ paths: [...paths], ttlSeconds });
      return signedRead(paths, ttlSeconds);
    },
    async download(path) {
      downloadCalls.push(path);
      return download(path);
    },
    async remove(paths) {
      removeCalls.push([...paths]);
      return remove(paths);
    },
  };
  const admin = {
    async rpc(name, args) {
      if (name === "pos_product_image_node_audit_admit_v1") {
        auditAdmissionCalls.push({ args, name });
        auditTimeline.push("admit");
        return auditAdmission(args, auditAdmissionCalls.length - 1);
      }
      rpcCalls.push({ args, name });
      return rpc(name, args, rpcCalls.length - 1);
    },
    storage: {
      from(bucketName) {
        assert.equal(bucketName, "product-images");
        return bucket;
      },
    },
  };
  const envelope = transpileCommonJs(
    "src/server/pos-auth/product-image-envelope.ts",
    {
      "./pos-contract": {
        POS_PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
        POS_PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
        POS_PRODUCT_IMAGE_MAX_CREDENTIAL_VERSION: 2_147_483_647,
        POS_PRODUCT_IMAGE_READ_BATCH_LIMIT: 16,
        POS_PRODUCT_IMAGE_SCHEMA_VERSION: "pos-product-image-v1",
        POS_PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
        POS_PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
      },
    },
  );
  const service = transpileCommonJs("src/server/pos-auth/product-images.ts", {
    "@/server/shop-admin/product-images/contract": {
      PRODUCT_IMAGE_BUCKET: "product-images",
      PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
      PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
      PRODUCT_IMAGE_READ_BATCH_LIMIT: 16,
      PRODUCT_IMAGE_READ_RESPONSE_LIMIT: 64 * 1024,
      PRODUCT_IMAGE_READ_URL_TTL_SECONDS: 5 * 60,
      PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
      PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
    },
    "@/server/shop-admin/product-images/runtime-core": {
      isCanonicalProductImagePath(input) {
        return (
          input.path ===
          `shops/${input.shopId}/products/${input.productId}/primary/${input.versionId}/${input.variant}.jpg`
        );
      },
      isProductImageStorageObjectMissingError(error) {
        return (
          error?.status === 404 ||
          error?.statusCode === "404" ||
          error?.code === "404" ||
          error?.code === "not_found"
        );
      },
      resolveProductImageAdminClient() {
        return configured ? admin : null;
      },
      verifyDownloadedProductImageJpeg(input) {
        verifyCalls.push(input);
        return verifyJpeg(input, verifyCalls.length - 1);
      },
    },
    "./pos-contract": {
      POS_PRODUCT_IMAGE_SCHEMA_VERSION: "pos-product-image-v1",
    },
    "./product-image-envelope": {
      canonicalPosProductImagePayloadJson:
        envelope.canonicalPosProductImagePayloadJson,
      createPosProductImageErrorBody:
        envelope.createPosProductImageErrorBody,
    },
    "./runtime-boundary": {
      async writePosRuntimeAudit(_admin, input) {
        auditTimeline.push("write");
        audits.push(input);
        return true;
      },
    },
  });

  return {
    admin,
    auditAdmissionCalls,
    auditTimeline,
    audits,
    downloadCalls,
    removeCalls,
    rpcCalls,
    service,
    signedReadCalls,
    signedUploadCalls,
    verifyCalls,
  };
}

function trustedWriteRequest(service, operation) {
  const request = authorizedRequest(validEnvelope(operation), "catalog.write");
  request.payloadHash = service.computePosProductImagePayloadHash(request);
  return request;
}

function trustedReadRequest(count = 1) {
  return authorizedRequest(readUrlsEnvelope(count), "catalog.read");
}

function baselineMetadata() {
  return {
    bytes: BASELINE_JPEG.byteLength,
    height: 3,
    mimeType: "image/jpeg",
    sha256: createHash("sha256").update(BASELINE_JPEG).digest("hex"),
    width: 2,
  };
}

function finalizePrepareData({
  serverTime = canonicalTimestamp(),
  mainPath = canonicalObjectPath("main"),
  thumbPath = canonicalObjectPath("thumb"),
} = {}) {
  return {
    code: "success",
    expected_main: baselineMetadata(),
    expected_thumb: baselineMetadata(),
    expires_at: canonicalTimestamp(30 * 60 * 1000),
    main_path: mainPath,
    ok: true,
    replayed: false,
    server_time: serverTime,
    status: "validation_required",
    thumb_path: thumbPath,
    version_id: VERSION_ID,
  };
}

function finalizeCommitData({
  replayed = false,
  serverTime = canonicalTimestamp(),
  status = "finalized",
} = {}) {
  return {
    code: "success",
    image_updated_at: canonicalTimestamp(),
    ok: true,
    replayed,
    server_time: serverTime,
    status,
    version_id: VERSION_ID,
  };
}

function resolvedReadItem(ref, code = "success") {
  if (code === "not_found") {
    return {
      code,
      object_path: null,
      product_id: ref.productId,
      variant: ref.variant,
      version_id: ref.versionId,
    };
  }

  const metadata = baselineMetadata();
  return {
    code,
    object_path:
      `shops/${SHOP_ID}/products/${ref.productId}/primary/` +
      `${ref.versionId}/${ref.variant}.jpg`,
    product_id: ref.productId,
    variant: ref.variant,
    verified_bytes: metadata.bytes,
    verified_height: metadata.height,
    verified_mime_type: metadata.mimeType,
    verified_sha256: metadata.sha256,
    verified_width: metadata.width,
    version_id: ref.versionId,
  };
}

function removeSuccessData({
  cleanupRequired = true,
  cleanupStatus = "pending",
  mainPath = canonicalObjectPath("main"),
  replayed = false,
  serverTime = canonicalTimestamp(),
  status = "removed",
  thumbPath = canonicalObjectPath("thumb"),
} = {}) {
  if (status === "already_removed") {
    return {
      code: "success",
      ok: true,
      replayed: true,
      server_time: serverTime,
      status,
      version_id: VERSION_ID,
    };
  }

  return {
    cleanup_required: cleanupRequired,
    cleanup_status: cleanupStatus,
    code: "success",
    image_updated_at: canonicalTimestamp(),
    main_path: cleanupRequired ? mainPath : null,
    ok: true,
    replayed,
    server_time: serverTime,
    status,
    thumb_path: cleanupRequired ? thumbPath : null,
    version_id: VERSION_ID,
  };
}

function normalizedEndpointResult(endpointResult) {
  return {
    body: {
      ...endpointResult.body,
      serverTime: "<server-time>",
    },
    status: endpointResult.status,
  };
}

function assertErrorBodyMatchesFrozenSchema(
  body,
  { code, operation, retryable, terminal },
) {
  const definition = json("contracts/pos-product-image-v1/schema.json").$defs
    .errorResponse;
  const allowedKeys = new Set(Object.keys(definition.properties));
  const canonicalTimestampPattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

  for (const requiredKey of definition.required) {
    assert.ok(requiredKey in body, `missing error field ${requiredKey}`);
  }
  for (const key of Object.keys(body)) {
    assert.ok(allowedKeys.has(key), `unexpected error field ${key}`);
  }

  assert.equal(body.schemaVersion, "pos-product-image-v1");
  assert.equal(body.operation, operation);
  assert.equal(body.ok, false);
  assert.equal(body.code, code);
  assert.equal(body.retryable, retryable);
  assert.equal(body.terminal, terminal);
  assert.match(body.serverTime, canonicalTimestampPattern);
  assert.ok(Number.isFinite(Date.parse(body.serverTime)));
  assert.match(body.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/);
  assert.equal(typeof body.message, "string");
  assert.ok(body.message.length >= 1 && body.message.length <= 160);
  assert.doesNotMatch(
    JSON.stringify(body),
    /https?:\/\/|\/storage\/|(?:device|session)Token|signedUrl/i,
  );
  assertCanonicalErrorKeyOrder(body);
}

function assertCanonicalErrorKeyOrder(body) {
  const canonicalOrder = [
    "schemaVersion",
    "operation",
    "operationId",
    "idempotencyKey",
    "payloadHash",
    "ok",
    "code",
    "message",
    "retryable",
    "serverTime",
    "requestId",
    "clientRequestId",
    "terminal",
  ];

  assert.deepEqual(
    Object.keys(body),
    canonicalOrder.filter((key) => key in body),
    "error JSON properties must remain in the Win7POS DataContract order",
  );
}

function sensitiveCatalogKeys(value, path = "$") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      sensitiveCatalogKeys(item, `${path}[${index}]`),
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const failures = [];

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;

    if (
      /(?:signed.?url|storage.?path|main.?path|thumb.?path|sha256|hash|raw.?metadata)/i.test(
        key,
      )
    ) {
      failures.push(childPath);
    }

    failures.push(...sensitiveCatalogKeys(child, childPath));
  }

  return failures;
}

test("TASK-149 declares all 48 requested server cases without disabled coverage", () => {
  const sourceCache = new Map();
  const packageJson = json("package.json");
  const sourceFor = (path) => {
    if (!sourceCache.has(path)) {
      sourceCache.set(path, read(path));
    }
    return sourceCache.get(path);
  };

  assert.equal(TASK_149_CASES.length, 48);
  assert.deepEqual(
    TASK_149_CASES.map(({ id }) => id),
    Array.from({ length: 48 }, (_, index) => index + 1),
  );
  assert.equal(
    new Set(TASK_149_CASES.map(({ name }) => name)).size,
    TASK_149_CASES.length,
  );

  for (const testCase of TASK_149_CASES) {
    assert.ok(testCase.name.length > 0, `case ${testCase.id}`);
    assert.ok(testCase.coverage.length > 0, `case ${testCase.id}`);
    assert.equal("disabled" in testCase, false, `case ${testCase.id}`);
    assert.equal("skip" in testCase, false, `case ${testCase.id}`);
    assert.equal("todo" in testCase, false, `case ${testCase.id}`);
    assert.equal(
      new Set(testCase.coverage).size,
      testCase.coverage.length,
      `case ${testCase.id} repeats a coverage provider`,
    );

    const gates = TASK_149_EXECUTABLE_GATES.get(testCase.id) ?? [];
    assert.ok(
      gates.length > 0,
      `TASK149_CASE_${String(testCase.id).padStart(2, "0")} has no executable gate`,
    );
    const registeredProviders = new Set(
      gates.map((gate) => TASK_149_GATE_PROVIDER_BY_KIND[gate.kind]),
    );
    for (const provider of testCase.coverage) {
      assert.ok(
        TASK_149_COVERAGE_PROVIDERS.has(provider),
        `TASK149_CASE_${String(testCase.id).padStart(2, "0")} declares unknown provider ${provider}`,
      );
      assert.ok(
        registeredProviders.has(provider),
        `TASK149_CASE_${String(testCase.id).padStart(2, "0")} declares ${provider} without a registered gate`,
      );
    }

    for (const gate of gates) {
      assert.ok(
        TASK_149_GATE_PROVIDER_BY_KIND[gate.kind],
        `TASK149_CASE_${String(testCase.id).padStart(2, "0")} has unknown gate kind ${gate.kind}`,
      );
      if (gate.kind === "foundation") {
        assert.equal(typeof gate.name, "string");
        assert.ok(gate.name.startsWith("TASK-149 "));
        continue;
      }

      const gateSource = sourceFor(gate.path);
      if (gate.kind === "external-foundation") {
        assert.ok(
          gateSource.includes(`test(${JSON.stringify(gate.name)}`),
          `${gate.path}: missing executable test ${gate.name}`,
        );
        continue;
      }

      if (gate.kind === "staging") {
        assert.ok(
          gateSource.includes(`markCase(tracker, "${gate.marker}")`),
          `${gate.path}: missing reached staging marker ${gate.marker}`,
        );
        assert.ok(
          gateSource.split(gate.marker).length - 1 >= 2,
          `${gate.path}: marker ${gate.marker} must be declared and reached`,
        );
        continue;
      }

      if (["bundle", "cloudflare", "security"].includes(gate.kind)) {
        const command = packageJson.scripts?.[gate.packageScript];
        assert.equal(
          typeof command,
          "string",
          `package.json: missing ${gate.packageScript}`,
        );
        assert.ok(
          command.includes(gate.path),
          `package.json: ${gate.packageScript} must execute ${gate.path}`,
        );
        for (const snippet of gate.requiredSnippets) {
          assert.ok(
            gateSource.includes(snippet),
            `${gate.path}: missing ${gate.kind} gate snippet ${snippet}`,
          );
        }
        continue;
      }

      assert.equal(gate.kind, "pgtap");
      const markerIndex = gateSource.indexOf(gate.marker);
      assert.ok(markerIndex >= 0, `${gate.path}: missing ${gate.marker}`);
      assert.match(
        gateSource.slice(Math.max(0, markerIndex - 2000), markerIndex),
        /\bselect\s+(?:ok|is|isnt|has_|lives_ok|throws_ok)\s*\(/i,
        `${gate.path}: ${gate.marker} is not attached to a pgTAP assertion`,
      );
    }
  }

  assert.doesNotMatch(
    sourceFor("tests/foundation/task-149-pos-product-image-v1.test.mjs"),
    /\b(?:test|task149Test)\.(?:skip|todo)\s*\(/,
  );
  assertErrorBodyMatchesFrozenSchema(
    json("contracts/pos-product-image-v1/error.response.valid.json"),
    {
      code: "validation_failed",
      operation: "intent",
      retryable: false,
      terminal: true,
    },
  );
});

task149Test(
  [6, 11, 27, 28],
  "TASK-149 envelope guards freeze exact bounded client input",
  () => {
    const envelope = transpileCommonJs(
      "src/server/pos-auth/product-image-envelope.ts",
      {
        "./pos-contract": {
          POS_PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
          POS_PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
          POS_PRODUCT_IMAGE_MAX_CREDENTIAL_VERSION: 2_147_483_647,
          POS_PRODUCT_IMAGE_READ_BATCH_LIMIT: 16,
          POS_PRODUCT_IMAGE_SCHEMA_VERSION: "pos-product-image-v1",
          POS_PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
          POS_PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
        },
      },
    );

    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(intentEnvelope()),
      true,
    );
    assert.equal(
      envelope.hasPosProductImageFinalizeEnvelope(finalizeEnvelope()),
      true,
    );
    assert.equal(
      envelope.hasPosProductImageReadUrlsEnvelope(readUrlsEnvelope(16)),
      true,
    );
    assert.equal(
      envelope.hasPosProductImageRemoveEnvelope(removeEnvelope()),
      true,
    );
    assert.equal(
      envelope.hasPosProductImageReadUrlsEnvelope(readUrlsEnvelope(17)),
      false,
    );

    const duplicateRefs = readUrlsEnvelope(2);
    duplicateRefs.refs[1] = { ...duplicateRefs.refs[0] };
    assert.equal(
      envelope.hasPosProductImageReadUrlsEnvelope(duplicateRefs),
      false,
    );

    const clientPath = intentEnvelope();
    clientPath.main.path = `shops/${SHOP_ID}/products/${PRODUCT_ID}/primary/untrusted/main.jpg`;
    assert.equal(envelope.hasPosProductImageIntentEnvelope(clientPath), false);

    const oversizedMain = intentEnvelope();
    oversizedMain.main.bytes = 1024 * 1024 + 1;
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(oversizedMain),
      false,
    );

    const oversizedThumb = intentEnvelope();
    oversizedThumb.thumb.bytes = 90 * 1024 + 1;
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(oversizedThumb),
      false,
    );

    const invalidMime = intentEnvelope();
    invalidMime.main.mimeType = "image/png";
    assert.equal(envelope.hasPosProductImageIntentEnvelope(invalidMime), false);

    const invalidHash = intentEnvelope();
    invalidHash.main.sha256 = `sha256:${IMAGE_SHA256}`;
    assert.equal(envelope.hasPosProductImageIntentEnvelope(invalidHash), false);

    const clientUrl = readUrlsEnvelope();
    clientUrl.refs[0].signedUrl =
      "https://example.invalid/storage/v1/object/sign/untrusted";
    assert.equal(envelope.hasPosProductImageReadUrlsEnvelope(clientUrl), false);

    const nullableRemove = removeEnvelope();
    nullableRemove.expectedCurrentVersionId = null;
    assert.equal(
      envelope.hasPosProductImageRemoveEnvelope(nullableRemove),
      false,
    );

    const browserAccessToken = intentEnvelope();
    browserAccessToken.accessToken = "browser-token-must-not-be-accepted";
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(browserAccessToken),
      false,
    );

    for (const sensitiveIdentifier of [
      "mcpos_device_TASK149SyntheticCredential",
      "prefix.mcpos_session_TASK149SyntheticCredential",
      "Bearer.synthetic-credential",
      "access_token.synthetic-credential",
      "refresh-token.synthetic-credential",
      "secret.synthetic-credential",
      "password.synthetic-credential",
      "credential.synthetic-value",
      "pin.synthetic-value",
      "eyJsyntheticHeader.payload.signature",
    ]) {
      for (const field of ["operationId", "idempotencyKey"]) {
        const tokenLikeIdentifier = intentEnvelope();
        tokenLikeIdentifier[field] = sensitiveIdentifier;
        assert.equal(
          envelope.hasPosProductImageIntentEnvelope(tokenLikeIdentifier),
          false,
          `${field}:${sensitiveIdentifier}`,
        );
      }
    }

    const credentialOverlap = intentEnvelope();
    credentialOverlap.deviceToken = "opaqueDeviceMaterial149";
    credentialOverlap.sessionToken = "opaqueSessionMaterial149";
    credentialOverlap.operationId = `task149.${credentialOverlap.deviceToken}.operation`;
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(credentialOverlap),
      false,
      "operationId cannot contain the opaque device credential",
    );
    credentialOverlap.operationId = "task149.safe-operation";
    credentialOverlap.idempotencyKey = credentialOverlap.sessionToken;
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(credentialOverlap),
      false,
      "idempotencyKey cannot equal the opaque session credential",
    );

    const uuidIdentifiers = intentEnvelope();
    uuidIdentifiers.operationId = SHOP_ID;
    uuidIdentifiers.idempotencyKey = STAFF_ID;
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(uuidIdentifiers),
      true,
      "UUID and ordinary synthetic identifiers remain valid",
    );

    const nonSensitiveSubstrings = intentEnvelope();
    nonSensitiveSubstrings.operationId = "shipping-manifest-149";
    nonSensitiveSubstrings.idempotencyKey = "tokenized-batch-149";
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(nonSensitiveSubstrings),
      true,
      "sensitive letter sequences outside delimited segments remain valid",
    );

    const astral = "\u{1f642}";
    const unicodeBoundary = intentEnvelope();
    unicodeBoundary.appVersion = astral.repeat(80);
    unicodeBoundary.deviceToken = astral.repeat(512);
    unicodeBoundary.sessionToken = astral.repeat(512);
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(unicodeBoundary),
      true,
    );

    const unicodeOverflow = intentEnvelope();
    unicodeOverflow.appVersion = astral.repeat(81);
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(unicodeOverflow),
      false,
    );

    for (const forbiddenToken of [
      "token-with-newline\nsecret",
      "token-with-del\u007fsecret",
    ]) {
      const controlCharacter = intentEnvelope();
      controlCharacter.deviceToken = forbiddenToken;
      assert.equal(
        envelope.hasPosProductImageIntentEnvelope(controlCharacter),
        false,
        JSON.stringify(forbiddenToken),
      );
    }
  },
);

task149Test(
  [8, 12, 13, 31, 33],
  "TASK-149 canonical payload fixtures bind every write hash",
  () => {
    const envelope = transpileCommonJs(
      "src/server/pos-auth/product-image-envelope.ts",
      {
        "./pos-contract": {
          POS_PRODUCT_IMAGE_MAIN_MAX_BYTES: 1024 * 1024,
          POS_PRODUCT_IMAGE_MAIN_MAX_SIDE: 1600,
          POS_PRODUCT_IMAGE_MAX_CREDENTIAL_VERSION: 2_147_483_647,
          POS_PRODUCT_IMAGE_READ_BATCH_LIMIT: 16,
          POS_PRODUCT_IMAGE_SCHEMA_VERSION: "pos-product-image-v1",
          POS_PRODUCT_IMAGE_THUMB_MAX_BYTES: 90 * 1024,
          POS_PRODUCT_IMAGE_THUMB_MAX_SIDE: 384,
        },
      },
    );
    const fixtures = [
      {
        guard: envelope.hasPosProductImageIntentEnvelope,
        path: "contracts/pos-product-image-v1/intent.request.valid.json",
      },
      {
        guard: envelope.hasPosProductImageFinalizeEnvelope,
        path: "contracts/pos-product-image-v1/finalize.request.valid.json",
      },
      {
        guard: envelope.hasPosProductImageRemoveEnvelope,
        path: "contracts/pos-product-image-v1/remove.request.valid.json",
      },
    ];

    for (const fixture of fixtures) {
      const request = json(fixture.path);
      const canonical = envelope.canonicalPosProductImagePayloadJson(request);
      const expectedHash = `sha256:${createHash("sha256")
        .update(canonical, "utf8")
        .digest("hex")}`;

      assert.equal(fixture.guard(request), true, fixture.path);
      assert.equal(request.payloadHash, expectedHash, fixture.path);
    }

    const invalidHash = json(
      "contracts/pos-product-image-v1/intent.request.invalid-hash.json",
    );
    assert.equal(envelope.hasPosProductImageIntentEnvelope(invalidHash), false);

    const validShapeWrongHash = json(
      "contracts/pos-product-image-v1/intent.request.valid.json",
    );
    validShapeWrongHash.payloadHash = `sha256:${"f".repeat(64)}`;
    assert.equal(
      envelope.hasPosProductImageIntentEnvelope(validShapeWrongHash),
      true,
    );
    assert.notEqual(
      validShapeWrongHash.payloadHash,
      `sha256:${createHash("sha256")
        .update(
          envelope.canonicalPosProductImagePayloadJson(validShapeWrongHash),
          "utf8",
        )
        .digest("hex")}`,
    );
  },
);

task149Test(
  [2, 3, 4],
  "TASK-149 auth fails closed before the authoritative permission RPC",
  async () => {
    const noConfig = loadProductImageAuth({ configured: false });
    const noConfigResult = await noConfig.auth.authorizePosProductImageRequest(
      intentEnvelope(),
      "catalog.write",
    );

    assert.equal(noConfigResult.ok, false);
    assert.equal(noConfigResult.status, 503);
    assert.equal(noConfigResult.body.code, "not_configured");
    assert.equal(noConfig.leaseCalls.length, 0);
    assert.equal(noConfig.rpcCalls.length, 0);

    const deniedLease = loadProductImageAuth({
      lease: { status: "denied" },
    });
    const deniedLeaseResult =
      await deniedLease.auth.authorizePosProductImageRequest(
        intentEnvelope(),
        "catalog.write",
      );

    assert.equal(deniedLeaseResult.ok, false);
    assert.equal(deniedLeaseResult.status, 401);
    assert.equal(deniedLeaseResult.body.code, "auth_denied");
    assert.equal(deniedLease.leaseCalls.length, 1);
    assert.equal(deniedLease.rpcCalls.length, 0);

    const identityFailures = [
      {
        label: "wrong shop",
        mutate(lease) {
          lease.shop.shop_id = "10000000-0000-4000-8000-000000000999";
        },
      },
      {
        label: "wrong staff",
        mutate(lease) {
          lease.staff.staff_id = "20000000-0000-4000-8000-000000000999";
        },
      },
      {
        label: "stale session credential version",
        mutate(lease) {
          lease.session.staff_credential_version = 8;
        },
      },
      {
        label: "stale device credential version",
        mutate(lease) {
          lease.credential.staff_credential_version = 8;
        },
      },
      {
        label: "stale staff credential version",
        mutate(lease) {
          lease.staff.credential_version = 8;
        },
      },
    ];

    for (const identityFailure of identityFailures) {
      const lease = validRuntimeLease();
      identityFailure.mutate(lease);
      const harness = loadProductImageAuth({ lease });
      const result = await harness.auth.authorizePosProductImageRequest(
        intentEnvelope(),
        "catalog.write",
      );

      assert.equal(result.ok, false, identityFailure.label);
      assert.equal(result.status, 401, identityFailure.label);
      assert.equal(result.body.code, "auth_denied", identityFailure.label);
      assert.equal(harness.rpcCalls.length, 0, identityFailure.label);
    }

    const tokenMismatch = loadProductImageAuth({
      verifySecret: () => false,
    });
    const tokenMismatchResult =
      await tokenMismatch.auth.authorizePosProductImageRequest(
        intentEnvelope(),
        "catalog.write",
      );

    assert.equal(tokenMismatchResult.ok, false);
    assert.equal(tokenMismatchResult.status, 401);
    assert.equal(tokenMismatchResult.body.code, "auth_denied");
    assert.equal(tokenMismatch.rpcCalls.length, 0);
  },
);

task149Test(
  [1, 5, 7],
  "TASK-149 auth binds permission and emits a token-free trusted request",
  async () => {
    const mismatchedPermission = loadProductImageAuth();
    const mismatchedResult =
      await mismatchedPermission.auth.authorizePosProductImageRequest(
        intentEnvelope(),
        "catalog.read",
      );

    assert.equal(mismatchedResult.ok, false);
    assert.equal(mismatchedResult.status, 500);
    assert.equal(mismatchedResult.body.code, "db_failure");
    assert.equal(mismatchedPermission.leaseCalls.length, 0);
    assert.equal(mismatchedPermission.rpcCalls.length, 0);

    const permissionDenied = loadProductImageAuth({
      rpcData: { code: "permission_denied", ok: false },
    });
    const permissionDeniedResult =
      await permissionDenied.auth.authorizePosProductImageRequest(
        intentEnvelope(),
        "catalog.write",
      );

    assert.equal(permissionDeniedResult.ok, false);
    assert.equal(permissionDeniedResult.status, 403);
    assert.equal(permissionDeniedResult.body.code, "permission_denied");
    assert.equal(permissionDenied.rpcCalls.length, 1);

    const unknownAppVersion = intentEnvelope();
    unknownAppVersion.appVersion = "future-pos-version-is-additive";
    const authorized = loadProductImageAuth();
    const authorizedResult =
      await authorized.auth.authorizePosProductImageRequest(
        unknownAppVersion,
        "catalog.write",
      );

    assert.equal(authorizedResult.ok, true);
    assert.equal(authorized.rpcCalls.length, 1);
    assert.equal(authorized.rpcCalls[0].name, "pos_product_image_authorize_v1");
    assert.equal(authorized.rpcCalls[0].args.p_permission, "catalog.write");
    assert.equal(
      authorized.rpcCalls[0].args.p_expected_staff_credential_version,
      7,
    );
    assert.equal(authorizedResult.request.permission, "catalog.write");
    assert.equal(
      authorizedResult.request.posDeviceCredentialId,
      POS_DEVICE_CREDENTIAL_ID,
    );
    assert.equal(
      authorizedResult.request.appVersion,
      "future-pos-version-is-additive",
    );
    assert.equal("deviceToken" in authorizedResult.request, false);
    assert.equal("sessionToken" in authorizedResult.request, false);

    const readAuthorized = loadProductImageAuth();
    const readResult =
      await readAuthorized.auth.authorizePosProductImageRequest(
        readUrlsEnvelope(),
        "catalog.read",
      );

    assert.equal(readResult.ok, true);
    assert.equal(readResult.request.permission, "catalog.read");
    assert.equal("deviceToken" in readResult.request, false);
    assert.equal("sessionToken" in readResult.request, false);
  },
);

task149Test(
  [16, 17, 18, 19, 20],
  "TASK-149 JPEG verifier rejects MIME, bytes, dimensions, checksum and corruption",
  () => {
    const jpegValidator = transpileCommonJs(
      "src/server/shop-admin/product-images/jpeg-validator.ts",
    );
    const runtimeCore = transpileCommonJs(
      "src/server/shop-admin/product-images/runtime-core.ts",
      {
        "@/lib/supabase/admin": {
          createSupabaseAdminClient() {
            return {};
          },
          resolveSupabaseAdminConfig() {
            return { status: "not_configured" };
          },
        },
        "./jpeg-validator": jpegValidator,
      },
    );
    const sha256 = createHash("sha256").update(BASELINE_JPEG).digest("hex");
    const valid = {
      blobMimeType: "image/jpeg",
      bytes: BASELINE_JPEG,
      expectedBytes: BASELINE_JPEG.byteLength,
      expectedHeight: 3,
      expectedSha256: sha256,
      expectedWidth: 2,
      maxBytes: 1024 * 1024,
      maxSide: 1600,
    };

    assert.equal(
      runtimeCore.isProductImageStorageObjectMissingError({ status: 404 }),
      true,
    );
    assert.equal(
      runtimeCore.isProductImageStorageObjectMissingError({
        status: 503,
        statusCode: "InternalError",
      }),
      false,
    );
    assert.equal(
      runtimeCore.isProductImageStorageObjectMissingError({
        name: "StorageUnknownError",
      }),
      false,
    );
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(runtimeCore.verifyDownloadedProductImageJpeg(valid)),
      ),
      {
        height: 3,
        ok: true,
        sha256,
        width: 2,
      },
    );
    assert.equal(
      runtimeCore.verifyDownloadedProductImageJpeg({
        ...valid,
        blobMimeType: "image/png",
      }).code,
      "jpeg_mime_invalid",
    );
    assert.equal(
      runtimeCore.verifyDownloadedProductImageJpeg({
        ...valid,
        expectedBytes: BASELINE_JPEG.byteLength + 1,
      }).code,
      "jpeg_byte_count_mismatch",
    );
    assert.equal(
      runtimeCore.verifyDownloadedProductImageJpeg({
        ...valid,
        expectedWidth: 3,
      }).code,
      "jpeg_dimensions_invalid",
    );
    assert.equal(
      runtimeCore.verifyDownloadedProductImageJpeg({
        ...valid,
        expectedSha256: "f".repeat(64),
      }).code,
      "jpeg_checksum_mismatch",
    );

    const corrupt = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const corruptResult = runtimeCore.verifyDownloadedProductImageJpeg({
      ...valid,
      bytes: corrupt,
      expectedBytes: corrupt.byteLength,
      expectedSha256: createHash("sha256").update(corrupt).digest("hex"),
    });
    assert.equal(corruptResult.ok, false);
    assert.equal(corruptResult.code, "jpeg_structure_invalid");
  },
);

task149Test(
  [8, 9, 10, 11, 12, 13, 29, 30, 48],
  "TASK-149 heavy intent binds hash, replay, RPC errors and final auth",
  async () => {
    const serverTime = canonicalTimestamp();
    const expiresAt = canonicalTimestamp(30 * 60 * 1000);
    const mainPath = canonicalObjectPath("main");
    const thumbPath = canonicalObjectPath("thumb");
    const success = loadProductImageService({
      rpc: async (name, _args, callIndex) => {
        if (name === "pos_product_image_intent_v1") {
          return {
            data: {
              code: "success",
              expires_at: expiresAt,
              main_path: mainPath,
              ok: true,
              replayed: callIndex > 0,
              server_time: serverTime,
              status: "upload_required",
              thumb_path: thumbPath,
              version_id: VERSION_ID,
            },
            error: null,
          };
        }

        if (name === "pos_product_image_authorize_v1") {
          return {
            data: { code: "authorized", ok: true },
            error: null,
          };
        }

        throw new Error(`unexpected RPC ${name}`);
      },
    });
    const successRequest = trustedWriteRequest(success.service, "intent");
    const successResult =
      await success.service.handlePosProductImageIntent(successRequest);

    assert.equal(successResult.status, 201);
    assert.equal(successResult.body.ok, true);
    assert.equal(successResult.body.status, "upload_required");
    assert.equal(successResult.body.replayed, false);
    assert.equal(success.signedUploadCalls.length, 2);
    assert.deepEqual(success.signedUploadCalls, [mainPath, thumbPath]);
    assert.deepEqual(
      success.rpcCalls.map(({ name }) => name),
      [
        "pos_product_image_intent_v1",
        "pos_product_image_intent_v1",
        "pos_product_image_authorize_v1",
      ],
    );

    const raced = loadProductImageService({
      rpc: async (name, _args, callIndex) => {
        assert.equal(name, "pos_product_image_intent_v1");
        return {
          data: {
            code: "success",
            expires_at: expiresAt,
            ok: true,
            replayed: callIndex > 0,
            server_time: canonicalTimestamp(),
            status: "upload_required",
            version_id: VERSION_ID,
            ...(callIndex === 0
              ? {
                  main_path: mainPath,
                  thumb_path: thumbPath,
                }
              : {}),
          },
          error: null,
        };
      },
    });
    const racedResult = await raced.service.handlePosProductImageIntent(
      trustedWriteRequest(raced.service, "intent"),
    );

    assert.equal(racedResult.status, 409);
    assert.equal(racedResult.body.code, "stale_conflict");
    assert.equal(racedResult.body.retryable, false);
    assert.equal(racedResult.body.terminal, true);
    assert.equal(raced.signedUploadCalls.length, 2);
    assert.deepEqual(
      raced.rpcCalls.map(({ name }) => name),
      ["pos_product_image_intent_v1", "pos_product_image_intent_v1"],
    );
    assert.doesNotMatch(
      JSON.stringify({
        audits: raced.audits,
        body: racedResult.body,
      }),
      /https?:\/\/|\/storage\/|signedUrl|uploadUrl/i,
    );

    const expiresDuringSigning = loadProductImageService({
      rpc: async (name, _args, callIndex) => {
        assert.equal(name, "pos_product_image_intent_v1");
        return {
          data: {
            code: "success",
            expires_at:
              callIndex === 0 ? expiresAt : canonicalTimestamp(-1_000),
            main_path: mainPath,
            ok: true,
            replayed: callIndex > 0,
            server_time: canonicalTimestamp(),
            status: "upload_required",
            thumb_path: thumbPath,
            version_id: VERSION_ID,
          },
          error: null,
        };
      },
    });
    const expiresDuringSigningResult =
      await expiresDuringSigning.service.handlePosProductImageIntent(
        trustedWriteRequest(expiresDuringSigning.service, "intent"),
      );

    assert.equal(expiresDuringSigningResult.status, 409);
    assert.equal(expiresDuringSigningResult.body.code, "intent_expired");
    assert.equal(expiresDuringSigningResult.body.retryable, false);
    assert.equal(expiresDuringSigningResult.body.terminal, true);
    assert.equal(expiresDuringSigning.signedUploadCalls.length, 2);
    assert.deepEqual(
      expiresDuringSigning.rpcCalls.map(({ name }) => name),
      ["pos_product_image_intent_v1", "pos_product_image_intent_v1"],
    );
    assert.doesNotMatch(
      JSON.stringify(expiresDuringSigningResult.body),
      /https?:\/\/|\/storage\/|signedUrl|uploadUrl/i,
    );

    const replay = loadProductImageService({
      rpc: async (name) => {
        if (name === "pos_product_image_intent_v1") {
          return {
            data: {
              code: "success",
              ok: true,
              replayed: true,
              server_time: serverTime,
              status: "noop",
              version_id: VERSION_ID,
            },
            error: null,
          };
        }

        return {
          data: { code: "authorized", ok: true },
          error: null,
        };
      },
    });
    const replayRequest = trustedWriteRequest(replay.service, "intent");
    replayRequest.expectedCurrentVersionId = VERSION_ID;
    replayRequest.payloadHash =
      replay.service.computePosProductImagePayloadHash(replayRequest);
    const replayResult =
      await replay.service.handlePosProductImageIntent(replayRequest);

    assert.equal(replayResult.status, 200);
    assert.equal(replayResult.body.status, "noop");
    assert.equal(replayResult.body.replayed, true);
    assert.equal(replay.signedUploadCalls.length, 0);

    const expiredReplay = loadProductImageService({
      rpc: async () => ({
        data: {
          code: "success",
          expires_at: canonicalTimestamp(-1),
          main_path: mainPath,
          ok: true,
          replayed: true,
          server_time: serverTime,
          status: "upload_required",
          thumb_path: thumbPath,
          version_id: VERSION_ID,
        },
        error: null,
      }),
    });
    const expiredReplayRequest = trustedWriteRequest(
      expiredReplay.service,
      "intent",
    );
    const expiredReplayResult =
      await expiredReplay.service.handlePosProductImageIntent(
        expiredReplayRequest,
      );

    assert.equal(expiredReplayResult.status, 409);
    assert.equal(expiredReplayResult.body.code, "intent_expired");
    assert.equal(expiredReplayResult.body.retryable, false);
    assert.equal(expiredReplayResult.body.terminal, true);
    assert.equal(expiredReplayResult.body.serverTime, serverTime);
    assert.equal(expiredReplay.signedUploadCalls.length, 0);
    assert.deepEqual(
      expiredReplay.rpcCalls.map(({ name }) => name),
      ["pos_product_image_intent_v1"],
    );

    const hashMismatch = loadProductImageService();
    const mismatchRequest = trustedWriteRequest(hashMismatch.service, "intent");
    mismatchRequest.payloadHash = `sha256:${"f".repeat(64)}`;
    const mismatchResult =
      await hashMismatch.service.handlePosProductImageIntent(mismatchRequest, {
        clientRequestId: "safe-client-id",
        requestId: "safe-server-id",
        route: "pos.catalog.product_images.intent",
      });

    assert.equal(mismatchResult.status, 400);
    assert.equal(mismatchResult.body.code, "payload_hash_mismatch");
    assertCanonicalErrorKeyOrder(mismatchResult.body);
    const routeSecurity = transpileCommonJs(
      "src/app/api/pos/_shared/pos-route-security.ts",
    );
    const mismatchResponse = routeSecurity.posJsonResponse(
      mismatchResult.body,
      mismatchResult.status,
      {
        clientRequestId: "safe-client-id",
        route: "pos.catalog.product_images.intent",
        serverRequestId: "safe-server-id",
      },
    );
    const mismatchText = await mismatchResponse.text();
    const mismatchWireBody = JSON.parse(mismatchText);
    assert.equal(mismatchText, JSON.stringify(mismatchWireBody));
    assertCanonicalErrorKeyOrder(mismatchWireBody);
    assert.equal(mismatchWireBody.requestId, "safe-server-id");
    assert.equal(mismatchWireBody.clientRequestId, "safe-client-id");
    assert.equal(hashMismatch.rpcCalls.length, 0);
    assert.equal(hashMismatch.auditAdmissionCalls.length, 1);
    assert.deepEqual(hashMismatch.auditTimeline, ["admit", "write"]);
    assert.equal(
      hashMismatch.auditAdmissionCalls[0].name,
      "pos_product_image_node_audit_admit_v1",
    );
    assert.deepEqual(
      Object.keys(hashMismatch.auditAdmissionCalls[0].args).sort(),
      [
        "p_expected_staff_credential_version",
        "p_permission",
        "p_pos_session_id",
        "p_shop_device_id",
        "p_shop_id",
        "p_staff_id",
      ],
    );
    assert.equal(
      hashMismatch.auditAdmissionCalls[0].args
        .p_expected_staff_credential_version,
      7,
    );
    assert.equal(
      hashMismatch.auditAdmissionCalls[0].args.p_permission,
      "catalog.write",
    );
    assert.equal(
      hashMismatch.auditAdmissionCalls[0].args.p_pos_session_id,
      POS_SESSION_ID,
    );
    assert.equal(
      hashMismatch.auditAdmissionCalls[0].args.p_shop_device_id,
      SHOP_DEVICE_ID,
    );
    assert.equal(hashMismatch.auditAdmissionCalls[0].args.p_shop_id, SHOP_ID);
    assert.equal(hashMismatch.auditAdmissionCalls[0].args.p_staff_id, STAFF_ID);
    assert.doesNotMatch(
      JSON.stringify(hashMismatch.auditAdmissionCalls[0].args),
      /(?:device|session)_?token|path|body|payload|metadata|signed.?url|sha256|hash/i,
    );
    assert.equal(hashMismatch.signedUploadCalls.length, 0);
    assert.equal(hashMismatch.audits.length, 1);
    assert.doesNotMatch(
      JSON.stringify(hashMismatch.audits),
      /https?:\/\/|\/storage\/|(?:device|session)Token|signedUrl/i,
    );

    const suppressedAdmissions = [
      {
        admission: async () => ({
          data: {
            admitted: false,
            ok: true,
            server_time: canonicalTimestamp(),
          },
          error: null,
        }),
        label: "budget exhausted",
      },
      {
        admission: async () => ({
          data: {
            admitted: false,
            ok: false,
            server_time: canonicalTimestamp(),
          },
          error: null,
        }),
        label: "denied",
      },
      {
        admission: async () => ({
          data: null,
          error: { code: "synthetic_admission_error" },
        }),
        label: "RPC error",
      },
      {
        admission: async () => ({
          data: {
            admitted: true,
            ok: true,
            server_time: "not-a-server-timestamp",
          },
          error: null,
        }),
        label: "malformed admission",
      },
      {
        admission: async () => {
          throw new Error("synthetic admission transport failure");
        },
        label: "transport error",
      },
    ];

    for (const { admission, label } of suppressedAdmissions) {
      const suppressed = loadProductImageService({
        auditAdmission: admission,
      });
      const suppressedRequest = trustedWriteRequest(
        suppressed.service,
        "intent",
      );
      suppressedRequest.payloadHash = `sha256:${"f".repeat(64)}`;
      const suppressedResult =
        await suppressed.service.handlePosProductImageIntent(
          suppressedRequest,
          {
            requestId: "safe-suppressed-audit-id",
          },
        );

      assert.deepEqual(
        normalizedEndpointResult(suppressedResult),
        normalizedEndpointResult(mismatchResult),
        label,
      );
      assert.equal(suppressed.auditAdmissionCalls.length, 1, label);
      assert.deepEqual(suppressed.auditTimeline, ["admit"], label);
      assert.equal(suppressed.audits.length, 0, label);
      assert.equal(suppressed.rpcCalls.length, 0, label);
      assert.equal(suppressed.signedUploadCalls.length, 0, label);
    }

    for (const [code, expectedStatus] of [
      ["product_not_found", 404],
      ["expected_version_conflict", 409],
      ["idempotency_payload_mismatch", 409],
    ]) {
      const failure = loadProductImageService({
        rpc: async () => ({
          data: {
            code,
            ok: false,
            server_time: serverTime,
          },
          error: null,
        }),
      });
      const request = trustedWriteRequest(failure.service, "intent");
      const operationResult =
        await failure.service.handlePosProductImageIntent(request);

      assert.equal(operationResult.status, expectedStatus, code);
      assert.equal(operationResult.body.code, code);
      assert.equal(failure.signedUploadCalls.length, 0, code);
    }

    const invalidMetadata = loadProductImageService();
    const invalidMetadataRequest = trustedWriteRequest(
      invalidMetadata.service,
      "intent",
    );
    invalidMetadataRequest.thumb.width = 100;
    invalidMetadataRequest.payloadHash =
      invalidMetadata.service.computePosProductImagePayloadHash(
        invalidMetadataRequest,
      );
    const invalidMetadataResult =
      await invalidMetadata.service.handlePosProductImageIntent(
        invalidMetadataRequest,
      );

    assert.equal(invalidMetadataResult.status, 400);
    assert.equal(invalidMetadataResult.body.code, "validation_failed");
    assert.equal(invalidMetadata.rpcCalls.length, 0);
    assert.equal(invalidMetadata.signedUploadCalls.length, 0);

    const finalAuthDenied = loadProductImageService({
      rpc: async (name, _args, callIndex) => {
        if (name === "pos_product_image_intent_v1") {
          return {
            data: {
              code: "success",
              expires_at: expiresAt,
              main_path: mainPath,
              ok: true,
              replayed: callIndex > 0,
              server_time: serverTime,
              status: "upload_required",
              thumb_path: thumbPath,
              version_id: VERSION_ID,
            },
            error: null,
          };
        }

        return {
          data: { code: "auth_denied", ok: false },
          error: null,
        };
      },
    });
    const finalAuthDeniedResult =
      await finalAuthDenied.service.handlePosProductImageIntent(
        trustedWriteRequest(finalAuthDenied.service, "intent"),
      );

    assert.equal(finalAuthDeniedResult.status, 401);
    assert.equal(finalAuthDeniedResult.body.code, "auth_denied");
    assert.equal(finalAuthDenied.signedUploadCalls.length, 2);
    assert.doesNotMatch(
      JSON.stringify({
        audits: finalAuthDenied.audits,
        body: finalAuthDeniedResult.body,
      }),
      /https?:\/\/|\/storage\/|signedUrl|uploadUrl/i,
    );

    const expiredServerTime = canonicalTimestamp();
    const expired = loadProductImageService({
      rpc: async (name) => {
        assert.equal(name, "pos_product_image_intent_v1");
        return {
          data: {
            code: "success",
            expires_at: canonicalTimestamp(-60_000),
            main_path: mainPath,
            ok: true,
            replayed: true,
            server_time: expiredServerTime,
            status: "upload_required",
            thumb_path: thumbPath,
            version_id: VERSION_ID,
          },
          error: null,
        };
      },
    });
    const expiredResult = await expired.service.handlePosProductImageIntent(
      trustedWriteRequest(expired.service, "intent"),
    );

    assert.equal(expiredResult.status, 409);
    assert.equal(expiredResult.body.code, "intent_expired");
    assert.equal(expiredResult.body.retryable, false);
    assert.equal(expiredResult.body.terminal, true);
    assert.equal(expiredResult.body.serverTime, expiredServerTime);
    assert.equal(expired.signedUploadCalls.length, 0);
    assert.deepEqual(
      expired.rpcCalls.map(({ name }) => name),
      ["pos_product_image_intent_v1"],
    );
  },
);

task149Test(
  [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  "TASK-149 heavy finalize validates downloads, commits publication and replays safely",
  async () => {
    const success = loadProductImageService({
      rpc: async (name) => {
        if (name === "pos_product_image_finalize_prepare_v1") {
          return { data: finalizePrepareData(), error: null };
        }
        if (name === "pos_product_image_finalize_commit_v1") {
          return { data: finalizeCommitData(), error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    });
    const successResult = await success.service.handlePosProductImageFinalize(
      trustedWriteRequest(success.service, "finalize"),
    );

    assert.equal(successResult.status, 200);
    assert.equal(successResult.body.status, "finalized");
    assert.equal(successResult.body.versionId, VERSION_ID);
    assert.deepEqual(success.downloadCalls, [
      canonicalObjectPath("main"),
      canonicalObjectPath("thumb"),
    ]);
    assert.equal(success.verifyCalls.length, 2);
    assert.deepEqual(
      success.rpcCalls.map(({ name }) => name),
      [
        "pos_product_image_finalize_prepare_v1",
        "pos_product_image_finalize_commit_v1",
      ],
    );
    const successCommit = success.rpcCalls[1].args;
    assert.equal(successCommit.p_validation_ok, true);
    assert.equal(successCommit.p_validation_code, null);
    assert.equal(successCommit.p_verified_main.bytes, BASELINE_JPEG.byteLength);
    assert.equal(
      successCommit.p_verified_thumb.bytes,
      BASELINE_JPEG.byteLength,
    );
    assert.doesNotMatch(
      JSON.stringify(successResult.body),
      /(?:main|thumb|storage)Path|signedUrl|https?:\/\//i,
    );

    const missing = loadProductImageService({
      download: async () => ({ data: null, error: { code: "404" } }),
      rpc: async (name) => {
        if (name === "pos_product_image_finalize_prepare_v1") {
          return { data: finalizePrepareData(), error: null };
        }
        if (name === "pos_product_image_finalize_commit_v1") {
          return {
            data: {
              cleanup_required: false,
              main_path: null,
              ok: false,
              replayed: false,
              server_time: canonicalTimestamp(),
              status: "validation_failed",
              thumb_path: null,
              validation_code: "storage_object_missing",
              version_id: VERSION_ID,
            },
            error: null,
          };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    });
    const missingResult = await missing.service.handlePosProductImageFinalize(
      trustedWriteRequest(missing.service, "finalize"),
    );

    assert.equal(missingResult.status, 409);
    assert.equal(missingResult.body.code, "storage_object_missing");
    assert.equal(missing.verifyCalls.length, 0);
    assert.equal(missing.removeCalls.length, 0);
    assert.equal(
      missing.rpcCalls[1].args.p_validation_code,
      "storage_object_missing",
    );
    assert.equal(missing.rpcCalls[1].args.p_validation_ok, false);
    assert.equal(missing.rpcCalls[1].args.p_verified_main, null);
    assert.equal(missing.rpcCalls[1].args.p_verified_thumb, null);

    const transient = loadProductImageService({
      download: async () => ({
        data: null,
        error: { status: 503, statusCode: "InternalError" },
      }),
      rpc: async (name) => {
        assert.equal(name, "pos_product_image_finalize_prepare_v1");
        return { data: finalizePrepareData(), error: null };
      },
    });
    const transientResult =
      await transient.service.handlePosProductImageFinalize(
        trustedWriteRequest(transient.service, "finalize"),
      );

    assert.equal(transientResult.status, 503);
    assert.equal(transientResult.body.code, "storage_unavailable");
    assert.equal(transientResult.body.retryable, true);
    assert.equal(transientResult.body.terminal, false);
    assert.deepEqual(
      transient.rpcCalls.map(({ name }) => name),
      ["pos_product_image_finalize_prepare_v1"],
    );
    assert.equal(transient.verifyCalls.length, 0);
    assert.equal(transient.removeCalls.length, 0);
    assert.equal(transient.auditAdmissionCalls.length, 1);
    assert.equal(transient.audits.at(-1).code, "storage_unavailable");

    const mixedFailure = loadProductImageService({
      download: async (path) =>
        path.endsWith("/main.jpg")
          ? { data: null, error: { status: 404, statusCode: "not_found" } }
          : {
              data: null,
              error: { status: 503, statusCode: "InternalError" },
            },
      rpc: async (name) => {
        assert.equal(name, "pos_product_image_finalize_prepare_v1");
        return { data: finalizePrepareData(), error: null };
      },
    });
    const mixedFailureResult =
      await mixedFailure.service.handlePosProductImageFinalize(
        trustedWriteRequest(mixedFailure.service, "finalize"),
      );

    assert.equal(mixedFailureResult.status, 503);
    assert.equal(mixedFailureResult.body.code, "storage_unavailable");
    assert.deepEqual(
      mixedFailure.rpcCalls.map(({ name }) => name),
      ["pos_product_image_finalize_prepare_v1"],
    );
    assert.equal(mixedFailure.verifyCalls.length, 0);
    assert.equal(mixedFailure.removeCalls.length, 0);

    for (const validationCode of [
      "jpeg_mime_invalid",
      "jpeg_checksum_mismatch",
      "jpeg_byte_count_mismatch",
      "jpeg_dimensions_invalid",
      "jpeg_structure_invalid",
    ]) {
      const invalid = loadProductImageService({
        rpc: async (name) => {
          if (name === "pos_product_image_finalize_prepare_v1") {
            return { data: finalizePrepareData(), error: null };
          }
          if (name === "pos_product_image_finalize_commit_v1") {
            return {
              data: {
                cleanup_required: false,
                main_path: null,
                ok: false,
                replayed: false,
                server_time: canonicalTimestamp(),
                status: "validation_failed",
                thumb_path: null,
                validation_code: validationCode,
                version_id: VERSION_ID,
              },
              error: null,
            };
          }
          throw new Error(`unexpected RPC ${name}`);
        },
        verifyJpeg: (input, index) =>
          index === 0
            ? { code: validationCode, ok: false }
            : {
                height: input.expectedHeight,
                ok: true,
                sha256: input.expectedSha256,
                width: input.expectedWidth,
              },
      });
      const invalidResult = await invalid.service.handlePosProductImageFinalize(
        trustedWriteRequest(invalid.service, "finalize"),
      );

      assert.equal(invalidResult.status, 422, validationCode);
      assert.equal(invalidResult.body.code, validationCode);
      assert.equal(invalid.rpcCalls[1].args.p_validation_code, validationCode);
      assert.equal(invalid.rpcCalls[1].args.p_validation_ok, false);
      assert.equal(invalid.rpcCalls[1].args.p_verified_main, null);
      assert.equal(invalid.rpcCalls[1].args.p_verified_thumb, null);
      assert.equal(invalid.removeCalls.length, 0);
    }

    const replay = loadProductImageService({
      rpc: async (name) => {
        assert.equal(name, "pos_product_image_finalize_prepare_v1");
        return {
          data: {
            ...finalizeCommitData({
              replayed: true,
              status: "already_finalized",
            }),
          },
          error: null,
        };
      },
    });
    const replayResult = await replay.service.handlePosProductImageFinalize(
      trustedWriteRequest(replay.service, "finalize"),
    );

    assert.equal(replayResult.status, 200);
    assert.equal(replayResult.body.status, "already_finalized");
    assert.equal(replayResult.body.replayed, true);
    assert.equal(replay.downloadCalls.length, 0);
    assert.equal(replay.verifyCalls.length, 0);
    assert.equal(replay.removeCalls.length, 0);
    assert.equal(replay.rpcCalls.length, 1);
  },
);

task149Test(
  [22, 34, 44, 48],
  "TASK-149 heavy finalize cleanup is canonical, bounded and response-redacted",
  async () => {
    const mainPath = canonicalObjectPath("main");
    const thumbPath = canonicalObjectPath("thumb");
    const cleanup = loadProductImageService({
      rpc: async (name) => {
        if (name === "pos_product_image_finalize_prepare_v1") {
          return { data: finalizePrepareData(), error: null };
        }
        if (name === "pos_product_image_finalize_commit_v1") {
          return {
            data: {
              cleanup_required: true,
              main_path: mainPath,
              ok: false,
              replayed: false,
              server_time: canonicalTimestamp(),
              status: "validation_failed",
              thumb_path: thumbPath,
              validation_code: "jpeg_checksum_mismatch",
              version_id: VERSION_ID,
            },
            error: null,
          };
        }
        if (name === "pos_product_image_cleanup_result_v1") {
          return {
            data: {
              cleanup_status: "pending",
              code: "cleanup_recorded",
              ok: true,
            },
            error: null,
          };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
      verifyJpeg: (_input, index) =>
        index === 0
          ? { code: "jpeg_checksum_mismatch", ok: false }
          : {
              height: 3,
              ok: true,
              sha256: baselineMetadata().sha256,
              width: 2,
            },
    });
    const cleanupResult = await cleanup.service.handlePosProductImageFinalize(
      trustedWriteRequest(cleanup.service, "finalize"),
    );

    assert.equal(cleanupResult.status, 422);
    assert.equal(cleanupResult.body.code, "jpeg_checksum_mismatch");
    assert.deepEqual(cleanup.removeCalls, [[mainPath, thumbPath]]);
    assert.equal(
      cleanup.rpcCalls.at(-1).name,
      "pos_product_image_cleanup_result_v1",
    );
    assert.equal(cleanup.rpcCalls.at(-1).args.p_success, true);
    assert.doesNotMatch(
      JSON.stringify({
        audits: cleanup.audits,
        body: cleanupResult.body,
      }),
      /https?:\/\/|\/storage\/|(?:main|thumb|storage)Path|signedUrl/i,
    );
  },
);

task149Test(
  [24, 25, 26, 29, 30],
  "TASK-149 heavy reads bind advertised expiry to authoritative server time",
  async () => {
    const readyRequest = trustedReadRequest();
    const readyRef = readyRequest.refs[0];
    const readyItem = resolvedReadItem(readyRef);
    const readyServerTime = canonicalTimestamp(-5_000);
    const ready = loadProductImageService({
      rpc: async (name) => {
        if (name === "pos_product_image_read_resolve_v1") {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return {
            data: {
              code: "success",
              items: [readyItem],
              ok: true,
              server_time: readyServerTime,
            },
            error: null,
          };
        }
        if (name === "pos_product_image_read_authorize_v1") {
          return {
            data: { code: "authorized", ok: true },
            error: null,
          };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    });
    const readyResult =
      await ready.service.handlePosProductImageReadUrls(readyRequest);

    assert.equal(readyResult.status, 200);
    assert.equal(readyResult.body.serverTime, readyServerTime);
    assert.equal(readyResult.body.items[0].status, "ready");
    assert.equal(
      readyResult.body.items[0].signedUrl,
      `https://storage.example.invalid/object/sign/${readyItem.object_path}?token=ephemeral`,
    );
    assert.equal(ready.signedReadCalls.length, 1);
    assert.deepEqual(ready.signedReadCalls[0].paths, [readyItem.object_path]);
    assert.equal(ready.signedReadCalls[0].ttlSeconds, 300);
    assert.equal(
      readyResult.body.items[0].expiresAt,
      new Date(Date.parse(readyServerTime) + 300_000)
        .toISOString()
        .replace("Z", "000Z"),
    );
    assert.deepEqual(
      ready.rpcCalls.map(({ name }) => name),
      [
        "pos_product_image_read_resolve_v1",
        "pos_product_image_read_authorize_v1",
        "pos_product_image_read_resolve_v1",
      ],
    );
    assert.doesNotMatch(
      JSON.stringify(ready.audits),
      /https?:\/\/|\/storage\/|signedUrl/i,
    );

    const missingRequest = trustedReadRequest();
    const missing = loadProductImageService({
      rpc: async (name) => {
        if (name === "pos_product_image_read_resolve_v1") {
          return {
            data: {
              code: "success",
              items: [resolvedReadItem(missingRequest.refs[0], "not_found")],
              ok: true,
              server_time: canonicalTimestamp(),
            },
            error: null,
          };
        }
        return {
          data: { code: "authorized", ok: true },
          error: null,
        };
      },
    });
    const missingResult =
      await missing.service.handlePosProductImageReadUrls(missingRequest);

    assert.equal(missingResult.status, 200);
    assert.equal(missingResult.body.items[0].status, "not_found");
    assert.equal("signedUrl" in missingResult.body.items[0], false);
    assert.equal(missing.signedReadCalls.length, 0);

    const removed = loadProductImageService({
      rpc: async () => ({
        data: {
          code: "not_found",
          ok: false,
          server_time: canonicalTimestamp(),
        },
        error: null,
      }),
    });
    const removedResult =
      await removed.service.handlePosProductImageReadUrls(trustedReadRequest());

    assert.equal(removedResult.status, 404);
    assert.equal(removedResult.body.code, "not_found");
    assert.equal(removed.signedReadCalls.length, 0);
  },
);

task149Test(
  [26, 29, 30, 35],
  "TASK-149 heavy read re-resolves after signing and suppresses stale URLs",
  async () => {
    const request = trustedReadRequest();
    const readyItem = resolvedReadItem(request.refs[0]);
    const raced = loadProductImageService({
      rpc: async (name, _args, callIndex) => {
        if (name === "pos_product_image_read_authorize_v1") {
          return {
            data: { code: "authorized", ok: true },
            error: null,
          };
        }
        assert.equal(name, "pos_product_image_read_resolve_v1");
        return {
          data: {
            code: "success",
            items: [
              callIndex === 0
                ? readyItem
                : resolvedReadItem(request.refs[0], "not_found"),
            ],
            ok: true,
            server_time: canonicalTimestamp(),
          },
          error: null,
        };
      },
    });
    const racedResult =
      await raced.service.handlePosProductImageReadUrls(request);

    assert.equal(racedResult.status, 409);
    assert.equal(racedResult.body.code, "stale_conflict");
    assert.equal(racedResult.body.retryable, false);
    assert.equal(racedResult.body.terminal, true);
    assert.equal(raced.signedReadCalls.length, 1);
    assert.deepEqual(
      raced.rpcCalls.map(({ name }) => name),
      [
        "pos_product_image_read_resolve_v1",
        "pos_product_image_read_authorize_v1",
        "pos_product_image_read_resolve_v1",
      ],
    );
    assert.deepEqual(
      raced.rpcCalls[0].args.p_refs,
      raced.rpcCalls[2].args.p_refs,
    );
    assert.doesNotMatch(
      JSON.stringify({
        audits: raced.audits,
        body: racedResult.body,
      }),
      /https?:\/\/|\/storage\/|signedUrl/i,
    );
  },
);

task149Test(
  [27, 28, 29, 30],
  "TASK-149 heavy read batches and final authorization fail closed",
  async () => {
    const batchRequest = trustedReadRequest(16);
    const batch = loadProductImageService({
      rpc: async (name) => {
        if (name === "pos_product_image_read_resolve_v1") {
          return {
            data: {
              code: "success",
              items: batchRequest.refs.map((ref) =>
                resolvedReadItem(ref, "not_found"),
              ),
              ok: true,
              server_time: canonicalTimestamp(),
            },
            error: null,
          };
        }
        return {
          data: { code: "authorized", ok: true },
          error: null,
        };
      },
    });
    const batchResult =
      await batch.service.handlePosProductImageReadUrls(batchRequest);

    assert.equal(batchResult.status, 200);
    assert.equal(batchResult.body.items.length, 16);
    assert.equal(batch.signedReadCalls.length, 0);

    const oversized = loadProductImageService();
    const oversizedResult =
      await oversized.service.handlePosProductImageReadUrls(
        trustedReadRequest(17),
      );

    assert.equal(oversizedResult.status, 400);
    assert.equal(oversizedResult.body.code, "validation_failed");
    assert.equal(oversized.rpcCalls.length, 0);
    assert.equal(oversized.signedReadCalls.length, 0);

    const deniedRequest = trustedReadRequest();
    const deniedItem = resolvedReadItem(deniedRequest.refs[0]);
    const denied = loadProductImageService({
      rpc: async (name) => {
        if (name === "pos_product_image_read_resolve_v1") {
          return {
            data: {
              code: "success",
              items: [deniedItem],
              ok: true,
              server_time: canonicalTimestamp(),
            },
            error: null,
          };
        }
        return {
          data: { code: "auth_denied", ok: false },
          error: null,
        };
      },
    });
    const deniedResult =
      await denied.service.handlePosProductImageReadUrls(deniedRequest);

    assert.equal(deniedResult.status, 401);
    assert.equal(deniedResult.body.code, "auth_denied");
    assert.equal(denied.signedReadCalls.length, 1);
    assert.doesNotMatch(
      JSON.stringify({
        audits: denied.audits,
        body: deniedResult.body,
      }),
      /https?:\/\/|\/storage\/|signedUrl/i,
    );
  },
);

task149Test(
  [29, 30],
  "TASK-149 heavy read response cap rejects oversized capability bodies before the final fence",
  async () => {
    const request = trustedReadRequest(16);
    const items = request.refs.map((ref) => resolvedReadItem(ref));
    const maxUrl = (index) => {
      const prefix = `https://storage.example.invalid/${index}?token=`;
      return `${prefix}${"a".repeat(4096 - prefix.length)}`;
    };
    const capped = loadProductImageService({
      rpc: async (name) => {
        assert.equal(name, "pos_product_image_read_resolve_v1");
        return {
          data: {
            code: "success",
            items,
            ok: true,
            server_time: canonicalTimestamp(),
          },
          error: null,
        };
      },
      signedRead: async (paths) => ({
        data: paths.map((path, index) => ({
          path,
          signedUrl: maxUrl(index),
        })),
        error: null,
      }),
    });
    const cappedResult = await capped.service.handlePosProductImageReadUrls(
      request,
      {
        requestId: "safe-cap-test",
      },
    );

    assert.equal(cappedResult.status, 503);
    assert.equal(cappedResult.body.code, "backend_contract_invalid");
    assert.equal(capped.rpcCalls.length, 1);
    assert.equal(capped.auditAdmissionCalls.length, 1);
    assert.equal(
      capped.auditAdmissionCalls[0].args.p_permission,
      "catalog.read",
    );
    assert.deepEqual(capped.auditTimeline, ["admit", "write"]);
    assert.equal(capped.signedReadCalls.length, 1);
    assert.equal(capped.audits.length, 1);
    assert.doesNotMatch(
      JSON.stringify({
        audits: capped.audits,
        body: cappedResult.body,
      }),
      /https?:\/\/|\/storage\/|signedUrl/i,
    );
  },
);

task149Test(
  [31, 33, 44, 48],
  "TASK-149 heavy remove deletes only returned canonical paths and replays one-shot",
  async () => {
    const mainPath = canonicalObjectPath("main");
    const thumbPath = canonicalObjectPath("thumb");
    const success = loadProductImageService({
      rpc: async (name) => {
        if (name === "pos_product_image_remove_v1") {
          return { data: removeSuccessData(), error: null };
        }
        if (name === "pos_product_image_cleanup_result_v1") {
          return {
            data: {
              cleanup_status: "pending",
              code: "cleanup_recorded",
              ok: true,
            },
            error: null,
          };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    });
    const successResult = await success.service.handlePosProductImageRemove(
      trustedWriteRequest(success.service, "remove"),
    );

    assert.equal(successResult.status, 200);
    assert.equal(successResult.body.status, "removed");
    assert.equal(successResult.body.cleanupStatus, "pending");
    assert.equal(successResult.body.currentImageVersionId, null);
    assert.deepEqual(success.removeCalls, [[mainPath, thumbPath]]);
    assert.equal(
      success.rpcCalls.at(-1).name,
      "pos_product_image_cleanup_result_v1",
    );
    assert.equal(success.rpcCalls.at(-1).args.p_success, true);
    assert.doesNotMatch(
      JSON.stringify(successResult.body),
      /https?:\/\/|\/storage\/|(?:main|thumb|storage)Path|signedUrl/i,
    );

    const replay = loadProductImageService({
      rpc: async (name) => {
        assert.equal(name, "pos_product_image_remove_v1");
        return {
          data: removeSuccessData({ status: "already_removed" }),
          error: null,
        };
      },
    });
    const replayResult = await replay.service.handlePosProductImageRemove(
      trustedWriteRequest(replay.service, "remove"),
    );

    assert.equal(replayResult.status, 200);
    assert.equal(replayResult.body.status, "already_removed");
    assert.equal(replayResult.body.replayed, true);
    assert.equal(replay.removeCalls.length, 0);
    assert.equal(replay.rpcCalls.length, 1);
  },
);

task149Test(
  [32, 34, 35, 44, 48],
  "TASK-149 heavy remove records pending cleanup and protects newer paths",
  async () => {
    const cleanupPending = loadProductImageService({
      remove: async () => ({
        data: null,
        error: { code: "storage_unavailable" },
      }),
      rpc: async (name) => {
        if (name === "pos_product_image_remove_v1") {
          return { data: removeSuccessData(), error: null };
        }
        if (name === "pos_product_image_cleanup_result_v1") {
          return {
            data: {
              cleanup_status: "pending",
              code: "cleanup_recorded",
              ok: true,
            },
            error: null,
          };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    });
    const cleanupPendingResult =
      await cleanupPending.service.handlePosProductImageRemove(
        trustedWriteRequest(cleanupPending.service, "remove"),
      );

    assert.equal(cleanupPendingResult.status, 200);
    assert.equal(cleanupPendingResult.body.cleanupStatus, "pending");
    assert.equal(cleanupPending.removeCalls.length, 1);
    assert.equal(cleanupPending.rpcCalls.at(-1).args.p_success, false);
    assert.equal(
      cleanupPending.rpcCalls.at(-1).args.p_error_code,
      "storage_delete_failed",
    );

    for (const code of ["expected_version_conflict", "stale_conflict"]) {
      const conflict = loadProductImageService({
        rpc: async () => ({
          data: {
            code,
            ok: false,
            server_time: canonicalTimestamp(),
          },
          error: null,
        }),
      });
      const conflictResult = await conflict.service.handlePosProductImageRemove(
        trustedWriteRequest(conflict.service, "remove"),
      );

      assert.equal(conflictResult.status, 409, code);
      assert.equal(conflictResult.body.code, code);
      assert.equal(conflict.removeCalls.length, 0, code);
    }

    const newerVersionId = "50000000-0000-4000-8000-000000000999";
    const malicious = loadProductImageService({
      rpc: async () => ({
        data: removeSuccessData({
          mainPath: canonicalObjectPath("main", newerVersionId),
          thumbPath: canonicalObjectPath("thumb", newerVersionId),
        }),
        error: null,
      }),
    });
    const maliciousResult = await malicious.service.handlePosProductImageRemove(
      trustedWriteRequest(malicious.service, "remove"),
      { requestId: "safe-newer-path-test" },
    );

    assert.equal(maliciousResult.status, 503);
    assert.equal(maliciousResult.body.code, "backend_contract_invalid");
    assert.equal(malicious.removeCalls.length, 0);
    assert.equal(malicious.audits.length, 1);
    assert.doesNotMatch(
      JSON.stringify({
        audits: malicious.audits,
        body: maliciousResult.body,
      }),
      /https?:\/\/|\/storage\/|(?:main|thumb|storage)Path|signedUrl/i,
    );
  },
);

task149Test(
  [45, 47],
  "TASK-149 routes expose POST-only two-stage dynamic boundaries",
  () => {
    for (const definition of ROUTES) {
      const route = read(definition.path);
      const authImport = '"@/server/pos-auth/product-image-auth"';
      const imageImport = '"@/server/pos-auth/product-images"';
      const authImportIndex = route.indexOf(authImport);
      const authorizationIndex = route.indexOf(
        "authorizePosProductImageRequest",
        authImportIndex + authImport.length,
      );
      const imageImportIndex = route.indexOf(imageImport);

      for (const marker of [
        'export const dynamic = "force-dynamic"',
        'export const runtime = "nodejs"',
        'from "@/server/pos-auth/product-image-envelope"',
        definition.envelopeGuard,
        "MAX_POS_PRODUCT_IMAGE_JSON_BODY_BYTES",
        "readPosJsonBody",
        "posJsonResponse",
        "posMethodNotAllowedResponse",
        definition.handler,
        `"${definition.label}"`,
        `"${definition.stage}"`,
        "methodNotAllowed as DELETE",
        "methodNotAllowed as GET",
        "methodNotAllowed as HEAD",
        "methodNotAllowed as OPTIONS",
        "methodNotAllowed as PATCH",
        "methodNotAllowed as PUT",
      ]) {
        assert.ok(route.includes(marker), `${definition.path}: ${marker}`);
      }

      assert.equal(
        (route.match(/await import\(/g) ?? []).length,
        2,
        definition.path,
      );
      assert.ok(authImportIndex >= 0, definition.path);
      assert.ok(authorizationIndex > authImportIndex, definition.path);
      assert.ok(imageImportIndex > authorizationIndex, definition.path);
      assert.doesNotMatch(
        route,
        /from\s+["']@\/server\/pos-auth\/product-image-auth["']|from\s+["']@\/server\/pos-auth\/product-images["']/,
      );
      assert.doesNotMatch(
        route,
        /@supabase\/supabase-js|createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY|request\.headers\.get\(\s*["']authorization["']/i,
      );
    }

    assert.doesNotMatch(
      read("src/server/pos-auth/route-envelope.ts"),
      /product-image|POS_PRODUCT_IMAGE|PosProductImage/,
      "legacy route envelope must not pull the product-image validator into existing POS entries",
    );
  },
);

task149Test(
  [6, 28, 45],
  "TASK-149 malformed bodies and unsupported methods never load auth or image code",
  async () => {
    const secretMarker = "TASK149_SECRET_BROWSER_TOKEN";

    for (const definition of ROUTES) {
      const malformed = loadProductImageRoute(definition);
      const malformedResponse = await malformed.route.POST(
        jsonRequest(definition.url, {}),
      );
      const malformedText = await malformedResponse.text();
      const malformedBody = JSON.parse(malformedText);

      assert.equal(malformedResponse.status, 400, definition.path);
      assert.equal(
        malformedText,
        JSON.stringify(malformedBody),
        definition.path,
      );
      assert.equal(
        malformedResponse.headers.get("cache-control"),
        "no-store",
        definition.path,
      );
      assert.equal(
        malformedResponse.headers.get("x-content-type-options"),
        "nosniff",
        definition.path,
      );
      assertErrorBodyMatchesFrozenSchema(malformedBody, {
        code: "validation_failed",
        operation: definition.operation,
        retryable: false,
        terminal: true,
      });
      assert.equal(JSON.stringify(malformedBody).includes(secretMarker), false);
      assert.equal(malformed.authLoads(), 0, definition.path);
      assert.equal(malformed.imageLoads(), 0, definition.path);
      assert.equal(malformed.rejectionAudits().length, 1, definition.path);

      const browserToken = loadProductImageRoute(definition);
      const browserTokenResponse = await browserToken.route.POST(
        jsonRequest(definition.url, {
          accessToken: secretMarker,
        }),
      );
      const browserTokenBody = await browserTokenResponse.json();

      assert.equal(browserTokenResponse.status, 400, definition.path);
      assertErrorBodyMatchesFrozenSchema(browserTokenBody, {
        code: "validation_failed",
        operation: definition.operation,
        retryable: false,
        terminal: true,
      });
      assert.equal(
        JSON.stringify(browserTokenBody).includes(secretMarker),
        false,
      );
      assert.equal(browserToken.authLoads(), 0, definition.path);
      assert.equal(browserToken.imageLoads(), 0, definition.path);
      assert.equal(
        browserToken
          .rejectionAudits()
          .some((entry) => entry.includes(secretMarker)),
        false,
        definition.path,
      );

      const oversized = loadProductImageRoute(definition);
      const oversizedResponse = await oversized.route.POST(
        jsonRequest(definition.url, "{}", {
          "content-length": String(16 * 1024 + 1),
        }),
      );

      assert.equal(oversizedResponse.status, 400, definition.path);
      assert.equal(oversized.authLoads(), 0, definition.path);
      assert.equal(oversized.imageLoads(), 0, definition.path);

      const unsupported = loadProductImageRoute(definition);
      const getResponse = await unsupported.route.GET(
        new Request(`https://example.invalid${definition.url}`),
      );

      assert.equal(getResponse.status, 405, definition.path);
      assert.equal(getResponse.headers.get("allow"), "POST", definition.path);
      assert.equal(
        getResponse.headers.get("x-content-type-options"),
        "nosniff",
        definition.path,
      );
      assertErrorBodyMatchesFrozenSchema(await getResponse.json(), {
        code: "method_not_allowed",
        operation: definition.operation,
        retryable: false,
        terminal: true,
      });
      assert.equal(unsupported.authLoads(), 0, definition.path);
      assert.equal(unsupported.imageLoads(), 0, definition.path);

      const thrown = loadProductImageRoute(definition, {
        authorize: async () => {
          throw new Error("safe synthetic auth failure");
        },
      });
      const thrownResponse = await thrown.route.POST(
        jsonRequest(definition.url, validEnvelope(definition.operation)),
      );

      assert.equal(thrownResponse.status, 500, definition.path);
      assert.equal(
        thrownResponse.headers.get("x-content-type-options"),
        "nosniff",
        definition.path,
      );
      assertErrorBodyMatchesFrozenSchema(await thrownResponse.json(), {
        code: "db_failure",
        operation: definition.operation,
        retryable: true,
        terminal: false,
      });
      assert.ok(thrown.authLoads() > 0, definition.path);
      assert.equal(thrown.imageLoads(), 0, definition.path);
    }
  },
);

task149Test(
  [6, 48],
  "TASK-149 token-like mutation identifiers stop before auth and DML boundaries",
  async () => {
    const tokenLikeIdentifiers = [
      "mcpos_device_TASK149RouteCredential",
      "mcpos_session_TASK149RouteCredential",
    ];

    for (const definition of ROUTES.filter(
      ({ operation }) => operation !== "read-urls",
    )) {
      for (const field of ["operationId", "idempotencyKey"]) {
        for (const sensitiveIdentifier of tokenLikeIdentifiers) {
          const body = validEnvelope(definition.operation);
          body[field] = sensitiveIdentifier;
          const rejected = loadProductImageRoute(definition);
          const response = await rejected.route.POST(
            jsonRequest(definition.url, body),
          );
          const responseBody = await response.json();

          assert.equal(response.status, 400, `${definition.path}:${field}`);
          assert.equal(
            responseBody.code,
            "validation_failed",
            `${definition.path}:${field}`,
          );
          assert.equal(rejected.authLoads(), 0, `${definition.path}:${field}`);
          assert.equal(rejected.imageLoads(), 0, `${definition.path}:${field}`);
          assert.equal(
            JSON.stringify(rejected.rejectionAudits()).includes(
              sensitiveIdentifier,
            ),
            false,
            `${definition.path}:${field}`,
          );
        }
      }
    }
  },
);

task149Test(
  [2, 3, 4, 5],
  "TASK-149 auth denial remains typed and never loads image or Storage code",
  async () => {
    for (const definition of ROUTES) {
      const realAuth = loadProductImageAuth({
        lease: { status: "denied" },
      });
      const harness = loadProductImageRoute(definition, {
        authorize: realAuth.auth.authorizePosProductImageRequest,
      });
      const response = await harness.route.POST(
        jsonRequest(definition.url, validEnvelope(definition.operation)),
      );
      const body = await response.json();

      assert.equal(response.status, 401, definition.path);
      assert.equal(
        response.headers.get("x-content-type-options"),
        "nosniff",
        definition.path,
      );
      assertErrorBodyMatchesFrozenSchema(body, {
        code: "auth_denied",
        operation: definition.operation,
        retryable: false,
        terminal: true,
      });
      assert.ok(harness.authLoads() > 0, definition.path);
      assert.equal(harness.imageLoads(), 0, definition.path);
      assert.equal(realAuth.rpcCalls.length, 0, definition.path);
    }
  },
);

task149Test(
  [1, 5, 7, 30, 48],
  "TASK-149 valid auth strips bearer material before the heavy handler",
  async () => {
    for (const definition of ROUTES) {
      const handled = [];
      const harness = loadProductImageRoute(definition, {
        authorize: async (body) => ({
          ok: true,
          request: authorizedRequest(body, definition.permission),
        }),
        handle: async (request) => {
          handled.push(request);

          return {
            body: {
              ok: true,
              operation: definition.operation,
            },
            status: 200,
          };
        },
      });
      const response = await harness.route.POST(
        jsonRequest(definition.url, validEnvelope(definition.operation)),
      );

      assert.equal(response.status, 200, definition.path);
      assert.ok(harness.authLoads() > 0, definition.path);
      assert.ok(harness.imageLoads() > 0, definition.path);
      assert.equal(handled.length, 1, definition.path);
      assert.equal(handled[0].permission, definition.permission);
      assert.equal(handled[0].posDeviceCredentialId, POS_DEVICE_CREDENTIAL_ID);
      assert.equal("deviceToken" in handled[0], false, definition.path);
      assert.equal("sessionToken" in handled[0], false, definition.path);
    }
  },
);

task149Test(
  [36, 39, 42],
  "TASK-149 catalog image fields are additive and expose no capability material",
  () => {
    const catalog = read("src/server/pos-auth/catalog-pull.ts");
    const productProjection = catalog.match(
      /catalog\.products\.push\(\{[\s\S]*?\n    }\);/,
    )?.[0];

    assert.ok(productProjection);
    assert.match(productProjection, /primaryImageUpdatedAt/);
    assert.match(productProjection, /primaryImageVersionId/);
    assert.doesNotMatch(
      productProjection,
      /\b(?:signedUrl|url|mainPath|thumbPath|storagePath|sha256|metadata)\b/i,
    );

    const legacyProduct = {
      barcode: "TASK149",
      categoryId: null,
      itemNumber: "149",
      productId: PRODUCT_ID,
      productName: "Task 149",
      purchasePrice: 1,
      retailPrice: 2,
      secondProductName: null,
      stockQuantity: 3,
      supplierId: null,
      updatedAt: "2026-07-30T16:00:00.000000Z",
    };
    const additiveProduct = {
      ...legacyProduct,
      primaryImageUpdatedAt: "2026-07-30T16:01:00.000000Z",
      primaryImageVersionId: VERSION_ID,
    };
    const legacyProjection = Object.fromEntries(
      Object.entries(additiveProduct).filter(
        ([key]) =>
          key !== "primaryImageUpdatedAt" && key !== "primaryImageVersionId",
      ),
    );

    assert.deepEqual(legacyProjection, legacyProduct);
    assert.deepEqual(sensitiveCatalogKeys({ products: [additiveProduct] }), []);
  },
);

task149Test(
  [29, 40],
  "TASK-149 staging evidence fails closed for expired URLs and proves the bounded full drain independently",
  () => {
    const stagingHarness = read(
      "scripts/testing/task-149-pos-product-image-staging-e2e.mjs",
    ).replace(/\r\n/g, "\n");
    const resourceGate = read(
      "scripts/testing/task-149-pos-product-image-resource-gate.mjs",
    );
    const expiryProof = stagingHarness.slice(
      stagingHarness.indexOf("async function proveExpiredUrlRenewal"),
      stagingHarness.indexOf("async function verifyDurableRedaction"),
    );
    const oldUrlObservationIndex = expiryProof.indexOf(
      "isDeterministicExpiredSignedUrlRejection(expiredResponse)",
    );
    const renewedLeaseIndex = expiryProof.indexOf(
      'versionId,\n    "read_after_expiry"',
    );

    assert.match(
      expiryProof,
      /catch\s*\{\s*fail\(\s*"BLOCKED_TASK149_EXPIRED_URL_OBSERVATION_UNAVAILABLE"/,
    );
    assert.doesNotMatch(expiryProof, /expiredResponse\s*=\s*null/);
    assert.ok(oldUrlObservationIndex >= 0);
    assert.ok(renewedLeaseIndex > oldUrlObservationIndex);
    assert.doesNotMatch(
      stagingHarness,
      /markCase\(tracker,\s*"TASK149_CASE_40"\)/,
    );
    assert.equal(stagingHarness.includes('"TASK149_CASE_40"'), false);
    assert.equal(resourceGate.includes('"TASK149_CASE_40"'), false);

    const guardSource = stagingHarness.slice(
      stagingHarness.indexOf(
        "function isDeterministicExpiredSignedUrlRejection",
      ),
      stagingHarness.indexOf("async function waitForPreDeadlinePendingCleanup"),
    );
    const guard = new Script(`(${guardSource.trim()})`).runInContext(
      createContext({ Response }),
    );
    for (const status of [400, 401, 403, 404, 410]) {
      assert.equal(guard(new Response(null, { status })), true);
    }
    for (const status of [200, 302, 408, 429, 500, 503]) {
      assert.equal(guard(new Response(null, { status })), false);
    }

    const manifestLoader = stagingHarness.slice(
      stagingHarness.indexOf("async function loadScopedManifestRows"),
      stagingHarness.indexOf("function assertCatalogDrainExactness"),
    );
    const fullDrain = stagingHarness.slice(
      stagingHarness.indexOf("function assertCatalogDrainExactness"),
      stagingHarness.indexOf("function assertCatalogImageFields"),
    );
    assert.match(
      manifestLoader,
      /\.select\(columns,\s*\{\s*count:\s*"exact"\s*}\)/,
    );
    assert.match(manifestLoader, /\.lte\("updated_at", snapshotAt\)/);
    assert.match(manifestLoader, /\.eq\("shop_id", state\.shopId\)/);
    assert.match(
      manifestLoader,
      /\.is\("shop_id", null\)\.eq\("owner_user_id", state\.ownerUserId\)/,
    );
    assert.match(manifestLoader, /\.range\(first, last\)/);
    assert.match(
      manifestLoader,
      /BLOCKED_TASK149_CATALOG_MANIFEST_BOUNDEDNESS_EXCEEDED/,
    );
    assert.match(fullDrain, /loadAuthoritativeFullCatalogManifest\(/);
    assert.match(fullDrain, /assertSameIdSet\(/);
    assert.match(
      fullDrain,
      /pageCount === authoritativeManifest\.expectedPageCount/,
    );
    assert.match(
      fullDrain,
      /isRecord\(lastPage\) && lastPage\.hasMore === false/,
    );
    assert.match(fullDrain, /!seenCursors\.has\(cursor\)/);
  },
);

task149Test(
  [1],
  "TASK-149 cleanup recovers committed synthetic shop and Auth actors after lost responses",
  () => {
    const stagingHarness = read(
      "scripts/testing/task-149-pos-product-image-staging-e2e.mjs",
    );
    const cleanupFixture = stagingHarness.slice(
      stagingHarness.indexOf("async function cleanupFixture"),
      stagingHarness.indexOf("function summarizeSamples"),
    );
    const authRecoveryIndex = cleanupFixture.indexOf(
      "await recoverFixtureAuthActors(client, state",
    );
    const shopRecoveryIndex = cleanupFixture.indexOf(
      "await recoverFixtureShopForCleanup(client, state)",
    );
    const earlyReturnIndex = cleanupFixture.indexOf(
      "if (!state.productId || !state.shopId)",
    );

    assert.ok(authRecoveryIndex >= 0);
    assert.ok(shopRecoveryIndex > authRecoveryIndex);
    assert.ok(earlyReturnIndex > shopRecoveryIndex);
    assert.match(
      stagingHarness,
      /await assertFixtureAuthActorsAbsent\(client, state\)/,
    );
    assert.match(
      stagingHarness,
      /client\.auth\.admin\.listUsers\(\{\s*page,\s*perPage: AUTH_USER_PAGE_SIZE,\s*}\)/,
    );
    assert.match(
      stagingHarness,
      /BLOCKED_TASK149_AUTH_ACTOR_LIST_BOUNDEDNESS_EXCEEDED/,
    );
    assert.match(stagingHarness, /client\.auth\.admin\.updateUserById\(/);
    assert.doesNotMatch(stagingHarness, /client\.auth\.admin\.deleteUser\(/);
    assert.match(
      stagingHarness,
      /fixtureRole: actor\.identity\.role,\s*source: CLEANED_ACTOR_SOURCE/,
    );
    assert.match(
      stagingHarness,
      /cleanup_auth_actor_verify[\s\S]*?banned_until[\s\S]*?CLEANED_ACTOR_SOURCE/,
    );
    assert.match(
      stagingHarness,
      /cleanup_shop_recovery_lookup[\s\S]*?\.from\("shops"\)[\s\S]*?\.eq\("shop_code", state\.shopCode\)[\s\S]*?\.limit\(2\)/,
    );
    assert.match(
      stagingHarness,
      /verifyActorCleanup[\s\S]*?\.from\("shops"\)[\s\S]*?\.eq\("shop_code", state\.shopCode\)[\s\S]*?\.neq\("shop_status", "archived"\)/,
    );
    assert.match(
      stagingHarness,
      /process\.on\(HARNESS_COOPERATIVE_ABORT_SIGNAL, handleCooperativeAbort\)/,
    );
    assert.match(
      stagingHarness,
      /fetch:\s*fetchWithTimeout[\s\S]*?AbortSignal\.any\(signals\)/,
    );
    assert.match(
      stagingHarness,
      /cleanupInProgress = true;[\s\S]*?cleanup = await cleanupFixture\(/,
    );
    assert.match(
      stagingHarness,
      /process\.off\(HARNESS_COOPERATIVE_ABORT_SIGNAL, handleCooperativeAbort\)/,
    );
    assert.match(
      stagingHarness,
      /lifecycleAbortController\.abort\([\s\S]*?BLOCKED_TASK149_COOPERATIVE_ABORT_REQUESTED/,
    );
    assert.match(stagingHarness, /await lifecycleDelay\(/);

    const cooperativeAbortSelfTest = spawnSync(
      process.execPath,
      [
        "scripts/testing/task-149-pos-product-image-staging-e2e.mjs",
        "--self-test-cooperative-abort",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "" },
        maxBuffer: 1024 * 1024,
      },
    );
    assert.equal(
      cooperativeAbortSelfTest.status,
      0,
      cooperativeAbortSelfTest.stderr,
    );
    assert.equal(cooperativeAbortSelfTest.stderr, "");
    assert.deepEqual(JSON.parse(cooperativeAbortSelfTest.stdout), {
      cooperativeAbortObserved: true,
      guardedFinallyRan: true,
      status: "PASS_SELF_TEST_NO_LIVE_EVIDENCE",
    });

    const resolverSource = stagingHarness.slice(
      stagingHarness.indexOf("function resolveRecoveredFixtureShopId"),
      stagingHarness.indexOf("async function recoverFixtureShopForCleanup"),
    );
    const resolver = new Script(`(${resolverSource.trim()})`).runInContext(
      createContext({
        assert(condition, code) {
          if (!condition) throw new Error(code);
        },
        isUuid(value) {
          return (
            typeof value === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              value,
            )
          );
        },
      }),
    );
    const state = {
      platformActorId: STAFF_ID,
      shopCode: "TASK149_SHOP_RECOVERY",
      shopName: "TASK149_SYNTHETIC_SHOP_RECOVERY",
    };
    const recoveredShopId = SHOP_ID;
    const exactRow = {
      created_by_profile_id: state.platformActorId,
      shop_code: state.shopCode,
      shop_id: recoveredShopId,
      shop_name: state.shopName,
    };

    assert.equal(resolver([], state), null);
    assert.equal(resolver([exactRow], state), recoveredShopId);
    assert.throws(
      () =>
        resolver(
          [{ ...exactRow, created_by_profile_id: POS_SESSION_ID }],
          state,
        ),
      /BLOCKED_TASK149_FIXTURE_SHOP_RECOVERY_IDENTITY_INVALID/,
    );
    assert.throws(
      () => resolver([exactRow, exactRow], state),
      /BLOCKED_TASK149_FIXTURE_SHOP_RECOVERY_AMBIGUOUS/,
    );

    const actorMatcherSource = stagingHarness.slice(
      stagingHarness.indexOf("function actorMetadataMatches"),
      stagingHarness.indexOf("async function listAllAuthUsers"),
    );
    const actorMatcher = new Script(
      `(${actorMatcherSource.trim()})`,
    ).runInContext(
      createContext({
        isRecord(value) {
          return (
            value !== null && typeof value === "object" && !Array.isArray(value)
          );
        },
      }),
    );
    const selectorSource = stagingHarness.slice(
      stagingHarness.indexOf("function selectFixtureAuthActors"),
      stagingHarness.indexOf("async function recoverFixtureAuthActors"),
    );
    const selector = new Script(`(${selectorSource.trim()})`).runInContext(
      createContext({
        assert(condition, code) {
          if (!condition) throw new Error(code);
        },
        isRecord(value) {
          return (
            value !== null && typeof value === "object" && !Array.isArray(value)
          );
        },
        actorMetadataMatches: actorMatcher,
      }),
    );
    const runMarker = "TASK149_AUTH_RECOVERY";
    const actorState = {
      actorIdentities: {
        owner: {
          email: "task149-owner-recovery@example.invalid",
          role: "owner",
          runMarker,
        },
        platform: {
          email: "task149-platform-recovery@example.invalid",
          role: "platform_actor",
          runMarker,
        },
      },
      ownerUserId: null,
      platformActorId: null,
    };
    const authUser = (id, identity, source = runMarker) => ({
      app_metadata: {
        task149_fixture_role: identity.role,
        task149_run_marker: runMarker,
      },
      email: identity.email,
      id,
      user_metadata: {
        fixtureRole: identity.role,
        source,
      },
    });
    const owner = authUser(STAFF_ID, actorState.actorIdentities.owner);
    const platform = authUser(
      POS_SESSION_ID,
      actorState.actorIdentities.platform,
    );
    const selected = selector(
      [owner, platform],
      actorState,
      new Set([runMarker, "TASK149_CLEANED"]),
      "test",
    );
    assert.equal(selected.owner.id, STAFF_ID);
    assert.equal(selected.platform.id, POS_SESSION_ID);
    assert.throws(
      () =>
        selector(
          [owner, { ...owner }],
          actorState,
          new Set([runMarker]),
          "test",
        ),
      /BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_AMBIGUOUS/,
    );
    assert.throws(
      () =>
        selector(
          [
            {
              ...owner,
              email: "different@example.invalid",
            },
          ],
          actorState,
          new Set([runMarker]),
          "test",
        ),
      /BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_MISMATCH/,
    );
    assert.throws(
      () =>
        selector(
          [],
          { ...actorState, ownerUserId: STAFF_ID },
          new Set([runMarker]),
          "test",
        ),
      /BLOCKED_TASK149_AUTH_ACTOR_IDENTITY_MISSING/,
    );
  },
);

task149Test(
  [43, 45, 46, 47, 48],
  "TASK-149 security and emitted bundle gates cover all exact routes",
  () => {
    const scanner = read("scripts/security-checks.mjs");
    const bundleGate = read("scripts/testing/pos-worker-bundle-graph.mjs");
    const stagingHarness = read(
      "scripts/testing/task-149-pos-product-image-staging-e2e.mjs",
    );
    const adminCleanup = read(
      "scripts/admin/task-137-product-image-cleanup.mjs",
    );
    const adminImageService = read(
      "src/server/shop-admin/product-images/service.ts",
    );
    const migration = read(
      "supabase/migrations/20260730165557_task_149_trusted_pos_product_image_v1.sql",
    );
    const packageJson = JSON.parse(read("package.json"));

    for (const definition of ROUTES) {
      const occurrences = scanner.split(definition.path).length - 1;

      assert.ok(
        occurrences >= 4,
        `${definition.path} must be present in all historical allowlists and TASK-149 gate`,
      );
      assert.ok(
        bundleGate.includes(definition.url.slice(1)),
        `${definition.url} bundle gate`,
      );
    }

    assert.match(scanner, /checkTask149TrustedPosProductImages\(\)/);
    assert.match(bundleGate, /DEFAULT_EXISTING_ROUTE_TOLERANCE_BYTES/);
    assert.match(bundleGate, /DEFAULT_PRODUCT_IMAGE_INITIAL_MAX_BYTES/);
    assert.match(bundleGate, /AUTH_DYNAMIC_PATTERNS/);
    assert.match(bundleGate, /IMAGE_DYNAMIC_PATTERNS/);
    assert.match(bundleGate, /initialDescriptor/);
    assert.match(bundleGate, /replace\(\s*CHUNK_REFERENCE_PATTERN/);
    assert.match(
      adminImageService,
      /cleanupRecordResult\.error[\s\S]*cleanupRecord\.cleanup_status[\s\S]*"complete"/,
    );
    assert.match(
      adminCleanup,
      /recordResult\.data\?\.cleanup_status === "complete"/,
    );
    const cleanupFixture = stagingHarness.slice(
      stagingHarness.indexOf("async function cleanupFixture"),
      stagingHarness.indexOf("function summarizeSamples"),
    );
    const actorFenceIndex = cleanupFixture.indexOf(
      "await cleanupActors(client, state)",
    );
    const capabilityWaitIndex = cleanupFixture.indexOf(
      "await waitForUploadCapabilityExpiry(client, state)",
    );
    const storageCleanupIndex = cleanupFixture.indexOf(
      "await cleanupStorage(client, state)",
    );
    const databaseCleanupIndex = cleanupFixture.indexOf(
      "await callCleanupRpc(",
    );
    assert.ok(actorFenceIndex >= 0);
    assert.ok(capabilityWaitIndex > actorFenceIndex);
    assert.ok(storageCleanupIndex > capabilityWaitIndex);
    assert.ok(databaseCleanupIndex > storageCleanupIndex);
    assert.match(
      stagingHarness,
      /TASK149_UPLOAD_CAPABILITY_EXPIRY_WAIT[\s\S]*remainingSeconds/,
    );
    const fixtureCleanupSql = migration.slice(
      migration.indexOf(
        "public.task_149_pos_product_image_fixture_cleanup_v1(",
      ),
      migration.indexOf(
        "revoke all on function public.task_149_pos_product_image_fixture_cleanup_v1(",
      ),
    );
    const shopRowLockIndex = fixtureCleanupSql.indexOf(
      "select shop.* into v_shop",
    );
    const staffRowLockIndex = fixtureCleanupSql.indexOf(
      "select staff.* into v_staff",
    );
    const lifecycleLockIndex = fixtureCleanupSql.indexOf(
      "p_shop_id::text || ':pos-product-image:lifecycle'",
    );
    const writeBudgetLockIndex = fixtureCleanupSql.indexOf(
      "p_shop_id::text || ':pos-product-image:budget:shop'",
    );
    const nodeAuditBudgetLockIndex = fixtureCleanupSql.indexOf(
      "p_shop_id::text || ':pos-product-image:node-audit-budget:shop'",
    );
    assert.ok(shopRowLockIndex >= 0);
    assert.ok(staffRowLockIndex > shopRowLockIndex);
    assert.ok(lifecycleLockIndex > staffRowLockIndex);
    assert.ok(writeBudgetLockIndex > lifecycleLockIndex);
    assert.ok(nodeAuditBudgetLockIndex > writeBudgetLockIndex);
    assert.equal(
      packageJson.scripts["check:pos-worker-bundle"],
      "node scripts/testing/pos-worker-bundle-graph.mjs --assert",
    );
  },
);

task149Test(
  [47],
  "TASK-149 bundle gate keeps every auth chunk isolated from the heavy image closure",
  () => {
    const isolated = runSyntheticPosBundleGate(
      "export const authorizePosProductImageRequest = true;",
    );

    assert.equal(isolated.status, 0, isolated.output);

    const combined = runSyntheticPosBundleGate(
      [
        "// src_server_pos-auth_product-images_ts",
        "export const authorizePosProductImageRequest = true;",
      ].join("\n"),
    );

    assert.equal(combined.status, 1, combined.output);
    assert.match(
      combined.output,
      /auth dynamic chunk .* also contains the heavy product image domain/,
    );

    const transitive = runSyntheticPosBundleGate(
      [
        'const image = "server/chunks/product-images.js";',
        "export const authorizePosProductImageRequest = image;",
      ].join("\n"),
    );

    assert.equal(transitive.status, 1, transitive.output);
    assert.match(
      transitive.output,
      /auth dynamic chunk .* reaches heavy product image chunk\(s\):/,
    );
  },
);

task149Test(
  [30, 42, 48],
  "TASK-149 POS image runtime has no unbounded console sink",
  () => {
    const sources = [
      read("src/server/pos-auth/product-image-auth.ts"),
      read("src/server/pos-auth/product-images.ts"),
      ...ROUTES.map(({ path }) => read(path)),
    ].join("\n");

    assert.doesNotMatch(sources, /console\.(?:log|debug|info|warn|error)\s*\(/);
  },
);

task149Test(
  [48],
  "TASK-149 durable evidence redaction rejects canonical Storage paths",
  () => {
    const stagingHarness = read(
      "scripts/testing/task-149-pos-product-image-staging-e2e.mjs",
    );
    const evaluatePattern = (name, nextName) => {
      const start = stagingHarness.indexOf(`const ${name}`);
      const end = stagingHarness.indexOf(`const ${nextName}`, start);
      assert.ok(start >= 0 && end > start);
      return new Script(
        `(() => { ${stagingHarness.slice(start, end)} return ${name}; })()`,
      ).runInContext(createContext({}));
    };
    const durablePattern = evaluatePattern(
      "FORBIDDEN_DURABLE_TEXT_PATTERN",
      "FORBIDDEN_OUTPUT_PATTERN",
    );
    const outputPattern = evaluatePattern(
      "FORBIDDEN_OUTPUT_PATTERN",
      "REQUEST_LABEL_PATTERN",
    );
    const canonicalPath =
      `shops/${SHOP_ID}/products/${PRODUCT_ID}/primary/` +
      `${VERSION_ID}/main.jpg`;
    const escapedCanonicalPath = canonicalPath.replaceAll("/", "\\/");
    const cleanDurableText = JSON.stringify({
      audit: [
        {
          event_key: "pos.catalog.product_image.finalize",
          metadata_redacted: { code: "success" },
        },
      ],
      receipts: [
        {
          operation_id: "task149.fixture.finalize.1",
          outcome_code: "success",
        },
      ],
    });

    assert.equal(durablePattern.test(cleanDurableText), false);
    for (const forbidden of [
      canonicalPath,
      escapedCanonicalPath,
      JSON.stringify({
        audit: [{ metadata_redacted: { storagePath: canonicalPath } }],
      }),
      '{"deviceToken":"redacted-capability"}',
      '{"sessionToken":"redacted-capability"}',
      '{"signedUrl":"https://example.invalid/private"}',
      '{"key":"service_role"}',
    ]) {
      assert.equal(durablePattern.test(forbidden), true, forbidden);
    }
    assert.equal(outputPattern.test(canonicalPath), true);

    const durableProof = stagingHarness.slice(
      stagingHarness.indexOf("async function verifyDurableRedaction"),
      stagingHarness.indexOf("async function runLifecycle"),
    );
    assert.match(durableProof, /durableText\.includes\(auth\.deviceToken\)/);
    assert.match(durableProof, /durableText\.includes\(auth\.sessionToken\)/);
  },
);

const TASK_149_RESOURCE_GATE_SCRIPT =
  "scripts/testing/task-149-pos-product-image-resource-gate.mjs";

function runTask149ResourceGate(args = [], envChanges = {}) {
  const env = { ...process.env, ...envChanges };
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete env[name];
  }
  return spawnSync(process.execPath, [TASK_149_RESOURCE_GATE_SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: 1024 * 1024,
  });
}

task149Test(
  [46, 48],
  "TASK-149 resource gate requires complete live Cloudflare evidence and cannot self-attest",
  () => {
    const resourceGate = read(TASK_149_RESOURCE_GATE_SCRIPT);
    const stagingHarness = read(
      "scripts/testing/task-149-pos-product-image-staging-e2e.mjs",
    );

    assert.doesNotMatch(
      resourceGate,
      /--(?:cloudflare|harness)-artifact|readJsonArtifact/,
    );
    assert.match(
      resourceGate,
      /const GRAPHQL_ENDPOINT\s*=\s*\n?\s*"https:\/\/api\.cloudflare\.com\/client\/v4\/graphql"/,
    );
    assert.match(resourceGate, /"deployments",\s*"status"/);
    assert.match(
      resourceGate,
      /"tail",[\s\S]*?"--header"[\s\S]*?"--version-id"/,
    );
    assert.match(resourceGate, /workersInvocationsAdaptive/);
    assert.match(resourceGate, /import WebSocket from "ws"/);
    assert.match(
      resourceGate,
      /TAIL_WEBSOCKET_HOSTNAME\s*=\s*"tail\.developers\.workers\.dev"/,
    );
    assert.match(
      resourceGate,
      /REQUEST_PHASE_TIMEOUT_MILLISECONDS\s*=\s*40 \* 60 \* 1_000/,
    );
    assert.match(
      resourceGate,
      /HARNESS_TOTAL_TIMEOUT_MILLISECONDS\s*=\s*175 \* 60 \* 1_000/,
    );
    assert.match(
      resourceGate,
      /TAIL_MINIMUM_REMAINING_MILLISECONDS\s*=\s*\n?\s*REQUEST_PHASE_TIMEOUT_MILLISECONDS \+ 5 \* 60 \* 1_000/,
    );
    assert.match(
      resourceGate,
      /filters:\s*\[[\s\S]*?header:[\s\S]*?scriptVersion:/,
    );
    assert.doesNotMatch(resourceGate, /sampling_rate|samplingRate/);
    assert.match(resourceGate, /websocket\.protocol === TAIL_PROTOCOL/);
    assert.match(resourceGate, /maxPayload:\s*MAX_TAIL_EVENT_BYTES/);
    assert.match(resourceGate, /perMessageDeflate:\s*false/);
    assert.match(
      resourceGate,
      /handshakeTimeout:\s*TAIL_CONNECTION_TIMEOUT_MILLISECONDS/,
    );
    assert.match(
      resourceGate,
      /binary:\s*false,[\s\S]*?compress:\s*false,[\s\S]*?fin:\s*true,[\s\S]*?mask:\s*false/,
    );
    assert.match(
      resourceGate,
      /"User-Agent": `wrangler\/\$\{WRANGLER_VERSION\}`/,
    );
    assert.match(resourceGate, /await reader\.cancel\(\)/);
    assert.match(resourceGate, /websocket\.ping\(TAIL_READINESS_PING\)/);
    assert.match(resourceGate, /websocket\.on\("pong"/);
    assert.match(
      resourceGate,
      /setInterval\([\s\S]*?TAIL_HEARTBEAT_INTERVAL_MILLISECONDS/,
    );
    assert.match(resourceGate, /websocket\.terminate\(\)/);
    assert.match(resourceGate, /tail\.cancelHeartbeat\(\)/);
    assert.match(resourceGate, /await tail\.deleteTailOnce\(\)/);
    assert.match(resourceGate, /BLOCKED_TASK149_HARNESS_REQUEST_PHASE_TIMEOUT/);
    assert.match(resourceGate, /await waitForHarnessCompletion\(harness\)/);
    assert.match(resourceGate, /requestHarnessCooperativeAbort\(harness\)/);
    assert.match(
      resourceGate,
      /harness\.child\.kill\(HARNESS_COOPERATIVE_ABORT_SIGNAL\)/,
    );
    assert.match(
      resourceGate,
      /const harnessExecution = await completeHarnessAfterTailTeardown\([\s\S]*?harness,[\s\S]*?tailStopError/,
    );
    assert.match(
      resourceGate,
      /try \{[\s\S]*?await stopLiveTail\(tail\);[\s\S]*?tailStopError = error/,
    );
    const harnessCompletionIndex = resourceGate.indexOf(
      "const harnessExecution = await waitForHarnessCompletion(harness)",
    );
    const harnessLifecycleValidationIndex = resourceGate.indexOf(
      "harnessExecution.code === 0",
      harnessCompletionIndex,
    );
    const tailStopRethrowIndex = resourceGate.indexOf(
      "if (tailStopError) throw tailStopError",
      harnessCompletionIndex,
    );
    assert.ok(harnessCompletionIndex >= 0);
    assert.ok(harnessLifecycleValidationIndex > harnessCompletionIndex);
    assert.ok(tailStopRethrowIndex > harnessLifecycleValidationIndex);
    assert.match(resourceGate, /\["SIGINT",\s*"SIGTERM",\s*"SIGKILL"\]/);
    assert.match(
      resourceGate,
      /tail\.aggregator\.events\.size ===\s*phaseSignal\.requestCount/,
    );
    assert.match(resourceGate, /await attestTailConnection\(/);
    assert.doesNotMatch(resourceGate, /async function readinessProbe/);
    assert.match(resourceGate, /harnessEvents\[0\] === cold\[0\]/);
    assert.match(resourceGate, /row\.sum\.requests >= exactTailCount/);
    assert.match(resourceGate, /row\.dimensions\?\.status === "success"/);
    assert.match(
      resourceGate,
      /!Object\.hasOwn\(payload, "errors"\) \|\| payload\.errors === null/,
    );
    assert.match(resourceGate, /value\.outcome === "ok"/);
    assert.match(resourceGate, /value\.truncated === false/);
    assert.match(resourceGate, /response\.status !== 503/);
    assert.match(resourceGate, /!requestUrl\.search/);
    assert.match(resourceGate, /!requestUrl\.hash/);
    assert.match(resourceGate, /exceptions\.length === 0/);
    assert.match(resourceGate, /diagnosticsChannelEvents/);
    assert.match(
      resourceGate,
      /for \(const \[key, value\] of Object\.entries\(current\)\)/,
    );
    assert.match(resourceGate, /\\\/\(\?:main\|thumb\)\\\.jpg/);
    assert.match(resourceGate, /escapedUrlProcessDiagnosticRejected/);
    assert.match(resourceGate, /escapedPathProcessDiagnosticRejected/);
    assert.match(resourceGate, /benignProcessDiagnosticAccepted/);
    assert.match(
      resourceGate,
      /diagnosticsChannelEventsScanned:\s*aggregator\.diagnosticsChannelEventCount/,
    );
    assert.match(resourceGate, /fullDrain\.length === fullDrainPages/);
    assert.match(resourceGate, /"activeAuthActors"/);
    assert.match(
      resourceGate,
      /"activeAuthActors",[\s\S]*?harness\.cleanup\[key\] === 0/,
    );
    assert.match(resourceGate, /tailCpuMicroseconds/);
    assert.match(resourceGate, /const microseconds = value \* 1_000/);
    assert.match(resourceGate, /groups\.cold\[0\]\.cpuMicroseconds === 1_500/);
    assert.match(resourceGate, /MEMORY_LIMIT_BYTES/);
    assert.match(resourceGate, /HARNESS_ENVIRONMENT_KEYS/);
    assert.match(resourceGate, /function wranglerEnvironment\(/);
    assert.doesNotMatch(resourceGate, /\.\.\.process\.env|env:\s*process\.env/);
    assert.match(resourceGate, /await queryLiveGraphql\(/);
    const liveTailReadyIndex = resourceGate.indexOf(
      "const tail = await createLiveTail(config, beforeDeployment)",
    );
    assert.ok(liveTailReadyIndex >= 0);
    assert.ok(
      resourceGate.indexOf("harness = startHarness()", liveTailReadyIndex) >
        liveTailReadyIndex,
    );
    const stopTailIndex = resourceGate.indexOf("await stopLiveTail(tail)");
    assert.ok(stopTailIndex >= 0);
    assert.ok(
      resourceGate.indexOf("!tail.failureCode", stopTailIndex) > stopTailIndex,
    );
    assert.ok(
      resourceGate.indexOf("const harnessOutput = validateHarnessOutput(") <
        resourceGate.indexOf("if (phaseError) throw phaseError"),
    );
    assert.ok(
      resourceGate.indexOf("await queryLiveGraphql(") <
        resourceGate.indexOf("return redactedResult({"),
    );

    for (const header of [
      "x-task149-run-marker",
      "x-task149-request-label",
      "x-task149-request-sequence",
    ]) {
      assert.match(stagingHarness, new RegExp(header));
    }
    assert.match(stagingHarness, /TASK149_REQUEST_PHASE_COMPLETE/);
    assert.match(stagingHarness, /workerRequest:\s*true/);

    const offline = runTask149ResourceGate([], {
      CLOUDFLARE_ACCOUNT_ID: undefined,
      CLOUDFLARE_API_TOKEN: undefined,
    });
    assert.equal(offline.status, 1);
    assert.equal(offline.stdout, "");
    assert.equal(JSON.parse(offline.stderr).status, "BLOCKED");
    assert.doesNotMatch(offline.stderr, /TASK149_CASE_(?:46|48)|"PASS"/);

    const callerArtifact = runTask149ResourceGate([
      "--cloudflare-artifact",
      "synthetic.json",
    ]);
    assert.equal(callerArtifact.status, 1);
    assert.equal(callerArtifact.stdout, "");
    assert.doesNotMatch(callerArtifact.stderr, /TASK149_CASE_(?:46|48)|"PASS"/);

    const selfTest = runTask149ResourceGate(["--self-test"]);
    assert.equal(selfTest.status, 0, selfTest.stderr);
    assert.equal(selfTest.stderr, "");
    const selfTestOutput = JSON.parse(selfTest.stdout);
    assert.equal(selfTestOutput.status, "PASS_SELF_TEST_NO_LIVE_EVIDENCE");
    assert.deepEqual(selfTestOutput.environmentIsolation, {
      harnessUsesExplicitAllowlist: true,
      inheritsServiceRole: false,
    });
    assert.deepEqual(selfTestOutput.validators, {
      controlPlaneFailClosed: true,
      coverageFailClosed: true,
      deploymentFailClosed: true,
      harnessLifecycleFailClosed: true,
      heartbeatFailClosed: true,
      logScanFailClosed: true,
      parserFailClosed: true,
    });
    assert.doesNotMatch(
      selfTest.stdout,
      /TASK149_CASE_(?:46|48)|"status":\s*"PASS"/,
    );
  },
);
