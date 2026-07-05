#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const port = Number(process.env.CF_SMOKE_PORT || 8788);
const baseUrl = `http://127.0.0.1:${port}`;
const workerPath = ".open-next/worker.js";
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

const secretPattern =
  /\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|service_role|SUPABASE_SERVICE_ROLE_KEY|credential_hash|password_hash|pin_hash|access_token|refresh_token|CLOUDFLARE_API_TOKEN|mcpos_(?:device|session)_[A-Za-z0-9_-]+)\b/i;
const securityHeaderExpectations = [
  {
    name: "content-security-policy",
    required: [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "https://*.supabase.co",
      "https://accounts.google.com",
    ],
  },
  {
    name: "permissions-policy",
    required: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "bluetooth=()",
      "serial=()",
      "browsing-topics=()",
    ],
  },
  {
    equals: "strict-origin-when-cross-origin",
    name: "referrer-policy",
  },
  {
    equals: "nosniff",
    name: "x-content-type-options",
  },
  {
    equals: "DENY",
    name: "x-frame-options",
  },
];

function log(message) {
  console.log(`[cloudflare-smoke] ${message}`);
}

function fail(message) {
  console.error(`[cloudflare-smoke] FAIL ${message}`);
  process.exitCode = 1;
}

function commandEnv() {
  return {
    ...process.env,
    CI: "1",
    DO_NOT_TRACK: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    WRANGLER_SEND_METRICS: "false",
  };
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: commandEnv(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${code ?? signal ?? "unknown"}`,
        ),
      );
    });
  });
}

function appendLog(buffer, chunk) {
  const next = `${buffer}${chunk.toString("utf8")}`;
  return next.length > 12000 ? next.slice(next.length - 12000) : next;
}

async function stopPreview(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const signalPreview = (signal) => {
    if (process.platform !== "win32" && child.pid) {
      process.kill(-child.pid, signal);
      return;
    }

    child.kill(signal);
  };

  signalPreview("SIGTERM");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    await delay(250);
  }

  signalPreview("SIGKILL");
}

async function waitForPreview(child, getLogs) {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.CF_SMOKE_STARTUP_TIMEOUT_MS || 90000);

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Wrangler dev exited before smoke start. Recent output:\n${getLogs()}`,
      );
    }

    try {
      const response = await fetch(baseUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(2500),
      });

      await response.arrayBuffer();
      return;
    } catch {
      await delay(750);
    }
  }

  throw new Error(`Timed out waiting for ${baseUrl}. Recent output:\n${getLogs()}`);
}

function assertNoSecretLeak(name, body) {
  if (secretPattern.test(body)) {
    throw new Error(`${name} response contains secret-like material`);
  }
}

function assertSecurityHeaders(name, response) {
  const poweredBy = response.headers.get("x-powered-by");

  if (poweredBy) {
    throw new Error(`${name} must not expose X-Powered-By`);
  }

  for (const expectation of securityHeaderExpectations) {
    const headerValue = response.headers.get(expectation.name);

    if (!headerValue) {
      throw new Error(`${name} missing ${expectation.name}`);
    }

    if (expectation.equals && headerValue !== expectation.equals) {
      throw new Error(
        `${name} ${expectation.name}=${headerValue}, expected ${expectation.equals}`,
      );
    }

    for (const requiredValue of expectation.required ?? []) {
      if (!headerValue.includes(requiredValue)) {
        throw new Error(
          `${name} ${expectation.name} missing ${requiredValue}`,
        );
      }
    }
  }
}

async function probe({
  body,
  expect,
  headers,
  method = "GET",
  name,
  path,
  requireNoStore = false,
}) {
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers,
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  assertSecurityHeaders(name, response);

  const contentType = response.headers.get("content-type") ?? "";
  const cacheControl = response.headers.get("cache-control") ?? "";
  const bytes = await response.arrayBuffer();
  const text = new TextDecoder().decode(bytes.slice(0, 200000));

  assertNoSecretLeak(name, text);

  const expectedStatus = expect?.includes(response.status) ?? false;

  if (response.status >= 500 && !expectedStatus) {
    throw new Error(`${name} returned ${response.status}`);
  }

  if (expect && !expect.includes(response.status)) {
    throw new Error(
      `${name} returned ${response.status}, expected one of ${expect.join(", ")}`,
    );
  }

  if (requireNoStore && !/\bno-store\b/i.test(cacheControl)) {
    throw new Error(`${name} missing Cache-Control: no-store`);
  }

  log(
    `PASS ${name}: status=${response.status} security=ok cache=${cacheControl || "none"} type=${contentType || "none"}`,
  );
}

async function main() {
  if (process.env.CF_SMOKE_SKIP_BUILD !== "1") {
    log("running npm run cf:build");
    await runCommand(npmBin, ["run", "cf:build"]);
  }

  if (!existsSync(workerPath)) {
    throw new Error(`${workerPath} is missing. Run npm run cf:build first.`);
  }

  let output = "";
  const child = spawn(
    npxBin,
    [
      "wrangler",
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--log-level",
      "warn",
      "--show-interactive-dev-session",
      "false",
    ],
    {
      cwd: root,
      detached: process.platform !== "win32",
      env: commandEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => {
    output = appendLog(output, chunk);
  });
  child.stderr.on("data", (chunk) => {
    output = appendLog(output, chunk);
  });

  const stopOnSignal = async () => {
    await stopPreview(child);
    process.exit(130);
  };
  process.once("SIGINT", stopOnSignal);
  process.once("SIGTERM", stopOnSignal);

  try {
    await waitForPreview(child, () => output);
    log(`preview ready at ${baseUrl}`);

    for (const route of [
      { name: "home", path: "/" },
      { name: "login", path: "/auth/login" },
      { name: "platform guard", path: "/platform" },
      { name: "shop guard", path: "/shop" },
      { name: "products guard", path: "/shop/products" },
    ]) {
      await probe(route);
    }

    for (const path of [
      "/api/pos/auth/first-login",
      "/api/pos/session/heartbeat",
      "/api/pos/catalog/import-sync",
      "/api/pos/catalog/pull",
      "/api/pos/sales/sync",
    ]) {
      await probe({
        body: "{}",
        expect: [400, 401, 503],
        headers: { "content-type": "application/json" },
        method: "POST",
        name: `POS guard ${path}`,
        path,
        requireNoStore: true,
      });
    }

    for (const path of [
      "/api/pos/auth/first-login",
      "/api/pos/session/heartbeat",
      "/api/pos/catalog/import-sync",
      "/api/pos/catalog/pull",
      "/api/pos/sales/sync",
    ]) {
      await probe({
        expect: [405],
        method: "GET",
        name: `POS method guard ${path}`,
        path,
      });
    }

    for (const path of [
      "/shop/import-export/preview",
      "/shop/import-export/apply",
    ]) {
      await probe({
        body: "{}",
        expect: [415],
        headers: {
          "content-length": "2",
          "content-type": "application/json",
          origin: baseUrl,
        },
        method: "POST",
        name: `catalog upload guard ${path}`,
        path,
        requireNoStore: true,
      });
    }

    await probe({
      expect: [400, 401, 403, 503],
      name: "catalog export guard",
      path: "/shop/import-export/export",
      requireNoStore: true,
    });

    await probe({
      expect: [200],
      name: "catalog template",
      path: "/shop/import-export/template",
      requireNoStore: true,
    });
  } finally {
    process.removeListener("SIGINT", stopOnSignal);
    process.removeListener("SIGTERM", stopOnSignal);
    await stopPreview(child);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
